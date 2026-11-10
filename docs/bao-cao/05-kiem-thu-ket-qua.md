# 05. Kiểm thử và kết quả

Toàn bộ số liệu dưới đây lấy từ các lần chạy có ghi nhận trong `docs/` và `data/`. Môi trường: Windows 10, Node 20 trong container, Chromium headless, stack kiểm thử cách ly `long-fish-e2e-b6` (cổng 18080 và 15678), `MOCK_INTEGRATIONS=true`. Stack gốc `long-fish` không được dùng để ghi dữ liệu.

## 5.1 Tổng hợp

| Nhóm kiểm thử | Kết quả | Ghi chú |
|---|---|---|
| Lint và build | PASS | `verify:all` ngày 09/11/2026 |
| Unit và HTTP backend (Vitest) | PASS | Bước `test` của `verify:all` PASS; lần chạy riêng trước đó: 122/122 |
| Playwright (desktop 1366×800 và Pixel 7) | **PASS 19/19, 3 lần liên tiếp**, mỗi lần 1 mục bỏ qua theo thiết kế | Xem 5.2 |
| Độ chính xác bot | **88/88 (100%)** trên 13 nhóm | `docs/bot-accuracy.json`, bộ câu do nhóm soạn |
| Kiểm tra phụ thuộc production | 0 lỗ hổng | `npm audit --omit=dev` |
| Lighthouse mobile | Trang chủ 99/100/100/100; trang sản phẩm 98/100/100/100 | Lần đo cuối, xem 5.4 |
| Đối soát WF4 | Ngày: 5 đơn, 357.000 đ; tháng 10: 7 đơn, 2.080.000 đ, 1 đơn hủy | Chạy thủ công hai nhánh, `docs/revenue-verification.json` |
| Tích hợp (`check:integrations`, 10/11/2026) | **OK cả 6 mục:** DB, ảnh, n8n, Messenger, Google Sheets, SMTP | Kết nối tài khoản thật của chủ dự án, xem 5.6 |

## 5.2 Playwright

Bộ kịch bản gồm hai tệp:

- `e2e/store.spec.ts` (4 kịch bản): danh mục, lọc, tìm không dấu, ảnh tải được, nguồn ảnh; chi tiết cá và số lượng tối thiểu; checkout COD và VietQR, luồng đơn trong admin, hủy hoàn kho, tra cứu; upload ảnh kéo thả, đổi thứ tự, chọn ảnh chính, gỡ ảnh.
- `e2e/flows.spec.ts` (6 kịch bản, bổ sung trong bước 5):

| Kịch bản | Kiểm chứng |
|---|---|
| Không cuộn ngang | Trang `/`, `/product/neon-tetra`, `/checkout`, `/track`, `/credits` không tràn chiều ngang trên desktop và điện thoại |
| Tra cứu tự cập nhật | Trang tra cứu hiển thị "Chờ xác nhận"; admin đổi sang "Đã xác nhận" và trang tự đổi trong vòng 25 giây (chu kỳ thực tế 15 giây) |
| Hết hàng | Thẻ sản phẩm hiển thị "Hết hàng"; API đặt hàng trả 409 |
| Vùng giao cá sống | Phụ kiện giao được An Giang (201); cá sống bị chặn (422) |
| Khóa đăng nhập sai | 10 lần sai đầu trả 401, lần thứ 11 trả 429; chỉ chạy trên desktop vì giới hạn theo IP dùng chung |
| Phiếu A6 | Phiếu `article.packing-label` ẩn ở màn hình và hiện khi in (`emulateMedia print`) |

Kết quả ba lần chạy liên tiếp trên cùng stack sạch (log: `data/`):

| Lần | Kết quả |
|---|---|
| 1 | 19 passed, 1 skipped |
| 2 | 19 passed, 1 skipped |
| 3 | 19 passed, 1 skipped |

Mục bỏ qua là khóa đăng nhập trên Pixel 7, chủ ý chỉ chạy một lần. Không có kịch bản nào flaky trong ba lần.

**Một lỗi do chính bộ kiểm thử gây ra, đã sửa.** Lần chạy đầu của kịch bản mới để lại sản phẩm `TEST` đang hiển thị, làm số thẻ sản phẩm vượt 27 và khiến `store.spec.ts` thất bại hai kiểm tra đếm. Nguyên nhân là dữ liệu thử không được dọn. Đã thêm bước ẩn sản phẩm test sau mỗi kịch bản (`DELETE` tương ứng với ẩn), reset stack và chạy lại; ba lần sau đó đều sạch. Trường hợp này cho thấy kiểm thử giao diện phụ thuộc trạng thái dữ liệu, và cần dọn sau mỗi lần chạy.

## 5.3 Bot

Bộ kiểm thử gọi trực tiếp `handleMessage` trên SQLite seed riêng; phần truyền tin Messenger được mock, không gửi tin thật. Kết quả 88/88 chia theo nhóm:

