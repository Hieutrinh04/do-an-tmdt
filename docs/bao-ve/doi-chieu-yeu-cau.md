# Đối chiếu yêu cầu đồ án

Đối chiếu đến bước 4 ngày 09/11/2026. “Đạt” về chức năng code không thay thế nghiệm thu bằng tài khoản thật. Minh chứng và giới hạn nằm trong [test-report.md](../test-report.md).

| Yêu cầu | Chức năng và minh chứng | Trạng thái |
|---|---|---|
| Node 20, Express, TypeScript, Prisma, SQLite | backend/package.json, Dockerfile, prisma/schema.prisma | Đạt |
| PostgreSQL qua môi trường | Profile postgres, migration/seed PostgreSQL 16, 8 HTTP E2E và oversell 8 khách | Đạt một backend; chưa nhiều instance |
| React, Vite, TypeScript, Tailwind, Router, responsive | Build và Playwright Chromium desktop 1366×800/Pixel 7, ảnh chụp mới | Đạt trong phạm vi test |
| Compose gồm backend, frontend, n8n | docker-compose.yml, ba dịch vụ chạy trong thử HTTP | Đạt |
| Secret qua .env, mẫu cấu hình | .env.example, credential n8n, docs/env-reference.md | Đạt |
| Đủ Product, Variant, Order, Item, Log, Handoff, Admin | schema.prisma, migrations có version, test đơn | Đạt |
| Seed >=10 sản phẩm, phân loại, admin, khoảng 30 đơn | 27 sản phẩm cá/phụ kiện, seed.ts, admin password sinh riêng | Đạt theo bản Long Fish |
| Tìm kiếm, danh mục, chi tiết, tồn kho | API và Playwright: danh mục/giá/độ khó, tìm có dấu/không dấu, ảnh tải được | Đạt |
| Tính giao hàng theo tỉnh, ngưỡng miễn phí | domain.ts quote, test checkout | Đạt |
| Quy tắc cá sống và phí đóng gói, DOA | HTTP và Playwright từ chối ngoài vùng/chưa chấp nhận DOA, đối chiếu tổng tiền | Đạt API/UI |
| Tạo mã đơn duy nhất, tính lại tiền server | OrderSequence và orders.ts, test đồng thời | Đạt |
| Trừ kho transaction, chống oversell | updateMany có điều kiện và retryTransaction, tám request test và hai request Docker | Đạt |
| Outbox khi n8n lỗi và retry | outbox.ts, E2E tắt/bật n8n và thấy CSV | Đạt |
| Tra cứu code cùng SĐT, timeline | HTTP và Playwright thử sai SĐT, đối chiếu đủ timeline | Đạt API/UI |
| Polling 15 giây | Track có timer; đã kiểm UI timeline nhưng chưa đo riêng chu kỳ 15 giây | Một phần kiểm chứng |
| Checkout form, giỏ, COD, VietQR | Playwright chặn DOA/tỉnh ngoài vùng, tính tiền, tạo COD/QR, tải ảnh QR và kiểm amount/addInfo | Đạt mock |
| Giữ PSID trong session, context có chữ ký | cart.ts, messengerLink và trustedPsid | Đạt code, chưa chạy Facebook thật |
| Admin đăng nhập, lọc đơn, xem chi tiết | JWT/API và Playwright đăng nhập, mở đơn, đổi trạng thái | Đạt trong phạm vi test |
| Đổi trạng thái, xác nhận SHIPPING hủy, hoàn kho | orders.ts và tests/orders.test.ts | Đạt |
| Ghi nhận thanh toán | PATCH payment thủ công; webhook `POST /api/payments/bank` tự đối soát mã đơn và số tiền, chống ghi lặp, phát outbox thông báo | Đạt API và test mock, chưa nối dịch vụ ngân hàng thật |
| CRUD sản phẩm, phân loại, cảnh báo tồn | products-admin.tsx, catalog.ts và routes | Đạt API, UI mới chưa kiểm chứng |
| Upload nhiều ảnh, sắp xếp, chọn chính, gỡ ảnh, dán URL | Playwright kéo thả, đổi thứ tự, chọn chính, gỡ/lưu; HTTP kiểm JWT/magic/5MB/serve | Đạt API và luồng upload UI |
| Dashboard ngày/tháng, trạng thái, top sản phẩm (cá và phụ kiện), danh mục | Playwright so số hiển thị với API; HTTP so API với DB; test top gồm phụ kiện | Đạt mock |
| WF1 verify và signature raw body | workflow 1, test code node cùng HMAC, chưa handshake Meta thật | Một phần |
| Lọc echo/read/delivery và dedupe mid | code node và MessengerReceipt | Đạt code/test |
| Ý định, carousel, quick reply, tư vấn cá | bot.ts, simulate và HTTP chat n8n | Đạt mock |
| AI tùy chọn | node HTTP AI trong WF1, chưa có API key | Chưa kiểm chứng AI thật |
| Chọn màu, cỡ cm, giới tính, số lượng, gửi link | bot.ts, HTTP chat và log link psid | Đạt mock |
| Tra cứu đơn qua chat | bot.ts nhận code/SĐT, trackOrder | Đạt code, kịch bản chat riêng cần thử tay |
| Handoff hai lần, tạm ngừng, admin đóng | HTTP n8n và admin PATCH handoff | Đạt mock |
| WF2 đọc đơn, Sheets, Messenger, email người bán | workflow 2, CSV và log mock sau E2E | Đạt mock, dịch vụ thật chưa kiểm chứng |
| WF3 cập nhật Sheets và nhắn trạng thái | workflow 3, outbox sau đổi trạng thái | Đạt mock, Meta thật chưa kiểm chứng |
| WF4 23:55 ngày, 00:10 đầu tháng, báo cáo | Chạy thủ công cả hai nhánh, CSV khớp DB, kiểm cron và TZ/GENERIC_TIMEZONE | Đạt chạy thủ công; chưa chờ giờ thật |
| Error Trigger và báo lỗi | workflow 5, log workflow, chưa chủ động gây mọi lỗi dịch vụ ngoài | Một phần |
| Rate limit, bcrypt, JWT, CORS, Helmet, nội bộ x-api-key | app.ts, messenger.ts, unit/API tests | Đạt cơ bản |
| Chống input sai, tiền VND số nguyên | Zod, giới hạn số lượng/tổng tiền, test giá sửa và oversell | Đạt |
| Chế độ mock, simulate và README | scripts/simulate-messenger.ts, CSV/mock email, docs/README.md | Đạt |
| Ảnh thật >=80%, đủ 2–3 mỗi mẫu | 17/27 có ảnh thật, một số chỉ có một ảnh | Chưa đạt |
| Credits theo ảnh hợp pháp và ảnh shop upload | Playwright kiểm footer, số nguồn, nguồn upload; API và manifest giấy phép | Đạt trong phạm vi test |
| Nhắn ngoài 24 giờ theo cơ chế Meta hiện hành | lastInboundAt và fallback admin có test, tài liệu Meta trả 429 | Một phần, chưa gửi ngoài cửa sổ |
| Google init, Profile setup, check integrations | scripts/init-sheets.ts, setup-messenger-profile.ts, check-integrations.ts | Dry-run đạt, thật thiếu credential |
| Security audit và cập nhật an toàn | Audit production 0; toàn bộ còn 10 high/20 moderate dev Lighthouse; Scout báo riêng | Đạt npm production; còn rủi ro dev/image |
| Accessibility và Lighthouse mobile >=85 | Trang chủ 99/100/100/100, Neon 98/100/100/100 trên cổng 8080; JSON/HTML Lighthouse mobile mặc định | Đạt lần đo local |
| Backup SQLite timestamp | Khôi phục volume riêng, so hash 48 đơn/71 biến thể/32 sản phẩm và tệp WebP | Đạt diễn tập local |
| Bộ ảnh giao diện mới desktop/mobile | Playwright tự chụp docs/screenshots trên stack cô lập | Đạt cập nhật |
| Hồ sơ 10 phút, kiến trúc, ERD, API và 20 câu hỏi | docs/bao-ve và docs/api-reference.md | Đạt tài liệu |

Chủ dự án cần cấu hình Facebook/Google/SMTP/ngân hàng, xác minh quyền Meta và thông báo ngoài cửa sổ, bổ sung ảnh hợp pháp cho mười sản phẩm và thử một đơn thật. Xem checklist bàn giao. Bộ test local không nghiệm thu thay các dịch vụ bên ngoài.
