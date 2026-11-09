# PROMPT CHO CODEX – Hệ thống bán hàng Facebook Messenger + Website chốt đơn + n8n

Bạn là Senior Full-stack Engineer. Hãy xây dựng hoàn chỉnh đồ án thương mại điện tử dưới đây trong thư mục hiện tại (`D:\Đồ án TMĐT`). Làm theo từng giai đoạn, chạy được thật, có hướng dẫn cài đặt, có dữ liệu mẫu. Giao tiếp, giao diện, nội dung bot và tài liệu bằng **tiếng Việt**; code, tên biến, tên bảng bằng tiếng Anh.

## 1. Mục tiêu hệ thống

Khách hàng chat với Fanpage Facebook → chatbot (n8n) tư vấn sản phẩm → gửi link website → khách chọn phân loại/số lượng, nhập thông tin, thanh toán (COD hoặc QR chuyển khoản) và chốt đơn → hệ thống tạo mã đơn, lưu Google Sheets, nhắn xác nhận qua Messenger, email báo người bán → admin cập nhật trạng thái → khách tra cứu trạng thái trên web → thống kê doanh thu.

## 2. Công nghệ (cố định, không tự đổi)

- **Backend**: Node.js 20 + Express + TypeScript, ORM Prisma, DB **SQLite** (file) làm nguồn dữ liệu chính (có thể đổi sang PostgreSQL qua biến môi trường).
- **Frontend**: React + Vite + TypeScript + TailwindCSS + React Router. Responsive, ưu tiên mobile (khách vào từ Messenger).
- **Tự động hóa**: **n8n** chạy bằng Docker (`docker-compose.yml` gồm n8n + backend + frontend). Xuất workflow ra file JSON trong `n8n/workflows/` để import.
- **Tích hợp**: Facebook Messenger Platform (Webhook + Send API), Google Sheets API (node có sẵn của n8n), SMTP/Gmail (node Send Email của n8n), VietQR (tạo ảnh QR qua `https://img.vietqr.io/image/<BANK>-<ACCOUNT>-compact2.png?amount=..&addInfo=..`).
- Mọi khóa/secret nằm trong `.env` (cung cấp `.env.example`), tuyệt đối không hard-code.

## 3. Cấu trúc thư mục yêu cầu

```
/backend        API Express + Prisma + seed
/frontend       Website khách + trang admin
/n8n/workflows  Các workflow .json
/docs           README, hướng dẫn cấu hình FB/Google/SMTP, sơ đồ luồng, kịch bản demo
docker-compose.yml
.env.example
```

## 4. Mô hình dữ liệu (Prisma)

- `Product`: id, name, slug, description, price, images (JSON), category, isActive, createdAt
- `ProductVariant`: id, productId, color, size, sku, stock, priceOverride?
- `Order`: id, code (VD `DH20261108-0001`), customerName, phone, address, psid (Messenger ID, nullable), paymentMethod (`COD`|`BANK_QR`), paymentStatus (`UNPAID`|`PAID`), subtotal, shippingFee, total, status (`PENDING`|`CONFIRMED`|`SHIPPING`|`DELIVERED`|`CANCELLED`), note, createdAt, updatedAt
- `OrderItem`: id, orderId, variantId, productName, color, size, unitPrice, quantity
- `OrderStatusLog`: id, orderId, fromStatus, toStatus, changedAt
- `HandoffRequest`: id, psid, lastMessage, reason, status (`OPEN`|`DONE`), createdAt
- `AdminUser`: id, username, passwordHash (bcrypt)
- Seed: ≥ 10 sản phẩm thời trang/phụ kiện, mỗi sản phẩm 2–4 phân loại màu/size với tồn kho, 1 tài khoản admin, ~30 đơn mẫu rải nhiều ngày/tháng để thống kê có số liệu.

## 5. Backend API (REST, JSON, validate bằng zod)

