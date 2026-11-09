# Báo cáo kiểm thử Long Fish — bước 4

Ngày 09/11/2026, Windows/Node 24 trên host, Node 20 trong backend Docker, Chromium headless thật. Tích hợp dùng `MOCK_INTEGRATIONS=true`. Stack gốc `long-fish` cổng 8080/5678 giữ nguyên dữ liệu. Các test ghi dùng SQLite riêng `long-fish-e2e` cổng 18080/15678; PostgreSQL riêng `long-fish-e2e-pg` cổng 18081/15681. Không dùng dữ liệu khách thật để chụp ảnh.

## Kết quả tự động

| Kiểm tra | Kết quả | Minh chứng/phạm vi |
|---|---|---|
| Lint, build | PASS | verify:all đã thực thi tuần tự |
| Unit/regression | PASS — 23 test | 19 backend + 4 pipeline ảnh, Vitest 4 |
| Playwright | PASS — 8/8, không skip/flaky | 4 kịch bản × desktop 1366×800/Pixel 7; verification-summary.json |
| Catalog | PASS | 27 sản phẩm, naturalWidth > 0, bộ lọc, tiếng Việt có/không dấu, nhãn tồn |
| Chi tiết cá | PASS | Dòng/cỡ/giới tính, chọn dòng hết hàng, minQty, care/DOA, nguồn ảnh và SVG |
| Checkout/tra cứu | PASS | Chặn thiếu DOA/tỉnh ngoài vùng, tiền khớp API, COD/VietQR, QR tải được và đúng amount/addInfo, mã/SĐT/timeline |
| Admin | PASS | Login, dashboard khớp API, đủ chuỗi trạng thái, hủy hoàn kho |
| Upload UI | PASS | Kéo thả 2 PNG, đổi thứ tự, chọn chính, gỡ/lưu, ghi nguồn |
| Credits/ảnh chụp | PASS | Footer, nguồn ảnh, bộ ảnh mới desktop/mobile; screenshots/README.md |
| HTTP SQLite trên volume trắng | PASS — 8/8 | Cùng bộ kiểm thử PostgreSQL, gồm 8 khách tranh món cuối, tắt/bật n8n và chat/handoff; e2e-results.json |
| Upload HTTP sau nâng dependency | PASS | JWT, magic bytes, 5 MB, WebP 1200/thumbnail 480, cache, nguồn và volume sau restart; upload-verification.json |
| PostgreSQL | PASS — 8/8 HTTP | Migration có version, seed, chống oversell 8 khách (1×201 + 7×409), outbox/n8n/chat; e2e-postgres-results.json |
| WF4 | PASS chạy thủ công hai nhánh | Daily 5 đơn/357.000đ; tháng 10 có 7 đơn/2.080.000đ/1 hủy tại thời điểm đo; revenue-verification.json |
| Cron/timezone | PASS rà cấu hình | 23:55 hằng ngày, 00:10 ngày 1; TZ và GENERIC_TIMEZONE đều Asia/Ho_Chi_Minh; chưa chờ giờ thật |
| Khôi phục volume riêng | PASS | So hash 48 đơn, 71 biến thể, 32 sản phẩm và 2 tệp WebP; restore-rehearsal.json |
| Demo reset | PASS | Backup trước, xóa 16 đơn/5 sản phẩm TEST, archive 1 thư mục ảnh; còn 32 đơn/27 sản phẩm, lần hai xóa 0; thiếu --yes bị từ chối |
| Bảo toàn dữ liệu thật | PASS trong diễn tập | 27 sản phẩm chuẩn, đường dẫn ảnh và tồn kho sau reset khớp nguồn; demo-reset-verification.json |
| Bootstrap sạch | PASS khởi tạo | Backup riêng trước down -v đúng project long-fish-e2e; up --build, seed, import/publish/activate 5 workflow, health xanh; bootstrap-rehearsal.json |
| npm audit production | PASS — 0 lỗ hổng | audit-after-prod.json, gồm workspace và gốc, --omit=dev |
| verify:all | FAIL ở integrations | Lint/build/test/audit prod/Playwright PASS; DB/ảnh/n8n OK; thiếu token Meta, Google credential, SMTP nên bước dịch vụ thật FAIL đúng thiết kế |

Playwright phát hiện nguy cơ phản hồi đổi trạng thái đến trễ ghi đè đơn đang mở. Đã khóa thao tác mở/đóng khi đang lưu rồi chạy lại. Khi nâng Zod 4, đã tách schema PATCH khỏi default và thêm regression test để giữ nguyên isActive/isLiveFish/minQty/giới tính/đơn vị khi sửa trường khác.

Kết quả máy đọc: [UI và verify:all](verification-summary.json), [HTTP SQLite](e2e-results.json), [HTTP PostgreSQL](e2e-postgres-results.json), [upload HTTP](upload-verification.json). Log/trace đầy đủ nằm trong data/ đã bỏ khỏi Git. Báo cáo doanh thu là snapshot ở thời điểm thực thi, các lượt E2E sau có thể tạo thêm đơn trên DB riêng.

