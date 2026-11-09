# PROMPT CHO CODEX (bước 4) – Kiểm chứng UI bằng Playwright, vá lỗ hổng, dọn dữ liệu thử, đóng gói bàn giao Long Fish

Tình trạng đã kiểm tra: `lint`, `build`, `test` (18 + 4) đều pass; 3 container Docker (frontend, backend, n8n) đang chạy khỏe; `docs/test-report.md`, `GO-LIVE.md`, `bao-ve/*` đã có; E2E qua HTTP và n8n (mock) đã PASS. Các mục **còn hở** theo chính báo cáo của bạn:

1. UI desktop/mobile, Lighthouse chưa kiểm chứng vì "Local browser use is disabled".
2. `npm audit` còn 7 cảnh báo (2 critical, 4 high, 1 moderate) – chưa đạt tiêu chí.
3. Ảnh thật 17/27 (63%), một số mẫu chỉ có 1 ảnh – chưa đạt mục tiêu ≥ 80%.
4. Lịch 23:55 / 00:10, PostgreSQL, khôi phục backup chưa diễn tập.
5. Dữ liệu thử (đơn TEST, sản phẩm demo ẩn, ảnh tổng hợp) đang lẫn trong database demo.

Làm theo thứ tự dưới đây. **Không phụ thuộc công cụ "browser use" của ứng dụng**: tự cài Playwright (Chromium headless) trong dự án để chạy trình duyệt thật.

## Việc 1 – Kiểm thử UI thật bằng Playwright

- Thêm `@playwright/test` vào devDependencies gốc, cấu hình `playwright.config.ts` chạy trên `http://localhost:8080` (stack Docker đang chạy) với 2 project: Desktop Chrome (1366×800) và Mobile (Pixel 7).
- Viết test E2E giao diện trong `e2e/`:
  1. Trang chủ: hiện sản phẩm, ảnh tải được (không `naturalWidth = 0`), lọc danh mục/giá/độ khó, tìm kiếm tiếng Việt có/không dấu, nhãn còn hàng/hết hàng.
  2. Chi tiết cá: chọn dòng/cỡ cm/giới tính, `minQty` chặn số lượng thấp, hiện thông số nuôi, chính sách DOA, ghi nguồn ảnh, nhãn "Ảnh minh họa" với SVG.
  3. Checkout: thiếu tick DOA bị chặn; tỉnh ngoài vùng giao cá sống bị chặn; tính đúng tiền hàng + đóng gói + ship; đặt COD và đặt VietQR (QR hiện, đúng số tiền); hiển thị mã đơn; tra cứu bằng mã + SĐT thấy timeline; SĐT sai bị từ chối.
  4. Admin: đăng nhập, danh sách đơn, đổi trạng thái đủ chuỗi, hủy đơn hoàn kho, upload ảnh sản phẩm (kéo thả, đổi thứ tự, chọn ảnh chính, xóa), dashboard số liệu khớp API.
  5. Trang `/credits` liệt kê đủ nguồn ảnh; footer có link.
- Chụp ảnh màn hình tự động các trang chính (desktop + mobile) vào `docs/screenshots/` (ghi đè bản cũ, bỏ dòng "phiên bản trước" trong README ảnh).
- Chạy **Lighthouse** bằng `lighthouse` CLI (headless, mobile) cho trang chủ và 1 trang chi tiết; lưu báo cáo JSON/HTML vào `docs/lighthouse/` và ghi điểm Performance/Accessibility/Best Practices/SEO vào test-report. Mục tiêu ≥ 85; nếu thấp thì sửa (kích thước ảnh, preload, cache nginx, nén gzip/brotli, `width/height`, tương phản màu, `lang="vi"`, meta description) rồi đo lại.
- Cập nhật `docs/test-report.md` chuyển các dòng UI/Lighthouse từ "Chưa kiểm chứng" sang PASS/FAIL **có số liệu thật**.

## Việc 2 – Vá cảnh báo bảo mật

- Chạy `npm audit` (cả `--omit=dev` và toàn bộ), phân tích từng cảnh báo critical/high: gói nào, dev hay prod, đường phụ thuộc, có bản vá không.
- Nâng cấp hoặc dùng `overrides` để loại bỏ; kiểm tra không phá vỡ API (đọc changelog nếu nâng major). Cảnh báo chỉ nằm ở devDependency không đi vào image production thì ghi rõ và chứng minh bằng `npm ls`/`npm audit --omit=dev`.
- Mục tiêu: **0 critical/high ở bản production** (`--omit=dev`). Phần còn lại ghi lý do chấp nhận rủi ro trong `docs/security-review.md`.
- Quét thêm image Docker (nếu có `docker scout` hoặc `trivy` thì chạy; không có thì ghi "chưa kiểm chứng").
- Chạy lại toàn bộ test + E2E sau khi nâng cấp.

## Việc 3 – Hoàn thiện ảnh sản phẩm

