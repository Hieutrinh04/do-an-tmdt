import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';

const name = 'test-' + randomUUID() + '.db';
const file = resolve('prisma', name);
process.env.DATABASE_URL = 'file:./' + name;
process.env.MOCK_INTEGRATIONS = 'true';
process.env.PUBLIC_BASE_URL = 'https://long-fish.example';
process.env.LIVE_FISH_PACKING_FEE = '30000';
process.env.LIVE_FISH_PROVINCES_JSON = '["Hồ Chí Minh"]';
process.env.SHIPPING_FREE_THRESHOLD = '600000';
process.env.SHIPPING_DEFAULT_FEE = '35000';
process.env.SHIPPING_FEES_JSON = '{"Hồ Chí Minh":20000}';
const secret = randomUUID() + randomUUID();
process.env.JWT_SECRET = secret;
process.env.BANK_WEBHOOK_SECRET = 'bank-' + randomUUID();
process.env.ORDER_RATE_LIMIT = '500';
const token = jwt.sign({}, secret, { subject: 'test-admin', audience: 'long-fish-admin', expiresIn: '1h' });
let db: typeof import('../src/db').db;
let api: ReturnType<typeof supertest>;
let variant: string;
const request = () => ({
  customerName: 'Nguyễn An', phone: '0901234567', province: 'Hồ Chí Minh', district: 'Quận 1',
  address: '12 Nguyễn Huệ', paymentMethod: 'COD', subtotal: 1, shippingFee: 1,
  items: [{ variantId: variant, quantity: 2 }],
});
const post = () => api.post('/api/orders').send(request());
const change = (id: string, status: string, confirmCancellation = false) =>
  api.patch('/api/admin/orders/' + id + '/status').set('Authorization', 'Bearer ' + token).send({ status, confirmCancellation });

test('upload cần JWT và từ chối SVG, ảnh giả hoặc quá 5 MB', async () => {
  const upload = () => api.post('/api/admin/uploads').set('Authorization', 'Bearer ' + token);
  await api.post('/api/admin/uploads').attach('image', Buffer.from('x'), 'a.jpg').expect(401);
  await upload().attach('image', Buffer.from('<svg/>'), 'a.svg').expect(415);
  await upload().attach('image', Buffer.from('không phải PNG'), 'a.png').expect(415);
  await upload().attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), 'a.jpg').expect(413);
  await upload().attach('image', Buffer.from([255, 216, 255, 0, 0]), 'a.jpg').expect(422);
});

test('PATCH retains catalog and variant flags when updating only stock or images', async () => {
  const row = await db.productVariant.update({ where: { id: variant }, data: {
    minQty: 6, gender: 'Cái', unit: 'con', isActive: false, product: { update: { isLiveFish: true, isActive: false } },
  } });
  const auth = { Authorization: 'Bearer ' + token };
  const product = await api.patch('/api/admin/products/' + row.productId).set(auth).send({ images: ['/catalog/betta.svg'] }).expect(200);
  expect(product.body).toMatchObject({ isActive: false, isLiveFish: true });
  const patched = await api.patch('/api/admin/products/' + row.productId + '/variants/' + variant).set(auth).send({ stock: 10 }).expect(200);
  expect(patched.body).toMatchObject({ isActive: false, stock: 10, minQty: 6, gender: 'Cái', unit: 'con' });
});

