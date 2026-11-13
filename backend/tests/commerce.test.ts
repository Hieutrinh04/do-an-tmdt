import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

const name = 'commerce-test-' + randomUUID() + '.db';
process.env.DATABASE_URL = 'file:./' + name;
process.env.MOCK_INTEGRATIONS = 'true';
process.env.SHIPPING_FEES_JSON = '{"Hồ Chí Minh":20000,"Hà Nội":30000}';
process.env.SHIPPING_DEFAULT_FEE = '35000';
process.env.SHIPPING_FREE_THRESHOLD = '600000';
process.env.SHIPPING_EXPRESS_SURCHARGE = '25000';
process.env.LIVE_FISH_PACKING_FEE = '30000';
process.env.LIVE_FISH_PROVINCES_JSON = '["*"]';
process.env.ORDER_RATE_LIMIT = '1000';
const secret = randomUUID() + randomUUID();
process.env.JWT_SECRET = secret;
process.env.SITE_URL = 'https://long-fish.example';
const admin = { Authorization: 'Bearer ' + jwt.sign({}, secret, { subject: 'test-admin', audience: 'long-fish-admin', expiresIn: '1h' }) };

let db: typeof import('../src/db').db;
let api: ReturnType<typeof supertest>;
let gear: { id: string; variant: string }; // Thiết bị, 150.000 ₫, có khuyến mãi theo lịch
let fish: { id: string; variant: string }; // Betta, cá sống, 69.000 ₫
let phoneSeed = 900000000;
const day = 86_400_000;

const lines = (variantId: string, quantity = 1) => [{ variantId, quantity }];
const order = (extra: Record<string, unknown> = {}) => ({
  customerName: 'Khách Thử', phone: '0' + (++phoneSeed), province: 'Hồ Chí Minh', district: 'Quận 1', address: '12 Nguyễn Huệ', ward: 'Bến Nghé',
  paymentMethod: 'COD', doaAccepted: true, items: lines(gear.variant), ...extra,
});

beforeAll(async () => {
  db = (await import('../src/db')).db;
  const sql = readdirSync('prisma/migrations').filter(dir => /^\d/.test(dir)).sort()
    .map(dir => readFileSync('prisma/migrations/' + dir + '/migration.sql', 'utf8')).join('\n');
  for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await db.$executeRawUnsafe(statement);
  const g = await db.product.create({ data: { name: 'Lọc thử', slug: 'loc-thu', description: 'Lọc', price: 150000, images: ['/catalog/tank.svg'], category: 'Thiết bị',
    variants: { create: [{ color: 'Mặc định', size: 'M', sku: 'C-GEAR-1', stock: 1000 }, { color: 'Mặc định', size: 'L', sku: 'C-GEAR-2', stock: 1000, priceOverride: 200000 }] }, }, include: { variants: true } });
  const f = await db.product.create({ data: { name: 'Betta thử', slug: 'betta-thu', description: 'Betta', price: 69000, images: ['/catalog/betta.svg'], category: 'Betta', isLiveFish: true,
    variants: { create: { color: 'Đỏ', size: '3–4 cm', sku: 'C-FISH-1', stock: 1000 } } }, include: { variants: true } });
  gear = { id: g.id, variant: g.variants.find(v => v.sku === 'C-GEAR-1')!.id };
  fish = { id: f.id, variant: f.variants[0].id };
  api = supertest((await import('../src/app')).createApp());
}, 30000);

beforeEach(async () => {
  vi.unstubAllEnvs();
  await db.product.update({ where: { id: gear.id }, data: { salePrice: null, saleStartsAt: null, saleEndsAt: null } });
  await db.coupon.deleteMany({ where: { redemptions: { none: {} } } });
});

afterAll(async () => {
  await db.$disconnect();
  for (const suffix of ['', '-journal']) { try { unlinkSync(resolve('prisma', name + suffix)); } catch { /* không có file */ } }
});

