import { afterAll, beforeAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const name = 'image-apply-' + randomUUID() + '.db';
const file = resolve('prisma', name);
process.env.DATABASE_URL = 'file:./' + name;
let db: typeof import('../src/db').db;

beforeAll(async () => {
  db = (await import('../src/db')).db;
  const migrations = readdirSync('prisma/migrations').filter(dir => /^\d/.test(dir)).sort();
  for (const migration of migrations) {
    const sql = readFileSync('prisma/migrations/' + migration + '/migration.sql', 'utf8');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  }
});

afterAll(async () => {
  await db?.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { unlinkSync(file + suffix); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
});

test('apply ảnh hỗ trợ dry-run, chạy lại an toàn, giữ tồn, đơn và ảnh do admin đặt', async () => {
  const product = await db.product.create({ data: {
    name: 'Betta Halfmoon', slug: 'betta-halfmoon', description: 'Cá thử', price: 69000,
    category: 'Betta', images: ['/catalog/betta.svg'],
    variants: { create: { color: 'Đỏ', size: '3–4 cm', gender: 'Đực', unit: 'con', stock: 12, sku: 'LF-TEST-IMAGE' } },
  }, include: { variants: true } });
  const variant = product.variants[0];
  const order = await db.order.create({ data: {
    code: 'DH20261108-0001', customerName: 'Khách thử', phone: '0901234567', address: 'Địa chỉ thử',
    paymentMethod: 'COD', subtotal: 69000, shippingFee: 20000, total: 89000,
    items: { create: { variantId: variant.id, productName: product.name, color: variant.color,
      size: variant.size, unitPrice: 69000, quantity: 1 } },
  } });
  const { applyCatalogPhotos } = await import('../src/apply-catalog-photos');
  const photos = { 'betta-halfmoon': ['/catalog/photos/betta-halfmoon-1.webp'] };
  await applyCatalogPhotos({ photos, only: product.slug, dryRun: true });
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).images).toEqual(['/catalog/betta.svg']);
  await applyCatalogPhotos({ photos, only: product.slug });
  expect((await applyCatalogPhotos({ photos, only: product.slug }))[0].action).toBe('Đã khớp');
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).images).toEqual(photos['betta-halfmoon']);
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stock).toBe(12);
  expect(await db.order.findUnique({ where: { id: order.id } })).toMatchObject({ code: order.code, total: order.total });
  await db.product.update({ where: { id: product.id }, data: { images: ['https://example.com/admin-photo.jpg'] } });
  await applyCatalogPhotos({ photos, only: product.slug, refresh: true });
  expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).images).toEqual(['https://example.com/admin-photo.jpg']);
  const legacy = await db.product.create({ data: {
    name: 'Betta Plakat Koi', slug: 'betta-plakat-koi', description: 'Cá thử', price: 89000,
    category: 'Betta', images: ['/catalog/betta.svg'],
  } });
  const replacement = ['/catalog/photos/betta-plakat-koi-1.webp'];
  await applyCatalogPhotos({ photos: { [legacy.slug]: replacement }, only: legacy.slug });
  expect((await db.product.findUniqueOrThrow({ where: { id: legacy.id } })).images).toEqual(replacement);
});