Public:
- `GET /api/products?search=&category=` · `GET /api/products/:slug` (kèm variants + tồn kho)
- `GET /api/products/:id/stock?color=&size=` → `{ inStock, stock }` (n8n/bot gọi)
- `POST /api/shipping/quote` → tính phí ship theo tỉnh/thành (bảng phí cấu hình được; miễn phí ship từ ngưỡng X)
- `POST /api/orders` → kiểm tra tồn kho **trong transaction**, trừ kho, tạo mã đơn, tính subtotal + ship + total, trả `{ code, total, qrUrl? }`; sau đó gọi webhook n8n `N8N_ORDER_CREATED_WEBHOOK` (không làm fail đơn nếu n8n lỗi, có retry + log)
- `GET /api/orders/track?code=&phone=` → trạng thái + lịch sử (bắt buộc khớp cả mã đơn và SĐT)

Nội bộ cho n8n (bảo vệ bằng header `x-api-key`):
- `GET /api/internal/products/search?q=` (bot tìm/gợi ý sản phẩm)
- `GET /api/internal/orders/:code`
- `POST /api/internal/handoff`
- `GET /api/internal/stats/daily?from=&to=` · `GET /api/internal/stats/monthly?year=`

Admin (JWT):
- `POST /api/admin/login`
- CRUD sản phẩm + phân loại + tồn kho
- `GET /api/admin/orders?status=&date=&q=` · `PATCH /api/admin/orders/:id/status` (kiểm tra luồng hợp lệ; khi `CANCELLED` thì **hoàn kho**; ghi `OrderStatusLog`; gọi webhook n8n `N8N_ORDER_STATUS_WEBHOOK`)
- `PATCH /api/admin/orders/:id/payment` (đánh dấu đã thanh toán)
- `GET /api/admin/stats/overview?from=&to=`
- `GET /api/admin/handoffs`, `PATCH /api/admin/handoffs/:id`

## 6. Website chốt đơn (frontend khách)

1. **Trang chủ/danh sách sản phẩm**: ảnh, tên, giá, nhãn "Còn hàng/Hết hàng", tìm kiếm, lọc danh mục.
2. **Chi tiết sản phẩm**: chọn màu, size, số lượng; hiển thị tồn kho theo phân loại; không cho chọn quá tồn; nút "Mua ngay".
3. **Giỏ hàng/Checkout** (một trang): form họ tên, SĐT (validate VN), tỉnh/thành – quận/huyện – địa chỉ; tự tính **tiền hàng + phí ship + tổng thanh toán** realtime; chọn thanh toán **COD** hoặc **Chuyển khoản QR** (hiện ảnh VietQR đúng số tiền + nội dung chuyển khoản = mã đơn sau khi đặt).
4. **Xác nhận đặt hàng**: hiển thị mã đơn, tóm tắt, nút copy mã, link sang trang tra cứu.
5. **Tra cứu đơn**: nhập mã đơn + SĐT → timeline trạng thái (chờ xác nhận → đã xác nhận → đang giao → đã giao / đã hủy), tự cập nhật (polling 15s).
6. Link từ Messenger có dạng `https://<site>/product/<slug>?psid=<PSID>` hoặc `/?psid=<PSID>`; frontend phải **giữ `psid` trong session** và gửi kèm khi tạo đơn để n8n nhắn lại đúng khách.

## 7. Trang quản trị (admin, `/admin`)

- Đăng nhập; menu: Dashboard, Đơn hàng, Sản phẩm, Hỗ trợ (handoff).
- **Đơn hàng**: bảng + lọc theo trạng thái/ngày/tìm theo mã/SĐT; xem chi tiết; đổi trạng thái (chờ xác nhận, đã xác nhận, đang giao, đã giao, đã hủy); đánh dấu đã thanh toán.
- **Dashboard thống kê**: doanh thu hôm nay/tháng này; biểu đồ doanh thu theo ngày (30 ngày) và theo tháng (12 tháng); số đơn thành công / đang xử lý / bị hủy; Top sản phẩm bán chạy. Dùng Recharts. Doanh thu chỉ tính đơn `DELIVERED` (ghi rõ trong UI).
- **Sản phẩm**: thêm/sửa/ẩn sản phẩm, quản lý phân loại và tồn kho, cảnh báo sắp hết hàng.

