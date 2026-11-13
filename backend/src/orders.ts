import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { trustedPsid } from './messenger';
import { dayKey, mock } from './env';
import { HttpError, nextStatus, orderDetails, orderInput, paymentSandbox, qrUrl, quote, retryTransaction } from './domain';
import { evaluateCoupon, redeemCoupon, releaseCoupon, unitPrices } from './commerce';
import { hashPassword, normalizeEmail, sendWelcomeEmail, strongPassword } from './accounts';

export async function createOrder(input: z.infer<typeof orderInput>, customerId?: string) {
  if (input.paymentMethod === 'BANK_QR' && !qrUrl('CHECK', 0)) {
    throw new HttpError(503, 'Chuyển khoản đang tạm ngưng. Vui lòng chọn COD.');
  }
  // Tạo tài khoản cùng lúc đặt hàng: cần email hợp lệ, email chưa có tài khoản và mật khẩu đủ mạnh. Kiểm tra trước khi trừ kho.
  let newAccount: { name: string; email: string; passwordHash: string } | undefined;
  if (input.createAccount) {
    if (!input.email) throw new HttpError(422, 'Cần nhập email để tạo tài khoản.');
    const password = strongPassword.safeParse(input.createAccount.password);
    if (!password.success) throw new HttpError(422, password.error.issues[0].message);
    const email = normalizeEmail(input.email);
    if (await db.customer.findUnique({ where: { email } })) throw new HttpError(409, 'Email này đã có tài khoản. Hãy đăng nhập để đặt hàng.');
    newAccount = { name: input.customerName, email, passwordHash: await hashPassword(password.data) };
  }
  const result = await retryTransaction(() => db.$transaction(async tx => {
    const now = new Date();
    const day = dayKey(now).replaceAll('-', '');
    const sequence = await tx.orderSequence.upsert({
      where: { day }, create: { day, value: 1 }, update: { value: { increment: 1 } },
    });
    const lines = [];
    for (const item of [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const updated = await tx.productVariant.updateMany({
        where: { id: item.variantId, isActive: true, stock: { gte: item.quantity }, product: { isActive: true } },
        data: { stock: { decrement: item.quantity } },
      });
      if (!updated.count) throw new HttpError(409, 'Một phân loại đã hết hàng hoặc không đủ số lượng.');
      const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: item.variantId }, include: { product: true } });
      if (item.quantity < variant.minQty) throw new HttpError(422, variant.product.name + ': Mua tối thiểu ' + variant.minQty + ' ' + variant.unit + '.');
      lines.push({
        variantId: variant.id, productName: variant.product.name, color: variant.color, size: variant.size,
        gender: variant.gender, unit: variant.unit, category: variant.product.category, isLiveFish: variant.product.isLiveFish,
        unitPrice: unitPrices(variant.product, variant, now).unit, quantity: item.quantity,
      });
    }
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const base = quote(input.province, subtotal, lines.some(line => line.isLiveFish), input.shippingMethod);
    const { hasLiveFish, liveDeliveryAvailable } = base;
    if (!liveDeliveryAvailable) throw new HttpError(422, 'Long Fish chưa giao cá sống đến tỉnh/thành này. Hãy bỏ cá sống khỏi giỏ để đặt phụ kiện.');
    if (hasLiveFish && !input.doaAccepted) throw new HttpError(422, 'Bạn cần xác nhận đã đọc chính sách cá sống (DOA).');
    // Mã giảm giá luôn được kiểm tra lại ở máy chủ, trong cùng giao dịch với việc trừ kho.
    let discount = 0;
    let shippingDiscount = 0;
    let couponId: string | undefined;
    let couponCode = '';
    if (input.couponCode) {
      const applied = await evaluateCoupon(tx, input.couponCode, {
        subtotal, lines: lines.map(line => ({ productId: line.variantId, category: line.category, lineTotal: line.unitPrice * line.quantity })),
        baseShippingFee: base.baseShippingFee, now, customerId, phone: input.phone, email: input.email,
      });
      discount = applied.discount; shippingDiscount = applied.shippingDiscount; couponId = applied.coupon.id; couponCode = applied.coupon.code;
    }
    const shippingFee = Math.max(0, base.shippingFee - shippingDiscount);
    const packingFee = base.packingFee;
    const total = subtotal - discount + shippingFee + packingFee;
    if (total > 2_147_483_647) throw new HttpError(422, 'Giá trị đơn vượt giới hạn.');
    let ownerId = customerId;
    if (newAccount) ownerId = (await tx.customer.create({ data: { email: newAccount.email, name: newAccount.name, phone: input.phone, passwordHash: newAccount.passwordHash } })).id;
    const code = 'DH' + day + '-' + String(sequence.value).padStart(4, '0');
    const order = await tx.order.create({
      data: {
        code, customerName: input.customerName, phone: input.phone, email: input.email || '', psid: trustedPsid(input.psid, input.context),
        address: [input.address, input.ward, input.district, input.province].filter(Boolean).join(', '),
        customerId: ownerId, couponCode, discount, shippingDiscount, shippingMethod: input.shippingMethod,
        note: input.note, paymentMethod: input.paymentMethod, subtotal, shippingFee, packingFee, total, hasLiveFish, doaAccepted: input.doaAccepted,
        preferredDelivery: input.preferredDelivery,
        createdAt: now, items: { create: lines }, history: { create: { toStatus: 'PENDING', changedAt: now } },
      },
      include: orderDetails,
    });
    if (couponId) await redeemCoupon(tx, couponId, order.id, { customerId: ownerId, phone: input.phone, email: input.email });
    await tx.outboxEvent.create({ data: { kind: 'created', payload: { code, status: order.status } } });
    return {
      code, total: order.total, subtotal, discount, couponCode, shippingFee, shippingMethod: input.shippingMethod, packingFee, hasLiveFish, items: order.items, paymentMethod: order.paymentMethod,
      customerName: input.customerName, phone: input.phone, email: input.email || '', address: order.address, accountCreated: !!newAccount,
      qrUrl: order.paymentMethod === 'BANK_QR' ? qrUrl(code, order.total) : undefined, mock, sandbox: paymentSandbox(),
    };
  }));
  if (newAccount) void sendWelcomeEmail(newAccount).catch(error => console.warn('[Email] Không gửi được email chào mừng:', error instanceof Error ? error.message : error));
  return result;
}

