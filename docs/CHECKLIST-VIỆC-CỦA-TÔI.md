# Việc chủ dự án cần làm

1. [x] Tạo Facebook App và Fanpage, lấy Page Access Token, App Secret, Verify Token, cấu hình webhook HTTPS và quyền Messenger. [Facebook và Messenger](GO-LIVE.md#facebook-và-messenger)
2. [x] Tạo Google Service Account, cấp quyền trên Sheet, nhập Sheet ID và cấu hình credential của n8n. [Google Sheets](GO-LIVE.md#google-sheets)
3. [x] Tạo Gmail App Password hoặc chuẩn bị SMTP, cấu hình người nhận và credential n8n. [Email người bán và VietQR](GO-LIVE.md#email-người-bán-và-vietqr)
4. [ ] Nhập ngân hàng, số tài khoản và tên chủ tài khoản VietQR, đối chiếu bằng ứng dụng ngân hàng. [Email người bán và VietQR](GO-LIVE.md#email-người-bán-và-vietqr)
5. [ ] Nếu dùng ảnh stock, tạo khóa Pexels hoặc Pixabay và nhập vào `.env`. Chỉ chọn ảnh đã kiểm tra quyền sử dụng và đúng sản phẩm. [Ảnh sản phẩm](GO-LIVE.md#ảnh-sản-phẩm)
6. [ ] Chụp ảnh 10 mẫu đang dùng SVG và chụp thêm góc thứ hai cho các mẫu được đánh dấu. Upload trong quản trị. [Ảnh sản phẩm](GO-LIVE.md#ảnh-sản-phẩm)
7. [x] Chạy `npm run check:integrations`, sau đó đổi `MOCK_INTEGRATIONS=false` và khởi động lại các dịch vụ liên quan. [Kiểm tra trước khi nhận đơn](GO-LIVE.md#kiểm-tra-trước-khi-nhận-đơn)
8. [ ] Từ tài khoản thử trên Messenger, đặt một đơn thật có kiểm soát. Đối chiếu mã đơn, tồn, Sheet, email và tin trả về. [Kiểm tra trước khi nhận đơn](GO-LIVE.md#kiểm-tra-trước-khi-nhận-đơn)

## Còn lại (cập nhật 10/11/2026)

- [ ] Nhắn thử "Xin chào" vào Trang từ tài khoản quản trị ứng dụng và xác nhận bot trả lời.
- [ ] Điền VietQR (mục 4) và chuyển khoản thử một đơn nhỏ.
- [ ] Đặt một đơn thật có email để kiểm tra email gửi khách, sau đó hủy đơn trong admin.
- [ ] Đổi lại các khóa đã gửi qua chat: mật khẩu admin, App Secret và token Trang, khóa Service Account, mật khẩu ứng dụng Gmail.
- [ ] Gửi xét duyệt quyền `pages_messaging` với Meta khi muốn bot trả lời mọi khách.
- [ ] Chọn tên miền và máy chủ cố định thay cho tunnel tạm ([DEPLOY.md](DEPLOY.md)).
- [ ] Chụp 7 sản phẩm còn ảnh minh họa ([images-todo.md](images-todo.md)).
