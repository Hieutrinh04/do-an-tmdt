import { mkdir, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { db } from './db';
import { env, mock } from './env';
import { isUploadedPhoto } from './image-path';
import { seed } from '../prisma/seed';

async function main() {
  if (!process.argv.includes('--yes') || !mock || env.SEED_DEMO === 'false' || !env.DATABASE_URL?.startsWith('file:')) {
    throw new Error('Reset chỉ dành cho SQLite demo mock và yêu cầu --yes.');
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = resolve(env.BACKUP_DIR || '/data/backups', `before-demo-reset-${timestamp}.db`);
  await mkdir(resolve(backup, '..'), { recursive: true });
  await db.$executeRawUnsafe("VACUUM INTO '" + backup.replaceAll("'", "''") + "'");
  const result = await db.$transaction(async tx => {
    const candidates = await tx.product.findMany({ where: { OR: [
      { slug: { startsWith: 'demo-' }, name: { startsWith: 'Betta kiểm thử demo-' }, description: { startsWith: 'Dữ liệu giả phục vụ kiểm thử' } },
      { slug: { startsWith: 'upload-test-' }, name: 'TEST ảnh upload', description: 'Tệp kiểm thử tổng hợp' },
      { slug: { startsWith: 'demo-playwright-' }, name: { startsWith: 'TEST ảnh ' }, description: 'TEST Playwright' },
    ] }, include: { variants: true } });
    const candidateVariants = new Set(candidates.flatMap(product => product.variants.map(variant => variant.id)));
    const marked = await tx.order.findMany({ where: { phone: '0900000001', OR: [
      { customerName: 'Khách kiểm thử Long Fish', note: { startsWith: 'TEST demo-' } },
      { customerName: 'Khách thử Playwright', note: 'TEST playwright' },
    ] }, include: { items: true } });
    const orders = marked.filter(order => order.note === 'TEST playwright' ||
      (order.items.length > 0 && order.items.every(item => candidateVariants.has(item.variantId))));
    const ids = orders.map(order => order.id);
    const codes = new Set(orders.map(order => order.code));
    for (const order of orders.filter(order => order.status !== 'CANCELLED')) {
      for (const item of order.items.filter(item => !candidateVariants.has(item.variantId))) {
        await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity } } });
      }
    }
    await tx.orderStatusLog.deleteMany({ where: { orderId: { in: ids } } });
    await tx.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await tx.order.deleteMany({ where: { id: { in: ids } } });
    const events = await tx.outboxEvent.findMany({ select: { id: true, payload: true } });
    await tx.outboxEvent.deleteMany({ where: { id: { in: events.flatMap(({ id, payload }) => {
      const code = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.code : undefined;
      return typeof code === 'string' && codes.has(code) ? [id] : [];
    }) } } });
    const assets: string[] = [];
    let products = 0;
    for (const product of candidates) {
      if (await tx.orderItem.count({ where: { variantId: { in: product.variants.map(row => row.id) } } })) continue;
      await tx.productVariant.deleteMany({ where: { productId: product.id } });
      await tx.product.delete({ where: { id: product.id } });
      products++;
      if (Array.isArray(product.images)) assets.push(...product.images.filter((file): file is string => typeof file === 'string' && isUploadedPhoto(file)));
    }
    return { orders: ids.length, products, assets: [...new Set(assets)] };
  });
  const remaining = await db.product.findMany({ select: { images: true } });
  const used = new Set(remaining.flatMap(row => Array.isArray(row.images) ? row.images : []));
  const root = resolve(env.UPLOADS_DIR || 'data/uploads');
  const archive = join(root, '.reset-archive', timestamp);
  let archived = 0;
  for (const path of result.assets.filter(file => !used.has(file))) {
    const id = path.slice('/uploads/'.length, -'.webp'.length);
    await mkdir(archive, { recursive: true });
    try { await rename(join(root, id), join(archive, id)); archived++; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  await seed(true);
  console.log(JSON.stringify({ backup, ordersRemoved: result.orders, productsRemoved: result.products, uploadsArchived: archived }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
