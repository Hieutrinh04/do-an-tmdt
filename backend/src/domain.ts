import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { env } from './env';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const clean = (max: number) => z.string().trim().max(max).transform(value =>
  value.replace(/[\x00-\x1f\x7f]/g, '').trim(),
);
export const required = (max: number) => clean(max).pipe(z.string().min(1));
export const phone = z.string().trim().max(25)
  .transform(value => value.replace(/[ .()-]/g, '').replace(/^\+84/, '0'))
  .pipe(z.string().regex(/^0[35789]\d{8}$/, 'Số điện thoại di động Việt Nam không hợp lệ.'));
export const psid = z.string().regex(/^\d{1,40}$/);
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value;
}, 'Ngày không hợp lệ.');

export const normalize = (value: string) => value.toLowerCase().normalize('NFD')
  .replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const currency = z.coerce.number().int().min(0).max(100_000_000);
const freeThreshold = currency.parse(env.SHIPPING_FREE_THRESHOLD || 600000);
const defaultFee = currency.parse(env.SHIPPING_DEFAULT_FEE || 35000);
const fees = z.record(z.string(), currency).parse(JSON.parse(env.SHIPPING_FEES_JSON || '{"Hồ Chí Minh":20000,"Hà Nội":30000,"Đà Nẵng":30000}'));
export const provinces = Object.keys(fees);
export const liveProvinces = z.array(z.string().trim().min(1)).parse(
  JSON.parse(env.LIVE_FISH_PROVINCES_JSON || '["Hồ Chí Minh","Hà Nội","Đà Nẵng"]'),
);
const livePackingFee = currency.parse(env.LIVE_FISH_PACKING_FEE || 30000);
const shopName = env.SHOP_NAME?.trim() || 'Long Fish';
export const doaPolicy = 'Với đơn có cá sống, quay video liền mạch khi mở thùng trong vòng 2 giờ từ lúc nhận. Gửi video và mã đơn cho ' + shopName + ' trong thời hạn này để được xem xét bù cá hoặc hoàn tiền phần cá chết khi nhận.';

const provinceKey = (value: string) => {
  const key = normalize(value).replace(/^(tp|thanh pho|tinh)\s+/, '');
  return key === 'hcm' ? 'ho chi minh' : key;
};

export function quote(province: string, subtotal: number, hasLiveFish = false) {
  const key = provinceKey(province);
  const entry = Object.entries(fees).find(([name]) => provinceKey(name) === key);
  const shippingFee = subtotal >= freeThreshold ? 0 : entry?.[1] ?? defaultFee;
  const packingFee = hasLiveFish ? livePackingFee : 0;
  const liveDeliveryAvailable = !hasLiveFish || liveProvinces.some(name => provinceKey(name) === key);
  return { subtotal, shippingFee, packingFee, total: subtotal + shippingFee + packingFee,
    hasLiveFish, liveDeliveryAvailable, freeThreshold };
}

export const orderLines = z.array(z.object({
  variantId: required(80), quantity: z.number().int().min(1).max(99),
})).min(1).max(20).superRefine((items, ctx) => {
  if (new Set(items.map(item => item.variantId)).size !== items.length) {
    ctx.addIssue({ code: 'custom', message: 'Phân loại trong giỏ bị trùng.' });
  }
});

export const orderInput = z.object({
  customerName: required(100), phone, province: required(100), district: required(100),
  address: required(200), psid: psid.optional(), context: z.string().regex(/^[a-f0-9]{64}$/).optional(), note: clean(300).optional(),
  paymentMethod: z.enum(['COD', 'BANK_QR']),
  preferredDelivery: z.string().datetime({ offset: true }).optional(),
  doaAccepted: z.boolean().default(false),
  items: orderLines,
});

export function qrUrl(code: string, amount: number) {
  const bank = env.VIETQR_BANK || (env.MOCK_INTEGRATIONS !== 'false' ? '970436' : '');
  const account = env.VIETQR_ACCOUNT || (env.MOCK_INTEGRATIONS !== 'false' ? '0000000000' : '');
  if (!/^[a-zA-Z0-9]{2,24}$/.test(bank) || !/^\d{4,30}$/.test(account)) return undefined;
  return 'https://img.vietqr.io/image/' + bank + '-' + account + '-compact2.png?' +
      new URLSearchParams({ amount: String(amount), addInfo: code, ...(env.VIETQR_ACCOUNT_NAME ? { accountName: env.VIETQR_ACCOUNT_NAME } : {}) });
}

export const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy',
};

export const nextStatus: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPING', 'CANCELLED'],
  SHIPPING: ['DELIVERED', 'CANCELLED'], DELIVERED: [], CANCELLED: [],
};

export const orderDetails = {
  items: true, history: { orderBy: { changedAt: 'asc' as const } },
} satisfies Prisma.OrderInclude;

export async function retryTransaction<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P1008', 'P2028', 'P2034'].includes(error.code) || attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 35 * (attempt + 1) + Math.random() * 50));
    }
  }
}


