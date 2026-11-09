# PROMPT CHO CODEX (v2) – Chuyển dự án thành LONG FISH (cá cảnh)

Bạn là Senior Full-stack Engineer. Thư mục `D:\Đồ án TMĐT` **đã có một dự án chạy được** (backend Express + Prisma + SQLite, frontend React + Vite + Tailwind, n8n workflow, docker-compose, test, docs). Tuy nhiên dự án đang được dựng cho một cửa hàng **thời trang tên "Mây Studio"** (áo, quần, váy, phụ kiện). Đề tài thật của tôi là **bán cá cảnh, thương hiệu LONG FISH**.

**Nhiệm vụ: KHÔNG làm lại từ đầu. Đọc code hiện có, giữ kiến trúc, rồi chuyển toàn bộ sang miền cá cảnh Long Fish, vá các chỗ còn thiếu và đảm bảo lint/build/test đều pass.** Giao diện, nội dung bot, tài liệu bằng tiếng Việt; code, tên biến, tên bảng bằng tiếng Anh.

## 1. Hiện trạng đã có (giữ lại, đừng viết lại)

- Backend: `app.ts`, `orders.ts` (tạo đơn trong transaction, trừ kho), `bot.ts` (bot Messenger theo luật), `outbox.ts` (hàng đợi gọi n8n), `stats.ts`, `integrations.ts` (mock/thật), Prisma schema (Product, ProductVariant, Order, OrderItem, OrderStatusLog, HandoffRequest, AdminUser, ConversationState, MessengerReceipt, OrderSequence, OutboxEvent).
- Frontend: catalog, checkout, tra cứu đơn, admin (đơn hàng, sản phẩm, dashboard Recharts).
- n8n: 5 workflow trong `n8n/workflows/` (messenger, order-created, order-status, revenue, errors), `scripts/simulate-messenger.ts`, `docker-compose.yml`, `docs/README.md`.
- Hiện `npm run lint` và `npm test` (7 test) đang pass. Sau khi sửa phải vẫn pass.

## 2. Việc 1 – Đổi thương hiệu & dữ liệu sang Long Fish

1. Thay mọi chỗ "Mây Studio", "may-store", "shop thời trang" thành **Long Fish** (tên package, tiêu đề trang, logo/text header, footer, email, tin nhắn bot, README, tên workflow n8n, tên sheet, tiêu đề email). Dùng grep để chắc chắn không còn sót (`Mây`, `may-store`, `áo`, `quần`, `váy`, `size`, `catalog/*.svg` thời trang…).
2. Đổi hệ màu giao diện sang chủ đề thủy sinh (xanh dương/xanh ngọc/trắng, điểm nhấn cam như cá koi), logo chữ "Long Fish" kèm icon cá (SVG tự vẽ). Mobile-first.
3. **Xóa dữ liệu mẫu thời trang**, tạo seed mới ≥ 14 sản phẩm thuộc các danh mục:
   - **Cá cảnh nước ngọt**: Betta (halfmoon, plakat, crowntail), Guppy (fancy, full red, snake skin), Neon Tetra/Cardinal, Molly, Platy, Cá bảy màu, Cá vàng (Ranchu, Oranda), Cá Koi mini, Cá rồng/Cá la hán (cao cấp), Cá thần tiên (Angelfish), Cá dĩa (Discus), Cá chuột/Pleco dọn bể.
   - **Thủy sinh & phụ kiện**: thức ăn (hạt, artemia), bể kính/hồ mini, lọc, đèn, sưởi, sủi oxy, cây thủy sinh, thuốc/vi sinh xử lý nước.
   - Mỗi sản phẩm có mô tả đặc điểm: tên khoa học (nếu có), kích thước trưởng thành, nhiệt độ/pH phù hợp, tính cách (nuôi chung được hay không), độ khó nuôi, thức ăn. Lưu thêm trường `careInfo` (JSON hoặc text) trong `Product`.