## 8. Workflow n8n (xuất JSON, đặt tên rõ ràng, có note mô tả từng node)

**WF1 – Messenger Chatbot** (Webhook `GET` verify + `POST` nhận tin):
- Xác thực `hub.verify_token`; kiểm tra chữ ký `X-Hub-Signature-256` nếu có thể.
- Bỏ qua echo/read/delivery; chống xử lý lặp (dedupe theo `mid`).
- Phân loại ý định (intent) bằng quy tắc từ khóa/regex tiếng Việt, **có node AI (OpenAI/Claude/Gemini) tùy chọn bật/tắt qua biến cấu hình** để hiểu câu hỏi tự do. Các intent: chào hỏi, hỏi sản phẩm/giá, xem hình ảnh, gợi ý theo nhu cầu (VD "áo đi biển dưới 300k"), hỏi còn hàng/hết hàng, hỏi phân loại màu/size/số lượng, muốn đặt hàng, tra cứu đơn, gặp nhân viên, không hiểu.
- Trả lời bằng **Generic Template (carousel)** có ảnh, tên, giá, nút "Xem & đặt hàng" (web_url kèm psid) và Quick Replies (Danh mục, Còn hàng?, Gặp nhân viên). Gọi API backend để lấy sản phẩm/tồn kho thật.
- Hỏi lần lượt thông tin còn thiếu (phân loại → màu → size → số lượng) bằng Quick Replies; lưu ngữ cảnh hội thoại theo PSID (Static Data hoặc bảng `ConversationState`); sau khi đủ thông tin thì kiểm tra tồn kho và **gửi link website** để chốt đơn.
- Tra cứu đơn qua chat: khách gửi mã đơn → bot trả trạng thái.
- **Chuyển nhân viên**: khi intent = gặp nhân viên hoặc bot không hiểu 2 lần liên tiếp → gọi `/api/internal/handoff`, gửi email/Telegram báo nhân viên, nhắn khách "Đã chuyển cho nhân viên", **tạm dừng bot cho PSID đó** (cờ `handoff=true`) cho đến khi admin đánh dấu xong.

**WF2 – Đơn hàng mới** (Webhook từ backend sau khi tạo đơn):
1. Nhận dữ liệu đơn → kiểm tra lại tồn kho/hợp lệ.
2. Append dòng vào **Google Sheets** (sheet `Orders`: mã đơn, thời gian, khách, SĐT, địa chỉ, sản phẩm, SL, tiền hàng, ship, tổng, thanh toán, trạng thái).
3. Nếu có `psid` → gửi tin nhắn xác nhận qua Messenger (mã đơn, tóm tắt, tổng tiền, hướng dẫn QR nếu chuyển khoản, link tra cứu).
4. Gửi **email HTML** cho người bán: "Đơn hàng mới <mã>" kèm bảng chi tiết.
5. Xử lý lỗi: nhánh Error Trigger ghi log + báo lại, không làm mất đơn.

**WF3 – Cập nhật trạng thái** (Webhook từ backend khi admin đổi trạng thái):
- Tìm dòng theo mã đơn trong Google Sheets và cập nhật cột trạng thái.
- Nhắn Messenger cho khách theo từng trạng thái (đã xác nhận / đang giao / đã giao / đã hủy).

**WF4 – Tổng hợp doanh thu** (Schedule 23:55 hằng ngày + 00:10 ngày 1 hằng tháng):
- Gọi `/api/internal/stats/daily|monthly` → ghi vào sheet `Daily_Revenue` và `Monthly_Revenue` (ngày/tháng, số đơn, doanh thu, đơn hủy); gửi email báo cáo cho người bán.

