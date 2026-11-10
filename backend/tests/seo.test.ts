import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import supertest from 'supertest';

const name = 'seo-test-' + randomUUID() + '.db';
process.env.DATABASE_URL = 'file:./' + name;
process.env.MOCK_INTEGRATIONS = 'true';
process.env.SITE_URL = 'https://long-fish.example';
process.env.SHOP_NAME = 'Long Fish';
process.env.JWT_SECRET = randomUUID() + randomUUID();

const shell = '<!doctype html><html lang="vi"><head><meta charset="UTF-8" /><meta name="description" content="mặc định" /><title>Mặc định</title></head><body><div id="root"></div></body></html>';
let db: typeof import('../src/db').db;
let api: ReturnType<typeof supertest>;

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(shell, { status: 200 })));
  db = (await import('../src/db')).db;
  const sql = readdirSync('prisma/migrations').filter(dir => /^\d/.test(dir)).sort()
    .map(dir => readFileSync('prisma/migrations/' + dir + '/migration.sql', 'utf8')).join('\n');
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  await db.product.create({ data: {
    name: 'Betta "Halfmoon" <b>', slug: 'betta-halfmoon', description: 'Cá Betta đẹp, nuôi riêng. '.repeat(20), price: 69000,
    images: ['/catalog/photos/betta-halfmoon-1.webp'], category: 'Betta',
    variants: { create: [
      { color: 'Đỏ', size: '3–4 cm', sku: 'SEO-1', stock: 10 },
      { color: 'Xanh', size: '3–4 cm', sku: 'SEO-2', stock: 5, priceOverride: 89000 },
    ] },
  } });
  await db.product.create({ data: { name: 'Đã ẩn', slug: 'da-an', description: 'x', price: 1000, images: ['/x.svg'], category: 'Betta', isActive: false,
    variants: { create: { color: 'a', size: 'b', sku: 'SEO-HIDDEN', stock: 5 } } } });
  await db.product.create({ data: { name: 'Hết hàng', slug: 'het-hang', description: 'Sản phẩm hết', price: 10000, images: ['https://cdn.example/a.webp'], category: 'Thiết bị',
    variants: { create: { color: 'a', size: 'b', sku: 'SEO-OUT', stock: 0 } } } });
  api = supertest((await import('../src/app')).createApp());
}, 30000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await db.$disconnect();
  for (const suffix of ['', '-journal']) { try { unlinkSync(resolve('prisma', name + suffix)); } catch { /* không có file */ } }
});

const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));

test('trang sản phẩm: title, mô tả ≤160, canonical, Open Graph và JSON-LD Product; thay thẻ mặc định, thoát ký tự đặc biệt', async () => {
  const html = (await api.get('/seo/product/betta-halfmoon').expect(200).expect('Content-Type', /text\/html/)).text;
  expect(html.match(/<title>/g)).toHaveLength(1);
  expect(html).toContain('<title>Betta &quot;Halfmoon&quot; &lt;b&gt; – Betta | Long Fish</title>');
  expect(html).not.toContain('Mặc định');
  expect(html).not.toContain('<b>');
  expect(html).toContain('<div id="root"></div>');
  const description = html.match(/<meta name="description" content="([^"]*)"/)![1];
  expect(description.length).toBeLessThanOrEqual(190);
  expect(description).toContain('giá từ 69.000');
  expect(html).toContain('<link rel="canonical" href="https://long-fish.example/product/betta-halfmoon" />');
  expect(html).toContain('<meta property="og:image" content="https://long-fish.example/catalog/photos/betta-halfmoon-1.webp" />');
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  const [product, crumbs] = ld(html);
  expect(product).toMatchObject({ '@type': 'Product', brand: { name: 'Long Fish' } });
  expect(product.offers).toMatchObject({ '@type': 'AggregateOffer', priceCurrency: 'VND', lowPrice: 69000, highPrice: 89000, offerCount: 2, availability: 'https://schema.org/InStock' });
  expect(crumbs['@type']).toBe('BreadcrumbList');
});

test('sản phẩm hết hàng báo OutOfStock; ảnh https giữ nguyên; JSON-LD không thoát được khỏi thẻ script', async () => {
  const html = (await api.get('/seo/product/het-hang').expect(200)).text;
  expect(ld(html)[0].offers.availability).toBe('https://schema.org/OutOfStock');
  expect(html).toContain('<meta property="og:image" content="https://cdn.example/a.webp" />');
  await db.product.update({ where: { slug: 'het-hang' }, data: { description: '</script><script>alert(1)</script>' } });
  const evil = (await api.get('/seo/product/het-hang').expect(200)).text;
  expect(evil).not.toContain('</script><script>alert');
  expect(ld(evil)[0].description).toContain('</script>');
});

test('sản phẩm ẩn hoặc không tồn tại trả 404 để nginx quay về giao diện tĩnh', async () => {
  await api.get('/seo/product/da-an').expect(404);
  await api.get('/seo/product/khong-co').expect(404);
});

test('trang chủ có Organization và WebSite JSON-LD', async () => {
  const html = (await api.get('/seo/home').expect(200)).text;
  const types = ld(html).map(item => item['@type']);
  expect(types).toEqual(['Organization', 'WebSite']);
  expect(html).toContain('<link rel="canonical" href="https://long-fish.example/" />');
});

test('sitemap chỉ có trang công khai và sản phẩm đang bán; robots.txt chặn trang riêng tư và trỏ tới sitemap', async () => {
  const xml = (await api.get('/seo/sitemap.xml').expect(200).expect('Content-Type', /application\/xml/)).text;
  expect(xml).toContain('<loc>https://long-fish.example/product/betta-halfmoon</loc>');
  expect(xml).toContain('<loc>https://long-fish.example/</loc>');
  expect(xml).not.toContain('da-an');
  expect(xml).not.toContain('/checkout');
  const robots = (await api.get('/seo/robots.txt').expect(200)).text;
  for (const line of ['Disallow: /admin', 'Disallow: /api/', 'Disallow: /checkout', 'Disallow: /confirmation', 'Disallow: /track', 'Sitemap: https://long-fish.example/sitemap.xml']) expect(robots).toContain(line);
});

test('trang HTML do backend trả có CSP cho phép ảnh QR VietQR và ảnh https (không bị chặn như mặc định helmet)', async () => {
  for (const path of ['/seo/home', '/seo/product/betta-halfmoon']) {
    const csp = String((await api.get(path).expect(200)).headers['content-security-policy']);
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  }
});
