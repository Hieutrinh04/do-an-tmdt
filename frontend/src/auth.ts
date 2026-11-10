import { useCallback, useEffect, useState } from 'react';
import { api, Customer, customerTokenKey, readCustomerToken } from './api';

// Trạng thái đăng nhập của khách hàng, dùng chung toàn trang (header, thanh toán, tài khoản).
const changed = 'customer:changed';

export function saveCustomerToken(token: string) {
  try { localStorage.setItem(customerTokenKey, token); } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event(changed));
}
export function clearCustomerToken() {
  try { localStorage.removeItem(customerTokenKey); } catch { /* bỏ qua */ }
  window.dispatchEvent(new Event(changed));
}

export function useCustomer() {
  const [token, setToken] = useState(readCustomerToken);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(!!readCustomerToken());
  const refresh = useCallback(async () => {
    const current = readCustomerToken();
    setToken(current);
    if (!current) { setCustomer(null); setLoading(false); return; }
    try { setCustomer(await api<Customer>('/account/me')); } catch { setCustomer(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const handler = () => { void refresh(); };
    window.addEventListener(changed, handler); window.addEventListener('customer:expired', handler); window.addEventListener('storage', handler);
    return () => { window.removeEventListener(changed, handler); window.removeEventListener('customer:expired', handler); window.removeEventListener('storage', handler); };
  }, [refresh]);
  return { token, customer, loading, refresh };
}
