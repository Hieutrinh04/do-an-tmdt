# SEO Long Fish – đối chiếu với file hướng dẫn đồ án

Nguồn yêu cầu: "Yêu cầu đồ án môn học – Xây dựng website TMĐT" (Phần A cấu trúc, B nội dung, C SEO On-page). File hướng dẫn viết cho WordPress/WooCommerce/Yoast; dự án này là ứng dụng React + Node riêng nên mỗi mục Yoast được thực hiện bằng mã tương ứng. Kiểm tra tự động: `npm run seo:audit` (655 mục, kết quả `docs/seo-audit.json`) và `npm run lighthouse` (`docs/lighthouse/`).

## Phần C – SEO On-page (25 điểm)

| Yêu cầu | Cách thực hiện | Kiểm chứng |
|---|---|---|
| C1. Cài đặt SEO chung: Site Title, meta mặc định, dấu phân cách, breadcrumb, Social Graph, sitemap | Tiêu đề dạng `Tên | …` hoặc `Tên – …`; mô tả mặc định 120–155 ký tự; breadcrumb hiển thị + JSON-LD; Open Graph/Twitter Card, ảnh OG 1200×630 (`/og-default.jpg`); `sameAs` lấy từ `SHOP_FACEBOOK_URL`, `SHOP_TIKTOK_URL`, `SHOP_INSTAGRAM_URL` | `seo:audit` |
| C2. Mỗi trang có SEO Title ≤60, Meta Description 120–155, từ khóa chính | `backend/src/seo.ts` + `seo-text.ts` tự dựng và cắt/đệm theo đúng giới hạn: trang chủ `Long Fish – Cá Cảnh Nước Ngọt & Thủy Sinh`; sản phẩm `[Tên] — Long Fish | Giá Tốt`; danh mục `[Tên] — Long Fish | Hàng Mới <năm>`. Từ khóa chính (tên sản phẩm/danh mục) có trong H1, title, mô tả và đoạn đầu. Giao diện dùng cùng quy tắc khi chuyển trang | `seo:audit` (từng trang, 44 trang) |
| C3. URL slug chuẩn | `/san-pham/<slug>`, `/danh-muc/<slug>`, `/gioi-thieu`, `/lien-he`, `/chinh-sach-doi-tra`, `/chinh-sach-bao-mat`, `/chinh-sach-van-chuyen`; tiếng Việt không dấu, gạch ngang. Đường dẫn cũ `/product/<slug>` chuyển hướng 301 nên link đã chia sẻ (Messenger, Zalo) vẫn dùng được | `seo:audit` |
| C4. Schema | Product (AggregateOffer, VND, còn/hết hàng), BreadcrumbList (có cấp danh mục), Organization (+ `contactPoint`, `sameAs`), WebSite, CollectionPage (danh mục), ContactPage; LocalBusiness trên trang Liên hệ **chỉ khi** `SHOP_ADDRESS` được điền | Rich Results Test (xem bên dưới) |
| C5. Core Web Vitals | CLS ≈ 0 (khung giữ chỗ khi tải dữ liệu), TTFB < 30 ms, tách mã theo trang, ảnh có `width/height` và `srcset`, gzip, cache tài nguyên | `npm run lighthouse` |
| C6. SEO hình ảnh | Mọi ảnh có `alt` mô tả (tên sản phẩm, logo); tên file có nghĩa (`betta-halfmoon-1.webp`); định dạng WebP | `seo:audit` (kiểm tra alt từng trang) |

## Phần A – Cấu trúc & điều hướng

| Yêu cầu | Hiện trạng |
|---|---|
| Menu chính: Trang chủ, Cửa hàng (dropdown danh mục + "Tất cả sản phẩm"), Giới thiệu, Liên hệ; sticky; hamburger ≤767 px | Có (thêm "Tra cứu đơn") |
| Header: logo, menu, ô tìm kiếm, icon giỏ hàng có số lượng | Có, số lượng cập nhật ngay khi thêm/xóa |
| Footer 4 cột (thương hiệu + mạng xã hội, liên kết nhanh, danh mục, liên hệ) + dải copyright + phương thức thanh toán | Có; địa chỉ/điện thoại/email hiện khi điền `SHOP_*` |
| Breadcrumb ngay dưới header trên sản phẩm và danh mục | Có (`Trang chủ › Danh mục › Tên sản phẩm`, mục cuối đậm) |
| Sitemap XML (44 địa chỉ), loại trừ giỏ hàng/thanh toán/tra cứu/quản trị | `/sitemap.xml`, khai báo trong `/robots.txt` |
| Trang riêng tư không lập chỉ mục | `X-Robots-Tag: noindex` (nginx) + `Disallow` trong robots.txt + thẻ meta |