## 9. Quy tắc nghiệp vụ bắt buộc

- Tồn kho được kiểm tra và trừ **trong một transaction** ở server (không tin dữ liệu client); chống oversell khi 2 khách đặt cùng lúc.
- Giá và phí ship luôn tính lại ở server.
- Luồng trạng thái hợp lệ: `PENDING → CONFIRMED → SHIPPING → DELIVERED`; `CANCELLED` chỉ từ `PENDING/CONFIRMED` (hoặc SHIPPING có xác nhận); hủy thì hoàn kho.
- Mã đơn duy nhất, tăng dần theo ngày.
- Tra cứu đơn cần mã + SĐT để không lộ đơn của người khác.
- Rate-limit endpoint public, sanitize input, CORS chỉ cho domain frontend, bcrypt cho mật khẩu admin.
- Khách không có `psid` (đặt trực tiếp trên web) vẫn đặt được; bỏ qua bước nhắn Messenger.

## 10. Cách làm việc (quan trọng)

1. Đọc yêu cầu, **liệt kê kế hoạch ngắn** rồi làm tuần tự theo giai đoạn: (A) khung dự án + DB + seed → (B) backend API + test → (C) frontend khách → (D) admin + thống kê → (E) workflow n8n + docker-compose → (F) tài liệu + kịch bản demo.
2. Sau mỗi giai đoạn: chạy lint/build/test, sửa lỗi, rồi tóm tắt đã làm gì và cách kiểm tra. Không bỏ giai đoạn, không để TODO/placeholder trong chức năng chính.
3. Viết test (Vitest/Jest + supertest) tối thiểu cho: tạo đơn thành công, hết hàng bị từ chối, đồng thời oversell, hoàn kho khi hủy, tra cứu sai SĐT, chuyển trạng thái không hợp lệ.
4. Cung cấp **chế độ mock** (`MOCK_INTEGRATIONS=true`) để chạy và demo được toàn luồng khi chưa có Facebook App/Google/SMTP: log tin nhắn Messenger ra console, ghi Sheets ra file CSV, email ra console. Kèm script `scripts/simulate-messenger.ts` giả lập tin nhắn khách gửi vào webhook n8n.
5. `docs/README.md` phải có: cài đặt 1 lệnh (`docker compose up`), cách tạo Facebook App + Page + Webhook (dùng ngrok/cloudflared để public), cách cấp Google Service Account/OAuth cho Sheets, cấu hình SMTP, import workflow n8n, danh sách biến `.env`, sơ đồ kiến trúc (mermaid), và **kịch bản demo từng bước** cho buổi bảo vệ đồ án.
6. Không chạy lệnh phá hủy ngoài thư mục dự án; không commit secret; hỏi lại tôi nếu cần quyết định ảnh hưởng lớn đến yêu cầu thay vì tự đoán.

## 11. Tiêu chí nghiệm thu

- [ ] `docker compose up` chạy được frontend, backend, n8n; seed dữ liệu mẫu.
- [ ] Khách đặt hàng trên web với cả COD và QR; thấy mã đơn; tra cứu được trạng thái.
- [ ] Hết hàng/vượt tồn kho bị chặn cả ở UI lẫn server.
- [ ] Đơn mới → có dòng trong Google Sheets (hoặc CSV mock), có tin Messenger xác nhận, có email cho người bán.
- [ ] Admin đổi trạng thái → khách thấy trên web, Sheets cập nhật, khách nhận tin Messenger.
- [ ] Bot chào, tư vấn, gợi ý, báo còn/hết hàng, gửi link web, chuyển nhân viên khi không hiểu.
- [ ] Dashboard hiển thị đúng doanh thu ngày/tháng, số đơn theo trạng thái, top sản phẩm bán chạy; WF4 ghi báo cáo định kỳ.
- [ ] Test pass, build không lỗi, README đầy đủ.

Bắt đầu từ giai đoạn A ngay bây giờ.