test('upload lưu hai WebP, chặn traversal và chỉ ghi nguồn ảnh đang dùng', async () => {
  await mkdir(resolve('data'), { recursive: true });
  const directory = await mkdtemp(resolve('data', 'long-fish-uploads-'));
  vi.stubEnv('UPLOADS_DIR', directory);
  try {
    const png = await sharp({ create: { width: 1500, height: 900, channels: 3, background: '#10324c' } }).png().toBuffer();
    const { body } = await api.post('/api/admin/uploads').set('Authorization', 'Bearer ' + token).attach('image', png, 'a.png').expect(201);
    expect(body.file).toMatch(/^\/uploads\/[a-f0-9-]{36}\.webp$/);
    for (const [file, width] of [[body.file, 1200], [body.file.replace('.webp', '-thumb.webp'), 480]] as const) {
      const response = await api.get(file).expect('Content-Type', /image\/webp/).expect('Cache-Control', /immutable/).expect(200);
      expect(await sharp(response.body).metadata()).toMatchObject({ format: 'webp', width, height: width * 3 / 4 });
    }
    await api.get('/uploads/%2e%2e%2fpackage.json').expect(404);
    expect((await api.get('/api/photo-credits').expect(200)).body).toEqual([]);
    const product = { name: 'Ảnh tải thử', slug: 'anh-tai-thu', description: 'Ảnh tải thử', price: 1000, category: 'Thiết bị', images: [body.file] };
    const saved = await api.post('/api/admin/products').set('Authorization', 'Bearer ' + token).send(product).expect(201);
    expect((await api.get('/api/photo-credits').expect(200)).body).toEqual([{ slug: product.slug, title: product.name, file: body.file }]);
    await api.patch('/api/admin/products/' + saved.body.id).set('Authorization', 'Bearer ' + token).send({ images: ['/catalog/equipment.svg'] }).expect(200);
    expect((await api.get('/api/photo-credits').expect(200)).body).toEqual([]);
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

beforeAll(async () => {
  db = (await import('../src/db')).db;
  const schema = readdirSync('prisma/migrations').filter(dir => /^\d/.test(dir)).sort()
    .map(dir => readFileSync('prisma/migrations/' + dir + '/migration.sql', 'utf8')).join('\n');
  for (const statement of schema.split(';').map(value => value.trim()).filter(Boolean)) {
    await db.$executeRawUnsafe(statement);
  }
  api = supertest((await import('../src/app')).createApp());
}, 30000);

beforeEach(async () => {
  const row = await db.product.create({ data: {
    name: 'Bộ lọc thử', slug: randomUUID(), price: 120000, description: 'Bộ lọc thử', images: [], category: 'Thiết bị',
    variants: { create: { color: 'Trắng', size: '3–4 cm', sku: randomUUID(), stock: 2 } },
  }, include: { variants: true } });
  variant = row.variants[0].id;
});

afterAll(async () => {
  await db?.$disconnect();
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { unlinkSync(file + suffix); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
});

test('tạo đơn, tính giá và phí trên máy chủ, ghi hàng đợi', async () => {
  const response = await post().expect(201);
  expect(response.body).toMatchObject({ subtotal: 240000, shippingFee: 20000, total: 260000 });
  expect(response.body.code).toMatch(/^DH\d{8}-\d{4,}$/);
  expect(await db.outboxEvent.findFirst({ orderBy: { id: 'desc' } })).toMatchObject({ kind: 'created', payload: { code: response.body.code } });
});

test('QR có đúng số tiền và mã đơn', async () => {
  const { body } = await api.post('/api/orders').send({ ...request(), paymentMethod: 'BANK_QR' }).expect(201);
  const qr = new URL(body.qrUrl);
  expect(qr.searchParams.get('amount')).toBe(String(body.total));
  expect(qr.searchParams.get('addInfo')).toBe(body.code);
});

test('từ chối đặt vượt tồn', async () => {
  await api.post('/api/orders').send({ ...request(), items: [{ variantId: variant, quantity: 3 }] }).expect(409);
  expect(await db.productVariant.findUnique({ where: { id: variant } })).toMatchObject({ stock: 2 });
});

test('tám yêu cầu đồng thời chỉ một yêu cầu thành công', async () => {
  await db.productVariant.update({ where: { id: variant }, data: { product: { update: { isLiveFish: true } } } });
  const liveOrder = () => api.post('/api/orders').send({ ...request(), doaAccepted: true });
  const results = await Promise.all(Array.from({ length: 8 }, liveOrder));
  expect(results.filter(result => result.status === 201)).toHaveLength(1);
  expect(results.filter(result => result.status === 409)).toHaveLength(7);
  expect(await db.productVariant.findUnique({ where: { id: variant } })).toMatchObject({ stock: 0 });
});

test('hủy hoàn kho đúng một lần', async () => {
  const { body } = await post().expect(201);
  const order = await db.order.findUniqueOrThrow({ where: { code: body.code } });
  await change(order.id, 'CANCELLED').expect(200);
  await change(order.id, 'CANCELLED').expect(200);
  expect(await db.productVariant.findUnique({ where: { id: variant } })).toMatchObject({ stock: 2 });
  expect(await db.orderStatusLog.count({ where: { orderId: order.id, toStatus: 'CANCELLED' } })).toBe(1);
});

test('tra cứu phải khớp cả mã và điện thoại', async () => {
  const { body } = await post().expect(201);
  await api.get('/api/orders/track').query({ code: body.code, phone: '0901234568' }).expect(404);
  const response = await api.get('/api/orders/track').query({ code: body.code, phone: '+84901234567' }).expect(200);
  expect(response.body.status).toBe('PENDING');
  expect(response.body).not.toHaveProperty('address');
});

test('từ chối nhảy trạng thái và yêu cầu xác nhận hủy khi đang giao', async () => {
  const { body } = await post().expect(201);
  const order = await db.order.findUniqueOrThrow({ where: { code: body.code } });
  await change(order.id, 'DELIVERED').expect(409);
  await change(order.id, 'CONFIRMED').expect(200);
  await change(order.id, 'SHIPPING').expect(200);
  await change(order.id, 'CANCELLED').expect(409);
  await change(order.id, 'CANCELLED', true).expect(200);
});

test('giới tính phân biệt hai biến thể cùng dòng và cỡ, đơn giữ giới tính và đơn vị', async () => {
  const original = await db.productVariant.findUniqueOrThrow({ where: { id: variant } });
  const female = await db.productVariant.create({ data: {
    productId: original.productId, color: original.color, size: original.size,
    gender: 'Cái', unit: 'con', stock: 2, sku: randomUUID(),
  } });
  const stock = await api.get('/api/products/' + original.productId + '/stock').query({ gender: 'Cái' }).expect(200);
  expect(stock.body.stock).toBe(2);
  const order = await api.post('/api/orders').send({ ...request(), items: [{ variantId: female.id, quantity: 1 }] }).expect(201);
  expect(order.body.items[0]).toMatchObject({ variantId: female.id, gender: 'Cái', unit: 'con' });
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant } })).stock).toBe(2);
});

