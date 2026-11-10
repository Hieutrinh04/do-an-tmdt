# 04. Triển khai

## 4.1 Công nghệ

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Backend | Node.js 20, Express, TypeScript | Chạy trong container `backend` |
| ORM và cơ sở dữ liệu | Prisma; SQLite mặc định, PostgreSQL 16 tùy chọn | Migration có phiên bản, seed riêng cho mỗi loại |
| Frontend | React, Vite, TypeScript, React Router, Recharts | Build tĩnh, phục vụ bằng Nginx |
| Tự động hóa | n8n 5 workflow | Xuất JSON trong `n8n/workflows/` |
| Đóng gói | Docker Compose | Ba dịch vụ: backend, frontend, n8n |
| HTTPS triển khai | Caddy (Let's Encrypt) hoặc Cloudflare Tunnel | Chỉ mở cổng 80/443 |
| Kiểm thử | Vitest, Playwright, Lighthouse CLI | Xem chương 5 |

## 4.2 Cấu trúc thư mục

```
backend/      API Express, Prisma, seed, test
frontend/     Website khách và trang quản trị
n8n/          Dockerfile và workflow JSON
e2e/          Kịch bản Playwright
scripts/      Kiểm tra tích hợp, sao lưu, khôi phục, demo reset, smoke test
deploy/       Caddyfile và cấu hình gateway
docs/         Tài liệu, báo cáo kiểm thử, báo cáo đồ án
```

## 4.3 Các module chính

- **Catalog và giá (`catalog.ts`, `domain.ts`):** tính phí giao theo tỉnh, ngưỡng miễn phí, phí đóng gói cá sống, kiểm tra số lượng tối thiểu và vùng giao.
- **Đơn hàng (`orders.ts`):** tạo đơn trong giao dịch, trừ kho có điều kiện, thử lại khi xung đột, sinh mã đơn theo ngày, đổi trạng thái theo luồng, hoàn kho khi hủy, ghi lịch sử và ghi chú nội bộ.
- **Outbox (`outbox.ts`):** tiến trình nền đọc sự kiện, gửi sang n8n, thử lại khi lỗi và đánh dấu sau khi thành công.
- **Messenger (`messenger.ts`):** xác thực webhook, gửi tin qua Send API, `typing_on`, quick reply, kiểm soát cửa sổ 24 giờ.
- **Bot (`bot.ts`, `bot-language.ts`):** luật ý định, từ điển tiếng Việt, gợi ý theo nhu cầu, trạng thái hội thoại, chuyển nhân viên và quay lại bot.
- **Thanh toán chuyển khoản (`POST /api/payments/bank`):** kiểm tra `x-bank-secret`, tìm mã đơn trong trường `code` hoặc `content`, yêu cầu số tiền khớp tuyệt đối, chỉ nhận đơn `BANK_QR` chưa hủy, không ghi trùng khi webhook gửi lặp.
- **Ảnh (`uploads.ts`, `photo-render.ts`, `image-path.ts`):** kiểm tra magic bytes, giới hạn 5 MB, tạo WebP 1200 px và thumbnail 480 px, lưu nguồn và giấy phép.
- **Xuất CSV (`csv.ts`):** chống CSV injection bằng cách tiền tố ô có ký tự nguy hiểm.
- **Thống kê (`stats.ts`):** doanh thu chỉ tính đơn `DELIVERED`; số đơn theo trạng thái; top sản phẩm tính cả cá và phụ kiện.

## 4.4 Workflow n8n

| Workflow | Kích hoạt | Việc chính |
|---|---|---|
| 1. Messenger Chatbot | Webhook Meta (GET xác thực, POST nhận tin) | Xác thực token và chữ ký, bỏ echo, chống trùng `mid`, gọi API nội bộ, trả lời |
| 2. Đơn hàng mới | Webhook từ outbox | Kiểm tra lại đơn, ghi Google Sheets, email người bán, email xác nhận cho khách nếu có email, nhắn xác nhận nếu có PSID |
| 3. Cập nhật trạng thái | Webhook từ outbox | Cập nhật dòng trong Sheets, nhắn và email khách theo trạng thái, thông báo khi nhận thanh toán |
| 4. Tổng hợp doanh thu | Lịch 23:55 hằng ngày và 00:10 ngày 1 hằng tháng | Ghi `Daily_Revenue` và `Monthly_Revenue`, gửi email báo cáo |
| 5. Lỗi | Error Trigger | Ghi log và thông báo; không làm mất đơn |

Múi giờ `Asia/Ho_Chi_Minh` được đặt ở cả `TZ` của container và `GENERIC_TIMEZONE` của n8n. Lịch chạy đã được rà cấu hình; việc chờ đúng giờ thật chưa được quan sát.

## 4.5 Bảo mật

- Khóa, token và mật khẩu chỉ nằm trong `.env` (không commit) hoặc volume `integration-keys`. Tệp `.env.example` chỉ có tên biến và chú thích.
- Mật khẩu quản trị được sinh ngẫu nhiên khi chạy demo và lưu trong volume, không ghi vào mã nguồn.
- Các endpoint nội bộ cho n8n yêu cầu `x-api-key`; endpoint chuyển khoản yêu cầu `x-bank-secret`.
- Đăng nhập admin: bcrypt, JWT, khóa tạm 15 phút sau 10 lần sai theo IP cộng tên đăng nhập.
- Lỗ hổng phụ thuộc: `npm audit --omit=dev` cho kết quả 0 lỗ hổng cho phần chạy thật. Phần phát triển (Lighthouse, Vitest) còn 10 mức cao và 20 mức trung bình, không được đưa vào image. Docker Scout báo thêm lỗi ở image nền; phần này được ghi rõ trong [báo cáo kiểm thử](../test-report.md) và cần cập nhật image trước khi sản xuất.
- Cổng n8n không công khai; chỉ đường dẫn `/webhook/...` của Meta đi qua gateway.

## 4.6 Cấu hình triển khai

`docker-compose.prod.yml` là file ghi đè: Caddy tự cấp chứng chỉ HTTPS, backend và n8n không lộ ra Internet. Cấu hình hiện có được kiểm tra bằng `docker compose config` và bằng gateway Nginx đã kiểm tra cú pháp. Chưa chạy ACME hoặc Cloudflare Tunnel thật vì chưa có domain. Quy trình từng bước nằm trong [DEPLOY.md](../DEPLOY.md), kèm sao lưu tự động giữ 14 bản.

## 4.7 Vấn đề gặp phải và cách xử lý

1. **Chống bán vượt tồn kho khi nhiều khách đặt cùng lúc.** Việc trừ kho dùng cập nhật có điều kiện trong giao dịch và thử lại khi xung đột (mục 2.5). Kiểm thử 8 khách tranh món cuối trên PostgreSQL: một đơn được 201, bảy đơn còn lại 409.
2. **Phản hồi chậm ghi đè đơn đang mở trên trang quản trị.** Playwright phát hiện: khi đang lưu thì người dùng mở đơn khác, phản hồi cũ ghi đè. Đã khóa thao tác mở và đóng khi đang lưu.
3. **Nâng cấp Zod 4 làm mất trường khi PATCH.** Đã tách schema PATCH khỏi giá trị mặc định và thêm test hồi quy giữ nguyên các trường như `isActive`, `isLiveFish`, `minQty`, giới tính và đơn vị.
4. **Điểm Lighthouse dao động theo tải máy.** Các lần đo có tải nền cho kết quả thấp hơn đáng kể. Báo cáo chỉ dùng lần đo cuối khi máy đã dừng các tiến trình nền.
5. **Dữ liệu kiểm thử lẫn với dữ liệu thật.** Dữ liệu kiểm thử được tiền tố `TEST`, chạy trong project Compose riêng có cổng riêng; lệnh demo reset từ chối project gốc và chỉ xóa khi có `--yes`, sau khi sao lưu.