const makeCoupon = (extra: Record<string, unknown>) => api.post('/api/admin/coupons').set(admin).send({ code: 'TEST' + randomUUID().slice(0, 6), kind: 'PERCENT', value: 10, ...extra });
const quote = (extra: Record<string, unknown> = {}) => api.post('/api/shipping/quote').send({ province: 'Hồ Chí Minh', items: lines(gear.variant), ...extra });

// ===== Giá khuyến mãi theo lịch =====
test('khuyến mãi theo lịch: chỉ áp dụng trong khoảng thời gian; giá riêng của phân loại trừ cùng khoản giảm; đơn lưu giá đã giảm', async () => {
  const { unitPrices } = await import('../src/commerce');
  const product = { price: 150000, salePrice: 120000, saleStartsAt: new Date(Date.now() - day), saleEndsAt: new Date(Date.now() + day) };
  expect(unitPrices(product, null)).toEqual({ regular: 150000, unit: 120000, onSale: true });
  expect(unitPrices(product, { priceOverride: 200000 })).toEqual({ regular: 200000, unit: 170000, onSale: true });
  expect(unitPrices({ ...product, saleStartsAt: new Date(Date.now() + day) }, null).onSale).toBe(false);
  expect(unitPrices({ ...product, saleEndsAt: new Date(Date.now() - 1000) }, null).onSale).toBe(false);
  expect(unitPrices({ ...product, salePrice: 150000 }, null).onSale).toBe(false);

  await db.product.update({ where: { id: gear.id }, data: { salePrice: 120000, saleStartsAt: new Date(Date.now() - day), saleEndsAt: new Date(Date.now() + day) } });
  const page = (await api.get('/api/products/loc-thu').expect(200)).body;
  expect(page).toMatchObject({ price: 150000, currentPrice: 120000, onSale: true, salePercent: 20 });
  expect(page.variants.map((v: { unitPrice: number; regularPrice: number }) => [v.regularPrice, v.unitPrice])).toEqual([[150000, 120000], [200000, 170000]]);
  const created = await api.post('/api/orders').send(order()).expect(201);
  expect(created.body.subtotal).toBe(120000);
  expect((await db.orderItem.findFirstOrThrow({ where: { order: { code: created.body.code } } })).unitPrice).toBe(120000);
});

test('admin: giá khuyến mãi phải nhỏ hơn giá gốc và lịch hợp lệ', async () => {
  await api.patch('/api/admin/products/' + gear.id).set(admin).send({ salePrice: 150000 }).expect(422);
  await api.patch('/api/admin/products/' + gear.id).set(admin).send({ salePrice: 100000, saleStartsAt: '2026-12-10T00:00:00Z', saleEndsAt: '2026-12-01T00:00:00Z' }).expect(422);
  const ok = await api.patch('/api/admin/products/' + gear.id).set(admin).send({ salePrice: 100000, saleEndsAt: new Date(Date.now() + day).toISOString() }).expect(200);
  expect(ok.body.salePrice).toBe(100000);
});

// ===== Phương thức vận chuyển =====
test('hai phương thức vận chuyển: tiêu chuẩn (miễn phí từ ngưỡng) và giao nhanh (phí tỉnh + phụ phí)', async () => {
  const small = (await quote().expect(200)).body;
  expect(small.methods.map((m: { id: string; fee: number }) => [m.id, m.fee])).toEqual([['STANDARD', 20000], ['EXPRESS', 45000]]);
  expect(small.shippingFee).toBe(20000);
  const express = (await quote({ shippingMethod: 'EXPRESS' }).expect(200)).body;
  expect(express).toMatchObject({ shippingFee: 45000, total: 150000 + 45000 });
  const big = (await quote({ items: lines(gear.variant, 5) }).expect(200)).body;
  expect(big.methods.map((m: { fee: number }) => m.fee)).toEqual([0, 45000]);
  const created = await api.post('/api/orders').send(order({ shippingMethod: 'EXPRESS' })).expect(201);
  expect(created.body).toMatchObject({ shippingMethod: 'EXPRESS', shippingFee: 45000, total: 195000 });
  expect((await db.order.findUniqueOrThrow({ where: { code: created.body.code } })).address).toBe('12 Nguyễn Huệ, Bến Nghé, Quận 1, Hồ Chí Minh');
  await api.post('/api/orders').send(order({ shippingMethod: 'DRONE' })).expect(422);
});

