# PROMPT CHO CODEX (bước 3) – Hoàn thiện, kiểm thử toàn luồng và chuẩn bị bảo vệ đồ án Long Fish

Trạng thái hiện tại (đã kiểm tra): `lint`, `build`, `test` đều pass; dự án đã chuyển sang Long Fish; 17/27 sản phẩm có ảnh thật kèm `credits.json` và trang `/credits`; `docs/images-todo.md` liệt kê 10 sản phẩm còn dùng SVG. Hãy làm tiếp các việc dưới đây theo thứ tự, sau mỗi việc chạy `npm run lint && npm run build && npm test` và tóm tắt ngắn.

## Việc 1 – Cho admin tự tải ảnh lên (thay vì chỉ dán link)

Mười sản phẩm còn thiếu ảnh phần lớn là phụ kiện/ảnh cụ thể, nên tôi sẽ tự chụp/mua ảnh. Hãy:
- Thêm endpoint admin `POST /api/admin/uploads` (multer, chỉ nhận JPEG/PNG/WebP, tối đa 5 MB, kiểm tra magic bytes, đổi tên ngẫu nhiên, lưu vào thư mục uploads có volume trong docker).
- Dùng `sharp` tự resize (≤ 1200 px) + xuất WebP + tạo thumb 480 px giống pipeline hiện có.
- Trang quản trị sản phẩm: nút "Tải ảnh lên" (nhiều ảnh, kéo thả, sắp xếp thứ tự, chọn ảnh chính, xóa ảnh), vẫn giữ ô dán URL cũ.
- Backend phục vụ `/uploads/...` an toàn (không cho path traversal), nginx cache hợp lý, validator ảnh trong `catalog.ts` chấp nhận đường dẫn uploads.
- Ảnh do admin tải lên ghi nhận nguồn là "Ảnh do Long Fish cung cấp" trên `/credits`.
- Viết test cho upload (sai định dạng, quá dung lượng, file giả đuôi ảnh, thiếu JWT).

## Việc 2 – Bổ sung ảnh còn thiếu một cách hợp pháp

- Nếu `.env` có `PEXELS_API_KEY`/`PIXABAY_API_KEY`/`UNSPLASH_ACCESS_KEY` thì chạy lại `npm run images:fetch` cho các sản phẩm trong `docs/images-todo.md`; vẫn áp dụng quy tắc: đúng loài/đúng loại thiết bị, giấy phép thương mại, không logo/watermark, cạnh ngắn ≥ 600 px, ghi nguồn.
- **Không bịa**: ảnh nào không xác minh được thì giữ SVG. Cập nhật lại `docs/images-todo.md` (thêm cột "ảnh nên chụp thế nào" ví dụ góc, nền trắng) để tôi tự chụp rồi upload qua admin.
- Cải thiện SVG fallback cho 10 sản phẩm này cho đẹp, đồng bộ phong cách với ảnh thật (nền, khung, bóng), và hiển thị nhãn nhỏ "Ảnh minh họa" khi đang dùng SVG.

## Việc 3 – Chạy thử TOÀN LUỒNG thật bằng trình duyệt và ghi lại bằng chứng

Khởi chạy backend + frontend (+ n8n bằng docker nếu máy có Docker; không có thì dùng chế độ mock) và tự thao tác như người dùng:
1. Mô phỏng khách chat: chào → "cá dễ nuôi cho người mới" → chọn Betta → dòng/màu → cỡ cm → giới tính → số lượng → nhận link web có `psid`.
2. Trên web: chọn sản phẩm, kiểm tra `minQty`, chọn tỉnh có/không hỗ trợ cá sống, đặt COD và đặt VietQR, đọc chính sách DOA, hiển thị mã đơn và QR đúng số tiền/nội dung.
3. Kiểm tra: đơn vào Google Sheets (hoặc CSV mock), có tin Messenger xác nhận, có email báo người bán, tồn kho giảm đúng.
4. Admin đăng nhập → đổi trạng thái qua đủ chuỗi (đã xác nhận → đang giao → đã giao) → khách tra cứu thấy timeline và nhận tin; thử hủy đơn → tồn kho được hoàn.
5. Dashboard: doanh thu ngày/tháng, số đơn theo trạng thái, top cá bán chạy, doanh thu theo danh mục khớp với dữ liệu.
6. Thử các tình huống lỗi: hết hàng, đặt vượt tồn, hai người đặt cùng lúc món cuối, SĐT sai khi tra cứu, n8n tắt (đơn vẫn tạo được, outbox gửi lại sau), bot không hiểu 2 lần → chuyển nhân viên → admin xử lý xong → bot hoạt động lại.
7. Lưu ảnh chụp màn hình vào `docs/screenshots/` (cập nhật các ảnh cũ) và viết `docs/test-report.md`: bảng kịch bản – kết quả (pass/fail) – ghi chú; mọi lỗi tìm thấy phải sửa và ghi lại cách sửa.