## Lighthouse mobile

Đo bằng Lighthouse CLI 12.8.2 với Chromium headless, preset mobile mặc định, lưu [home JSON](lighthouse/home.report.json), [home HTML](lighthouse/home.report.html), [product JSON](lighthouse/product.report.json), [product HTML](lighthouse/product.report.html).

| Trang | Performance | Accessibility | Best Practices | SEO | Mục tiêu mỗi điểm ≥85 |
|---|---:|---:|---:|---:|---|
| Trang chủ | 99 | 100 | 100 | 100 | PASS |
| Neon Tetra | 98 | 100 | 100 | 100 | PASS |

Đo cuối trên http://localhost:8080 lúc 14:58 ngày 09/11/2026, sau khi các test/build hoàn tất và dừng scan n8n đang tốn khoảng 2 GB RAM. Không đổi cấu hình CPU/network của Lighthouse. Các lượt có tải nền đo được home 75 rồi 74, product 66 rồi 93, cho thấy điểm phụ thuộc tải host. Báo cáo JSON/HTML lưu lượt cuối.

Đã bổ sung gzip, cache assets immutable, robots.txt, meta description, kích thước/priority ảnh hero và chiều cao tối thiểu nội dung để giảm CLS. Lần đo ban đầu trên runtime cũ: home 42/100/100/83, product 74/100/100/83. Không suy điểm từ build. Backend/frontend ở cổng 8080 đã cập nhật bản vá, cả ba dịch vụ đang khỏe, dữ liệu/volume gốc được giữ.

## Dependency và image

Audit toàn bộ trước: 2 critical/13 high/21 moderate; production trước: 4 high. Sau vá: production 0; toàn bộ còn 0 critical/10 high/20 moderate trong nhánh dev Lighthouse. Vitest, Lighthouse, tsx không có trong node_modules image backend sau prune. [Phân tích đường phụ thuộc và rủi ro](security-review.md).

Docker Scout 1.23.1 đã quét backend digest 729d76dc80f3: 10 critical/82 high; frontend digest 37afda96d336: 1 critical/2 high. Scout liệt kê base OS (Perl/glibc/GnuTLS…), Go stdlib nhúng trong binary và thư viện npm; phạm vi rộng hơn npm audit dự án, cần đối chiếu thêm đường dẫn từng thành phần. Cần cập nhật base image/thành phần liên quan trước production; không tuyên bố image sạch. [Kết quả Scout](docker-scout-results.json), log thô trong data/scout-*-final.txt. Scan n8n đã thử nhưng dừng sau 8 phút indexing và khoảng 2 GB RAM, chưa có kết quả CVE nên ghi chưa kiểm chứng.

## Giới hạn và việc chủ dự án làm

- Ảnh thật vẫn 17/27 (63%); thiếu khóa ảnh stock, không tải ảnh không rõ quyền. 10 mẫu SVG và các mẫu cần góc thứ hai có trong [images-todo.md](images-todo.md).
- Facebook Page/webhook HTTPS, Google Sheets, SMTP và ngân hàng thật chưa kiểm chứng vì thiếu tài khoản/khóa. AI tùy chọn cũng chưa có khóa.
- Cron đã chạy nhánh thủ công và so CSV/DB; chưa quan sát trigger đúng giờ thật. Chưa kiểm thử nhiều backend instance hoặc mọi lỗi dịch vụ bên ngoài.
- verify:all trả mã lỗi 1 vì thiếu tích hợp thật; không ghi PASS thay cho tài khoản chưa cấu hình.
- Dữ liệu TEST được cô lập. Bản demo sạch phục vụ bảo vệ tại http://localhost:18082; stack gốc giữ lịch sử và volume. Reset từ chối project gốc.

Xem [checklist chủ dự án](CHECKLIST-VIỆC-CỦA-TÔI.md), [diễn tập backup/reset](backup-restore.md), [đối chiếu](bao-ve/doi-chieu-yeu-cau.md) và [dàn ý 14 slide](bao-ve/slide-outline.md).

## Bước 5 — nhật ký kiểm chứng

- Việc 1: đã backup/gỡ 3 project tạm (9 container, 12 volume, 3 network). Trước/sau stack chính đều 48 đơn/32 sản phẩm, health xanh. Cleanup dry-run mặc định, --yes mới xóa. Có giới hạn RAM và rotate log trong compose; chỉ áp dụng cho project kiểm thử. Xem cleanup-results.json và resource-usage.json. verify:all: lint/build/test/audit prod/8 Playwright PASS, integrations FAIL vì thiếu credential.
- Việc 2: production override merge PASS, không publish frontend/backend/n8n/gateway; chỉ Caddy 80/443. Nginx gateway syntax PASS. Đã chuẩn bị DEPLOY, env production, smoke public bắt buộc URL và backup 14 bản. Chưa chạy ACME/tunnel/smoke ngoài Internet vì chưa có URL/tài khoản của chủ dự án. verify:all có cùng kết quả local PASS/integrations FAIL. Nhật ký máy đọc: b5-verification-stages.json.

