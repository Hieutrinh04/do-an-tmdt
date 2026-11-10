import { useEffect } from 'react';

// Cập nhật tiêu đề, mô tả và robots khi chuyển trang trong ứng dụng (bản chèn sẵn từ máy chủ lo phần bộ thu thập không chạy JS).
function meta(name: string) {
  let element = document.head.querySelector<HTMLMetaElement>('meta[name="' + name + '"]');
  if (!element) { element = document.createElement('meta'); element.name = name; document.head.appendChild(element); }
  return element;
}

// Cùng quy tắc với máy chủ (backend/src/seo-text.ts): title ≤ 60, mô tả 120–155 ký tự.
const clip = (value: string, max: number) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
};
const FILLERS = [' Đặt hàng trực tuyến, giao tận nơi.', ' Thanh toán khi nhận hàng hoặc chuyển khoản VietQR, chính sách đổi trả rõ ràng.', ' Xem thông số, giá và tồn kho chi tiết ngay trên website.'];
export function fitDescription(text: string) {
  let value = text.replace(/\s+/g, ' ').trim();
  for (const filler of FILLERS) { if (value.length >= 120) break; value = (value + filler).replace(/\s+/g, ' ').trim(); }
  return clip(value, 155);
}
export function fitTitle(primary: string, suffixes: string[]) {
  for (const suffix of suffixes) if ((primary + suffix).length <= 60) return primary + suffix;
  return clip(primary, 60);
}

export type Seo = { title: string; description?: string; noindex?: boolean };

export function applySeo({ title, description, noindex }: Seo) {
  document.title = title;
  if (description) meta('description').content = description;
  meta('robots').content = noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large';
}

// Chưa có dữ liệu (đang tải) thì truyền undefined để giữ nguyên title/mô tả mà máy chủ đã chèn sẵn.
export function useSeo(seo: Seo | undefined) {
  useEffect(() => { if (seo) applySeo(seo); }, [seo?.title, seo?.description, seo?.noindex]); // eslint-disable-line react-hooks/exhaustive-deps
}

const pages: Record<string, Seo> = {
  '/checkout': { title: 'Chốt đơn | Long Fish', noindex: true },
  '/confirmation': { title: 'Đặt hàng thành công | Long Fish', noindex: true },
  '/track': { title: 'Tra cứu đơn hàng | Long Fish', noindex: true },
  '/credits': { title: 'Nguồn ảnh | Long Fish', description: 'Danh sách tác giả, giấy phép và nguồn của các ảnh sản phẩm trên Long Fish.' },
};

export function seoForPath(pathname: string): Seo | undefined {
  if (pathname.startsWith('/admin')) return { title: 'Quản trị | Long Fish', noindex: true };
  return pages[pathname];
}
