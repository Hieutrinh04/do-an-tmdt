# Chạy Long Fish với dịch vụ thật

Kiểm tra hướng dẫn ngày 09/11/2026. Chạy demo tại http://localhost:8080 và mở n8n tại http://localhost:5678 trước khi cấu hình tài khoản thật. Các bước dùng PowerShell tại thư mục dự án.

## Chuẩn bị

- [ ] Sao chép `.env.example` thành `.env`, đặt mật khẩu quản trị từ 12 ký tự và các secret ngẫu nhiên từ 32 ký tự.
- [ ] Chạy `npm install` và `docker compose up --build -d`. Thư mục Windows có dấu cần ánh xạ ổ như hướng dẫn README.
- [ ] Chạy `npm run db:backup -- --docker` và sao lưu volume ảnh trước khi đổi chế độ.
- [ ] Chuẩn bị tên miền HTTPS hoặc hai tunnel, một cho website cổng 8080, một cho n8n cổng 5678. Giữ trình biên tập n8n được bảo vệ bằng tài khoản quản trị.
- [ ] Nhập `SITE_URL`, `PUBLIC_BASE_URL`, `FRONTEND_ORIGIN` theo URL website, `WEBHOOK_URL` theo URL n8n, bật `N8N_SECURE_COOKIE=true` khi dùng HTTPS.

## Facebook và Messenger

1. Đăng nhập Meta for Developers bằng tài khoản của chủ Fanpage. Tạo ứng dụng cho doanh nghiệp và thêm khả năng Messenger theo giao diện hiện hành. Tạo hoặc chọn Fanpage Long Fish.
2. Kết nối Fanpage, lấy Page Access Token. Vào cài đặt ứng dụng lấy App Secret. Ghi token vào `META_PAGE_ACCESS_TOKEN`, secret vào `META_APP_SECRET`, tự đặt `META_VERIFY_TOKEN`. Chọn Graph API version được tài khoản hỗ trợ trong `META_GRAPH_VERSION`.
3. Tạo tunnel n8n, ví dụ `ngrok http 5678`. Trong cấu hình webhook Messenger nhập `https://<n8n>/webhook/messenger` và verify token khớp `.env`. Workflow GET cùng đường dẫn trả challenge, workflow POST xử lý sự kiện.
4. Đăng ký `messages` và `messaging_postbacks`. Kiểm tra người gửi có vai trò app khi app ở development. Để phục vụ công chúng cần hoàn tất quyền và xét duyệt mà Meta yêu cầu cho tài khoản.
5. Trong n8n nhập bản mới `n8n/workflows/1-messenger.json`, kiểm tra bước xác thực HMAC SHA-256 rồi publish. Container tự import một lần khi volume mới, đổi file trên máy không tự thay workflow đã import.
6. Chạy `npm run messenger:setup -- --dry-run` để xem cấu hình. Khi sẵn sàng chạy `npm run messenger:setup` để cài nút Bắt đầu và menu Xem cá, Tra cứu đơn, Gặp nhân viên.
7. Đặt `MOCK_INTEGRATIONS=false`, khởi động lại backend và n8n để nhận biến mới. Nhắn “Xin chào” từ tài khoản thử và kiểm tra nhận trả lời, ảnh HTTPS và link có `psid` cùng `context`.

- [ ] Đã xác thực webhook bằng chữ ký trên raw body.
- [ ] Đã thử nút Bắt đầu, ba menu và một vòng chọn cá.
- [ ] Đã thử với khách không có vai trò app sau khi được cấp quyền công khai.

### Cửa sổ 24 giờ

Backend lưu `ConversationState.lastInboundAt` khi nhận tin khách mới. Đơn tạo trên web hoặc đổi trạng thái không gia hạn thời điểm này. Ở chế độ thật, gửi thông báo khi thiếu thời điểm hoặc đã đủ 24 giờ sẽ đưa yêu cầu vào Quản trị → Hỗ trợ và trả `sent=false, fallback=admin`. Workflow hoàn tất các bước Sheets/email, không liên tục gửi lại Messenger ngoài cửa sổ.