// ===== Mã giảm giá =====
test('WELCOME10: giảm 10% chỉ cho đơn hàng đầu tiên của khách (theo số điện thoại), hủy đơn thì dùng lại được', async () => {
  const code = (await makeCoupon({ code: 'WELCOME10', kind: 'PERCENT', value: 10, firstOrderOnly: true }).expect(201)).body.code;
  const phone = '0911000111';
  const preview = (await quote({ couponCode: 'welcome10' }).expect(200)).body;
  expect(preview).toMatchObject({ discount: 15000, coupon: { code }, couponError: '', total: 150000 - 15000 + 20000 });
  const first = await api.post('/api/orders').send(order({ phone, couponCode: 'welcome10' })).expect(201);
  expect(first.body).toMatchObject({ discount: 15000, couponCode: 'WELCOME10', total: 155000 });
  const saved = await db.order.findUniqueOrThrow({ where: { code: first.body.code } });
  expect(saved.total).toBe(saved.subtotal - saved.discount + saved.shippingFee + saved.packingFee);
  const second = await api.post('/api/orders').send(order({ phone, couponCode: code }));
  expect(second.status).toBe(422);
  expect(second.body.message).toContain('đơn hàng đầu tiên');
  // khách khác (số khác) vẫn dùng được
  await api.post('/api/orders').send(order({ couponCode: code })).expect(201);
  // hủy đơn đầu: trả lại lượt dùng, khách đó đặt lại với mã được
  const cancelled = await api.patch('/api/admin/orders/' + saved.id + '/status').set(admin).send({ status: 'CANCELLED' }).expect(200);
  expect(cancelled.body.status).toBe('CANCELLED');
  expect(await db.couponRedemption.count({ where: { orderId: saved.id } })).toBe(0);
  await api.post('/api/orders').send(order({ phone, couponCode: code })).expect(201);
});

test('FREESHIP: cần đơn tối thiểu, hết hạn thì từ chối, miễn phí vận chuyển nhưng không miễn phí đóng gói', async () => {
  await makeCoupon({ code: 'FREESHIP', kind: 'FREESHIP', minSubtotal: 300000, expiresAt: new Date(Date.now() + 30 * day).toISOString() }).expect(201);
  const low = (await quote({ couponCode: 'FREESHIP' }).expect(200)).body;
  expect(low.coupon).toBeNull();
  expect(low.couponError).toContain('300.000');
  const good = (await quote({ items: lines(gear.variant, 3), couponCode: 'FREESHIP' }).expect(200)).body;
  expect(good).toMatchObject({ subtotal: 450000, shippingFee: 0, shippingDiscount: 20000, total: 450000 });
  const express = (await quote({ items: lines(gear.variant, 3), couponCode: 'FREESHIP', shippingMethod: 'EXPRESS' }).expect(200)).body;
  expect(express.shippingFee).toBe(25000);
  const live = (await quote({ items: [...lines(gear.variant, 3), ...lines(fish.variant)], couponCode: 'FREESHIP' }).expect(200)).body;
  expect(live).toMatchObject({ shippingFee: 0, packingFee: 30000 });
  await db.coupon.update({ where: { code: 'FREESHIP' }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await quote({ items: lines(gear.variant, 3), couponCode: 'FREESHIP' }).expect(200)).body.couponError).toContain('hết hạn');
  const rejected = await api.post('/api/orders').send(order({ items: lines(gear.variant, 3), couponCode: 'FREESHIP' }));
  expect(rejected.status).toBe(422);
  expect(rejected.body.message).toContain('hết hạn');
});

