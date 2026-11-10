import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { HttpError, orderLines, quote } from './domain';

type Client = Prisma.TransactionClient | typeof db;
const money = (amount: number) => new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';

// ---------- Giá khuyến mãi theo lịch ----------
type PriceFields = { price: number; salePrice: number | null; saleStartsAt: Date | null; saleEndsAt: Date | null };

export function saleActive(product: PriceFields, now = new Date()) {
  return product.salePrice != null && product.salePrice < product.price &&
    (!product.saleStartsAt || product.saleStartsAt <= now) && (!product.saleEndsAt || now <= product.saleEndsAt);
}

// Giá gốc của phân loại = giá riêng của phân loại hoặc giá sản phẩm; khuyến mãi trừ cùng một khoản (giá gốc sản phẩm - giá sale).
export function unitPrices(product: PriceFields, variant: { priceOverride: number | null } | null, now = new Date()) {
  const regular = variant?.priceOverride ?? product.price;
  const off = saleActive(product, now) ? product.price - (product.salePrice as number) : 0;
  return { regular, unit: Math.max(0, regular - off), onSale: off > 0 };
}

// ---------- Mã giảm giá ----------
export const couponKinds = ['PERCENT', 'FIXED', 'FREESHIP'] as const;
export const normalizeCode = (value: string) => value.trim().toUpperCase();

export type CartLine = { productId: string; category: string; lineTotal: number };
export type CouponContext = {
  subtotal: number; lines: CartLine[]; baseShippingFee: number; now?: Date; customerId?: string; phone?: string; email?: string;
};

function identities(context: Pick<CouponContext, 'customerId' | 'phone' | 'email'>) {
  return [context.customerId && 'customer:' + context.customerId, context.phone && 'phone:' + context.phone.replace(/\D/g, ''),
    context.email && 'email:' + context.email.toLowerCase()].filter(Boolean) as string[];
}

export async function evaluateCoupon(client: Client, rawCode: string, context: CouponContext) {
  const code = normalizeCode(rawCode);
  const now = context.now ?? new Date();
  const coupon = await client.coupon.findUnique({ where: { code } });
  if (!coupon) throw new HttpError(422, 'Mã giảm giá không tồn tại.');
  if (!coupon.isActive) throw new HttpError(422, 'Mã giảm giá hiện không còn hiệu lực.');
  if (coupon.startsAt && coupon.startsAt > now) throw new HttpError(422, 'Mã giảm giá chưa đến thời gian áp dụng.');
  if (coupon.expiresAt && coupon.expiresAt < now) throw new HttpError(422, 'Mã giảm giá đã hết hạn.');
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw new HttpError(422, 'Mã giảm giá đã hết lượt sử dụng.');
  if (context.subtotal < coupon.minSubtotal) throw new HttpError(422, 'Đơn hàng cần từ ' + money(coupon.minSubtotal) + ' để dùng mã này.');

  const categories = z.array(z.string()).catch([]).parse(coupon.categories);
  const eligible = categories.length ? context.lines.filter(line => categories.includes(line.category)) : context.lines;
  if (!eligible.length) throw new HttpError(422, 'Mã chỉ áp dụng cho danh mục: ' + categories.join(', ') + '.');
  const eligibleSubtotal = eligible.reduce((sum, line) => sum + line.lineTotal, 0);

  const keys = identities(context);
  if (coupon.firstOrderOnly && keys.length) {
    const conditions: Prisma.OrderWhereInput[] = [];
    if (context.customerId) conditions.push({ customerId: context.customerId });
    if (context.phone) conditions.push({ phone: context.phone });
    if (context.email) conditions.push({ email: context.email.toLowerCase() });
    const previous = await client.order.count({ where: { status: { not: 'CANCELLED' }, OR: conditions } });
    if (previous > 0) throw new HttpError(422, 'Mã này chỉ dành cho đơn hàng đầu tiên.');
  }
  if (coupon.perCustomerLimit > 0 && keys.length) {
    const used = await client.couponRedemption.count({ where: { couponId: coupon.id, OR: keys.map(key => ({ customerKey: { contains: key } })) } });
    if (used >= coupon.perCustomerLimit) throw new HttpError(422, 'Bạn đã dùng mã này rồi.');
  }

  let discount = 0;
  let shippingDiscount = 0;
  if (coupon.kind === 'PERCENT') discount = Math.floor(eligibleSubtotal * coupon.value / 100);
  else if (coupon.kind === 'FIXED') discount = Math.min(coupon.value, eligibleSubtotal);
  else if (coupon.kind === 'FREESHIP') {
    shippingDiscount = context.baseShippingFee;
    if (!shippingDiscount) throw new HttpError(422, 'Đơn hàng của bạn đã được miễn phí vận chuyển.');
  }
  return { coupon, discount: Math.min(discount, context.subtotal), shippingDiscount };
}

