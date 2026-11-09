import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from './db';
import { trustedPsid } from './messenger';
import { dayKey, mock } from './env';
import { HttpError, nextStatus, orderDetails, orderInput, orderLines, qrUrl, quote, retryTransaction } from './domain';

export async function checkoutQuote(province: string, items: z.infer<typeof orderLines>) {
  const variants = await db.productVariant.findMany({
    where: { id: { in: items.map(item => item.variantId) }, isActive: true, product: { isActive: true } },
    include: { product: true },
  });
  let subtotal = 0;
  for (const item of items) {
    const variant = variants.find(row => row.id === item.variantId);
    if (!variant || variant.stock < item.quantity) throw new HttpError(409, 'Phân loại đã hết hoặc không đủ hàng.');
    if (item.quantity < variant.minQty) throw new HttpError(422, 'Số lượng tối thiểu là ' + variant.minQty + ' ' + variant.unit + '.');
    subtotal += (variant.priceOverride ?? variant.product.price) * item.quantity;
  }
  return quote(province, subtotal, variants.some(row => row.product.isLiveFish));
}

export async function createOrder(input: z.infer<typeof orderInput>) {
  if (input.paymentMethod === 'BANK_QR' && !qrUrl('CHECK', 0)) {
    throw new HttpError(503, 'Chuyển khoản đang tạm ngưng. Vui lòng chọn COD.');
  }
  return retryTransaction(() => db.$transaction(async tx => {
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
        unitPrice: variant.priceOverride ?? variant.product.price, quantity: item.quantity,
      });
    }
    const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const { shippingFee, packingFee, total, hasLiveFish, liveDeliveryAvailable } =
      quote(input.province, subtotal, lines.some(line => line.isLiveFish));
    if (!liveDeliveryAvailable) throw new HttpError(422, 'Long Fish chưa giao cá sống đến tỉnh/thành này. Hãy bỏ cá sống khỏi giỏ để đặt phụ kiện.');
    if (hasLiveFish && !input.doaAccepted) throw new HttpError(422, 'Bạn cần xác nhận đã đọc chính sách cá sống (DOA).');
    if (total > 2_147_483_647) throw new HttpError(422, 'Giá trị đơn vượt giới hạn.');
    const code = 'DH' + day + '-' + String(sequence.value).padStart(4, '0');
    const order = await tx.order.create({
      data: {
        code, customerName: input.customerName, phone: input.phone, psid: trustedPsid(input.psid, input.context),
        address: [input.address, input.district, input.province].join(', '),
        note: input.note, paymentMethod: input.paymentMethod, subtotal, shippingFee, packingFee, total, hasLiveFish, doaAccepted: input.doaAccepted,
        preferredDelivery: input.preferredDelivery,
        createdAt: now, items: { create: lines }, history: { create: { toStatus: 'PENDING', changedAt: now } },
      },
      include: orderDetails,
    });
    await tx.outboxEvent.create({ data: { kind: 'created', payload: { code, status: order.status } } });
    return {
      code, total: order.total, subtotal, shippingFee, packingFee, hasLiveFish, items: order.items, paymentMethod: order.paymentMethod,
      qrUrl: order.paymentMethod === 'BANK_QR' ? qrUrl(code, order.total) : undefined, mock,
    };
  }));
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
    }
    await tx.orderStatusLog.create({ data: { orderId: id, fromStatus: order.status, toStatus: status } });
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
    return order;
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



