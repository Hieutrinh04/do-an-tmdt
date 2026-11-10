import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import supertest from 'supertest';

const name = 'payment-test-' + randomUUID() + '.db';
process.env.DATABASE_URL = 'file:./' + name;
process.env.MOCK_INTEGRATIONS = 'true';
process.env.SHIPPING_FEES_JSON = '{"Hồ Chí Minh":20000}';
process.env.SHIPPING_DEFAULT_FEE = '35000';
process.env.SHIPPING_FREE_THRESHOLD = '600000';
process.env.LIVE_FISH_PROVINCES_JSON = '["*"]';
process.env.LIVE_FISH_PACKING_FEE = '30000';
process.env.JWT_SECRET = randomUUID() + randomUUID();
process.env.ORDER_RATE_LIMIT = '500';

let db: typeof import('../src/db').db;
let api: ReturnType<typeof supertest>;
let variant: string;

const phone = '0901234567';
const order = (paymentMethod: 'COD' | 'BANK_QR') => ({
  customerName: 'Khách Thử', phone, province: 'Hồ Chí Minh', district: 'Quận 1', address: '12 Nguyễn Huệ', paymentMethod, doaAccepted: true,
  items: [{ variantId: variant, quantity: 1 }],
});

beforeAll(async () => {
  db = (await import('../src/db')).db;
  const sql = readdirSync('prisma/migrations').filter(dir => /^\d/.test(dir)).sort()
    .map(dir => readFileSync('prisma/migrations/' + dir + '/migration.sql', 'utf8')).join('\n');
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  const product = await db.product.create({ data: {
    name: 'Sản phẩm thử', slug: 'san-pham-thu', description: 'Thử', price: 50000, images: ['/catalog/tank.svg'], category: 'Thiết bị',
    variants: { create: { color: 'Mặc định', size: 'M', sku: 'PAY-TEST-1', stock: 50 } },
  }, include: { variants: true } });
  variant = product.variants[0].id;
  api = supertest((await import('../src/app')).createApp());
}, 30000);

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('MOCK_INTEGRATIONS', 'true');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await db.$disconnect();
  for (const suffix of ['', '-journal']) { try { unlinkSync(resolve('prisma', name + suffix)); } catch { /* không có file */ } }
});

test('chưa cấu hình ngân hàng (chế độ thật): giao diện biết chuyển khoản tạm ngưng và server từ chối rõ ràng', async () => {
  vi.stubEnv('MOCK_INTEGRATIONS', 'false');
  vi.stubEnv('VIETQR_BANK', '');
  vi.stubEnv('VIETQR_ACCOUNT', '');
  vi.stubEnv('PAYMENT_SANDBOX', 'false');
  expect((await api.get('/api/payments/config').expect(200)).body).toEqual({ bankTransfer: false, sandbox: false });
  const rejected = await api.post('/api/orders').send(order('BANK_QR'));
  expect(rejected.status).toBe(503);
  expect(rejected.body.message).toContain('Chuyển khoản đang tạm ngưng');
  await api.post('/api/orders').send(order('COD')).expect(201);
});

test('đã cấu hình ngân hàng thật: có QR đúng số tiền, không có chế độ sandbox', async () => {
  vi.stubEnv('MOCK_INTEGRATIONS', 'false');
  vi.stubEnv('VIETQR_BANK', '970415');
  vi.stubEnv('VIETQR_ACCOUNT', '123456789012');
  vi.stubEnv('PAYMENT_SANDBOX', 'false');
  expect((await api.get('/api/payments/config').expect(200)).body).toEqual({ bankTransfer: true, sandbox: false });
  const created = await api.post('/api/orders').send(order('BANK_QR')).expect(201);
  expect(created.body.sandbox).toBe(false);
  const qr = new URL(created.body.qrUrl);
  expect(qr.pathname).toContain('970415-123456789012');
  expect(qr.searchParams.get('amount')).toBe(String(created.body.total));
  expect(qr.searchParams.get('addInfo')).toBe(created.body.code);
  await api.post('/api/payments/sandbox/confirm').send({ code: created.body.code, phone }).expect(404);
});

test('PAYMENT_SANDBOX: luôn dùng tài khoản thử, kể cả khi đã nhập ngân hàng thật; nút giả lập đối soát đơn', async () => {
  vi.stubEnv('MOCK_INTEGRATIONS', 'false');
  vi.stubEnv('VIETQR_BANK', '970415');
  vi.stubEnv('VIETQR_ACCOUNT', '123456789012');
  vi.stubEnv('PAYMENT_SANDBOX', 'true');
  expect((await api.get('/api/payments/config').expect(200)).body).toEqual({ bankTransfer: true, sandbox: true });
  const created = await api.post('/api/orders').send(order('BANK_QR')).expect(201);
  expect(created.body.sandbox).toBe(true);
  expect(created.body.qrUrl).toContain('970436-0000000000');
  expect(created.body.qrUrl).not.toContain('123456789012');

  await api.post('/api/payments/sandbox/confirm').send({ code: created.body.code, phone: '0909999999' }).expect(404);
  expect((await db.order.findUniqueOrThrow({ where: { code: created.body.code } })).paymentStatus).toBe('UNPAID');

  const paid = await api.post('/api/payments/sandbox/confirm').send({ code: created.body.code, phone }).expect(200);
  expect(paid.body).toMatchObject({ ok: true, sandbox: true, paymentStatus: 'PAID' });
  const again = await api.post('/api/payments/sandbox/confirm').send({ code: created.body.code, phone }).expect(200);
  expect(again.body.paymentStatus).toBe('PAID');
  const log = await db.orderStatusLog.findMany({ where: { order: { code: created.body.code }, action: 'payment' } });
  expect(log).toHaveLength(1);
  expect(log[0].detail).toContain('SANDBOX');
});

test('sandbox không áp dụng cho đơn COD', async () => {
  vi.stubEnv('PAYMENT_SANDBOX', 'true');
  const cod = await api.post('/api/orders').send(order('COD')).expect(201);
  expect(cod.body.qrUrl).toBeUndefined();
  await api.post('/api/payments/sandbox/confirm').send({ code: cod.body.code, phone }).expect(422);
  expect((await db.order.findUniqueOrThrow({ where: { code: cod.body.code } })).paymentStatus).toBe('UNPAID');
});