test('SALE20: giảm số tiền cố định, chỉ cho danh mục chỉ định, mỗi người dùng một lần', async () => {
  await makeCoupon({ code: 'SALE20', kind: 'FIXED', value: 20000, categories: ['Thiết bị'], perCustomerLimit: 1 }).expect(201);
  const onlyFish = (await quote({ items: lines(fish.variant), couponCode: 'SALE20' }).expect(200)).body;
  expect(onlyFish.couponError).toContain('Thiết bị');
  expect(onlyFish.discount).toBe(0);
  const mixed = (await quote({ items: [...lines(gear.variant), ...lines(fish.variant)], couponCode: 'SALE20' }).expect(200)).body;
  expect(mixed.discount).toBe(20000);
  const phone = '0922000222';
  await api.post('/api/orders').send(order({ phone, couponCode: 'SALE20' })).expect(201);
  const again = await api.post('/api/orders').send(order({ phone, couponCode: 'SALE20' }));
  expect(again.status).toBe(422);
  expect(again.body.message).toContain('đã dùng mã này');
  await api.post('/api/orders').send(order({ couponCode: 'SALE20' })).expect(201);
});

test('mã không tồn tại, đã tắt, chưa tới ngày, hết lượt: báo lỗi rõ ràng; admin kiểm tra dữ liệu mã', async () => {
  expect((await quote({ couponCode: 'KHONGCO' }).expect(200)).body.couponError).toContain('không tồn tại');
  await makeCoupon({ code: 'OFF1', isActive: false }).expect(201);
  expect((await quote({ couponCode: 'OFF1' }).expect(200)).body.couponError).toContain('không còn hiệu lực');
  await makeCoupon({ code: 'LATER', startsAt: new Date(Date.now() + day).toISOString() }).expect(201);
  expect((await quote({ couponCode: 'LATER' }).expect(200)).body.couponError).toContain('chưa đến');
  await makeCoupon({ code: 'ONCE', usageLimit: 1 }).expect(201);
  await api.post('/api/orders').send(order({ couponCode: 'ONCE' })).expect(201);
  const used = await api.post('/api/orders').send(order({ couponCode: 'ONCE' }));
  expect(used.status).toBe(422);
  expect(used.body.message).toContain('hết lượt');
  await makeCoupon({ code: 'ONCE' }).expect(409);
  await makeCoupon({ code: 'BAD', kind: 'PERCENT', value: 150 }).expect(422);
  await makeCoupon({ code: 'BAD2', kind: 'FIXED', value: 0 }).expect(422);
  await api.post('/api/admin/coupons').send({ code: 'NOAUTH', kind: 'FIXED', value: 1000 }).expect(401);
  const list = (await api.get('/api/admin/coupons').set(admin).expect(200)).body as { code: string; usedCount: number }[];
  expect(list.find(item => item.code === 'ONCE')!.usedCount).toBe(1);
});

test('hai khách đặt cùng lúc với mã giới hạn 1 lượt: chỉ một đơn được áp dụng', async () => {
  await makeCoupon({ code: 'RACE', usageLimit: 1 }).expect(201);
  const results = await Promise.all([1, 2, 3, 4].map(() => api.post('/api/orders').send(order({ couponCode: 'RACE' }))));
  expect(results.filter(row => row.status === 201)).toHaveLength(1);
  expect((await db.coupon.findUniqueOrThrow({ where: { code: 'RACE' } })).usedCount).toBe(1);
});

// ===== Sản phẩm mua kèm / đề xuất =====
test('admin đặt sản phẩm mua kèm và đề xuất; trang sản phẩm trả danh sách còn hàng', async () => {
  await api.put('/api/admin/products/' + gear.id + '/links').set(admin).send({ CROSSSELL: ['betta-thu'], UPSELL: [] }).expect(200);
  expect((await api.get('/api/admin/products/' + gear.id + '/links').set(admin).expect(200)).body).toEqual([{ type: 'CROSSSELL', slug: 'betta-thu', name: 'Betta thử' }]);
  const page = (await api.get('/api/products/loc-thu').expect(200)).body;
  expect(page.crossSells.map((row: { slug: string }) => row.slug)).toEqual(['betta-thu']);
  expect(page.upSells).toEqual([]);
  await api.put('/api/admin/products/' + gear.id + '/links').set(admin).send({ CROSSSELL: ['khong-co'] }).expect(422);
  await api.put('/api/admin/products/' + gear.id + '/links').set(admin).send({ CROSSSELL: ['loc-thu'] }).expect(422);
  await api.put('/api/admin/products/' + gear.id + '/links').set(admin).send({ CROSSSELL: [], UPSELL: [] }).expect(200);
});