## Việc 4 – Chuẩn bị chạy thật với Facebook, Google Sheets, email

Tạo `docs/GO-LIVE.md` hướng dẫn từng bước cho người không rành kỹ thuật, kèm checklist đánh dấu:
- Tạo Facebook App + Fanpage Long Fish, lấy Page Access Token, App Secret, đặt Webhook (`/webhook/...` của n8n) bằng ngrok/cloudflared, đăng ký `messages` và `messaging_postbacks`, cấu hình Get Started + Persistent Menu (viết script `scripts/setup-messenger-profile.ts` gọi Messenger Profile API: nút Bắt đầu, menu "Xem cá", "Tra cứu đơn", "Gặp nhân viên").
- Tạo Google Sheet mẫu (liệt kê đủ tên tab và tiêu đề cột; viết script `scripts/init-sheets.ts` tự tạo tab/tiêu đề nếu có credentials), cấp quyền Service Account.
- SMTP/Gmail App Password, VietQR (mã ngân hàng, số tài khoản, tên chủ tài khoản).
- Biến `.env` đầy đủ (kèm cột "bắt buộc/tùy chọn", ví dụ giá trị an toàn), cách đổi `MOCK_INTEGRATIONS=false`, cách kiểm tra từng tích hợp bằng script `npm run check:integrations` (in OK/FAIL cho Messenger, Sheets, SMTP, n8n, DB, ảnh).
- Lưu ý chính sách Meta: chỉ nhắn trong cửa sổ 24 giờ sau tin nhắn cuối của khách; nếu tin xác nhận đơn/đổi trạng thái ngoài cửa sổ này thì dùng message tag phù hợp (`POST_PURCHASE_UPDATE` hoặc tag hiện hành theo tài liệu Meta mới nhất — hãy tra tài liệu chính thức rồi áp dụng, không đoán) và có phương án dự phòng gửi email/SMS cho khách nếu có email.

## Việc 5 – Rà soát bảo mật và chất lượng

- Rà soát OWASP cơ bản: validate input, rate-limit (đặc biệt `/api/orders`, `/api/orders/track`, `/api/admin/login`), chống brute-force đăng nhập admin, helmet/CORS, xác thực chữ ký `X-Hub-Signature-256` cho webhook Messenger, `x-api-key` cho API nội bộ, JWT hết hạn hợp lý, không lộ stack trace, không log dữ liệu cá nhân thừa (che SĐT trong log).
- Kiểm tra chống oversell bằng test đồng thời nhiều request; kiểm tra làm tròn tiền (VND số nguyên).
- `npm audit` (báo cáo lỗ hổng nghiêm trọng và cập nhật nếu an toàn).
- Accessibility cơ bản (alt, label, tương phản, focus), Lighthouse mobile ≥ 85 cho trang chủ và trang sản phẩm; sửa các điểm dễ như kích thước ảnh, lazy-load.
- Backup: script `npm run db:backup` sao lưu SQLite có timestamp; ghi chú cách khôi phục.

## Việc 6 – Gói hồ sơ bảo vệ đồ án

Tạo thư mục `docs/bao-ve/` gồm:
- `kich-ban-demo.md`: kịch bản demo 10 phút, từng bước ai làm gì, màn hình nào, câu thoại gợi ý, dữ liệu mẫu cần chuẩn bị, phương án dự phòng nếu mất mạng/Facebook lỗi (dùng `npm run simulate` và mock).
- `kien-truc.md`: sơ đồ kiến trúc, sơ đồ luồng dữ liệu (mermaid), sơ đồ ERD, bảng API, giải thích vì sao chọn từng công nghệ.
- `doi-chieu-yeu-cau.md`: bảng đối chiếu từng gạch đầu dòng trong yêu cầu đề tài gốc (n8n, chatbot, website chốt đơn, quản lý đơn & thống kê) với chức năng đã làm, file/màn hình chứng minh, trạng thái (đạt/chưa/một phần). Trung thực: mục nào chưa đạt ghi rõ lý do.
- `cau-hoi-phan-bien.md`: 20 câu hỏi hội đồng có thể hỏi (bảo mật, tồn kho đồng thời, chi phí, mở rộng, hạn chế) kèm gợi ý trả lời dựa trên đúng code của dự án.

## Quy tắc

- Không sửa schema/migration cũ; nếu cần đổi DB thì thêm migration mới và cập nhật seed + test.
- Không commit khóa/secret; mọi cấu hình qua `.env`.
- Mọi kết quả kiểm thử phải là kết quả thật bạn đã chạy; không ghi pass cho thứ chưa chạy. Mục nào không chạy được (không có Docker, không có khóa API…) ghi rõ "chưa kiểm chứng" và nêu tôi cần làm gì.
- Cuối cùng báo cáo: việc đã xong, việc chưa xong, lỗi đã sửa, và danh sách chính xác những gì tôi cần tự làm (tài khoản Facebook, Google, ảnh cần chụp…).

Bắt đầu từ Việc 1.
