# Long Fish trên desktop và mobile

Chụp tự động ngày 09/11/2026 bằng Playwright Chromium headless, trên Docker `long-fish-e2e` cổng 18080 với database riêng và dữ liệu giả. Desktop 1366×800, Pixel 7 viewport 412×839; ảnh toàn trang có chiều cao theo nội dung. Bộ 8 test đều PASS. Xem [báo cáo](../test-report.md).

Riêng hai ảnh dashboard được chụp lại trên bản demo sạch cổng 18082 sau khi biểu đồ hoàn tất hoạt ảnh JavaScript. Dữ liệu chỉ hiển thị tổng hợp; bản demo gồm 32 đơn và 27 sản phẩm sau reset.

| Màn hình | Desktop | Mobile |
|---|---|---|
| Cửa hàng | [Ảnh](home-desktop.jpg) | [Ảnh](home-mobile.jpg) |
| Neon Tetra | [Ảnh](product-desktop.jpg) | [Ảnh](product-mobile.jpg) |
| Betta Halfmoon | [Ảnh](product-betta-halfmoon-desktop.jpg) | [Ảnh](product-betta-halfmoon-mobile.jpg) |
| Cá đĩa | [Ảnh](product-ca-dia-desktop.jpg) | [Ảnh](product-ca-dia-mobile.jpg) |
| Chốt đơn cá sống | [Ảnh](checkout-desktop.jpg) | [Ảnh](checkout-mobile.jpg) |
| VietQR | [Ảnh](vietqr-desktop.jpg) | [Ảnh](vietqr-mobile.jpg) |
| Tra cứu và timeline | [Ảnh](track-desktop.jpg) | [Ảnh](track-mobile.jpg) |
| Quản trị đơn | [Ảnh](admin-desktop.jpg) | [Ảnh](admin-mobile.jpg) |
| Dashboard | [Ảnh](dashboard-desktop.jpg) | [Ảnh](dashboard-mobile.jpg) |
| Upload và quản lý ảnh | [Ảnh](upload-desktop.jpg) | [Ảnh](upload-mobile.jpg) |
| Nguồn ảnh | [Ảnh](credits-desktop.jpg) | [Ảnh](credits-mobile.jpg) |

Chạy lại với `E2E_WRITE=1`, `E2E_SCREENSHOTS=1`, `E2E_COMPOSE_PROJECT=long-fish-e2e`, `E2E_BASE_URL=http://localhost:18080` và `npm run test:ui`. Cấu hình từ chối ghi vào stack gốc cổng 8080. Ảnh upload tổng hợp chỉ dùng thử chức năng và sản phẩm thử được ẩn khi kết thúc.