## Phần B – Nội dung trang

- **Trang danh mục** (10 danh mục): banner/ảnh, H1, mô tả 50–100 từ, sắp xếp theo giá, lưới sản phẩm; trang chủ có mục "Danh mục nổi bật".
- **Trang sản phẩm**: gallery ảnh, H1 duy nhất, giá, biến thể, tồn kho, **sản phẩm liên quan** (4 sản phẩm cùng danh mục), thông số nuôi.
- **Giới thiệu** (≥150 từ), **Liên hệ** (thông tin + biểu mẫu hoạt động, lưu DB, admin xem ở mục Hỗ trợ, có bẫy chống bot và giới hạn tần suất), **3 chính sách**: đổi trả (≥200 từ), bảo mật (≥150 từ), vận chuyển (≥150 từ, bảng phí lấy từ cấu hình phí thật).

## Việc chủ shop cần làm (không thể tự động)

1. **Điền thông tin thật trong `.env`**: `SHOP_ADDRESS`, `SHOP_PHONE`, `SHOP_EMAIL` (và `SHOP_TIKTOK_URL`, `SHOP_INSTAGRAM_URL` nếu có). Để trống thì footer/trang Liên hệ/LocalBusiness không hiển thị các mục đó.
2. **Xác nhận điều khoản trong Chính sách đổi trả**: mặc định là `SHOP_RETURN_DAYS=7` ngày đổi trả phụ kiện và `SHOP_REFUND_DAYS=3–5 ngày làm việc`; phần cá sống lấy từ chính sách DOA đang áp dụng. Các điều khoản này do mình soạn mặc định, cần chủ shop xác nhận hoặc chỉnh.
3. **Domain thật**: `SITE_URL` phải là domain chính thức (canonical, sitemap, ảnh chia sẻ dùng giá trị này). Địa chỉ `*.trycloudflare.com` (tunnel tạm) **luôn bị Cloudflare thêm `X-Robots-Tag: none`**, nên PageSpeed/Lighthouse chạy trên địa chỉ đó báo "Trang bị chặn lập chỉ mục" và điểm SEO chỉ ~69. Lỗi này tự hết khi dùng domain thật hoặc tunnel có tên.
4. **Search Console**: gửi `https://<domain>/sitemap.xml`.
5. **Ảnh chụp để nộp báo cáo** (cần địa chỉ công khai, dùng domain thật): (a) Rich Results Test (`search.google.com/test/rich-results`) cho ≥2 trang sản phẩm; (b) PageSpeed Insights (`pagespeed.web.dev`) mobile và desktop.
6. **Đánh giá khách hàng (AggregateRating)**: dự án chưa có tính năng đánh giá sản phẩm nên chưa khai báo Review/AggregateRating (không tạo dữ liệu giả).

## Số liệu đo ngày 10/11/2026 (Lighthouse trên máy chủ cục bộ)

| Trang | Mobile | Desktop | SEO | CLS | TTFB |
|---|---:|---:|---:|---:|---:|
| Trang chủ | 75–78 | 99 | 100 | 0,003 | < 20 ms |
| Danh mục | 83–88 | 99 | 100 | 0 | < 30 ms |
| Sản phẩm | 76–80 | 99 | 100 | 0 | < 30 ms |

Ngưỡng của hướng dẫn: mobile ≥ 60, desktop ≥ 80, CLS ≤ 0,1, TTFB ≤ 800 ms: **đạt**. **Chưa đạt**: LCP trên điện thoại mô phỏng mạng 4G chậm là 3,3–4,7 s (ngưỡng 2,5 s); trên máy tính LCP < 1 s. Cải thiện triệt để cần dựng sẵn phần đầu trang phía máy chủ.