| Nhóm | Số câu | Đạt |
|---|---|---|
| Chào hỏi | 10 | 10 |
| Giá | 6 | 6 |
| Ảnh | 5 | 5 |
| Gợi ý theo nhu cầu | 16 | 16 |
| Tồn kho | 5 | 5 |
| Chăm sóc | 6 | 6 |
| Vận chuyển và DOA | 9 | 9 |
| Tra cứu đơn | 5 | 5 |
| Chuyển nhân viên | 6 | 6 |
| Không hiểu | 5 | 5 |
| An toàn (prompt injection, yêu cầu giảm giá) | 7 | 7 |
| Thông tin còn thiếu | 4 | 4 |
| Đính kèm (ảnh, sticker, vị trí) | 4 | 4 |

**Cách đọc kết quả này.** Bộ câu do nhóm tự soạn, nên 100% không chứng minh được bot đúng với mọi cách nói của khách thật. Nó chứng minh rằng các câu đã biết được xử lý đúng và các quy tắc an toàn (không bịa giá, không hứa giờ giao, không xác nhận giảm giá) luôn được giữ. Chưa có phép đo trên tin nhắn khách thật.

## 5.4 Lighthouse và hiệu năng

| Trang | Performance | Accessibility | Best Practices | SEO |
|---|---:|---:|---:|---:|
| Trang chủ | 99 | 100 | 100 | 100 |
| Neon Tetra | 98 | 100 | 100 | 100 |

Đây là lần đo cuối của bước 4 (`docs/lighthouse/`). Chưa đo lại trong bước 5. Các lần đo khi máy đang tải cho điểm thấp hơn (trang chủ 74–75, trang sản phẩm 66), nên điểm trên chỉ có ý nghĩa khi máy đã dừng các tiến trình nền. Mục tiêu đề ra là mỗi chỉ số ≥ 85.

Bộ nhớ (`docs/resource-usage.json`): backend khoảng 136 MiB trên giới hạn 512 MiB; frontend khoảng 9 MiB trên 128 MiB; n8n khoảng 285 MiB trên 768 MiB. Hai số đo này là hai instance chạy tải khác nhau, không phải bằng chứng giảm RAM khi nhàn rỗi.

## 5.5 Bảo mật và phụ thuộc

- `npm audit --omit=dev`: 0 lỗ hổng.
- Phần phát triển (Lighthouse, Vitest, tsx) còn 10 mức cao và 20 mức trung bình; không có trong image backend sau khi prune.
- Docker Scout báo thêm lỗi ở image nền và thư viện đi kèm (backend 10 critical, 82 high; frontend 1 critical, 2 high). Đây là phạm vi rộng hơn `npm audit` và chưa được đối chiếu từng thành phần. **Chưa tuyên bố image sạch.**
- Quét n8n bằng Scout dừng sau 8 phút và khoảng 2 GB RAM, chưa có kết quả.

## 5.6 Kiểm chứng với dịch vụ thật (10/11/2026)

Sau khi chủ dự án tạo tài khoản, hệ thống được chuyển sang `MOCK_INTEGRATIONS=false` trên máy cá nhân, công khai qua Cloudflare Tunnel tạm thời.

| Dịch vụ | Đã kiểm chứng | Chưa kiểm chứng |
|---|---|---|
| Facebook Messenger | Ứng dụng Meta ở chế độ phát triển; Meta xác minh webhook thành công; token Trang hợp lệ, không hết hạn, có `pages_messaging`; đăng ký `messages`, `messaging_postbacks` | Chưa ghi nhận tin nhắn thật đầu tiên từ khách; chưa xét duyệt để mở cho mọi người dùng |
| Google Sheets | Service Account đọc và ghi được; tạo 3 tab; workflow doanh thu ghi một dòng và chạy lại không nhân đôi | Chưa có đơn thật ghi vào `Long_Fish_Orders` |
| Gmail SMTP | Đăng nhập bằng mật khẩu ứng dụng; Gmail trả `250 OK` cho 2 email báo cáo; người nhận xác nhận đã nhận | Email gửi khách mới kiểm bằng mock, chưa gửi thật |
| HTTPS công khai | Website và n8n truy cập được qua `trycloudflare.com` | Địa chỉ tạm, đổi mỗi lần chạy lại; chưa có tên miền và máy chủ cố định |

Còn lại:
- Chuyển khoản thật qua dịch vụ ngân hàng; webhook đối soát chỉ kiểm bằng request mô phỏng. Chưa điền tài khoản VietQR.
- Lịch cron 23:55 và 00:10 đúng giờ thật.
- Ảnh thật: 20/27 sản phẩm (74%), thấp hơn mục tiêu 80%.
- Một đơn thật có kiểm soát từ Messenger tới Sheet, email và tin xác nhận.

Các mục này được ghi trong [checklist bàn giao](../CHECKLIST-VIỆC-CỦA-TÔI.md).