// ===== Tài khoản khách hàng =====
const register = (email: string, extra: Record<string, unknown> = {}) => api.post('/api/account/register').send({ name: 'Nguyễn An', email, password: 'matkhau123', ...extra });
const bearer = (token: string) => ({ Authorization: 'Bearer ' + token });

test('đăng ký: mật khẩu đủ mạnh, email duy nhất (không phân biệt hoa thường); đăng nhập đúng/sai; mật khẩu được băm', async () => {
  await register('weak@example.com', { password: 'abc' }).expect(422);
  await register('weak@example.com', { password: 'chuchuchuchu' }).expect(422);
  await register('khong-phai-email').expect(422);
  const created = await register('An@Example.com').expect(201);
  expect(created.body.customer).toMatchObject({ email: 'an@example.com', name: 'Nguyễn An' });
  expect(JSON.stringify(created.body)).not.toContain('passwordHash');
  const row = await db.customer.findUniqueOrThrow({ where: { email: 'an@example.com' } });
  expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  const duplicate = await register('AN@example.com');
  expect(duplicate.status).toBe(409);
  expect((await api.post('/api/account/login').send({ email: 'an@example.com', password: 'sai-mat-khau1' })).status).toBe(401);
  expect((await api.post('/api/account/login').send({ email: 'khong-co@example.com', password: 'matkhau123' })).status).toBe(401);
  const login = await api.post('/api/account/login').send({ email: ' AN@example.com ', password: 'matkhau123' }).expect(200);
  expect((await api.get('/api/account/me').set(bearer(login.body.token)).expect(200)).body).toMatchObject({ name: 'Nguyễn An', orderCount: 0 });
  await api.get('/api/account/me').expect(401);
  await api.get('/api/account/me').set(bearer('khong-phai-token')).expect(401);
  // token khách hàng không dùng được cho API quản trị
  await api.get('/api/admin/coupons').set(bearer(login.body.token)).expect(401);
});

test('chi tiết tài khoản: đổi tên, đổi email cần mật khẩu, đổi mật khẩu rồi đăng nhập lại', async () => {
  const { token } = (await register('detail@example.com').expect(201)).body;
  await api.patch('/api/account/me').set(bearer(token)).send({ name: 'Trần Bình', phone: '0933000333' }).expect(200);
  expect((await api.patch('/api/account/me').set(bearer(token)).send({ email: 'moi@example.com' })).status).toBe(403);
  expect((await api.patch('/api/account/me').set(bearer(token)).send({ email: 'moi@example.com', currentPassword: 'sai' })).status).toBe(403);
  await register('dung-roi@example.com').expect(201);
  expect((await api.patch('/api/account/me').set(bearer(token)).send({ email: 'dung-roi@example.com', currentPassword: 'matkhau123' })).status).toBe(409);
  const changed = await api.patch('/api/account/me').set(bearer(token)).send({ email: 'moi@example.com', currentPassword: 'matkhau123' }).expect(200);
  expect(changed.body).toMatchObject({ email: 'moi@example.com', name: 'Trần Bình', phone: '0933000333' });
  expect((await api.post('/api/account/password').set(bearer(token)).send({ currentPassword: 'sai-sai-sai1', newPassword: 'matkhaumoi456' })).status).toBe(403);
  await api.post('/api/account/password').set(bearer(token)).send({ currentPassword: 'matkhau123', newPassword: 'yeu' }).expect(422);
  await api.post('/api/account/password').set(bearer(token)).send({ currentPassword: 'matkhau123', newPassword: 'matkhaumoi456' }).expect(200);
  expect((await api.post('/api/account/login').send({ email: 'moi@example.com', password: 'matkhau123' })).status).toBe(401);
  await api.post('/api/account/login').send({ email: 'moi@example.com', password: 'matkhaumoi456' }).expect(200);
}, 20000); // Nhiều lần băm bcrypt, máy chậm có thể vượt 5 giây mặc định.