test('cá sống ngoài vùng hoặc thiếu xác nhận DOA bị chặn và không mất tồn', async () => {
  const row = await db.productVariant.update({ where: { id: variant }, data: { product: { update: { isLiveFish: true } } } });
  const outside = { ...request(), province: 'An Giang', doaAccepted: true };
  const quoted = await api.post('/api/shipping/quote').send(outside).expect(200);
  expect(quoted.body.liveDeliveryAvailable).toBe(false);
  await api.post('/api/orders').send(outside).expect(422);
  await api.post('/api/orders').send(request()).expect(422);
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: row.id } })).stock).toBe(2);
});

test('cá sống áp dụng số lượng tối thiểu và phí đóng gói, VietQR dùng tổng mới', async () => {
  await db.productVariant.update({ where: { id: variant }, data: {
    stock: 12, minQty: 6, product: { update: { isLiveFish: true } },
  } });
  await api.post('/api/orders').send({ ...request(), doaAccepted: true }).expect(422);
  const input = { ...request(), items: [{ variantId: variant, quantity: 6 }], doaAccepted: true, paymentMethod: 'BANK_QR' };
  const free = await api.post('/api/shipping/quote').send(input).expect(200);
  expect(free.body).toMatchObject({ subtotal: 720000, shippingFee: 0, packingFee: 30000, total: 750000 });
  const product = await db.productVariant.findUniqueOrThrow({ where: { id: variant } });
  await db.product.update({ where: { id: product.productId }, data: { price: 25000 } });
  const { body } = await api.post('/api/orders').send(input).expect(201);
  expect(body).toMatchObject({ hasLiveFish: true, subtotal: 150000, packingFee: 30000, shippingFee: 20000, total: 200000 });
  expect(new URL(body.qrUrl).searchParams.get('amount')).toBe('200000');
  const order = await db.order.findUniqueOrThrow({ where: { code: body.code } });
  await change(order.id, 'CANCELLED').expect(200);
  expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant } })).stock).toBe(12);
});

test('phụ kiện giao ngoài vùng cá sống và không tính phí đóng gói', async () => {
  const { body } = await api.post('/api/orders').send({ ...request(), province: 'An Giang' }).expect(201);
  expect(body).toMatchObject({ packingFee: 0, hasLiveFish: false, shippingFee: 35000 });
});

