import { useEffect, useState } from 'react';
import { api } from './api';

export type SiteInfo = { name: string; address: string; phone: string; email: string; facebook: string; tiktok: string; instagram: string; hours: string };
export type CategoryInfo = { slug: string; name: string; description: string; count: number };

export function useApi<T>(path: string, fallback: T) {
  const [data, setData] = useState<T>(fallback);
  useEffect(() => { let alive = true; api<T>(path).then(value => { if (alive) setData(value); }).catch(() => {}); return () => { alive = false; }; }, [path]);
  return data;
}
export const useSite = () => useApi<SiteInfo | null>('/site', null);
export const useCategories = () => useApi<CategoryInfo[]>('/categories', []);
// Trả về null khi chưa tải xong để giao diện giữ chỗ (tránh dịch chuyển bố cục - CLS).
export const useCategoriesLoading = () => useApi<CategoryInfo[] | null>('/categories', null);