- Với 10 mẫu còn SVG và các mẫu chỉ có 1 ảnh: nếu `.env` có `PEXELS_API_KEY`/`PIXABAY_API_KEY`/`UNSPLASH_ACCESS_KEY` thì chạy lại `npm run images:fetch`, vẫn tuân thủ quy tắc đúng loài, giấy phép thương mại, không watermark, ≥ 600 px, ghi nguồn. Không có khóa thì **không** bịa hay lấy nguồn không rõ bản quyền.
- Đừng để mẫu nào chỉ có 1 ảnh nếu có thể thêm ảnh thứ 2 hợp pháp; ngược lại 1 ảnh đúng vẫn tốt hơn 2 ảnh sai.
- Cập nhật `docs/images-todo.md` và tỉ lệ phủ ảnh thật. Phần còn lại là việc của tôi (chụp tay rồi upload qua admin) – ghi rõ danh sách.

## Việc 4 – Diễn tập các mục "chưa kiểm chứng" có thể làm trên máy

1. **Lịch n8n**: dùng n8n CLI/REST nội bộ hoặc node "Execute Workflow" đã có để chạy thủ công WF4 nhánh ngày và nhánh tháng với dữ liệu thật trong DB; kiểm tra CSV `Daily_Revenue`/`Monthly_Revenue` ghi đúng, số liệu khớp dashboard. Ghi rõ rằng trigger theo giờ thật chưa chờ tới mốc, nhưng đã kiểm cron expression + múi giờ `Asia/Ho_Chi_Minh` (kiểm biến `GENERIC_TIMEZONE`/`TZ`).
2. **PostgreSQL**: thêm profile compose `postgres` (service postgres + biến `DATABASE_URL`), chạy migration và seed trên PostgreSQL, rồi chạy lại bộ test chống oversell + E2E HTTP trên đó. Báo kết quả; nếu schema SQLite-specific gây lỗi thì sửa.
3. **Khôi phục backup**: diễn tập đầy đủ trên volume riêng (tạo backup → dựng stack tạm với volume mới → restore → so khớp số đơn, tồn kho, ảnh). Viết `docs/backup-restore.md` kèm các lệnh đã chạy thật.
4. **Chạy lại từ đầu sạch**: `docker compose down -v` trên một project name tạm (KHÔNG xóa volume của stack đang chạy), `docker compose up --build`, kiểm tra bootstrap n8n tự import/publish đủ 5 workflow, seed chạy, health xanh, smoke test E2E pass.

## Việc 5 – Dọn dữ liệu thử và chuẩn bị dữ liệu demo sạch

- Viết `npm run demo:reset` (có xác nhận `--yes`, mặc định từ chối): sao lưu tự động trước, rồi xóa **đơn/sản phẩm/ảnh upload mang nhãn TEST/demo-** do bộ kiểm thử tạo, sinh lại bộ đơn mẫu ~30 đơn đẹp (tên Việt, nhiều ngày/tháng, đủ trạng thái, có đơn cá sống), để dashboard sạch cho buổi bảo vệ. Không đụng sản phẩm thật và ảnh thật.
- Tách dữ liệu E2E sang DB/tiền tố riêng để lần sau không làm bẩn DB demo (ví dụ `E2E_DATABASE_URL` hoặc dọn sau mỗi lần chạy).
- Cập nhật README: cách reset demo, tài khoản admin lấy từ `.env`, tuyệt đối không ghi mật khẩu thật vào tài liệu.

## Việc 6 – Gói bàn giao

- Rà `docs/bao-ve/doi-chieu-yeu-cau.md`: cập nhật trạng thái sau các việc trên (đừng nâng "Đạt" nếu chưa chứng minh).
- Tạo `docs/CHECKLIST-VIỆC-CỦA-TÔI.md`: danh sách việc chỉ chủ dự án làm được, theo thứ tự, mỗi việc có link hướng dẫn trong GO-LIVE: (1) tạo Facebook App/Page + token, (2) Google Service Account + Sheet ID, (3) Gmail App Password, (4) thông tin ngân hàng VietQR, (5) khóa ảnh Pexels/Pixabay (tùy chọn), (6) chụp ảnh 10 mẫu còn thiếu, (7) chạy `npm run check:integrations` rồi đổi `MOCK_INTEGRATIONS=false`, (8) test thật 1 đơn từ Messenger.
- Tạo `docs/bao-ve/slide-outline.md`: dàn ý 12–15 slide (vấn đề, giải pháp, kiến trúc, demo, kết quả kiểm thử, hạn chế, hướng phát triển) bằng tiếng Việt, kèm gợi ý ảnh chụp nào dùng cho slide nào.
- Tạo `.github`-free script `npm run verify:all` chạy tuần tự: lint → build → test → audit prod → E2E Playwright → check:integrations, in bảng tổng kết PASS/FAIL.

## Quy tắc

- Không ghi PASS cho thứ chưa chạy; mục nào cần tài khoản/khóa của tôi thì ghi "chưa kiểm chứng – cần X".
- Không xóa volume/dữ liệu của stack đang chạy; mọi thao tác phá hủy dùng project name/volume riêng và phải backup trước.
- Không commit khóa, `.env`, `data/`, báo cáo chứa dữ liệu cá nhân thật.
- Không thay đổi hành vi nghiệp vụ đã được test, trừ khi sửa lỗi và có test mới đi kèm.
- Cuối cùng báo cáo: việc xong, việc chưa xong, số liệu Lighthouse, kết quả audit trước/sau, và những gì tôi cần tự làm.

Bắt đầu từ Việc 1.