export async function changeStatus(id: string, status: OrderStatus, confirmCancellation: boolean) {
  return retryTransaction(() => db.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new HttpError(404, 'Không tìm thấy đơn.');
    if (order.status === status) return tx.order.findUniqueOrThrow({ where: { id }, include: orderDetails });
    if (!nextStatus[order.status].includes(status) ||
        (order.status === 'SHIPPING' && status === 'CANCELLED' && !confirmCancellation)) {
      throw new HttpError(409, 'Không thể chuyển sang trạng thái đã chọn.');
    }
    const update = await tx.order.updateMany({ where: { id, status: order.status }, data: { status } });
    if (!update.count) throw new HttpError(409, 'Đơn vừa được cập nhật. Hãy tải lại.');
    if (status === 'CANCELLED') {
      for (const line of order.items) {
        await tx.productVariant.update({ where: { id: line.variantId }, data: { stock: { increment: line.quantity } } });
      }
      await releaseCoupon(tx, id);
    }
    await tx.orderStatusLog.create({ data: { orderId: id, fromStatus: order.status, toStatus: status } });
    // Đơn COD giao xong nghĩa là đã thu tiền mặt.
    if (status === 'DELIVERED' && order.paymentMethod === 'COD' && order.paymentStatus === 'UNPAID') {
      await tx.order.update({ where: { id }, data: { paymentStatus: 'PAID' } });
      await tx.orderStatusLog.create({ data: { orderId: id, fromStatus: status, toStatus: status, action: 'payment', detail: 'Đã thu tiền COD khi giao' } });
    }
    await tx.outboxEvent.create({ data: { kind: 'status', payload: { code: order.code, status } } });
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderDetails });
  }));
}

export async function updatePayment(id: string) {
  return retryTransaction(() => db.$transaction(async tx => {
    const result = await tx.order.updateMany({
      where: { id, paymentStatus: 'UNPAID', status: { not: 'CANCELLED' } }, data: { paymentStatus: 'PAID' },
    });
    const order = await tx.order.findUniqueOrThrow({ where: { id }, include: orderDetails });
    if (order.status === 'CANCELLED') throw new HttpError(409, 'Không thể ghi nhận thanh toán cho đơn đã hủy.');
      if (result.count) await tx.orderStatusLog.create({ data: { orderId: id, fromStatus: order.status, toStatus: order.status, action: 'payment', detail: 'Ghi nhận đã thanh toán' } });
      if (result.count) await tx.outboxEvent.create({
      data: { kind: 'payment', payload: { code: order.code, status: order.status, notify: false } },
    });
    return tx.order.findUniqueOrThrow({ where: { id }, include: orderDetails });
  }));
}

export async function reconcileBankPayment(code: string, amount: number, reference?: string) {
  return retryTransaction(() => db.$transaction(async tx => {
    const order = await tx.order.findUnique({ where: { code } });
    if (!order) throw new HttpError(404, 'Không tìm thấy mã đơn.');
    if (order.paymentMethod !== 'BANK_QR') throw new HttpError(422, 'Đơn này không dùng chuyển khoản ngân hàng.');
    if (order.status === 'CANCELLED') throw new HttpError(409, 'Đơn đã hủy, không ghi nhận thanh toán.');
    if (amount !== order.total) throw new HttpError(422, 'Số tiền chuyển khoản không khớp tổng đơn.');
    const result = await tx.order.updateMany({
      where: { id: order.id, paymentStatus: 'UNPAID' }, data: { paymentStatus: 'PAID' },
    });
    if (result.count) {
      await tx.orderStatusLog.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: order.status, action: 'payment',
        detail: 'Đối soát chuyển khoản tự động' + (reference ? ' · ' + reference : '') } });
      await tx.outboxEvent.create({
        data: { kind: 'payment', payload: { code: order.code, status: order.status, notify: true } },
      });
    }
    return tx.order.findUniqueOrThrow({ where: { id: order.id } });
  }));
}

export async function trackOrder(code: string, phone: string, psid?: string) {
  const order = await db.order.findFirst({
    where: { code, phone, ...(psid ? { psid } : {}) },
    select: {
      code: true, total: true, status: true, paymentStatus: true, createdAt: true,
      history: { where: { action: 'status' }, select: { toStatus: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
    },
  });
  if (!order) throw new HttpError(404, 'Mã đơn hoặc số điện thoại không khớp.');
  return order;
}



