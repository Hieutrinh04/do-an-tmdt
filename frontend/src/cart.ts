export type CartLine = { slug: string; variantId: string; quantity: number };
export function session<T>(key: string, fallback: T): T {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
const cartKey = 'longFish.cart';
export const receiptKey = 'longFish.confirmation';
export const cartFromSession = () => session<CartLine[]>(cartKey, []);
export const saveCart = (cart: CartLine[]) => sessionStorage.setItem(cartKey, JSON.stringify(cart));