test('quên mật khẩu: luôn trả lời như nhau, token lưu dạng băm, dùng được một lần và hết hạn sau 1 giờ', async () => {
  await register('quen@example.com').expect(201);
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const known = await api.post('/api/account/forgot').send({ email: 'quen@example.com' }).expect(200);
  const unknown = await api.post('/api/account/forgot').send({ email: 'ai-do@example.com' }).expect(200);
  expect(known.body).toEqual(unknown.body);
  info.mockRestore();
  const row = await db.customer.findUniqueOrThrow({ where: { email: 'quen@example.com' } });
  expect(row.resetTokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(row.resetExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  // lấy token thật bằng cách tạo lại một token đã biết (token gốc chỉ có trong email)
  const { createHash } = await import('node:crypto');
  const token = 'a'.repeat(64);
  await db.customer.update({ where: { id: row.id }, data: { resetTokenHash: createHash('sha256').update(token).digest('hex') } });
  await api.post('/api/account/reset').send({ email: 'quen@example.com', token: 'b'.repeat(64), password: 'matkhaumoi789' }).expect(400);
  await api.post('/api/account/reset').send({ email: 'quen@example.com', token, password: 'yeu' }).expect(422);
  const done = await api.post('/api/account/reset').send({ email: 'quen@example.com', token, password: 'matkhaumoi789' }).expect(200);
  expect(done.body.token).toBeTruthy();
  await api.post('/api/account/reset').send({ email: 'quen@example.com', token, password: 'matkhaukhac123' }).expect(400);
  await api.post('/api/account/login').send({ email: 'quen@example.com', password: 'matkhaumoi789' }).expect(200);
  await db.customer.update({ where: { id: row.id }, data: { resetTokenHash: createHash('sha256').update(token).digest('hex'), resetExpiresAt: new Date(Date.now() - 1000) } });
  await api.post('/api/account/reset').send({ email: 'quen@example.com', token, password: 'matkhaumoi000' }).expect(400);
});

test('địa chỉ giao hàng và thanh toán được lưu theo tài khoản', async () => {
  const { token } = (await register('diachi@example.com').expect(201)).body;
  expect((await api.get('/api/account/addresses').set(bearer(token)).expect(200)).body).toEqual({ shippingAddress: null, billingAddress: null });
  const address = { name: 'Nguyễn An', phone: '0901234567', province: 'Hà Nội', district: 'Cầu Giấy', ward: 'Dịch Vọng', address: '1 Xuân Thủy' };
  await api.put('/api/account/addresses').set(bearer(token)).send({ shippingAddress: { ...address, phone: '1' } }).expect(422);
  const saved = await api.put('/api/account/addresses').set(bearer(token)).send({ shippingAddress: address, billingAddress: address }).expect(200);
  expect(saved.body.shippingAddress).toMatchObject({ province: 'Hà Nội', ward: 'Dịch Vọng' });
  const cleared = await api.put('/api/account/addresses').set(bearer(token)).send({ billingAddress: null }).expect(200);
  expect(cleared.body).toMatchObject({ billingAddress: null, shippingAddress: { district: 'Cầu Giấy' } });
});

test('đơn hàng của tôi: đặt khi đã đăng nhập thì gắn vào tài khoản; chỉ xem được đơn của mình; hủy đơn chờ xác nhận hoàn lại kho', async () => {
  const mine = (await register('don@example.com').expect(201)).body.token;
  const other = (await register('khac@example.com').expect(201)).body.token;
  const before = (await db.productVariant.findUniqueOrThrow({ where: { id: gear.variant } })).stock;
  const created = await api.post('/api/orders').set(bearer(mine)).send(order({ items: lines(gear.variant, 2) })).expect(201);
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: gear.variant } })).stock).toBe(before - 2);
  const list = (await api.get('/api/account/orders').set(bearer(mine)).expect(200)).body;
  expect(list).toMatchObject([{ code: created.body.code, status: 'PENDING', total: created.body.total, itemCount: 2 }]);
  expect((await api.get('/api/account/orders').set(bearer(other)).expect(200)).body).toEqual([]);
  const detail = (await api.get('/api/account/orders/' + created.body.code).set(bearer(mine)).expect(200)).body;
  expect(detail.items).toHaveLength(1);
  expect(detail.psid).toBeUndefined();
  await api.get('/api/account/orders/' + created.body.code).set(bearer(other)).expect(404);
  await api.post('/api/account/orders/' + created.body.code + '/cancel').set(bearer(other)).expect(404);
  expect((await api.get('/api/account/me').set(bearer(mine)).expect(200)).body.recentOrders[0].code).toBe(created.body.code);
  await api.post('/api/account/orders/' + created.body.code + '/cancel').set(bearer(mine)).expect(200);
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: gear.variant } })).stock).toBe(before);
  expect((await api.post('/api/account/orders/' + created.body.code + '/cancel').set(bearer(mine))).status).toBe(409);
  // đơn đã xác nhận không tự hủy được
  const second = await api.post('/api/orders').set(bearer(mine)).send(order()).expect(201);
  const row = await db.order.findUniqueOrThrow({ where: { code: second.body.code } });
  await api.patch('/api/admin/orders/' + row.id + '/status').set(admin).send({ status: 'CONFIRMED' }).expect(200);
  expect((await api.post('/api/account/orders/' + second.body.code + '/cancel').set(bearer(mine))).status).toBe(409);
});

