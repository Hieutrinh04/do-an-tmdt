import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { db } from './db';
import { env, mock } from './env';
import { HttpError } from './domain';

// ---------- Mật khẩu và mã đăng nhập ----------
export const strongPassword = z.string().min(8, 'Mật khẩu cần ít nhất 8 ký tự.').max(72, 'Mật khẩu tối đa 72 ký tự.')
  .refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), 'Mật khẩu cần gồm cả chữ và số.');

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
const audience = 'long-fish-customer';

export function signCustomerToken(customerId: string) {
  if (!env.JWT_SECRET) throw new HttpError(503, 'Chưa cấu hình JWT_SECRET.');
  return jwt.sign({}, env.JWT_SECRET, { subject: customerId, audience, expiresIn: '7d' });
}

export function customerIdFrom(req: Request): string | undefined {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ') || !env.JWT_SECRET) return undefined;
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET, { audience }) as jwt.JwtPayload;
    return typeof payload.sub === 'string' ? payload.sub : undefined;
  } catch { return undefined; }
}

export const requireCustomer: RequestHandler = (req, res, next) => {
  const id = customerIdFrom(req);
  if (!id) { res.status(401).json({ message: 'Vui lòng đăng nhập.' }); return; }
  (req as Request & { customerId?: string }).customerId = id;
  next();
};
export const currentCustomerId = (req: Request) => (req as Request & { customerId?: string }).customerId as string;

// ---------- Hồ sơ ----------
export const addressInput = z.object({
  name: z.string().trim().min(1).max(100), phone: z.string().trim().min(8).max(20), province: z.string().trim().min(1).max(100),
  district: z.string().trim().min(1).max(100), ward: z.string().trim().max(100).default(''), address: z.string().trim().min(1).max(200),
});

type CustomerRow = NonNullable<Awaited<ReturnType<typeof db.customer.findUnique>>>;
export const publicCustomer = (customer: CustomerRow) => ({
  id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, createdAt: customer.createdAt,
  shippingAddress: customer.shippingAddress ?? null, billingAddress: customer.billingAddress ?? null,
});

export const normalizeEmail = (value: string) => value.trim().toLowerCase();

export async function registerCustomer(input: { name: string; email: string; password: string; phone?: string }, client: Pick<typeof db, 'customer'> = db) {
  const email = normalizeEmail(input.email);
  if (await client.customer.findUnique({ where: { email } })) throw new HttpError(409, 'Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu".');
  return client.customer.create({ data: { email, name: input.name.trim(), phone: (input.phone || '').trim(), passwordHash: await hashPassword(input.password) } });
}

let dummyHash: string | undefined;
export async function loginCustomer(emailInput: string, password: string) {
  const customer = await db.customer.findUnique({ where: { email: normalizeEmail(emailInput) } });
  // So sánh với một băm giả khi không có tài khoản để thời gian phản hồi không lộ email nào đã đăng ký.
  const hash = customer?.passwordHash ?? (dummyHash ??= await bcrypt.hash('khong-co-tai-khoan', 12));
  const ok = await bcrypt.compare(password, hash);
  if (!customer || !ok) throw new HttpError(401, 'Email hoặc mật khẩu không đúng.');
  return customer;
}

export async function changePassword(customerId: string, current: string, next: string) {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (!await bcrypt.compare(current, customer.passwordHash)) throw new HttpError(403, 'Mật khẩu hiện tại không đúng.');
  await db.customer.update({ where: { id: customerId }, data: { passwordHash: await hashPassword(next), resetTokenHash: null, resetExpiresAt: null } });
}

export async function updateProfile(customerId: string, input: { name?: string; phone?: string; email?: string; currentPassword?: string }) {
  const customer = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const data: { name?: string; phone?: string; email?: string } = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.phone !== undefined) data.phone = input.phone.trim();
  if (input.email !== undefined && normalizeEmail(input.email) !== customer.email) {
    // Đổi email là thao tác nhạy cảm: phải nhập lại mật khẩu hiện tại.
    if (!input.currentPassword || !await bcrypt.compare(input.currentPassword, customer.passwordHash)) throw new HttpError(403, 'Nhập đúng mật khẩu hiện tại để đổi email.');
    const email = normalizeEmail(input.email);
    if (await db.customer.findUnique({ where: { email } })) throw new HttpError(409, 'Email này đã được dùng cho tài khoản khác.');
    data.email = email;
  }
  return db.customer.update({ where: { id: customerId }, data });
}