// Ghi nhận lượt dùng trong cùng giao dịch với đơn hàng; lệnh cập nhật có điều kiện chống vượt giới hạn khi nhiều người dùng cùng lúc.
export async function redeemCoupon(tx: Prisma.TransactionClient, couponId: string, orderId: string, context: Pick<CouponContext, 'customerId' | 'phone' | 'email'>) {
  const updated = await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = ${couponId} AND ("usageLimit" = 0 OR "usedCount" < "usageLimit")`;
  if (!updated) throw new HttpError(422, 'Mã giảm giá đã hết lượt sử dụng.');
  // Lưu mọi định danh (tài khoản, số điện thoại, email) để một người không lách giới hạn bằng cách đổi thông tin.
  const key = identities(context).join('|') || 'order:' + orderId;
  await tx.couponRedemption.create({ data: { couponId, orderId, customerKey: key } });
}

// Khi hủy đơn: trả lại lượt dùng mã để khách dùng lại.
export async function releaseCoupon(tx: Prisma.TransactionClient, orderId: string) {
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (!redemption) return;
  await tx.couponRedemption.delete({ where: { orderId } });
  await tx.$executeRaw`UPDATE "Coupon" SET "usedCount" = "usedCount" - 1 WHERE "id" = ${redemption.couponId} AND "usedCount" > 0`;
}

// ---------- Tính giỏ hàng (xem trước tại giỏ hàng/thanh toán, dùng cùng quy tắc với lúc tạo đơn) ----------
export const quoteInput = z.object({
  items: orderLines, province: z.string().trim().max(100).default(''), couponCode: z.string().trim().max(40).optional(),
  shippingMethod: z.enum(['STANDARD', 'EXPRESS']).default('STANDARD'), phone: z.string().trim().max(20).optional(), email: z.string().trim().max(254).optional(),
});

export async function priceCart(input: z.infer<typeof quoteInput>, customerId?: string, now = new Date()) {
  const variants = await db.productVariant.findMany({
    where: { id: { in: input.items.map(item => item.variantId) }, isActive: true, product: { isActive: true } }, include: { product: true },
  });
  const lines = [] as (CartLine & { variantId: string; quantity: number; unitPrice: number; regularPrice: number })[];
  for (const item of input.items) {
    const variant = variants.find(row => row.id === item.variantId);
    if (!variant || variant.stock < item.quantity) throw new HttpError(409, 'Phân loại đã hết hoặc không đủ hàng.');
    if (item.quantity < variant.minQty) throw new HttpError(422, 'Số lượng tối thiểu là ' + variant.minQty + ' ' + variant.unit + '.');
    const price = unitPrices(variant.product, variant, now);
    lines.push({ productId: variant.productId, category: variant.product.category, variantId: variant.id, quantity: item.quantity,
      unitPrice: price.unit, regularPrice: price.regular, lineTotal: price.unit * item.quantity });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const hasLive = variants.some(row => row.product.isLiveFish);
  const base = quote(input.province, subtotal, hasLive, input.shippingMethod);
  let discount = 0;
  let shippingDiscount = 0;
  let applied: { code: string; kind: string; description: string } | null = null;
  let couponError = '';
  if (input.couponCode) {
    try {
      const result = await evaluateCoupon(db, input.couponCode, { subtotal, lines, baseShippingFee: base.baseShippingFee, now, customerId, phone: input.phone, email: input.email });
      discount = result.discount; shippingDiscount = result.shippingDiscount;
      applied = { code: result.coupon.code, kind: result.coupon.kind, description: result.coupon.description };
    } catch (error) { if (error instanceof HttpError) couponError = error.message; else throw error; }
  }
  const shippingFee = Math.max(0, base.shippingFee - shippingDiscount);
  return {
    ...base, subtotal, discount, shippingDiscount, shippingFee, coupon: applied, couponError,
    total: subtotal - discount + shippingFee + base.packingFee,
    lines: lines.map(line => ({ variantId: line.variantId, quantity: line.quantity, unitPrice: line.unitPrice, regularPrice: line.regularPrice, lineTotal: line.lineTotal })),
  };
}
