# Rà soát bảo mật và chất lượng

Kiểm tra ngày 09/11/2026 trên Docker local ở chế độ mock. Phạm vi là rà soát code, dependency audit, Docker Scout và các test tự động trong test-report.md. Chưa thực hiện pentest độc lập.

| Mục | Cách triển khai hoặc kết quả |
|---|---|
| Input và giá tiền | Zod giới hạn chuỗi, số lượng, danh sách dòng, giá VND nguyên. Server đọc lại giá và giữ kho bằng transaction. |
| Rate limit | Public 180 yêu cầu/phút, tạo đơn 20/phút, tra cứu 20/phút, login 10 lần sai/15 phút, upload 30/phút sau JWT. |
| Admin | Bcrypt, JWT HS256 audience long-fish-admin, hạn tám giờ, dữ liệu admin Cache-Control no-store. Chưa có refresh token hoặc danh sách thu hồi JWT. |
| CORS và HTTP | Helmet và CORS domain cấu hình, Nginx không mở /api/internal. Chạy thật cần HTTPS và FRONTEND_ORIGIN đúng. |
| API nội bộ | x-api-key so sánh constant-time, webhook outbox có x-webhook-secret. Các cổng backend không publish trực tiếp trong Compose. |
| Messenger webhook | WF1 kiểm HMAC SHA-256 raw body khi mock=false, lọc echo/read/delivery. Test chạy code node với chữ ký đúng/sai và postback. |
| Chống lặp | MessengerReceipt khóa unique mid. Sheets upsert code. Thông báo email/Messenger có thể lặp khi retry một workflow thất bại giữa chừng. |
| Upload | JWT trước multipart, giới hạn tệp 5 MB, magic bytes/MIME/giải mã, giới hạn pixel, không nhận ảnh động, WebP UUID trong volume. Public chỉ phục vụ tên UUID main/thumb. |
| Lỗi và log | API trả lỗi chung, không trả stack. Lỗi chưa biết chỉ log loại lỗi. SĐT được che trong log Messenger mock, email mock chỉ ghi subject và độ dài HTML. Dữ liệu CSV có thông tin khách nên cần quyền truy cập phù hợp. |
| SQL | Prisma thao tác tham số hóa. VACUUM INTO dùng đường dẫn hệ thống tạo, escape dấu nháy đơn. Chỉ dùng raw SQL migration được quản lý trong repo. |
| Oversell | Test tám request đồng thời, một thành công, bảy nhận 409. Thử thêm hai request đồng thời qua Docker. |
| VND | Giá và tổng là integer, giới hạn tổng không vượt Int SQLite/Prisma, kiểm tra amount/addInfo VietQR qua HTTP. |
| Accessibility | Alt, label, fieldset/legend, focus-visible, role status/alert, SVG có nhãn. Playwright desktop/mobile đã chạy, điểm Lighthouse trong test-report.md. |
| Hiệu năng ảnh | Thumbnail 480 px, width/height, lazy-loading, ảnh chi tiết eager/high priority, cache assets và gzip Nginx. Báo cáo Lighthouse JSON/HTML được lưu. |
| Backup | VACUUM INTO timestamp; đã khôi phục trên volume riêng, so khớp hash đơn, tồn kho và WebP. Xem backup-restore.md. |

## Dependency audit

Chạy `npm audit --workspaces --include-workspace-root --json` và lặp lại với `--omit=dev`. Báo cáo trước/sau nằm tại `audit-before-all.json`, `audit-before-prod.json`, `audit-after-all.json`, `audit-after-prod.json`.

| Phạm vi | Trước | Sau |
|---|---|---|
| Toàn bộ, sau khi thêm công cụ UI/Lighthouse | 2 critical, 13 high, 21 moderate | 0 critical, 10 high, 20 moderate |
| Production | 4 high | 0 lỗ hổng |

Đã nâng Zod lên 4.6.7, Vitest lên 4.1.12 và override deepmerge-ts 8.0.2. Prisma CLI là dependency runtime vì bootstrap chạy migration; không loại nó khỏi audit production. Đã đọc [Zod 4 migration](https://zod.dev/v4/changelog), [deepmerge-ts 8](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) và [Vitest 4 migration](https://v4.vitest.dev/guide/migration.html). Zod 4 áp dụng default bên trong partial: tách schema PATCH không default và thêm regression test để sửa ảnh/kho không đổi trạng thái sản phẩm, minQty, giới tính hay đơn vị. Migration PostgreSQL và seed cũng chạy thành công.

Các high ban đầu: `vitest → tinypool` (dev, đã loại critical bằng nâng Vitest); `prisma → @prisma/config → deepmerge-ts` (runtime, override bản vá); `zod` (runtime, nâng bản vá). Các high còn lại đều thuộc devDependency gốc `lighthouse@12.8.2`:

| Nhóm high còn lại | Đường phụ thuộc và bản sửa |
|---|---|
| extract-zip, @puppeteer/browsers | lighthouse → puppeteer-core → @puppeteer/browsers → extract-zip; audit đề nghị Lighthouse 13.6.0 |
| basic-ftp, get-uri, pac-proxy-agent, proxy-agent | cùng nhánh browser → proxy-agent → pac-proxy-agent → get-uri → basic-ftp; audit đề nghị Lighthouse 13.6.0 |
| zod, chromium-bidi, puppeteer-core, lighthouse | lighthouse → puppeteer-core → chromium-bidi → Zod cũ; audit đề nghị Lighthouse 13.6.0 |

20 moderate còn lại nằm trong Lighthouse/Sentry/OpenTelemetry và minimatch. Giữ Lighthouse 12 để tương thích Node 20 của dự án; Lighthouse 13 cần Node mới hơn. Chấp nhận có giới hạn cho công cụ đo local: chỉ đo URL localhost, dùng Chromium đã cài bởi Playwright, không dùng công cụ này để xử lý archive/proxy không tin cậy. Cần nâng môi trường phát triển rồi nâng Lighthouse trước khi dùng rộng hơn. Đây không phải khẳng định audit toàn bộ sạch.

Dockerfile chạy `npm prune --omit=dev --workspace backend`. Kiểm tra trực tiếp trong image bằng `require.resolve` trả `ABSENT` cho vitest, lighthouse và tsx; seed chạy JavaScript đã biên dịch. Frontend runtime là Nginx và assets đã build. Kết quả npm audit không bao gồm CVE của hệ điều hành hay dependency đóng gói trong image n8n; xem kết quả Scout riêng trong test-report.md.

## Giới hạn vận hành

Outbox worker hiện phục vụ một instance backend, chưa có claim/lease giữa nhiều worker. Khi scale nhiều instance cần thêm cơ chế claim và idempotency theo tác vụ. PostgreSQL đã qua migration/seed và 8 kịch bản HTTP, gồm oversell 8 request; chưa kiểm thử nhiều instance backend.

Ảnh đã gỡ khỏi sản phẩm vẫn tồn tại trên volume. URL không chứa tên tệp khách. Tránh tự động xóa tệp đang được tham chiếu, khi dọn tệp cần đối chiếu Product.images và backup trước. Sau đổi mật khẩu admin, token cũ còn hợp lệ đến khi hết hạn nếu JWT_SECRET không được xoay.
