# 06. Kết luận

## 6.1 Kết quả đạt được

1. Hoàn thành website bán cá cảnh có danh mục, lọc, tìm kiếm có dấu và không dấu, chi tiết theo phân loại, giỏ và checkout với COD và VietQR, tra cứu đơn tự cập nhật.
2. Hoàn thành trang quản trị: đăng nhập, lọc và xử lý đơn theo luồng trạng thái, hoàn kho khi hủy, ghi chú nội bộ, lịch sử thay đổi, in phiếu đóng gói A6, xuất CSV, thống kê doanh thu ngày và tháng, quản lý sản phẩm và ảnh.
3. Chống bán vượt tồn kho được kiểm tra ở máy chủ trong giao dịch, và đã được chứng minh bằng kiểm thử đồng thời trên PostgreSQL.
4. Quy tắc cá sống (số lượng tối thiểu, vùng giao, phí đóng gói, chính sách DOA) được chặn cả ở giao diện lẫn API.
5. Năm workflow n8n đã chạy với dữ liệu mock; luồng đơn mới, cập nhật trạng thái và tổng hợp doanh thu đã được chạy thủ công và đối chiếu với cơ sở dữ liệu.
6. Chatbot xử lý 88 câu kiểm thử với độ chính xác 100% trên bộ câu do nhóm tự soạn, và chuyển nhân viên đúng khi cần.
7. Triển khai bằng Docker Compose, có cấu hình HTTPS, sao lưu và khôi phục đã diễn tập.
8. Kiểm thử tự động gồm test đơn vị và HTTP, Playwright trên desktop và điện thoại, Lighthouse mobile đạt từ 98 điểm trở lên ở các trang chính.

## 6.2 Hạn chế trung thực

- **Dịch vụ thật mới kiểm chứng từng phần.** Messenger, Google Sheets và Gmail đã kết nối bằng tài khoản thật và `check:integrations` báo OK, nhưng chưa có một đơn thật đi trọn luồng từ tin nhắn khách tới Sheet và email. Ứng dụng Meta còn ở chế độ phát triển nên chỉ tài khoản quản trị nhận được trả lời. Hệ thống đang chạy trên máy cá nhân qua tunnel tạm, chưa có máy chủ và tên miền cố định. Tài khoản ngân hàng VietQR chưa được cấu hình.
- **Chatbot dựa trên luật.** Độ chính xác 100% chỉ có nghĩa là các câu trong bộ kiểm thử được xử lý đúng; nó không đảm bảo mọi cách diễn đạt của khách. Bộ câu do chính nhóm soạn nên có thiên lệch. Lớp AI tùy chọn chưa được thử với khóa thật.
- **Ảnh sản phẩm chưa đầy đủ.** 20/27 sản phẩm có ảnh thật; phần còn lại dùng SVG minh họa. Một số mẫu chưa có ảnh góc thứ hai.
- **Cron chưa quan sát ở giờ thật.** Workflow tổng hợp đã được chạy thủ công cả hai nhánh và đối chiếu kết quả; lịch 23:55 và 00:10 mới được rà cấu hình.
- **Chưa kiểm thử nhiều instance.** Hệ thống chạy một backend; outbox và kho đã được kiểm thử với nhiều request đồng thời, nhưng chưa với nhiều tiến trình backend.
- **Bảo mật chưa đủ cho sản xuất.** Dependency phát triển và image nền còn lỗ hổng được ghi nhận trong báo cáo kiểm thử và cần cập nhật trước khi đưa lên mạng công khai.
- **Chưa có hệ thống nhắn ngoài cửa sổ 24 giờ.** Khi cửa sổ đóng, hệ thống ghi lại để người bán xử lý thủ công.
- **Chưa có thanh toán trực tuyến qua cổng thẻ**, và đối soát chuyển khoản mới là webhook sẵn sàng nhận dữ liệu từ dịch vụ ngân hàng thật.

## 6.3 Bài học

- Đặt quy tắc nghiệp vụ trong mã có kiểm thử thay vì trong các nút n8n giúp thay đổi an toàn hơn và kiểm chứng được.
- Outbox tốn thêm một bảng và một tiến trình nền, nhưng loại bỏ hẳn tình huống đơn mất khi kênh bên ngoài lỗi.
- Kiểm thử trên trình duyệt thật phát hiện lỗi mà kiểm thử API không thấy, ví dụ phản hồi trễ ghi đè đơn đang mở.
- Tách rõ “đã chạy trong môi trường kiểm thử” và “đã kiểm chứng với dịch vụ thật” giúp báo cáo trung thực hơn.

## 6.4 Hướng phát triển

1. Nối Messenger, Sheets và SMTP thật; thử một đơn thật có kiểm soát.
2. Mở rộng bộ câu kiểm thử bot với khách thật và đo lại độ chính xác; cân nhắc lớp AI có kiểm soát cho câu ngoài luật.
3. Hoàn thiện ảnh sản phẩm theo đúng quyền sử dụng.
4. Chuyển sang PostgreSQL khi có nhiều người bán hoặc nhiều tiến trình backend.
5. Thêm đối soát chuyển khoản với dịch vụ ngân hàng được hỗ trợ và thông báo tự động cho khách.
6. Cập nhật image nền và các dependency phát triển, rồi quét lại trước khi triển khai công khai.
