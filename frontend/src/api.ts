export type CareInfo = { scientificName: string; adultCm: number; temperature: string; ph: string; temperament: string; difficulty: string; food: string; minTankLiters: number; community: boolean; algaeEater: boolean; compact: boolean; source?: string };
export type LivePolicy = { doaPolicy: string; liveProvinces: string[]; liveEverywhere?: boolean; freeThreshold?: number };
export type Variant = { id: string; color: string; size: string; sku: string; gender: string; unit: string; minQty: number; stock: number; lowStockThreshold: number; priceOverride: number | null; isActive: boolean; unitPrice?: number; regularPrice?: number; onSale?: boolean };
export type Product = { id: string; name: string; slug: string; description: string; price: number; images: string[]; category: string; isLiveFish: boolean; careInfo: CareInfo | null; isActive: boolean; variants: Variant[]; currentPrice?: number; onSale?: boolean; salePercent?: number; salePrice?: number | null; saleStartsAt?: string | null; saleEndsAt?: string | null;
  alternatives?: Linked[]; crossSells?: Linked[]; upSells?: Linked[]; links?: { type: string; linked: { slug: string } }[] };
export type Linked = { id: string; name: string; slug: string; price: number; currentPrice?: number; onSale?: boolean; images: string[]; category?: string };
export type Status = 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'CANCELLED';
export type Payment = 'COD' | 'BANK_QR';
export type PaymentConfig = { bankTransfer: boolean; sandbox: boolean };
export type Item = { id: string; productName: string; color: string; size: string; gender: string; unit: string; quantity: number; unitPrice: number };
export type Tracked = { code: string; total: number; status: Status; paymentStatus: 'UNPAID' | 'PAID'; createdAt: string; history: { id?:string; toStatus: Status; changedAt: string; action?:string; detail?:string }[] };
export type Order = Tracked & { discount?: number; couponCode?: string; shippingMethod?: ShippingMethod; shippingDiscount?: number; id: string; customerName: string; phone: string; email: string; address: string; note: string; items: Item[]; paymentMethod: Payment; subtotal: number; shippingFee: number; packingFee: number; hasLiveFish: boolean; preferredDelivery: string; internalNote: string };
export type Confirmation = Pick<Order, 'code' | 'total' | 'items' | 'paymentMethod' | 'subtotal' | 'shippingFee' | 'packingFee' | 'hasLiveFish'> & {
  qrUrl?: string; mock: boolean; sandbox?: boolean; phone?: string; discount?: number; couponCode?: string; shippingMethod?: ShippingMethod;
  customerName?: string; email?: string; address?: string; accountCreated?: boolean };
export type ShippingMethod = 'STANDARD' | 'EXPRESS';
export type Quote = {
  subtotal: number; discount: number; shippingDiscount: number; shippingFee: number; packingFee: number; total: number; hasLiveFish: boolean;
  liveDeliveryAvailable: boolean; freeThreshold: number; shippingMethod: ShippingMethod; couponError: string;
  coupon: { code: string; kind: string; description: string } | null;
  methods: { id: ShippingMethod; label: string; description: string; fee: number }[];
  lines: { variantId: string; quantity: number; unitPrice: number; regularPrice: number; lineTotal: number }[];
};
export type Address = { name: string; phone: string; province: string; district: string; ward: string; address: string };
export type Customer = { id: string; email: string; name: string; phone: string; shippingAddress: Address | null; billingAddress: Address | null; orderCount?: number;
  recentOrders?: { code: string; createdAt: string; status: Status; total: number }[] };
export const labels: Record<Status, string> = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', SHIPPING: 'Đang giao', DELIVERED: 'Đã giao', CANCELLED: 'Đã hủy' };
export const money = (amount: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
export const localDate = (date: string) => new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Không thể kết nối.';
export function query(values: Record<string, string>) {
  const params = new URLSearchParams(Object.entries(values).filter(([, value]) => value));
  return params.size ? '?' + params : '';
}
export const customerTokenKey = 'longFish.customerToken';
export const readCustomerToken = () => { try { return localStorage.getItem(customerTokenKey) || ''; } catch { return ''; } };
export async function api<T>(path: string, options: { method?: string; body?: unknown; token?: string; signal?: AbortSignal } = {}) {
  const multipart = options.body instanceof FormData;
  // Khách đã đăng nhập: gắn mã đăng nhập vào các lệnh gọi không phải quản trị (đặt hàng, báo giá, tài khoản).
  const customerToken = !options.token && !path.startsWith('/admin') ? readCustomerToken() : '';
  const response = await fetch('/api' + path, {
    method: options.method, signal: options.signal,
    headers: { ...(options.body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: 'Bearer ' + options.token } : customerToken ? { Authorization: 'Bearer ' + customerToken } : {}) },
    body: multipart ? options.body as FormData : options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => {
    if (!response.ok) return { message: response.status === 413 ? 'Tệp vượt giới hạn tải lên.' : 'Yêu cầu thất bại.' };
    throw new Error('Phản hồi không hợp lệ.');
  });
  if (!response.ok) {
    if (response.status === 401 && options.token) window.dispatchEvent(new Event('admin:expired'));
    if (response.status === 401 && customerToken) { try { localStorage.removeItem(customerTokenKey); } catch { /* bỏ qua */ } window.dispatchEvent(new Event('customer:expired')); }
    throw new Error(result.message || 'Yêu cầu thất bại.');
  }
  return result as T;
}
