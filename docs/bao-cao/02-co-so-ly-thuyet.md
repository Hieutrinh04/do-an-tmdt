# 02. Cơ sở lý thuyết

## 2.1 Thương mại điện tử và bán hàng qua mạng xã hội

Thương mại điện tử là việc mua bán hàng hóa và dịch vụ qua mạng máy tính. Với cửa hàng nhỏ, kênh bán thường gồm mạng xã hội để tiếp cận và website để chốt đơn. Hai kênh này cần chung một nguồn dữ liệu về sản phẩm, giá và tồn kho để tránh bán trùng hoặc báo sai.

## 2.2 Chatbot và hội thoại có luật

Chatbot trên Messenger có thể xử lý theo luật (từ khóa, biểu thức chính quy, từ điển đồng nghĩa) hoặc dựa vào mô hình ngôn ngữ. Đồ án dùng luật và từ điển tiếng Việt có dấu, không dấu và viết tắt làm nền tảng, vì kết quả lặp lại được và kiểm thử được. Một lớp AI tùy chọn có thể được bật qua cấu hình, nhưng chưa được kiểm chứng với khóa thật. Bot luôn chuyển nhân viên khi không hiểu hai lần liên tiếp hoặc khi khách yêu cầu.

Messenger Platform gửi sự kiện qua webhook HTTPS. Mỗi sự kiện cần xác thực bằng token xác minh khi đăng ký và chữ ký `X-Hub-Signature-256` khi nhận tin. Chính sách gửi tin ngoài cửa sổ 24 giờ sau tin cuối của khách bị giới hạn bởi Meta; đồ án chỉ gửi tin trong cửa sổ cho phép và ghi lại trường hợp còn lại để người bán xử lý thủ công.

## 2.3 Tự động hóa quy trình với n8n

n8n là công cụ tự động hóa theo sơ đồ nút, có webhook làm điểm vào, các nút gọi API, ghi bảng tính, gửi email và lịch chạy định kỳ. Ưu điểm là người bán có thể xem và chỉnh luồng mà không sửa mã nguồn. Đồ án xuất năm workflow dưới dạng JSON để nhập lại được.

## 2.4 Webhook và tính nhất quán sự kiện

Khi backend phát sự kiện sang n8n, mạng có thể lỗi hoặc n8n có thể đang khởi động lại. Nếu gửi đồng bộ trong cùng yêu cầu của khách, một lỗi phụ có thể làm hỏng đơn đã lưu. **Outbox pattern** giải quyết việc này: sự kiện được ghi vào bảng `OutboxEvent` trong cùng giao dịch với đơn; một tiến trình nền đọc bảng này, gửi đi và đánh dấu đã gửi khi thành công, tự thử lại khi thất bại. Đơn không mất khi kênh bên ngoài tạm ngừng.

## 2.5 Giao dịch và kiểm soát tồn kho

Chống bán vượt tồn kho đòi hỏi kiểm tra và trừ kho trong cùng một giao dịch cơ sở dữ liệu. Có hai cách phổ biến: khóa bi quan (`SELECT ... FOR UPDATE`) trên PostgreSQL, và cập nhật có điều kiện (`UPDATE ... WHERE stock >= n`) kiểm tra số dòng bị ảnh hưởng. Đồ án dùng cập nhật có điều kiện kèm thử lại giao dịch khi xung đột, vì cách này chạy được trên cả SQLite lẫn PostgreSQL.

## 2.6 Tiền tệ và làm tròn

Giá tiền dùng số nguyên đồng (VND), không dùng số thực, để tránh sai số làm tròn. Tổng đơn được tính lại trên máy chủ theo công thức `total = subtotal + shippingFee + packingFee`.

## 2.7 Chính sách hàng sống

Cá sống có ba ràng buộc: số lượng tối thiểu theo phân loại, vùng giao hạn chế, và phí đóng gói giữ oxy. Khách phải chấp nhận chính sách hàng chết khi nhận (DOA) trước khi đặt. Những ràng buộc này được mã hóa trong cấu hình, không nằm rải rác trong giao diện.

## 2.8 Bảo mật ứng dụng web

Các biện pháp áp dụng: mật khẩu quản trị băm bằng bcrypt; JWT cho phiên quản trị; giới hạn tần suất theo IP cho đăng nhập, đặt hàng và tra cứu; khóa tạm đăng nhập sai theo IP cộng tên đăng nhập; kiểm tra đầu vào bằng Zod; khóa nội bộ `x-api-key` cho các endpoint dành cho n8n; header bảo mật qua Helmet; CORS chỉ cho miền website. Ảnh upload được kiểm tra bằng chữ ký tệp (magic bytes) và giới hạn 5 MB.

## 2.9 Kiểm thử phần mềm

Kiểm thử gồm nhiều tầng: kiểm thử đơn vị và tích hợp với Vitest; kiểm thử HTTP trên máy chủ thật; kiểm thử giao diện với Playwright trên trình duyệt Chromium ở hai khung hình (desktop 1366×800 và Pixel 7). Đo hiệu năng và khả năng truy cập bằng Lighthouse. Kiểm tra phụ thuộc bằng `npm audit`.