test('tạo tài khoản ngay khi đặt hàng: cần email, mật khẩu mạnh, email chưa dùng; đơn gắn vào tài khoản mới', async () => {
  await api.post('/api/orders').send(order({ createAccount: { password: 'matkhau123' } })).expect(422);
  await api.post('/api/orders').send(order({ email: 'moi1@example.com', createAccount: { password: 'chuchuchu' } })).expect(422);
  const stock = (await db.productVariant.findUniqueOrThrow({ where: { id: gear.variant } })).stock;
  const created = await api.post('/api/orders').send(order({ email: 'Moi1@Example.com', createAccount: { password: 'matkhau123' } })).expect(201);
  expect(created.body).toMatchObject({ accountCreated: true, email: 'Moi1@Example.com' });
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: gear.variant } })).stock).toBe(stock - 1);
  const login = await api.post('/api/account/login').send({ email: 'moi1@example.com', password: 'matkhau123' }).expect(200);
  expect((await api.get('/api/account/orders').set(bearer(login.body.token)).expect(200)).body).toHaveLength(1);
  // email đã có tài khoản: từ chối trước khi trừ kho
  const duplicate = await api.post('/api/orders').send(order({ email: 'moi1@example.com', createAccount: { password: 'matkhau123' } }));
  expect(duplicate.status).toBe(409);
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: gear.variant } })).stock).toBe(stock - 1);
  // khách vãng lai vẫn đặt hàng được (Guest Checkout bật có chủ đích)
  await api.post('/api/orders').send(order()).expect(201);
});

test('email giao dịch dùng khung thương hiệu: logo, nút đồng bộ màu, thoát ký tự HTML', async () => {
  const { emailLayout } = await import('../src/accounts');
  const html = emailLayout('Xin chào <b>', '<p>Nội dung</p>', { label: 'Vào tài khoản', href: 'https://long-fish.example/tai-khoan?a=1&b="2"' }, 'Ghi chú <script>');
  expect(html).toContain('https://long-fish.example/logo-email.png');
  expect(html).toContain('background:#1f5c46');
  expect(html).toContain('Xin chào &lt;b&gt;');
  expect(html).toContain('&amp;b=&quot;2&quot;');
  expect(html).not.toContain('<script>');
});
