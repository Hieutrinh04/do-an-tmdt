import { db } from './db';
import { addDays, dayKey, dayStart } from './env';
import { HttpError } from './domain';

const empty = (period: string) => ({ period, orders: 0, revenue: 0, cancelled: 0, delivered: 0, processing: 0 });

export async function report(from: string, to: string, monthly = false) {
  const start = dayStart(from);
  const end = dayStart(to);
  if (start > end || +end - +start > 370 * 86400000) throw new HttpError(422, 'Khoảng thời gian không hợp lệ hoặc vượt 371 ngày.');
  const buckets = new Map<string, ReturnType<typeof empty>>();
  const getPeriod = (date: Date) => dayKey(date).slice(0, monthly ? 7 : 10);
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    const key = getPeriod(cursor);
    if (!buckets.has(key)) buckets.set(key, empty(key));
  }
  const orders = await db.order.findMany({
    where: { createdAt: { gte: start, lt: addDays(end, 1) } },
    select: { createdAt: true, status: true, total: true, items: { select: { productName: true, quantity: true, unitPrice: true, category: true, isLiveFish: true, variant: { select: { productId: true } } } } },
  });
  const products = new Map<string, { id: string; name: string; quantity: number; revenue: number }>();
  const categories = new Map<string, number>();
  const total = empty('');
  for (const order of orders) {
    const row = buckets.get(getPeriod(order.createdAt))!;
    row.orders++;
    total.orders++;
    if (order.status === 'CANCELLED') {
      row.cancelled++;
      total.cancelled++;
    } else if (order.status === 'DELIVERED') {
      row.delivered++;
      total.delivered++;
      row.revenue += order.total;
      total.revenue += order.total;
      for (const item of order.items) {
        const revenue = item.unitPrice * item.quantity;
        categories.set(item.category, (categories.get(item.category) ?? 0) + revenue);
        const id = item.variant.productId;
        const product = products.get(id) ?? { id, name: item.productName, quantity: 0, revenue: 0 };
        product.quantity += item.quantity;
        product.revenue += revenue;
        products.set(id, product);
      }
    } else {
      row.processing++;
      total.processing++;
    }
  }
  return { rows: [...buckets.values()], total, categories: [...categories].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue),
    top: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8) };
}

export async function overview(from?: string, to?: string) {
  const now = new Date();
  const today = dayKey(now);
  const month = today.slice(0, 7);
  const monthlyStart = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12, 1));
  const [daily, monthly, selection, monthToDate, todayReport] = await Promise.all([
    report(dayKey(addDays(now, -29)), today),
    report(dayKey(monthlyStart), today, true),
    report(from || dayKey(addDays(now, -29)), to || today),
    report(month + '-01', today), report(today, today),
  ]);
  return { daily: daily.rows, monthly: monthly.rows, total: selection.total, top: selection.top, categories: selection.categories,
    todayRevenue: todayReport.total.revenue, monthRevenue: monthToDate.total.revenue };
}

