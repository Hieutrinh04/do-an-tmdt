# Kịch bản video demo 5 phút

Mục tiêu: chứng minh luồng đặt cá từ tin nhắn đến quản trị và thống kê, và nói rõ phần nào là dữ liệu mock. Quay trên stack kiểm thử cách ly hoặc bản demo sạch (`http://localhost:18082`), không dùng dữ liệu khách thật. Mọi số điện thoại và tên trong video là giả.

| Cảnh | Thời lượng | Màn hình | Lời thoại (gợi ý) |
|---|---|---|---|
| 1. Mở đầu | 0:00–0:25 | Trang chủ, danh mục 27 sản phẩm | "Long Fish là cửa hàng cá cảnh online. Đồ án này nối Messenger, website, n8n và trang quản trị vào một kho dữ liệu chung." |
| 2. Chatbot tư vấn | 0:25–1:05 | Cửa sổ chat mô phỏng (`npm run simulate`), gõ "cá betta dưới 300k cho người mới" | "Bot hiểu tiếng Việt có dấu và không dấu, gợi ý theo ngân sách và độ khó, rồi gửi liên kết đặt hàng. Bot không tự nêu giá; giá lấy từ API." |
| 3. Chọn cá | 1:05–1:40 | Chi tiết Betta Halfmoon: chọn dòng, cỡ, giới tính, số lượng | "Số lượng không được dưới mức tối thiểu và không vượt tồn kho. Thông số nuôi và cam kết cá sống hiển thị ngay." |
| 4. Chặn quy tắc | 1:40–2:00 | Checkout, chọn tỉnh An Giang với cá sống | "Cá sống chỉ giao trong vùng cấu hình. Nút đặt hàng bị khóa cho tới khi khách chấp nhận chính sách DOA." |
| 5. Đặt hàng | 2:00–2:30 | Chọn Hồ Chí Minh, COD; sau đó đơn VietQR; màn hình cảm ơn với mã đơn | "Tổng tiền do máy chủ tính lại, gồm tiền hàng, phí giao và phí đóng gói. Mã đơn và mã QR đều có số tiền đúng." |
| 6. Quản trị đơn | 2:30–3:05 | Đăng nhập admin, mở đơn, đổi trạng thái đến "Đã giao", thử hủy đơn khác | "Đổi trạng thái theo luồng hợp lệ. Khi hủy, số lượng được hoàn về kho. Lịch sử được ghi lại." |
| 7. In phiếu và xuất CSV | 3:05–3:25 | Nút "In phiếu A6", hộp thoại in; nút "Xuất CSV" | "Phiếu đóng gói có dòng cảnh báo hàng sống và mã QR tra cứu. CSV có chống chèn công thức." |
| 8. Tra cứu của khách | 3:25–3:45 | Trang tra cứu, nhập mã và SĐT; cho thấy trạng thái tự cập nhật | "Khách tra cứu bằng mã đơn và số điện thoại; trang tự làm mới mỗi 15 giây." |
| 9. Thống kê và n8n | 3:45–4:20 | Dashboard doanh thu ngày, tháng, top sản phẩm; màn hình n8n với 5 workflow | "Doanh thu chỉ tính đơn đã giao. Workflow tổng hợp chạy 23:55 mỗi ngày. Đã chạy thủ công và đối chiếu với cơ sở dữ liệu." |
| 10. Kiểm thử và giới hạn | 4:20–4:50 | `docs/test-report.md`, bảng PASS/FAIL, Lighthouse | "Playwright chạy 3 lần liên tiếp đều đạt. Chưa kết nối Facebook, Google và SMTP thật; các phần này là mock và đã ghi rõ." |
| 11. Kết thúc | 4:50–5:00 | Logo, tên sinh viên, `[TRƯỜNG]` | "Cảm ơn thầy cô đã theo dõi." |

## Chuẩn bị trước khi quay

1. Chạy stack kiểm thử hoặc bản demo sạch; xác nhận `/api/health` trả về OK.
2. Kiểm tra admin có mật khẩu ghi trong volume, không đọc to trong video.
3. Tắt thông báo hệ điều hành; đặt trình duyệt ở cỡ 1366×800.
4. Tạo sẵn một đơn COD và một đơn VietQR để có mã đối chiếu trong cảnh 6 và 8.
5. Không quay phần chứa khóa, token hoặc dữ liệu thật của khách.

## Lưu ý khi thuyết minh

- Nói rõ "mock" ở cảnh 10 để không bị hiểu là đã nối dịch vụ thật.
- Nếu chạy thời gian thực không kịp, dùng ảnh chụp trong `docs/screenshots/` cho các cảnh 7 và 9.