4. Ảnh sản phẩm: tạo ảnh SVG minh họa cá (nhiều màu/dáng khác nhau) trong `frontend/public/catalog/`, xóa SVG thời trang cũ. Không dùng ảnh có bản quyền; ghi chú cho tôi cách thay bằng ảnh thật (đường dẫn hoặc upload).
5. Seed đơn mẫu ~30 đơn rải nhiều ngày/tháng với khách tên Việt Nam hợp lý để dashboard có số liệu; giữ cơ chế `ADMIN_PASSWORD` từ `.env` (không hard-code mật khẩu).

## 3. Việc 2 – Điều chỉnh mô hình "phân loại" cho cá cảnh

Hiện biến thể là `color` + `size (M/L/F)`. Cá cảnh cần:
- **Dòng/màu** (`color`: ví dụ Đỏ, Xanh dương, Koi, Platinum, Mix) → giữ.
- **Kích cỡ theo cm** (`size`: `3-4cm`, `5-6cm`, `7-9cm`, `10cm+`) thay cho M/L/F; phụ kiện dùng `Mặc định` hoặc theo dung tích/công suất (VD lọc 20W, 40W).
- **Giới tính** (`gender`: `Đực`, `Cái`, `Cặp`, `Không phân biệt`) – thêm cột vào `ProductVariant`, đưa vào unique key, SKU, form chọn trên web, bảng OrderItem (lưu snapshot), tin nhắn bot và Google Sheets.
- **Đơn vị bán** (`unit`: `con`, `cặp`, `bộ`, `gói`, `cái`) và số lượng tối thiểu (`minQty`, VD Neon Tetra bán tối thiểu 6 con).
- Tồn kho theo từng biến thể vẫn kiểm tra trong transaction, chống oversell như hiện tại.
- Cập nhật migration Prisma mới (không sửa migration cũ nếu đã có dữ liệu), seed, API, zod schema, frontend, bot, n8n và test cho khớp.

## 4. Việc 3 – Nghiệp vụ riêng của bán cá sống

Thêm vào checkout và backend:
- **Phí đóng gói cá sống** (túi oxy + thùng xốp) + **phí vận chuyển** theo vùng; tổng = tiền hàng + phí đóng gói + phí ship. Miễn phí ship từ ngưỡng cấu hình. Hiển thị rõ từng khoản.
- **Cam kết sống khi nhận (DOA)**: hiển thị chính sách ngắn gọn (khách phải quay video mở thùng trong 2 giờ, đền/bù cá chết theo quy định) ở trang sản phẩm, checkout và tin nhắn xác nhận đơn; checkbox "Tôi đã đọc chính sách" bắt buộc trước khi đặt.
- **Giới hạn giao cá sống**: chỉ giao các tỉnh/thành trong danh sách hỗ trợ (cấu hình được); tỉnh ngoài danh sách chỉ cho mua phụ kiện (không cho thêm cá sống vào đơn) và báo rõ lý do.
- Cho phép **ghi chú / ngày giờ nhận hàng mong muốn**; đơn có cá sống đánh dấu `hasLiveFish` để admin ưu tiên đóng gói và thể hiện trong email/Sheets.
- Trạng thái đơn giữ nguyên: chờ xác nhận, đã xác nhận, đang giao, đã giao, đã hủy (hủy thì hoàn kho). Có thể thêm ghi chú nội bộ cho admin (ví dụ "đã đóng gói 16h").

## 5. Việc 4 – Chatbot Messenger cho Long Fish

