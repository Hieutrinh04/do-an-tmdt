import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorText, Product, Quote, ShippingMethod } from './api';
import { CartLine, cartChanged, cartFromSession, saveCart } from './cart';

// Giỏ hàng phản ứng ngay khi có thay đổi (thêm/xóa/sửa số lượng ở bất kỳ trang nào, kể cả mini cart trên header).
export function useCart() {
  const [cart, setCart] = useState<CartLine[]>(cartFromSession);
  useEffect(() => {
    const refresh = () => setCart(cartFromSession());
    window.addEventListener(cartChanged, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(cartChanged, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const update = useCallback((variantId: string, quantity: number) => {
    const current = cartFromSession();
    saveCart(quantity ? current.map(line => line.variantId === variantId ? { ...line, quantity } : line) : current.filter(line => line.variantId !== variantId));
  }, []);
  const clear = useCallback(() => saveCart([]), []);
  return { cart, update, clear };
}

// Thông tin sản phẩm của các dòng trong giỏ (tên, ảnh, giá hiện hành, tồn kho) lấy từ máy chủ.
export function useCartProducts(cart: CartLine[]) {
  const [products, setProducts] = useState<Record<string, Product | null>>({});
  const slugs = useMemo(() => [...new Set(cart.map(line => line.slug))].sort().join(','), [cart]);
  useEffect(() => {
    const controller = new AbortController();
    if (!slugs) { setProducts({}); return; }
    Promise.all(slugs.split(',').map(async slug => {
      try { return [slug, await api<Product>('/products/' + slug, { signal: controller.signal })] as const; } catch { return [slug, null] as const; }
    })).then(rows => { if (!controller.signal.aborted) setProducts(Object.fromEntries(rows)); });
    return () => controller.abort();
  }, [slugs]);
  return products;
}

export function useCartLines(cart: CartLine[]) {
  const products = useCartProducts(cart);
  const lines = cart.map(line => {
    const product = products[line.slug];
    const variant = product?.variants.find(row => row.id === line.variantId);
    const unit = variant?.unitPrice ?? variant?.priceOverride ?? product?.price ?? 0;
    const regular = variant?.regularPrice ?? variant?.priceOverride ?? product?.price ?? 0;
    return { ...line, product, variant, unit, regular, onSale: unit < regular, total: unit * line.quantity };
  });
  const loaded = cart.every(line => line.slug in products);
  const valid = !!lines.length && lines.every(line => line.variant && line.quantity >= line.variant.minQty && line.quantity <= line.variant.stock);
  return { lines, loaded, valid, subtotal: lines.reduce((sum, line) => sum + line.total, 0), hasLiveFish: lines.some(line => line.product?.isLiveFish) };
}

// Báo giá do máy chủ tính (giá khuyến mãi, mã giảm giá, phí giao, đóng gói): giỏ hàng và thanh toán luôn cho cùng một kết quả.
export function useQuote(input: { cart: CartLine[]; valid: boolean; province: string; coupon: string; method: ShippingMethod; phone?: string; email?: string }) {
  const [quote, setQuote] = useState<Quote>();
  const [error, setError] = useState('');
  const key = JSON.stringify([input.cart.map(({ variantId, quantity }) => ({ variantId, quantity })), input.province.trim(), input.coupon.trim(), input.method, input.phone || '', input.email || '']);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    if (!input.valid) { setQuote(undefined); return; }
    const [items, province, couponCode, shippingMethod, phone, email] = JSON.parse(key) as [{ variantId: string; quantity: number }[], string, string, ShippingMethod, string, string];
    const timer = window.setTimeout(() => api<Quote>('/shipping/quote', { method: 'POST', signal: controller.signal,
      body: { items, province, couponCode: couponCode || undefined, shippingMethod, phone: phone || undefined, email: email || undefined } })
      .then(result => { setQuote(result); })
      .catch(reason => { if (!controller.signal.aborted) { setQuote(undefined); setError(errorText(reason)); } }), 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, input.valid]);
  return { quote, error };
}

// Lưu lựa chọn (mã giảm giá, tỉnh, phương thức giao) trong phiên để giỏ hàng và thanh toán dùng chung.
export function useSessionState(key: string, initial: string) {
  const [value, setValue] = useState(() => { try { return sessionStorage.getItem(key) ?? initial; } catch { return initial; } });
  const set = useCallback((next: string) => { setValue(next); try { sessionStorage.setItem(key, next); } catch { /* bỏ qua */ } }, [key]);
  return [value, set] as const;
}
