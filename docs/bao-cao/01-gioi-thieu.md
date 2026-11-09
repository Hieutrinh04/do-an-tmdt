# 01. Giới thiệu

## 1.1 Bối cảnh

Cá cảnh là mặt hàng phổ biến nhưng khó bán online. Khách thường hỏi qua tin nhắn về loài, dòng, cỡ, giới tính, giá và thời điểm nhận. Với cá sống, mỗi đơn còn phải kiểm soát tồn kho theo số lượng tối thiểu, vùng giao, phí đóng gói giữ oxy và chính sách hàng chết khi nhận (DOA). Người bán nhỏ thường ghi đơn bằng tay, dễ sai tồn kho và khó theo dõi doanh thu theo ngày hoặc tháng.

Đồ án chọn cửa hàng cá cảnh **Long Fish** làm bối cảnh triển khai. Mô hình gồm ba lớp: kênh hội thoại Messenger để tư vấn, website để chốt đơn và tra cứu, và một trang quản trị để người bán xử lý đơn.

## 1.2 Mục tiêu

1. Xây dựng website bán hàng có danh mục, phân loại theo dòng, cỡ, giới tính và số lượng tối thiểu.
2. Chặn đơn vượt tồn kho và đơn cá sống ngoài vùng giao bằng kiểm tra ở máy chủ, không tin dữ liệu từ trình duyệt.
3. Tự động hóa các việc lặp lại bằng n8n: nhận tin nhắn, ghi Google Sheets, gửi thông báo, email người bán và tổng hợp doanh thu.
4. Cung cấp trang quản trị đủ dùng cho người bán cá: theo dõi đơn, đổi trạng thái, in phiếu đóng gói, xuất CSV và xem thống kê.
5. Kiểm thử đủ để chứng minh luồng chính chạy đúng trên môi trường cách ly, đồng thời ghi rõ phần nào chưa kiểm chứng.

## 1.3 Phạm vi

**Trong phạm vi:** cửa hàng và giỏ hàng, checkout với COD và chuyển khoản VietQR, tra cứu đơn, trang quản trị, chatbot Messenger ở mức luật và từ điển tiếng Việt, năm workflow n8n, đóng gói Docker, cấu hình HTTPS triển khai, kiểm thử tự động và tài liệu.

**Ngoài phạm vi:** thanh toán trực tuyến qua cổng thẻ, nhiều chi nhánh, vận đơn của đơn vị vận chuyển, ứng dụng di động riêng, và các chương trình khuyến mãi tự động. Bot không tự bịa giá, tồn kho, khuyến mãi hay thời gian giao; khi thiếu thông tin thì chuyển nhân viên.

## 1.4 Đối tượng sử dụng

- **Khách hàng:** nhắn tin trên Fanpage, mở liên kết web để chọn và đặt hàng, tra cứu trạng thái.
- **Người bán (chủ cửa hàng):** đăng nhập quản trị để xử lý đơn, cập nhật sản phẩm, xem doanh thu và in phiếu.
- **Hệ thống tự động:** n8n và các tiến trình nền gửi, đồng bộ và tổng hợp dữ liệu.

## 1.5 Đóng góp của đồ án

- Mô hình kho cho cá sống gồm số lượng tối thiểu theo phân loại, phí đóng gói và chính sách DOA, được kiểm tra cả ở giao diện và API.
- Cơ chế outbox để đơn không bị mất khi n8n tạm ngừng, và để việc đổi trạng thái đơn không phụ thuộc vào kết nối tới n8n.
- Đối soát chuyển khoản qua webhook có khóa bí mật, khớp mã đơn và số tiền tuyệt đối.
- Bộ kiểm thử tự động gồm test đơn vị, test HTTP trên SQLite và PostgreSQL, và Playwright trên desktop và điện thoại.