RAM ghi nhận trước: backend 50,58 MiB, frontend 8,734 MiB, n8n 233,1 MiB trên stack chính. Sau trên instance kiểm thử đã chạy test: backend 136,3 MiB/512 MiB, frontend 8,695 MiB/128 MiB, n8n 284,7 MiB/768 MiB. Đây là hai instance và tải khác nhau, không phải bằng chứng giảm RAM idle. Khoảng 2 GB trong bước 4 thuộc Docker Scout indexing, không phải n8n. Stack chính chưa áp dụng cấu hình resource mới theo yêu cầu chỉ đọc.

## Bổ sung: đối soát chuyển khoản và top bán chạy (09/11/2026)

- Thêm `POST /api/payments/bank` có `x-bank-secret`, đối chiếu mã đơn trong `code` hoặc `content`, yêu cầu số tiền khớp tuyệt đối, chỉ nhận đơn BANK_QR chưa hủy; webhook lặp không tạo thêm log/outbox. WF3 phát thông báo “Đã nhận thanh toán”. Test phủ secret sai, lệch tiền, đúng tiền, gửi lặp, đơn COD và nội dung chuyển khoản.
- Top bán chạy và doanh thu danh mục tính cả cá sống và phụ kiện; nhãn dashboard đổi thành “Sản phẩm bán chạy”. Có test HTTP cho đơn phụ kiện đã giao.
- `npm run test -w backend` PASS 122/122; `npm run lint` và `npm run build` PASS. Chưa chạy lại Playwright/E2E và chưa nối webhook với dịch vụ ngân hàng thật.


## Bước 5 — việc 5–7 (ngày 09/11/2026)

- **Playwright mở rộng:** thêm `e2e/flows.spec.ts` (6 kịch bản: không tràn ngang, tra cứu tự cập nhật, hết hàng, vùng giao cá sống, khóa đăng nhập sai, phiếu A6 chỉ hiện khi in). Ba lần liên tiếp trên stack `long-fish-e2e-b6` cách ly: **19 passed, 1 skipped** mỗi lần; mục bỏ qua là khóa đăng nhập, chỉ chạy trên desktop để không làm đầy giới hạn theo IP. Lần chạy đầu gặp lỗi do dữ liệu `TEST` không được dọn làm lệch số thẻ sản phẩm; đã thêm bước ẩn sản phẩm test sau mỗi kịch bản, reset stack và chạy lại.
- **Kết quả máy đọc:** `data/playwright-results.json`; log ba lần trong `data/`.
- **verify:all:** lint, build, test, audit production và Playwright PASS. Bước integrations FAIL vì Messenger, Sheets và SMTP chưa có credential thật. Khi trỏ `CHECK_BASE_URL` về stack kiểm thử, DB, ảnh và n8n đều OK; ba mục còn lại vẫn FAIL đúng thiết kế.
- **Báo cáo đồ án:** `docs/bao-cao/` gồm 00–06, tài liệu tham khảo, kịch bản video 5 phút và các sơ đồ Mermaid nguồn trong `docs/bao-cao/hinh/`. Chưa xuất PNG/SVG vì bước dựng `@mermaid-js/mermaid-cli` không được phép chạy trong phiên này; có thể xuất sau bằng `npx @mermaid-js/mermaid-cli`.
- **Đóng gói:** `git init`, `.gitignore` đã loại `.env`, `data/`, `node_modules`, `dist`, backup và `*.db*`. Quét secret không thấy khóa thật; kết quả dương tính giả đến từ ảnh base64 trong báo cáo Lighthouse. `README.md` gốc đã thêm. Chưa push lên remote nào.

## Cập nhật ảnh thật (09/11/2026, buổi tối)

- Thêm ảnh Wikimedia Commons đã xem và xác nhận đúng sản phẩm cho **Guppy Full Red** (CC BY-SA 3.0), **Đèn LED thủy sinh** (CC BY-SA 3.0) và **Bộ sủi oxy** (CC BY 4.0). Các ảnh này được tải và render qua pipeline `images:fetch`, có ghi nguồn trong `credits.json`.
- Ảnh giới thiệu trang chủ đổi từ SVG minh họa sang ảnh cá Betta halfmoon thật (đã có ghi nguồn).
- Không dùng: ảnh "Koi-smic" (thực ra là ảnh thiên văn), ảnh máy sưởi trong ấm nước, ảnh hồ tự nhiên cho Artemia, các ảnh bể/cây/tôm không đúng sản phẩm.
- Còn 7 sản phẩm chỉ có SVG (Betta Plakat Koi, Koi mini, Hạt nổi Betta, Artemia sấy, Bể kính 40 cm, Sưởi có chỉnh nhiệt, Vi sinh): Wikimedia Commons không có ảnh CC phù hợp đã tìm được. Cần chụp hoặc mua ảnh có quyền sử dụng.
- Kiểm thử sau thay đổi: lint PASS; backend 122/122; Playwright 19 passed, 1 skipped trên stack làm mới.
