// Chuẩn hướng dẫn đồ án: SEO title ≤ 60 ký tự, meta description 120–155 ký tự. Giao diện (frontend/src/seo.ts) dùng cùng quy tắc.
export const TITLE_MAX = 60;
export const DESCRIPTION_MIN = 120;
export const DESCRIPTION_MAX = 155;

export const clip = (value: string, max: number) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : text.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
};

const FILLERS = [
  ' Đặt hàng trực tuyến, giao tận nơi.',
  ' Thanh toán khi nhận hàng hoặc chuyển khoản VietQR, chính sách đổi trả rõ ràng.',
  ' Xem thông số, giá và tồn kho chi tiết ngay trên website.',
];

export function fitDescription(text: string, fillers: string[] = FILLERS) {
  let value = text.replace(/\s+/g, ' ').trim();
  for (const filler of fillers) {
    if (value.length >= DESCRIPTION_MIN) break;
    value = (value + filler).replace(/\s+/g, ' ').trim();
  }
  return clip(value, DESCRIPTION_MAX);
}

export function fitTitle(primary: string, suffixes: string[]) {
  for (const suffix of suffixes) if ((primary + suffix).length <= TITLE_MAX) return primary + suffix;
  return clip(primary, TITLE_MAX);
}