Sửa `bot.ts` (và workflow `1-messenger.json` nếu có logic trùng) để:
- Chào đúng thương hiệu: "Chào bạn, Long Fish đây 🐟 …".
- Nhận diện từ khóa cá cảnh tiếng Việt (có/không dấu): betta, guppy, bảy màu, koi, cá vàng, cá rồng, dĩa, thần tiên, neon, bể, lọc, thức ăn, cây thủy sinh…; thay các từ khóa thời trang cũ (áo/quần/váy/size).
- **Gợi ý theo nhu cầu**: "cá dễ nuôi cho người mới", "cá nuôi chung bể nhỏ dưới 100k", "cá đẹp để bàn làm việc", "cá ăn rêu", "bể 40cm nuôi được gì" → trả carousel sản phẩm phù hợp (dựa vào độ khó nuôi, kích thước, giá, tính cách lưu trong `careInfo`).
- Tư vấn chăm sóc cơ bản: nhiệt độ, pH, thức ăn, nuôi chung được không, bể tối thiểu (lấy từ dữ liệu sản phẩm, không bịa; nếu thiếu dữ liệu thì chuyển nhân viên).
- Hỏi lần lượt: loại cá → dòng/màu → cỡ cm → giới tính → số lượng (tuân thủ `minQty`) rồi kiểm tra còn hàng và gửi link website kèm `psid`.
- Báo còn hàng/hết hàng theo từng biến thể; hết hàng thì gợi ý biến thể/loài tương tự.
- Tra cứu đơn bằng mã đơn trong chat; chuyển nhân viên khi khách yêu cầu hoặc bot không hiểu 2 lần liên tiếp (giữ cơ chế `ConversationState.handoff`, thêm cách admin tắt chế độ này).
- Có chế độ AI tùy chọn (bật/tắt qua biến môi trường) chỉ dùng để hiểu câu hỏi tự do, **không được tự bịa giá hay tồn kho**; mọi số liệu lấy từ API.

## 6. Việc 5 – Website & admin

- Trang danh mục: lọc theo danh mục, khoảng giá, độ khó nuôi, kích thước cá; tìm kiếm; nhãn "Còn hàng/Hết hàng/Sắp hết".
- Trang chi tiết: thư viện ảnh, bảng thông số nuôi (nhiệt độ, pH, kích thước trưởng thành, tính cách, thức ăn), chọn dòng/cỡ/giới tính/số lượng, hiển thị tồn kho theo biến thể, chính sách DOA.
- Checkout: họ tên, SĐT, tỉnh/thành – quận/huyện – địa chỉ, tính tự động tiền hàng + phí đóng gói + phí ship + tổng; COD hoặc chuyển khoản **VietQR** (đúng số tiền, nội dung = mã đơn); xác nhận và hiển thị mã đơn.
- Tra cứu đơn bằng mã đơn + SĐT, hiển thị timeline, tự cập nhật.
- Admin: quản lý đơn (lọc theo trạng thái/ngày, đổi trạng thái, đánh dấu đã thanh toán, đánh dấu đơn có cá sống), quản lý sản phẩm/biến thể/tồn kho (có cảnh báo sắp hết), hộp thư "Cần nhân viên" (handoff), dashboard: doanh thu ngày/tháng, số đơn thành công/đang xử lý/đã hủy, **top cá bán chạy**, doanh thu theo danh mục.

## 7. Việc 6 – n8n

Cập nhật 5 workflow cho Long Fish:
1. **Messenger**: dùng nội dung/từ khóa mới.
2. **Đơn mới**: ghi Google Sheets (thêm các cột giới tính, phí đóng gói, `hasLiveFish`, ghi chú nhận hàng) → nhắn xác nhận qua Messenger (có chính sách DOA, nhắc quay video khi nhận) → email báo người bán có tiêu đề "[Long Fish] Đơn mới <mã>".
3. **Cập nhật trạng thái**: cập nhật Sheets + nhắn khách theo từng trạng thái.
4. **Doanh thu**: tổng hợp ngày/tháng vào `Daily_Revenue`, `Monthly_Revenue`, gửi email báo cáo.
5. **Lỗi**: giữ nhánh ghi log/báo lỗi.
Export lại JSON, đặt tên theo "Long Fish – …", cập nhật `docker-compose.yml` và `.env.example` (tên shop, thông tin ngân hàng, ngưỡng miễn ship, danh sách tỉnh hỗ trợ cá sống, phí đóng gói).

