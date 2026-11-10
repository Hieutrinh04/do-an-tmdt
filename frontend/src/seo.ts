import { useEffect } from 'react';

// Cập nhật tiêu đề, mô tả và robots khi chuyển trang trong ứng dụng (bản chèn sẵn từ máy chủ lo phần bộ thu thập không chạy JS).
function meta(name: string) {
  let element = document.head.querySelector<HTMLMetaElement>('meta[name="' + name + '"]');
  if (!element) { element = document.createElement('meta'); element.name = name; document.head.appendChild(element); }
  return element;
}

export type Seo = { title: string; description?: string; noindex?: boolean };

export function applySeo({ title, description, noindex }: Seo) {
  document.title = title;
  if (description) meta('description').content = description;
  meta('robots').content = noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large';
}

export function useSeo(seo: Seo) {
  useEffect(() => { applySeo(seo); }, [seo.title, seo.description, seo.noindex]); // eslint-disable-line react-hooks/exhaustive-deps
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
