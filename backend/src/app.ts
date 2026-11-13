import express, { ErrorRequestHandler, RequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { csvDocument } from './csv';
import { equalSecret } from './messenger';
import { integrations } from './integrations';
import { seo } from './seo';
import { fitDescription, fitTitle } from './seo-text';
import { categories, pageBySlug, siteInfo } from './site-content';
import { openHandoff } from './bot';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { dayKey, dayStart, addDays, env } from './env';
import { bankTransferAvailable, paymentSandbox, shippingInfo, clean, date, doaPolicy, liveEverywhere, liveProvinces, orderLines, HttpError, orderDetails, orderInput, phone, provinces, psid, qrUrl, required, statusLabels } from './domain';
import { changeStatus, createOrder, reconcileBankPayment, trackOrder, updatePayment } from './orders';
import { couponKinds, normalizeCode, priceCart, quoteInput } from './commerce';
import { addressInput, changePassword, currentCustomerId, customerIdFrom, finishPasswordReset, loginCustomer, publicCustomer, registerCustomer,
  requireCustomer, sendWelcomeEmail, signCustomerToken, startPasswordReset, strongPassword, updateProfile } from './accounts';
import { detail, detailPage, products, productInput, productPatch, removeVariant, stock, updateVariant, variantInput, variantPatch } from './catalog';
import { overview, report } from './stats';
import { uploadAdmin, uploadPublic, uploadedPhotoCredits } from './uploads';

const id = required(80);
const code = z.string().trim().toUpperCase().regex(/^DH\d{8}-\d{4,10}$/);
const statuses = z.nativeEnum(OrderStatus);
const range = z.object({ from: date.optional(), to: date.optional() });


const admin: RequestHandler = (req, _res, next) => {
  try {
    const token = req.get('authorization')?.match(/^Bearer (.+)$/)?.[1] || '';
    const verified = jwt.verify(token, env.JWT_SECRET || '', { algorithms: ['HS256'], audience: 'long-fish-admin' });
    if (typeof verified === 'string' || !verified.sub) throw new Error();
    next();
  } catch { next(new HttpError(401, 'Vui lòng đăng nhập quản trị.')); }
};

const internal: RequestHandler = (req, _res, next) => {
  if (!equalSecret(env.INTERNAL_API_KEY, req.get('x-api-key'))) return next(new HttpError(401, 'API key không hợp lệ.'));
  next();
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_ORIGIN || 'http://localhost:8080' }));
  app.use(express.json({ limit: '256kb' }));
  app.use('/uploads', uploadPublic);
  app.use('/seo', seo);
  app.get('/api/health', async (_req, res) => {
    await db.product.count();
    res.json({ ok: true });
  });

  const api = express.Router();
  const publicLimit = rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' } });
  const trackLimit = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Bạn đã tra cứu quá nhiều lần. Vui lòng thử lại sau.' } });
  api.use(['/products', '/shipping', '/orders'], publicLimit);
  api.post('/orders', rateLimit({ windowMs: 60_000, limit: Number(env.ORDER_RATE_LIMIT) || 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Bạn tạo quá nhiều đơn trong một phút. Vui lòng thử lại sau.' } }));
  api.get('/products', async (req, res) => {
    const { search, category } = z.object({ search: clean(100).optional(), category: clean(80).optional() }).parse(req.query);
    res.json(await products(search, category));
  });
  api.get('/products/:id/stock', async (req, res) => {
    const query = z.object({ color: clean(70).optional(), size: clean(30).optional(), gender: clean(30).optional() }).parse(req.query);
    res.json(await stock(id.parse(req.params.id), query.color, query.size, query.gender));
  });
  api.get('/products/:slug', async (req, res) => { res.json(await detailPage(id.parse(req.params.slug))); });
  api.get('/photo-credits', publicLimit, async (_req, res) => res.set('Cache-Control', 'no-store').json(await uploadedPhotoCredits()));
  api.get('/shipping/provinces', (_req, res) => res.json(provinces));
  api.get('/shipping/policy', (_req, res) => res.json({ doaPolicy, liveProvinces, liveEverywhere, freeThreshold: shippingInfo().freeThreshold }));
  // Nội dung cố định phục vụ SEO: thông tin cửa hàng, danh mục có mô tả, trang giới thiệu/chính sách.
  api.get('/site', (_req, res) => res.set('Cache-Control', 'public, max-age=300').json(siteInfo()));
  api.get('/categories', publicLimit, async (_req, res) => {
    const counts = await db.product.groupBy({ by: ['category'], where: { isActive: true, variants: { some: { isActive: true } } }, _count: { _all: true } });
    res.set('Cache-Control', 'public, max-age=60').json(categories
      .map(item => ({ ...item, count: counts.find(row => row.category === item.name)?._count._all ?? 0 })).filter(item => item.count > 0));
  });
  api.get('/pages/:slug', (req, res) => {
    const page = pageBySlug(String(req.params.slug));
    if (!page) throw new HttpError(404, 'Không tìm thấy trang.');
    res.set('Cache-Control', 'public, max-age=300').json({ ...page, title: fitTitle(page.title, []), description: fitDescription(page.description) });
  });

  // ===== Tài khoản khách hàng (Dashboard, Đơn hàng, Địa chỉ, Chi tiết tài khoản, Đăng nhập/Đăng ký, Quên mật khẩu) =====
  const accountLimit = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Quá nhiều lần thử. Vui lòng thử lại sau ít phút.' } });
  const noStore: RequestHandler = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  api.use('/account', noStore);
  api.post('/account/register', accountLimit, async (req, res) => {
    const body = z.object({ name: required(100), email: z.string().trim().max(254).email('Email không hợp lệ.'), password: strongPassword, phone: z.string().trim().max(20).optional() }).parse(req.body);
    const customer = await registerCustomer(body);
    void sendWelcomeEmail(customer).catch(error => console.warn('[Email] Không gửi được email chào mừng:', error instanceof Error ? error.message : error));
    res.status(201).json({ token: signCustomerToken(customer.id), customer: publicCustomer(customer) });
  });
  api.post('/account/login', accountLimit, async (req, res) => {
    const body = z.object({ email: z.string().trim().max(254), password: z.string().min(1).max(200) }).parse(req.body);
    const customer = await loginCustomer(body.email, body.password);
    res.json({ token: signCustomerToken(customer.id), customer: publicCustomer(customer) });
  });
  api.post('/account/forgot', accountLimit, async (req, res) => {
    const body = z.object({ email: z.string().trim().max(254).email('Email không hợp lệ.') }).parse(req.body);
    await startPasswordReset(body.email).catch(error => console.warn('[Email] Không gửi được email đặt lại mật khẩu:', error instanceof Error ? error.message : error));
    res.json({ ok: true, message: 'Nếu email đã đăng ký, chúng tôi đã gửi liên kết đặt lại mật khẩu.' });
  });
  api.post('/account/reset', accountLimit, async (req, res) => {
    const body = z.object({ email: z.string().trim().max(254), token: z.string().regex(/^[a-f0-9]{64}$/), password: strongPassword }).parse(req.body);
    const customer = await finishPasswordReset(body.email, body.token, body.password);
    res.json({ token: signCustomerToken(customer.id), customer: publicCustomer(customer) });
  });
  api.get('/account/me', requireCustomer, async (req, res) => {
    const customer = await db.customer.findUnique({ where: { id: currentCustomerId(req) } });
    if (!customer) throw new HttpError(401, 'Phiên đăng nhập không còn hiệu lực.');
    const recent = await db.order.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, take: 3, select: { code: true, createdAt: true, status: true, total: true } });
    const orders = await db.order.count({ where: { customerId: customer.id } });
    res.json({ ...publicCustomer(customer), orderCount: orders, recentOrders: recent });
  });
  api.patch('/account/me', requireCustomer, async (req, res) => {
    const body = z.object({ name: required(100).optional(), phone: z.string().trim().max(20).optional(), email: z.string().trim().max(254).email('Email không hợp lệ.').optional(), currentPassword: z.string().max(200).optional() }).parse(req.body);
    res.json(publicCustomer(await updateProfile(currentCustomerId(req), body)));
  });
  api.post('/account/password', requireCustomer, accountLimit, async (req, res) => {
    const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: strongPassword }).parse(req.body);
    await changePassword(currentCustomerId(req), body.currentPassword, body.newPassword);
    res.json({ ok: true });
  });
  api.get('/account/addresses', requireCustomer, async (req, res) => {
    const customer = await db.customer.findUniqueOrThrow({ where: { id: currentCustomerId(req) } });
    res.json({ shippingAddress: customer.shippingAddress ?? null, billingAddress: customer.billingAddress ?? null });
  });
  api.put('/account/addresses', requireCustomer, async (req, res) => {
    const body = z.object({ shippingAddress: addressInput.nullable().optional(), billingAddress: addressInput.nullable().optional() }).parse(req.body);
    const data: { shippingAddress?: object | typeof Prisma.DbNull; billingAddress?: object | typeof Prisma.DbNull } = {};
    if (body.shippingAddress !== undefined) data.shippingAddress = body.shippingAddress ?? Prisma.DbNull;
    if (body.billingAddress !== undefined) data.billingAddress = body.billingAddress ?? Prisma.DbNull;
    const customer = await db.customer.update({ where: { id: currentCustomerId(req) }, data });
    res.json({ shippingAddress: customer.shippingAddress ?? null, billingAddress: customer.billingAddress ?? null });
  });
  api.get('/account/orders', requireCustomer, async (req, res) => {
    const rows = await db.order.findMany({ where: { customerId: currentCustomerId(req) }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { code: true, createdAt: true, status: true, paymentStatus: true, paymentMethod: true, total: true, items: { select: { quantity: true } } } });
    res.json(rows.map(row => ({ ...row, itemCount: row.items.reduce((sum, item) => sum + item.quantity, 0), items: undefined })));
  });
  api.get('/account/orders/:code', requireCustomer, async (req, res) => {
    const order = await db.order.findFirst({ where: { code: code.parse(req.params.code), customerId: currentCustomerId(req) }, include: orderDetails });
    if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
    res.json({ ...order, psid: undefined, internalNote: undefined });
  });
  // Khách chỉ tự hủy được đơn đang chờ xác nhận và chưa thanh toán; các trường hợp khác cần liên hệ cửa hàng.
  api.post('/account/orders/:code/cancel', requireCustomer, async (req, res) => {
    const order = await db.order.findFirst({ where: { code: code.parse(req.params.code), customerId: currentCustomerId(req) } });
    if (!order) throw new HttpError(404, 'Không tìm thấy đơn hàng.');
    if (order.status !== 'PENDING') throw new HttpError(409, 'Chỉ hủy được đơn đang chờ xác nhận. Vui lòng liên hệ cửa hàng.');
    if (order.paymentStatus === 'PAID') throw new HttpError(409, 'Đơn đã thanh toán, vui lòng liên hệ cửa hàng để được hoàn tiền.');
    const updated = await changeStatus(order.id, 'CANCELLED', false);
    res.json({ code: updated.code, status: updated.status });
  });
  // Biểu mẫu Liên hệ: lưu vào database cho admin xem. Ô "website" là bẫy chống bot: người thật không thấy và không điền.
  api.post('/contact', rateLimit({ windowMs: 10 * 60_000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Bạn gửi quá nhiều tin nhắn. Vui lòng thử lại sau ít phút.' } }), async (req, res) => {
    const body = z.object({
      name: required(100), email: z.string().trim().max(254).email('Email không hợp lệ.'), message: required(2000).pipe(z.string().min(10, 'Nội dung quá ngắn.')),
      website: z.string().max(200).optional(),
    }).parse(req.body);
    if (body.website) { res.status(201).json({ ok: true }); return; }
    await db.contactMessage.create({ data: { name: body.name, email: body.email, message: body.message } });
    res.status(201).json({ ok: true });
  });
  api.post('/shipping/quote', async (req, res) => {
    const body = quoteInput.parse(req.body);
    res.set('Cache-Control', 'no-store').json(await priceCart(body, customerIdFrom(req)));
  });
  api.post('/orders', async (req, res) => { res.status(201).json(await createOrder(orderInput.parse(req.body), customerIdFrom(req))); });
  api.get('/orders/track', trackLimit, async (req, res) => {
    const query = z.object({ code, phone }).parse(req.query);
    res.set('Cache-Control', 'no-store').json(await trackOrder(query.code, query.phone));
  });
  // Giao diện hỏi trước để ẩn/khóa lựa chọn chuyển khoản khi chưa cấu hình ngân hàng, thay vì báo lỗi sau khi bấm đặt.
  api.get('/payments/config', (_req, res) => res.set('Cache-Control', 'no-store').json({ bankTransfer: bankTransferAvailable(), sandbox: paymentSandbox() }));
  // Chỉ có khi PAYMENT_SANDBOX=true: giả lập "đã chuyển khoản" để thử luồng đối soát mà không cần tiền thật.
  api.post('/payments/sandbox/confirm', rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Quá nhiều yêu cầu.' } }), async (req, res) => {
    if (!paymentSandbox()) throw new HttpError(404, 'Không tìm thấy.');
    const body = z.object({ code, phone }).parse(req.body);
    const order = await trackOrder(body.code, body.phone);
    const paid = await reconcileBankPayment(body.code, order.total, 'SANDBOX');
    res.set('Cache-Control', 'no-store').json({ ok: true, sandbox: true, code: paid.code, paymentStatus: paid.paymentStatus });
  });
  api.post('/payments/bank', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Quá nhiều yêu cầu đối soát.' } }), async (req, res) => {
    if (!env.BANK_WEBHOOK_SECRET) throw new HttpError(503, 'Đối soát chuyển khoản chưa được cấu hình.');
    if (!equalSecret(env.BANK_WEBHOOK_SECRET, req.get('x-bank-secret'))) throw new HttpError(401, 'Webhook ngân hàng không hợp lệ.');
    const body = z.object({
      code: code.optional(), content: clean(500).optional(), reference: clean(120).optional(),
      amount: z.coerce.number().int().min(1).max(2_147_483_647),
    }).parse(req.body);
    const match = body.content?.match(/\bDH(\d{8})-?(\d{4,10})\b/i);
    const orderCode = body.code ?? (match ? 'DH' + match[1] + '-' + match[2] : undefined);
    if (!orderCode) throw new HttpError(422, 'Không tìm thấy mã đơn trong nội dung chuyển khoản.');
    const order = await reconcileBankPayment(orderCode, body.amount, body.reference);
    res.json({ ok: true, code: order.code, paymentStatus: order.paymentStatus });
  });

  api.use('/internal', internal, integrations);
  api.get('/internal/products/search', async (req, res) => {
    const { q, maxPrice } = z.object({ q: clean(100).optional(), maxPrice: z.coerce.number().int().min(0).optional() }).parse(req.query);
    res.json((await products(q, undefined, maxPrice)).slice(0, 10));
  });
  api.get('/internal/orders/:code', async (req, res) => {
    const order = await db.order.findUnique({ where: { code: code.parse(req.params.code) }, include: orderDetails });
    if (!order || !order.items.length || order.subtotal !== order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
        || order.total !== order.subtotal - order.discount + order.shippingFee + order.packingFee) throw new HttpError(404, 'Đơn không tồn tại hoặc dữ liệu không hợp lệ.');
    res.json({ ...order, doaPolicy, qrUrl: order.paymentMethod === 'BANK_QR' ? qrUrl(order.code, order.total) : undefined });
  });
  api.post('/internal/orders/track', async (req, res) => {
    const body = z.object({ code, phone, psid: psid.optional() }).parse(req.body);
    res.json(await trackOrder(body.code, body.phone));
  });
  api.get('/internal/stats/daily', async (req, res) => {
    const today = dayKey(new Date());
    const { from, to } = range.parse(req.query);
    res.json(await report(from || today, to || today));
  });
  api.get('/internal/stats/monthly', async (req, res) => {
    const { year } = z.object({ year: z.coerce.number().int().min(2000).max(2200).default(Number(dayKey(new Date()).slice(0, 4))) }).parse(req.query);
    res.json(await report(year + '-01-01', year + '-12-31', true));
  });
  api.post('/internal/handoff', async (req, res) => {
    const body = z.object({ psid, lastMessage: clean(2000), reason: required(250) }).parse(req.body);
    const result = await openHandoff(body.psid, body.lastMessage, body.reason);
    res.status(201).json(result);
  });

  api.use('/admin/login', rateLimit({ windowMs: 15 * 60_000, limit: 100, skipSuccessfulRequests: true,
    message: { message: 'Bạn đã thử đăng nhập quá nhiều lần.' } }));
  api.post('/admin/login', rateLimit({ windowMs: 15 * 60_000, limit: 10, skipSuccessfulRequests: true,
    keyGenerator: req => ipKeyGenerator(req.ip || '') + ':' + String(req.body?.username || '').trim().toLowerCase().slice(0, 100),
    message: { message: 'Bạn đã thử đăng nhập quá nhiều lần.' } }), async (req, res) => {
    const { username, password } = z.object({ username: required(100), password: z.string().min(1).max(72) }).parse(req.body);
    const user = await db.adminUser.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new HttpError(503, 'JWT_SECRET chưa được cấu hình.');
    res.set('Cache-Control', 'no-store').json({ token: jwt.sign({}, env.JWT_SECRET, { subject: user.id, expiresIn: '8h', audience: 'long-fish-admin' }) });
  });
  api.use('/admin', admin);
  api.use('/admin', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use('/admin/uploads', rateLimit({ windowMs: 60_000, limit: 30 }), uploadAdmin);
  // Số liệu cho thanh bên và cảnh báo của trang quản trị: đơn chờ, số đơn theo trạng thái, yêu cầu hỗ trợ, liên hệ mới, tồn thấp.
  api.get('/admin/orders/summary', async (_req, res) => {
    const [pending, latest, grouped, openHandoffs, newContacts, variants] = await Promise.all([
      db.order.count({ where: { status: 'PENDING' } }),
      db.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }),
      db.order.groupBy({ by: ['status'], _count: { _all: true } }),
      db.handoffRequest.count({ where: { status: 'OPEN' } }),
      db.contactMessage.count({ where: { status: 'NEW' } }),
      db.productVariant.findMany({ where: { isActive: true, product: { isActive: true } },
        select: { id: true, sku: true, color: true, size: true, unit: true, stock: true, lowStockThreshold: true, product: { select: { id: true, name: true, slug: true } } } }),
    ]);
    const lowStock = variants.filter(row => row.stock <= row.lowStockThreshold).sort((a, b) => a.stock - b.stock);
    res.json({ pending, latestId: latest?.id || '', openHandoffs, newContacts, lowStockCount: lowStock.length, lowStock: lowStock.slice(0, 12),
      statusCounts: Object.fromEntries(grouped.map(row => [row.status, row._count._all])) });
  });
  // Khách hàng: gộp theo tài khoản (nếu có) hoặc số điện thoại, kể cả khách đặt không cần tài khoản.
  api.get('/admin/customers', async (req, res) => {
    const { q } = z.object({ q: clean(100).optional() }).parse(req.query);
    const [orders, accounts] = await Promise.all([
      db.order.findMany({ orderBy: { createdAt: 'desc' }, take: 20000,
        select: { code: true, customerName: true, phone: true, email: true, total: true, status: true, createdAt: true, customerId: true } }),
      db.customer.findMany({ select: { id: true, email: true, name: true, phone: true, createdAt: true } }),
    ]);
    type Row = { key: string; name: string; phone: string; email: string; hasAccount: boolean; accountCreatedAt: Date | null; orders: number; delivered: number;
      cancelled: number; open: number; spent: number; lastOrderAt: Date | null; lastCode: string };
    const rows = new Map<string, Row>();
    const account = new Map(accounts.map(row => [row.id, row]));
    for (const order of orders) {
      const key = order.customerId ? 'c:' + order.customerId : 'p:' + order.phone;
      const owner = order.customerId ? account.get(order.customerId) : undefined;
      const row = rows.get(key) ?? { key, name: owner?.name || order.customerName, phone: owner?.phone || order.phone, email: owner?.email || order.email,
        hasAccount: !!owner, accountCreatedAt: owner?.createdAt ?? null, orders: 0, delivered: 0, cancelled: 0, open: 0, spent: 0, lastOrderAt: order.createdAt, lastCode: order.code };
      row.orders++;
      if (!row.email && order.email) row.email = order.email;
      if (order.status === 'DELIVERED') { row.delivered++; row.spent += order.total; }
      else if (order.status === 'CANCELLED') row.cancelled++;
      else row.open++;
      rows.set(key, row);
    }
    for (const owner of accounts) if (!rows.has('c:' + owner.id)) rows.set('c:' + owner.id, { key: 'c:' + owner.id, name: owner.name, phone: owner.phone, email: owner.email,
      hasAccount: true, accountCreatedAt: owner.createdAt, orders: 0, delivered: 0, cancelled: 0, open: 0, spent: 0, lastOrderAt: null, lastCode: '' });
    const needle = q?.toLowerCase();
    const list = [...rows.values()].filter(row => !needle || [row.name, row.phone, row.email].some(value => value.toLowerCase().includes(needle)))
      .sort((a, b) => +(b.lastOrderAt ?? b.accountCreatedAt ?? 0) - +(a.lastOrderAt ?? a.accountCreatedAt ?? 0));
    res.json({ total: list.length, accounts: accounts.length, customers: list.slice(0, 500) });
  });
  api.get('/admin/exports/:kind', async (req, res) => {
    const kind = z.enum(['orders', 'revenue']).parse(req.params.kind);
    const { from, to } = z.object({ from: date, to: date }).parse(req.query);
    const stats = await report(from, to); // Validates range before any large export.
    let rows: (string | number)[][];
    if (kind === 'revenue') rows = [['Ngày', 'Số đơn', 'Đã giao', 'Đã hủy', 'Doanh thu VND'], ...stats.rows.map(row => [row.period, row.orders, row.delivered, row.cancelled, row.revenue])];
    else {
      const orders = await db.order.findMany({ where: { createdAt: { gte: dayStart(from), lt: addDays(dayStart(to), 1) } }, orderBy: { createdAt: 'asc' }, take: 5001 });
      if (orders.length > 5000) throw new HttpError(422, 'Tối đa 5000 đơn mỗi lần xuất. Hãy thu hẹp khoảng ngày.');
      rows = [['Mã đơn', 'Khách hàng', 'SĐT', 'Email', 'Địa chỉ', 'Trạng thái', 'Phương thức', 'Thanh toán', 'Tổng VND', 'Giờ nhận mong muốn', 'Ghi chú nội bộ'],
        ...orders.map(order => [order.code, order.customerName, order.phone, order.email, order.address, order.status, order.paymentMethod, order.paymentStatus, order.total, order.preferredDelivery, order.internalNote])];
    }
    res.type('text/csv; charset=utf-8').attachment(`long-fish-${kind}-${from}-${to}.csv`).send(csvDocument(rows));
  });
  // ===== Mã giảm giá =====
  const couponBody = z.object({
    code: z.string().trim().min(3).max(40).transform(normalizeCode), kind: z.enum(couponKinds), value: z.number().int().min(0).max(100_000_000).default(0),
    description: z.string().trim().max(300).default(''), minSubtotal: z.number().int().min(0).default(0), categories: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    firstOrderOnly: z.boolean().default(false), perCustomerLimit: z.number().int().min(0).max(1000).default(0), usageLimit: z.number().int().min(0).max(1_000_000).default(0),
    startsAt: z.coerce.date().nullable().optional(), expiresAt: z.coerce.date().nullable().optional(), isActive: z.boolean().default(true),
  }).superRefine((value, ctx) => {
    if (value.kind === 'PERCENT' && (value.value < 1 || value.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Phần trăm giảm từ 1 đến 100.' });
    if (value.kind === 'FIXED' && value.value < 1) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Số tiền giảm phải lớn hơn 0.' });
    if (value.startsAt && value.expiresAt && value.startsAt > value.expiresAt) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Ngày hết hạn phải sau ngày bắt đầu.' });
  });
  api.get('/admin/coupons', async (_req, res) => res.json(await db.coupon.findMany({ orderBy: { createdAt: 'desc' } })));
  api.post('/admin/coupons', async (req, res) => {
    const body = couponBody.parse(req.body);
    if (await db.coupon.findUnique({ where: { code: body.code } })) throw new HttpError(409, 'Mã này đã tồn tại.');
    res.status(201).json(await db.coupon.create({ data: body }));
  });
  api.patch('/admin/coupons/:id', async (req, res) => {
    const current = await db.coupon.findUniqueOrThrow({ where: { id: id.parse(req.params.id) } });
    const body = couponBody.parse({ ...current, startsAt: current.startsAt, expiresAt: current.expiresAt, ...(req.body as object) });
    if (body.code !== current.code && await db.coupon.findUnique({ where: { code: body.code } })) throw new HttpError(409, 'Mã này đã tồn tại.');
    res.json(await db.coupon.update({ where: { id: current.id }, data: body }));
  });
  api.get('/admin/products/:id/links', async (req, res) => {
    const links = await db.productLink.findMany({ where: { productId: id.parse(req.params.id) }, include: { linked: { select: { slug: true, name: true } } } });
    res.json(links.map(link => ({ type: link.type, slug: link.linked.slug, name: link.linked.name })));
  });
  // Đặt lại toàn bộ sản phẩm mua kèm (CROSSSELL) và đề xuất thay thế (UPSELL) của một sản phẩm theo danh sách slug.
  api.put('/admin/products/:id/links', async (req, res) => {
    const productId = id.parse(req.params.id);
    const body = z.object({ CROSSSELL: z.array(z.string()).max(12).default([]), UPSELL: z.array(z.string()).max(12).default([]) }).parse(req.body);
    const slugs = [...new Set([...body.CROSSSELL, ...body.UPSELL])];
    const found = await db.product.findMany({ where: { slug: { in: slugs }, id: { not: productId } }, select: { id: true, slug: true } });
    const missing = slugs.filter(slug => !found.some(row => row.slug === slug));
    if (missing.length) throw new HttpError(422, 'Không tìm thấy sản phẩm: ' + missing.join(', '));
    await db.$transaction([
      db.productLink.deleteMany({ where: { productId } }),
      db.productLink.createMany({ data: (['CROSSSELL', 'UPSELL'] as const).flatMap(type => body[type].map(slug => ({ productId, linkedId: found.find(row => row.slug === slug)!.id, type }))) }),
    ]);
    res.json({ ok: true });
  });
  api.get('/admin/products', async (_req, res) => res.json(await db.product.findMany({ include: { variants: true, links: { select: { type: true, linked: { select: { slug: true } } } } }, orderBy: { createdAt: 'desc' } })));
  const checkSale = (price: number | undefined, salePrice: number | null | undefined, starts?: Date | null, ends?: Date | null) => {
    if (salePrice != null && price != null && salePrice >= price) throw new HttpError(422, 'Giá khuyến mãi phải nhỏ hơn giá gốc.');
    if (starts && ends && starts > ends) throw new HttpError(422, 'Ngày kết thúc khuyến mãi phải sau ngày bắt đầu.');
  };
  api.post('/admin/products', async (req, res) => {
    const data = productInput.parse(req.body);
    checkSale(data.price, data.salePrice, data.saleStartsAt, data.saleEndsAt);
    res.status(201).json(await db.product.create({ data }));
  });
  api.patch('/admin/products/:id', async (req, res) => {
    const data = productPatch.parse(req.body);
    const current = await db.product.findUniqueOrThrow({ where: { id: id.parse(req.params.id) } });
    checkSale(data.price ?? current.price, data.salePrice !== undefined ? data.salePrice : current.salePrice,
      data.saleStartsAt !== undefined ? data.saleStartsAt : current.saleStartsAt, data.saleEndsAt !== undefined ? data.saleEndsAt : current.saleEndsAt);
    res.json(await db.product.update({ where: { id: current.id }, data }));
  });
  // Mặc định là ẩn khỏi cửa hàng. ?permanent=1: xóa hẳn, chỉ khi sản phẩm chưa từng có trong đơn hàng (giữ lịch sử đơn).
  api.delete('/admin/products/:id', async (req, res) => {
    const productId = id.parse(req.params.id);
    if (req.query.permanent !== '1') {
      await db.product.update({ where: { id: productId }, data: { isActive: false } });
      res.sendStatus(204); return;
    }
    await db.$transaction(async tx => {
      await tx.product.findUniqueOrThrow({ where: { id: productId } });
      const used = await tx.orderItem.count({ where: { variant: { productId } } });
      if (used) throw new HttpError(409, 'Sản phẩm đã có trong ' + used + ' dòng đơn hàng nên không xóa được (để giữ lịch sử đơn). Hãy dùng “Ẩn khỏi cửa hàng”.');
      await tx.productLink.deleteMany({ where: { OR: [{ productId }, { linkedId: productId }] } });
      await tx.productVariant.deleteMany({ where: { productId } });
      await tx.product.delete({ where: { id: productId } });
    });
    res.sendStatus(204);
  });
  api.post('/admin/products/:id/variants', async (req, res) => res.status(201).json(await db.productVariant.create({
    data: { ...variantInput.parse(req.body), product: { connect: { id: id.parse(req.params.id) } } },
  })));
  api.patch('/admin/products/:id/variants/:variantId', async (req, res) => res.json(
    await updateVariant(id.parse(req.params.id), id.parse(req.params.variantId), variantPatch.parse(req.body)),
  ));
  // Mặc định là ngừng bán. ?permanent=1: xóa hẳn phân loại chưa từng được đặt.
  api.delete('/admin/products/:id/variants/:variantId', async (req, res) => {
    const productId = id.parse(req.params.id), variantId = id.parse(req.params.variantId);
    if (req.query.permanent !== '1') { await removeVariant(productId, variantId); res.sendStatus(204); return; }
    const used = await db.orderItem.count({ where: { variantId } });
    if (used) throw new HttpError(409, 'Phân loại đã có trong ' + used + ' dòng đơn hàng nên không xóa được. Hãy dùng “Ngừng bán”.');
    const removed = await db.productVariant.deleteMany({ where: { id: variantId, productId } });
    if (!removed.count) throw new HttpError(404, 'Không tìm thấy phân loại.');
    res.sendStatus(204);
  });
  api.get('/admin/orders', async (req, res) => {
    const filter = z.object({ status: statuses.optional(), date: date.optional(), q: clean(100).optional(),
      paymentStatus: z.enum(['PAID','UNPAID']).optional(), paymentMethod: z.enum(['COD','BANK_QR']).optional(), deliveryDate: date.optional(),
      page: z.coerce.number().int().min(1).max(10000).default(1) }).parse(req.query);
    const where: Prisma.OrderWhereInput = {
      status: filter.status,
      paymentStatus: filter.paymentStatus, paymentMethod: filter.paymentMethod,
      ...(filter.deliveryDate ? { preferredDelivery: { gte: dayStart(filter.deliveryDate).toISOString(), lt: addDays(dayStart(filter.deliveryDate), 1).toISOString() } } : {}),
      ...(filter.date ? { createdAt: { gte: dayStart(filter.date), lt: addDays(dayStart(filter.date), 1) } } : {}),
      ...(filter.q ? { OR: [{ code: { contains: filter.q.toUpperCase() } }, { phone: { contains: filter.q } }, { customerName: { contains: filter.q } }, { email: { contains: filter.q.toLowerCase() } }] } : {}),
    };
    const [orders, total] = await Promise.all([
      db.order.findMany({ where, include: orderDetails, orderBy: { createdAt: 'desc' }, take: 30, skip: (filter.page - 1) * 30 }),
      db.order.count({ where }),
    ]);
    res.json({ orders, total, labels: statusLabels });
  });
  api.patch('/admin/orders/:id/status', async (req, res) => {
    const { status, confirmCancellation } = z.object({ status: statuses, confirmCancellation: z.boolean().default(false) }).parse(req.body);
    res.json(await changeStatus(id.parse(req.params.id), status, confirmCancellation));
  });
  api.patch('/admin/orders/:id/payment', async (req, res) => res.json(await updatePayment(id.parse(req.params.id))));
  api.get('/admin/stats/overview', async (req, res) => {
    const { from, to } = range.parse(req.query);
    res.json(await overview(from, to));
  });
  // Ghi chú nội bộ, ưu tiên cá sống, và sửa thông tin nhận hàng (chỉ khi đơn chưa giao xong / chưa hủy).
  const recipientFields = { customerName: 'tên người nhận', phone: 'số điện thoại', email: 'email', address: 'địa chỉ', preferredDelivery: 'giờ nhận mong muốn', note: 'ghi chú giao hàng' } as const;
  api.patch('/admin/orders/:id/details', async (req, res) => {
    const data = z.object({
      internalNote: clean(600).optional(), hasLiveFish: z.literal(true).optional(),
      customerName: required(100).optional(), phone: phone.optional(),
      email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Email không hợp lệ.').max(200)]).optional(),
      address: required(400).optional(), note: clean(500).optional(),
      preferredDelivery: z.union([z.literal(''), z.string().datetime({ offset: true })]).optional(),
    }).parse(req.body);
    const orderId = id.parse(req.params.id);
    const order = await db.$transaction(async tx => {
      const previous = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const changed = (Object.keys(recipientFields) as (keyof typeof recipientFields)[]).filter(key => data[key] !== undefined && data[key] !== previous[key]);
      if (changed.length && ['DELIVERED', 'CANCELLED'].includes(previous.status)) throw new HttpError(409, 'Đơn đã giao xong hoặc đã hủy nên không sửa thông tin nhận hàng được.');
      const updated = await tx.order.update({ where: { id: orderId }, data, include: orderDetails });
      const log = (detail: string) => tx.orderStatusLog.create({ data: { orderId, fromStatus: previous.status, toStatus: updated.status, action: 'note', detail } });
      if (updated.internalNote !== previous.internalNote) await log('Ghi chú nội bộ: ' + updated.internalNote);
      if (updated.hasLiveFish !== previous.hasLiveFish) await log('Đánh dấu ưu tiên cá sống');
      if (changed.length) await log('Sửa ' + changed.map(key => recipientFields[key]).join(', '));
      if (updated.hasLiveFish !== previous.hasLiveFish || changed.length) await tx.outboxEvent.create({
        data: { kind: 'details', payload: { code: updated.code, status: updated.status, notify: false } },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderDetails });
    });
    res.json(order);
  });
  api.get('/admin/contacts', async (_req, res) => res.json(await db.contactMessage.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 })));
  api.patch('/admin/contacts/:id', async (req, res) => {
    z.object({ status: z.literal('DONE') }).parse(req.body);
    res.json(await db.contactMessage.update({ where: { id: id.parse(req.params.id) }, data: { status: 'DONE' } }));
  });
  api.get('/admin/handoffs', async (_req, res) => res.json(await db.handoffRequest.findMany({ orderBy: [{ status: 'desc' }, { createdAt: 'desc' }] })));
  api.patch('/admin/handoffs/:id', async (req, res) => {
    z.object({ status: z.literal('DONE') }).parse(req.body);
    const result = await db.$transaction(async tx => {
      const request = await tx.handoffRequest.findUniqueOrThrow({ where: { id: id.parse(req.params.id) } });
      if (request.status === 'DONE') return request;
      await tx.conversationState.updateMany({ where: { psid: request.psid }, data: { handoff: false, unknownCount: 0, selection: Prisma.DbNull } });
      return tx.handoffRequest.update({ where: { id: request.id }, data: { status: 'DONE' } });
    });
    res.json(result);
  });
  app.use('/api', api);
  app.use((_req, res) => res.status(404).json({ message: 'Không tìm thấy đường dẫn.' }));

  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(422).json({ message: error.issues.find(issue => /[À-ỹ]/.test(issue.message))?.message || 'Dữ liệu nhập không hợp lệ.', fields: error.flatten().fieldErrors });
    } else if (error instanceof HttpError) {
      res.status(error.status).json({ message: error.message });
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025'].includes(error.code)) {
      // Báo rõ trường bị trùng (SKU, đường dẫn, mã giảm giá…) thay vì một câu chung chung.
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? '');
      const duplicate = /sku/i.test(target) ? 'Mã SKU này đã có ở phân loại khác.' : /slug/i.test(target) ? 'Đường dẫn (slug) này đã được sản phẩm khác dùng.'
        : /code/i.test(target) ? 'Mã này đã tồn tại.' : /email/i.test(target) ? 'Email này đã được dùng.' : 'Giá trị đã tồn tại.';
      res.status(error.code === 'P2002' ? 409 : 404).json({ message: error.code === 'P2002' ? duplicate : 'Không tìm thấy dữ liệu.' });
    } else if (error?.type === 'entity.too.large') {
      res.status(413).json({ message: 'Nội dung yêu cầu vượt giới hạn.' });
    } else if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ message: 'JSON không hợp lệ.' });
    } else {
      console.error('Lỗi xử lý yêu cầu', error instanceof Error ? error.name : 'UnknownError');
      res.status(500).json({ message: 'Có lỗi hệ thống. Vui lòng thử lại.' });
    }
  };
  app.use(errors);
  return app;
}