## 8. Việc 7 – Kiểm tra chất lượng (bắt buộc)

1. Chạy `npm run lint`, `npm run build`, `npm test`; sửa đến khi pass hết.
2. Bổ sung test cho: biến thể có giới tính, `minQty`, phí đóng gói + ship, từ chối cá sống ngoài vùng hỗ trợ, đặt thiếu checkbox chính sách, hủy đơn hoàn kho, chống oversell đồng thời, bot hiểu từ khóa cá cảnh, tra cứu sai SĐT bị từ chối.
3. Chạy `npm run simulate` (chế độ `MOCK_INTEGRATIONS=true`) để chứng minh toàn luồng: chat → gợi ý cá → link web → đặt đơn → ghi Sheets mock → tin xác nhận → email mock → admin đổi trạng thái → khách tra cứu thấy.
4. Chạy thử giao diện thật (dev server), chụp ảnh các trang chính (trang chủ, chi tiết, checkout, tra cứu, admin, dashboard) ở mobile và desktop, kiểm tra không còn chữ/ảnh thời trang.
5. `grep` lại toàn repo để chắc không còn "Mây Studio", "may-store", dữ liệu áo/quần/váy.

## 9. Cập nhật tài liệu

Sửa `docs/README.md`: giới thiệu Long Fish, cách chạy (`docker compose up` hoặc dev), cấu hình Facebook App/Page/webhook (ngrok/cloudflared), Google Sheets, SMTP, VietQR, danh sách biến `.env`, sơ đồ kiến trúc, **kịch bản demo bảo vệ đồ án** theo luồng cá cảnh (ví dụ: khách hỏi "cá dễ nuôi cho người mới" → chọn Betta → chọn màu/cỡ/giới tính → link web → đặt COD → nhận tin xác nhận → admin đổi "đang giao" → khách tra cứu → xem thống kê).

## 10. Quy tắc làm việc

- Làm theo thứ tự: (1) đổi thương hiệu + seed → (2) mô hình biến thể mới + migration → (3) nghiệp vụ cá sống → (4) bot → (5) frontend/admin → (6) n8n → (7) test + tài liệu. Sau mỗi bước chạy lint/test và tóm tắt ngắn.
- Không bịa số liệu nuôi cá; dùng thông tin phổ biến, chính xác, ghi rõ là tham khảo.
- Không hard-code khóa/secret/mật khẩu; không commit `.env`.
- Không phá hủy dữ liệu ngoài thư mục dự án. Hỏi lại tôi nếu cần quyết định lớn thay vì tự đoán.

## 11. Tiêu chí nghiệm thu

- [ ] Toàn bộ giao diện, bot, email, tài liệu mang thương hiệu **Long Fish**, không còn dấu vết thời trang.
- [ ] Sản phẩm là cá cảnh + phụ kiện thủy sinh, có thông số nuôi, chọn được dòng/cỡ cm/giới tính/số lượng, tôn trọng `minQty`.
- [ ] Checkout tính đúng tiền hàng + phí đóng gói + phí ship, hỗ trợ COD và VietQR, chặn cá sống ngoài vùng giao.
- [ ] Đơn mới → Sheets (hoặc CSV mock) + Messenger + email; đổi trạng thái → khách thấy trên web và nhận tin.
- [ ] Bot chào, tư vấn, gợi ý theo nhu cầu, báo còn/hết hàng, gửi link, chuyển nhân viên.
- [ ] Dashboard đúng doanh thu ngày/tháng, số đơn theo trạng thái, top cá bán chạy.
- [ ] `lint`, `build`, `test` đều pass; README và kịch bản demo đầy đủ.

Bắt đầu từ bước (1) ngay bây giờ.