// ---------- Quên mật khẩu ----------
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function startPasswordReset(emailInput: string) {
  const customer = await db.customer.findUnique({ where: { email: normalizeEmail(emailInput) } });
  if (!customer) return; // luôn phản hồi như nhau để không lộ email nào đã đăng ký
  const token = randomBytes(32).toString('hex');
  await db.customer.update({ where: { id: customer.id }, data: { resetTokenHash: sha256(token), resetExpiresAt: new Date(Date.now() + 60 * 60_000) } });
  const link = siteUrl() + '/tai-khoan/dat-lai-mat-khau?token=' + token + '&email=' + encodeURIComponent(customer.email);
  await sendMail(customer.email, 'Đặt lại mật khẩu ' + shop(), emailLayout('Đặt lại mật khẩu',
    '<p>Chào ' + escapeHtml(customer.name) + ',</p><p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu tài khoản ' + shop() + '. Liên kết dưới đây có hiệu lực trong <strong>1 giờ</strong>.</p>',
    { label: 'Đặt mật khẩu mới', href: link },
    'Nếu không phải bạn yêu cầu, hãy bỏ qua email này; mật khẩu hiện tại vẫn an toàn.'));
}

export async function finishPasswordReset(emailInput: string, token: string, password: string) {
  const customer = await db.customer.findUnique({ where: { email: normalizeEmail(emailInput) } });
  if (!customer?.resetTokenHash || !customer.resetExpiresAt || customer.resetExpiresAt < new Date() || customer.resetTokenHash !== sha256(token)) {
    throw new HttpError(400, 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.');
  }
  await db.customer.update({ where: { id: customer.id }, data: { passwordHash: await hashPassword(password), resetTokenHash: null, resetExpiresAt: null } });
  return customer;
}

// ---------- Email ----------
const shop = () => env.SHOP_NAME?.trim() || 'Long Fish';
const siteUrl = () => (env.SITE_URL || 'http://localhost:8080').replace(/\/$/, '');
export const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Khung email thống nhất thương hiệu: logo, màu nút đồng bộ website, chân email có thông tin cửa hàng.
export function emailLayout(heading: string, bodyHtml: string, button?: { label: string; href: string }, footerNote?: string) {
  const brand = '#1f5c46';
  return '<!doctype html><html lang="vi"><body style="margin:0;background:#eaf4ef;font-family:Arial,Helvetica,sans-serif;color:#0e2a2b">' +
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">' +
    '<tr><td style="background:' + brand + ';padding:18px 24px"><img src="' + siteUrl() + '/logo-email.png" alt="' + escapeHtml(shop()) + '" width="44" height="44" style="vertical-align:middle;border:0">' +
    '<span style="color:#ffffff;font-size:22px;font-weight:bold;margin-left:10px;vertical-align:middle">' + escapeHtml(shop()) + '</span></td></tr>' +
    '<tr><td style="padding:24px"><h1 style="font-size:22px;margin:0 0 14px">' + escapeHtml(heading) + '</h1>' + bodyHtml +
    (button ? '<p style="margin:22px 0"><a href="' + escapeHtml(button.href) + '" style="background:' + brand + ';color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:bold">' + escapeHtml(button.label) + '</a></p>' : '') +
    (footerNote ? '<p style="color:#4a6661;font-size:13px">' + escapeHtml(footerNote) + '</p>' : '') + '</td></tr>' +
    '<tr><td style="background:#f3faf6;padding:14px 24px;font-size:12px;color:#4a6661">' + escapeHtml(shop()) + ' · ' + escapeHtml(siteUrl()) + '</td></tr></table></td></tr></table></body></html>';
}

export async function sendMail(to: string, subject: string, html: string) {
  if (mock) { console.info('[Email mock]', to.replace(/(^.).*(@.*$)/, '$1***$2'), '|', subject); return { sent: false, mock: true }; }
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) { console.warn('[Email] Chưa cấu hình SMTP, bỏ qua email:', subject); return { sent: false }; }
  const port = Number(env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port, secure: port === 465, requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }, connectionTimeout: 15000, socketTimeout: 15000 });
  try { await transport.sendMail({ from: env.MAIL_FROM || env.SMTP_USER, to, subject, html }); return { sent: true }; }
  finally { transport.close(); }
}

export async function sendWelcomeEmail(customer: { email: string; name: string }) {
  const code = (await db.coupon.findUnique({ where: { code: 'WELCOME10' } }))?.isActive ? 'WELCOME10' : '';
  await sendMail(customer.email, 'Chào mừng bạn đến với ' + shop(), emailLayout('Chào mừng ' + customer.name + '!',
    '<p>Tài khoản ' + shop() + ' của bạn đã sẵn sàng. Bạn có thể theo dõi đơn hàng, lưu địa chỉ giao hàng và đặt hàng nhanh hơn.</p>' +
    (code ? '<p>Quà chào mừng: nhập mã <strong style="font-size:18px">' + code + '</strong> để giảm 10% cho đơn hàng đầu tiên.</p>' : ''),
    { label: 'Vào tài khoản của tôi', href: siteUrl() + '/tai-khoan' }));
}
