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
import { bankTransferAvailable, paymentSandbox, clean, date, doaPolicy, liveEverywhere, liveProvinces, orderLines, HttpError, orderDetails, orderInput, phone, provinces, psid, qrUrl, required, statusLabels } from './domain';
import { changeStatus, checkoutQuote, createOrder, reconcileBankPayment, trackOrder, updatePayment } from './orders';
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
  api.get('/shipping/policy', (_req, res) => res.json({ doaPolicy, liveProvinces, liveEverywhere }));
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
    const body = z.object({ province: required(100), items: orderLines }).parse(req.body);
    res.json(await checkoutQuote(body.province, body.items));
  });
  api.post('/orders', async (req, res) => { res.status(201).json(await createOrder(orderInput.parse(req.body))); });
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
        || order.total !== order.subtotal + order.shippingFee + order.packingFee) throw new HttpError(404, 'Đơn không tồn tại hoặc dữ liệu không hợp lệ.');
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
  api.get('/admin/orders/summary', async (_req, res) => {
    const [pending, latest] = await Promise.all([db.order.count({ where: { status: 'PENDING' } }), db.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } })]);
    res.json({ pending, latestId: latest?.id || '' });
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
  api.get('/admin/products', async (_req, res) => res.json(await db.product.findMany({ include: { variants: true }, orderBy: { createdAt: 'desc' } })));
  api.post('/admin/products', async (req, res) => res.status(201).json(await db.product.create({ data: productInput.parse(req.body) })));
  api.patch('/admin/products/:id', async (req, res) => res.json(await db.product.update({
    where: { id: id.parse(req.params.id) }, data: productPatch.parse(req.body),
  })));
  api.delete('/admin/products/:id', async (req, res) => {
    await db.product.update({ where: { id: id.parse(req.params.id) }, data: { isActive: false } });
    res.sendStatus(204);
  });
  api.post('/admin/products/:id/variants', async (req, res) => res.status(201).json(await db.productVariant.create({
    data: { ...variantInput.parse(req.body), product: { connect: { id: id.parse(req.params.id) } } },
  })));
  api.patch('/admin/products/:id/variants/:variantId', async (req, res) => res.json(
    await updateVariant(id.parse(req.params.id), id.parse(req.params.variantId), variantPatch.parse(req.body)),
  ));
  api.delete('/admin/products/:id/variants/:variantId', async (req, res) => {
    await removeVariant(id.parse(req.params.id), id.parse(req.params.variantId));
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
      ...(filter.q ? { OR: [{ code: { contains: filter.q.toUpperCase() } }, { phone: { contains: filter.q } }] } : {}),
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
  api.patch('/admin/orders/:id/details', async (req, res) => {
    const data = z.object({ internalNote: clean(600).optional(), hasLiveFish: z.literal(true).optional() }).parse(req.body);
    const orderId = id.parse(req.params.id);
    const order = await db.$transaction(async tx => {
      const previous = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const updated = await tx.order.update({ where: { id: orderId }, data, include: orderDetails });
      if (updated.internalNote !== previous.internalNote || updated.hasLiveFish !== previous.hasLiveFish) await tx.orderStatusLog.create({ data: {
        orderId, fromStatus: previous.status, toStatus: updated.status, action: 'note',
        detail: updated.internalNote !== previous.internalNote ? 'Ghi chú nội bộ: ' + updated.internalNote : 'Đánh dấu ưu tiên cá sống',
      } });
      if (updated.hasLiveFish !== previous.hasLiveFish) await tx.outboxEvent.create({
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
      res.status(error.code === 'P2002' ? 409 : 404).json({ message: error.code === 'P2002' ? 'Giá trị đã tồn tại.' : 'Không tìm thấy dữ liệu.' });
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