test('bot hiểu từ khóa cá cảnh không dấu và chỉ gợi ý sản phẩm phù hợp', async () => {
  const psid = '100000000081';
  const row = await db.productVariant.findUniqueOrThrow({ where: { id: variant } });
  await db.product.update({ where: { id: row.productId }, data: {
    name: 'Guppy thử', category: 'Guppy', isLiveFish: true, slug: 'guppy-kiem-thu', images: ['/catalog/photos/guppy-kiem-thu-1.webp'],
  } });
  const messages = vi.spyOn(console, 'info').mockImplementation(() => {});
  try {
    const result = await (await import('../src/bot')).handleMessage({ mid: randomUUID(), psid, text: 'Cho mình xem cá bảy màu' });
    expect(result).toMatchObject({ replied: true });
    expect(messages).toHaveBeenCalledWith('[Messenger mock]', expect.stringContaining('https://long-fish.example/catalog/photos/guppy-kiem-thu-1-thumb.webp'));
  } finally { messages.mockRestore(); }
  expect((await db.conversationState.findUniqueOrThrow({ where: { psid } })).selection)
    .toEqual({ candidates: ['guppy-kiem-thu'] });
});

test('admin summary/filters reflect pending, payment and requested delivery date', async()=>{
  const delivery=new Date(Date.now()+86400000).toISOString();
  const {body}=await api.post('/api/orders').send({...request(),paymentMethod:'BANK_QR',preferredDelivery:delivery}).expect(201);
  const auth={Authorization:'Bearer '+token};
  await api.get('/api/admin/orders/summary').expect(401);
  const summary=await api.get('/api/admin/orders/summary').set(auth).expect(200);
  expect(summary.body.pending).toBe(await db.order.count({where:{status:'PENDING'}}));
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date(delivery));
  const result=await api.get('/api/admin/orders').set(auth).query({q:body.code,paymentMethod:'BANK_QR',paymentStatus:'UNPAID',deliveryDate:date}).expect(200);
  expect(result.body.total).toBe(1);
  expect((await api.get('/api/admin/orders').set(auth).query({q:body.code,paymentStatus:'PAID'}).expect(200)).body.total).toBe(0);
});
test('notes/payment create admin audit history and never leak notes into public timeline',async()=>{
  const{body}=await post().expect(201);const order=await db.order.findUniqueOrThrow({where:{code:body.code}});const auth={Authorization:'Bearer '+token};
  const note='NỘI BỘ: kiểm tra túi oxy';
  const edited=await api.patch('/api/admin/orders/'+order.id+'/details').set(auth).send({internalNote:note}).expect(200);
  expect(edited.body.history.some((row:any)=>row.action==='note'&&row.detail.includes(note))).toBe(true);
  await api.patch('/api/admin/orders/'+order.id+'/payment').set(auth).send({}).expect(200);
  await api.patch('/api/admin/orders/'+order.id+'/payment').set(auth).send({}).expect(200);
  expect(await db.orderStatusLog.count({where:{orderId:order.id,action:'payment'}})).toBe(1);
  const tracked=await api.get('/api/orders/track').query({code:body.code,phone:request().phone}).expect(200);
  expect(tracked.body.history).toHaveLength(1);expect(JSON.stringify(tracked.body)).not.toContain(note);
});
test('CSV exports enforce auth/range and neutralize formula injection in real downloaded content',async()=>{
  const{body}=await api.post('/api/orders').send({...request(),customerName:'=HYPERLINK("https://example.com")',address:'@SUM(1)'}).expect(201);
  const auth={Authorization:'Bearer '+token};const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date());
  await api.get('/api/admin/exports/orders').query({from:day,to:day}).expect(401);
  const csv=await api.get('/api/admin/exports/orders').set(auth).query({from:day,to:day}).expect(200);
  expect(csv.headers['content-type']).toContain('text/csv');expect(csv.headers['content-disposition']).toContain('attachment');
  expect(csv.text).toContain(body.code);expect(csv.text).toContain('"\'=HYPERLINK');expect(csv.text).toContain('"\'@SUM');
  const revenue=await api.get('/api/admin/exports/revenue').set(auth).query({from:day,to:day}).expect(200);
  expect(revenue.text).toContain('Doanh thu VND');expect(revenue.text).toContain(day);
  await api.get('/api/admin/exports/orders').set(auth).query({from:'2020-01-01',to:day}).expect(422);
  await api.get('/api/admin/exports/orders').set(auth).query({from:day,to:'2020-01-01'}).expect(422);
  const {csvField}=await import('../src/csv');for(const prefix of['=','+','-','@',' \t=','\n='])expect(csvField(prefix+'danger')).toMatch(/^"'/);
});
test('low stock threshold is persisted per variant and validates limits',async()=>{
  const row=await db.productVariant.findUniqueOrThrow({where:{id:variant}});
  const path='/api/admin/products/'+row.productId+'/variants/'+variant;const auth={Authorization:'Bearer '+token};
  expect(row.lowStockThreshold).toBe(5);
  const updated=await api.patch(path).set(auth).send({lowStockThreshold:17}).expect(200);
  expect(updated.body).toMatchObject({lowStockThreshold:17,stock:2});
  await api.patch(path).set(auth).send({lowStockThreshold:-1}).expect(422);
  await api.patch(path).set(auth).send({lowStockThreshold:1000001}).expect(422);
});
test('login locks repeated failures for 15 minutes while reporting Retry-After',async()=>{
  const username='lock-'+randomUUID();for(let i=0;i<10;i++)await api.post('/api/admin/login').send({username,password:'wrong-password'}).expect(401);
  const locked=await api.post('/api/admin/login').send({username,password:'wrong-password'}).expect(429);
  expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  await api.post('/api/admin/login').send({username:'different-'+randomUUID(),password:'wrong-password'}).expect(401);
});
test('webhook ngân hàng đối soát đúng tiền, chống ghi lặp và phát thông báo', async () => {
  const bank = (payload: Record<string, unknown>, secret = process.env.BANK_WEBHOOK_SECRET!) =>
    api.post('/api/payments/bank').set('x-bank-secret', secret).send(payload);
  const { body } = await api.post('/api/orders').send({ ...request(), paymentMethod: 'BANK_QR' }).expect(201);
  const order = await db.order.findUniqueOrThrow({ where: { code: body.code } });
  await bank({ code: body.code, amount: body.total }, 'wrong-secret').expect(401);
  await bank({ code: body.code, amount: body.total - 1 }).expect(422);
  expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('UNPAID');
  const before = await db.outboxEvent.count({ where: { kind: 'payment' } });
  const first = await bank({ code: body.code, amount: body.total, reference: 'FT-TEST-1' }).expect(200);
  expect(first.body).toEqual({ ok: true, code: body.code, paymentStatus: 'PAID' });
  await bank({ code: body.code, amount: body.total, reference: 'FT-TEST-1' }).expect(200);
  expect(await db.orderStatusLog.count({ where: { orderId: order.id, action: 'payment' } })).toBe(1);
  const after = await db.outboxEvent.count({ where: { kind: 'payment' } });
  expect(after - before).toBe(1);
  expect(await db.outboxEvent.findFirst({ where: { kind: 'payment' }, orderBy: { id: 'desc' } }))
    .toMatchObject({ payload: { code: body.code, notify: true } });
  const tracked = await api.get('/api/orders/track').query({ code: body.code, phone: request().phone }).expect(200);
  expect(tracked.body.paymentStatus).toBe('PAID');
  expect(JSON.stringify(tracked.body)).not.toContain('FT-TEST-1');
  await db.productVariant.update({ where: { id: variant }, data: { stock: 10 } });
  const content = await api.post('/api/orders').send({ ...request(), paymentMethod: 'BANK_QR' }).expect(201);
  await bank({ content: 'CK ' + content.body.code.replace('-', '') + ' Long Fish', amount: content.body.total }).expect(200);
  const cod = await post().expect(201);
  await bank({ code: cod.body.code, amount: cod.body.total }).expect(422);
});
test('top bán chạy tính cả phụ kiện, không chỉ cá sống', async () => {
  const row = await db.productVariant.findUniqueOrThrow({ where: { id: variant } });
  const { body } = await post().expect(201);
  const order = await db.order.findUniqueOrThrow({ where: { code: body.code } });
  await change(order.id, 'CONFIRMED').expect(200);
  await change(order.id, 'SHIPPING').expect(200);
  await change(order.id, 'DELIVERED').expect(200);
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
  const stats = await api.get('/api/admin/stats/overview').set('Authorization', 'Bearer ' + token).query({ from: day, to: day }).expect(200);
  expect(stats.body.top).toContainEqual({ id: row.productId, name: 'Bộ lọc thử', quantity: 2, revenue: 240000 });
});