Các trang tài liệu Meta chính thức trả HTTP 429 trong lần kiểm tra này. Vì vậy cơ chế Utility Template và tag gửi ngoài cửa sổ chưa được xác minh hoặc bật trong code. Chủ dự án cần mở tài liệu, xác nhận quyền và mẫu thông báo được duyệt cho Page, rồi bổ sung tích hợp tương ứng trước khi tự động gửi ngoài cửa sổ. Không nhập tag suy đoán vào payload. Các đường dẫn cần kiểm tra gồm [Send API](https://developers.facebook.com/docs/messenger-platform/send-messages/), [Utility messages](https://developers.facebook.com/docs/messenger-platform/send-messages/utility-messages/) và [changelog Messenger](https://developers.facebook.com/docs/messenger-platform/changelog/).

Phương án vận hành hiện có là nhân viên mở đơn theo mã trong yêu cầu hỗ trợ, gọi hoặc gửi SMS tới số khách đã cung cấp. Nếu đã thu email với sự đồng ý của khách qua kênh hỗ trợ, gửi email thủ công. Form đặt hàng có ô email không bắt buộc; khách nhập email sẽ tự nhận email xác nhận đơn và thông báo trạng thái qua SMTP (workflow 2 và 3), kể cả khi cửa sổ Messenger đã đóng. Chưa tích hợp cổng SMS. Không dùng HUMAN_AGENT cho bot gửi tự động.

## Google Sheets

1. Mở Google Cloud Console, tạo project, bật Google Sheets API.
2. Tạo Service Account, tải JSON key và lưu trong `secrets/google-service-account.json`. Điền đường dẫn tuyệt đối vào `GOOGLE_APPLICATION_CREDENTIALS`. Thư mục secrets đã được ignore.
3. Tạo bảng tính Long Fish. Chia sẻ quyền Editor cho `client_email` trong JSON. Lấy đoạn ID giữa `/d/` và `/edit` trong URL, điền `GOOGLE_SHEET_ID`.
4. Chạy `npm run sheets:init -- --dry-run`, rồi `npm run sheets:init`. Script thêm tab còn thiếu và tiêu đề ở hàng 1 khi còn trống. Nếu tiêu đề đã có khác mẫu, script dừng để đối chiếu.
5. Trong n8n tạo credential Google Service Account bằng email và private key tương ứng, gắn vào các node Google Sheets ở workflow 2, 3, 4. Dùng RAW để dữ liệu khách không thành công thức.
6. Publish workflow, đặt một đơn thử, xác nhận hàng được upsert theo `code`. Thử đổi trạng thái và chạy lại cùng sự kiện để kiểm tra không nhân đôi hàng.

| Tab | Tiêu đề hàng 1 theo thứ tự |
|---|---|
| Long_Fish_Orders | code, createdAt, customer, phone, address, products, quantity, subtotal, shippingFee, total, paymentMethod, paymentStatus, status, gender, packingFee, hasLiveFish, preferredDelivery, deliveryNote |
| Daily_Revenue | period, orders, revenue, cancelled |
| Monthly_Revenue | period, orders, revenue, cancelled |

Tham khảo [Service Account OAuth](https://developers.google.com/identity/protocols/oauth2/service-account) và [ghi giá trị vào Sheets](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/update).

## Email người bán và VietQR

1. Với Gmail, bật xác minh hai bước và tạo App Password nếu tài khoản được Google cho phép. Dùng mật khẩu ứng dụng cho SMTP, không dùng mật khẩu đăng nhập chính.
2. Trong n8n tạo credential SMTP, điền host `smtp.gmail.com`, cổng 465 với TLS hoặc 587 với STARTTLS. Đặt người gửi `MAIL_FROM`, người nhận thông báo `MAIL_TO`, gắn credential vào node SMTP của các workflow và publish.
3. Điền cùng cấu hình vào `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` để script kiểm tra xác thực được. Các biến này không tự tạo credential trong n8n.
4. Điền mã ngân hàng hoặc BIN vào `VIETQR_BANK`, số tài khoản vào `VIETQR_ACCOUNT`, tên chủ tài khoản vào `VIETQR_ACCOUNT_NAME`. Tạo đơn VietQR, mở bằng ứng dụng ngân hàng và đối chiếu tên, tiền, nội dung trước khi chuyển khoản thử.
5. Tùy chọn tự động đối soát: đặt `BANK_WEBHOOK_SECRET` từ 32 ký tự, cấu hình dịch vụ ngân hàng hoặc middleware của bạn gọi `POST https://<site>/api/payments/bank` với header `x-bank-secret` và body `{ "code": "DH...", "amount": 120000, "reference": "FT..." }`. Có thể gửi `content` chứa mã đơn thay cho `code`. Backend chỉ ghi PAID khi đơn dùng BANK_QR, chưa hủy và số tiền khớp tuyệt đối; webhook lặp được bỏ qua; WF3 gửi Messenger xác nhận thanh toán nếu còn trong cửa sổ 24 giờ.
6. Không bật webhook thì nhân viên bấm xác nhận trong admin sau khi đối chiếu sao kê. Luôn đối chiếu lại giao dịch thật trước khi giao hàng.

Tham khảo [SMTP và xác thực kết nối](https://nodemailer.com/smtp).

## Ảnh sản phẩm

Điền khóa `PEXELS_API_KEY` hoặc `PIXABAY_API_KEY` trong `.env` nếu muốn dùng dịch vụ ảnh stock. Chạy `npm run images:fetch -- --only <slug> --dry-run` để xem ứng viên. Kiểm tra đúng loài, kích thước và giấy phép trước khi duyệt. Để dùng ảnh tự chụp, mở Quản trị → Sản phẩm và tải ảnh lên. [Danh sách mẫu và góc chụp](images-todo.md).

## Kiểm tra trước khi nhận đơn

- [ ] Chạy `npm run check:integrations -- --docker`. OK cho Messenger chỉ chứng minh token đọc được Page. OK cho SMTP chỉ chứng minh kết nối và đăng nhập thành công.
- [ ] Tạo đơn thật giá trị nhỏ được chủ tài khoản cho phép, kiểm tra Messenger, Sheet, email, ảnh và tồn kho.
- [ ] Mở Outbox và execution n8n nếu có lỗi. Đơn đã commit vẫn còn trong DB khi tích hợp tạm dừng.
- [ ] Đổi trạng thái đơn, thử hủy đơn được phép và đối chiếu kho.
- [ ] Kiểm tra mobile, DOA và chính sách giao cá sống cho địa chỉ kinh doanh thực tế.
- [ ] Bật backup định kỳ và thử khôi phục trên bản sao.

Các tích hợp ngoài chưa có credentials được ghi FAIL cùng lý do “chưa kiểm chứng” khi chạy script. Chỉ chuyển sang nhận đơn công khai sau khi các bước tương ứng đã được chính chủ xác nhận.

## Backup và khôi phục

Chạy `npm run db:backup -- --docker` để dùng SQLite `VACUUM INTO` tạo snapshot trong container và chép ra `data/backups`. Khi chạy backend local, đặt `DATABASE_URL` đúng database đang dùng rồi chạy `npm run db:backup`. Sao lưu thêm volume `uploads-data` và volume n8n cùng encryption key, lưu chúng ở nơi hạn chế truy cập.

Để khôi phục Docker, dừng frontend, backend và n8n. Giữ thêm bản sao database hiện tại. Chép backup vào volume `store-data` dưới tên `store.db` bằng container quản trị hoặc Docker Desktop, bảo đảm quyền ghi của backend. Khôi phục volume ảnh tương ứng, bật dịch vụ và kiểm tra health, số đơn, ảnh và tồn kho. Thử trên một volume riêng trước khi thay bản đang dùng. Không chép đè file DB khi backend đang ghi. [SQLite VACUUM INTO](https://www.sqlite.org/lang_vacuum.html).

## Bảng môi trường

Xem bảng biến đầy đủ trong [env-reference.md](env-reference.md). Secret thật chỉ đặt trong `.env` hoặc credential n8n.

## Tự nhắn riêng cho người bình luận (Private Reply)

Khi có người bình luận dưới bài viết của Page, backend gửi một tin nhắn riêng (lời chào, giá và link nếu bình luận nhắc tên sản phẩm, lời mời nhắn lại để được tư vấn). Meta chỉ cho trả lời riêng **một lần cho mỗi bình luận**, trong **7 ngày**.

Quyền cần có trên mã Trang (kiểm tra bằng debug_token): `pages_messaging`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_show_list`. Thiếu `pages_read_user_content` thì Meta không gửi sự kiện bình luận và không cho đọc bình luận.

Lấy mã Trang đủ quyền: Graph API Explorer → app Long Fish Bot → Mã người dùng → thêm đủ quyền trên → Generate Access Token → lưu vào `data/user-token.txt` → chạy `npx tsx scripts/meta-page-token.ts` (đổi sang mã Trang không hết hạn, từ chối ghi `.env` nếu thiếu quyền, tự xóa file tạm) → `docker compose up -d`.

Hai đường nhận bình luận, dùng cùng bộ xử lý và chống trùng theo mã bình luận:
1. Webhook `feed` của Meta (workflow Messenger, nhánh "Tách bình luận"). Khi app còn ở chế độ phát triển, Meta có thể không gửi sự kiện này.
2. Bộ quét dự phòng trong backend (`backend/src/comment-poller.ts`): mỗi `COMMENT_POLL_SECONDS` giây đọc bình luận mới dưới `COMMENT_POLL_POSTS` bài gần nhất, trong `COMMENT_POLL_LOOKBACK_MINUTES` phút gần nhất.

Biến cấu hình: `COMMENT_AUTOREPLY_ENABLED`, `COMMENT_KEYWORDS` (để trống = mọi bình luận), `COMMENT_MAX_PER_HOUR`, `COMMENT_POLL_*`. Đã kiểm chứng thật ngày 10/11/2026 với tài khoản có vai trò trong app: bình luận được nhắn riêng thành công. Chưa kiểm chứng với tài khoản ngoài app (cần Meta xét duyệt quyền).
