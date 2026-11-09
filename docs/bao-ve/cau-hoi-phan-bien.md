# 20 câu hỏi phản biện

1. **Vì sao không dùng Google Sheets làm database chính?** Sheets là bản sao vận hành. Đơn, kho và lịch sử lưu trong SQLite để giữ transaction. n8n đọc đơn đã commit trước khi upsert theo code.
2. **Hai khách mua món cuối thì sao?** updateMany giảm stock với điều kiện stock >= quantity trong transaction. Một yêu cầu thất bại nhận 409. Test chạy tám request đồng thời và kiểm tra chỉ một thành công.
3. **Khách sửa giá gửi lên có được không?** API chỉ nhận variantId và quantity cho dòng hàng. Server đọc giá và priceOverride, tính lại phí giao và đóng gói.
4. **n8n tắt có mất đơn không?** Đơn và OutboxEvent commit cùng transaction. Worker thử lại, tăng attempts, đặt availableAt bằng backoff giới hạn 300 giây.
5. **Gửi thông báo có exactly-once không?** Chưa. Sheets upsert chống trùng hàng và webhook Messenger dedupe mid, nhưng email hoặc tin gửi có thể lặp khi retry sau lỗi giữa chừng.
6. **Mã đơn tăng thế nào?** OrderSequence có khóa ngày, tăng trong transaction. Order.code unique, có prefix DH cùng ngày theo múi giờ Việt Nam.
7. **Hủy đơn có hoàn kho hai lần?** changeStatus kiểm tra trạng thái hiện tại và updateMany có điều kiện. Gửi lại cùng trạng thái trả dữ liệu hiện có trước bước hoàn kho.
8. **Ai được đọc đơn?** Khách cần code cùng số điện thoại khớp. Admin dùng JWT. API nội bộ dùng x-api-key và không mở qua Nginx public.
9. **Bảo vệ tài khoản admin ra sao?** Mật khẩu bcrypt, login giới hạn lần sai, JWT HS256 có audience và hạn tám giờ. Cần HTTPS và bảo vệ thiết bị admin khi chạy thật.
10. **Webhook Facebook có giả mạo được không?** Workflow kiểm HMAC SHA-256 trên raw body với App Secret ở chế độ thật. Mock bỏ kiểm chữ ký để dùng simulate, nên không để mock trên môi trường công khai.
11. **Ảnh upload có thể chứa mã thực thi không?** Chỉ nhận JPEG/PNG/WebP, kiểm magic bytes, MIME và giải mã bằng Sharp. Chỉ lưu WebP đã tạo lại, UUID thay tên gốc, không phục vụ tệp tùy ý.
12. **Ảnh có bản quyền không?** Ảnh tải qua Commons/Openverse có tác giả và giấy phép, ghi /credits. Ảnh admin tải có nhãn Long Fish cung cấp, chủ shop phải có quyền sử dụng.
13. **Vì sao có sản phẩm còn SVG?** Mười sản phẩm chưa có ảnh đủ điều kiện xác minh. images-todo.md ghi loại ảnh cần tự chụp. Nhãn Ảnh minh họa giúp khách nhận biết.
14. **QR có xác nhận đã thanh toán không?** Có nếu bật webhook ngân hàng: `POST /api/payments/bank` kiểm secret, mã đơn, đúng số tiền, chống gửi lặp rồi ghi PAID và phát thông báo. Không cấu hình webhook thì admin đánh dấu PAID sau khi đối chiếu sao kê. Chưa kiểm chứng với ngân hàng thật.
15. **Doanh thu tính ngày nào?** Đơn DELIVERED được nhóm theo createdAt, chuyển sang Asia/Ho_Chi_Minh. Nếu giao muộn cần chạy lại báo cáo kỳ đặt đơn để cập nhật bản sao Sheet.
16. **Vì sao doanh thu danh mục khác tổng doanh thu?** Danh mục cộng unitPrice × quantity. Tổng doanh thu cộng cả shippingFee và packingFee của đơn đã giao.
17. **Gửi Messenger sau 24 giờ ra sao?** Code kiểm lastInboundAt. Ngoài cửa sổ chuyển yêu cầu hỗ trợ cho admin, cần quyền/mẫu hợp lệ theo Meta trước khi bổ sung gửi tự động. Cơ chế ngoài cửa sổ chưa được kiểm chứng bằng tài khoản thật.
18. **Chuyển sang PostgreSQL có chạy ngay không?** Helper hỗ trợ tạo schema provider PostgreSQL theo DATABASE_URL. Cần kiểm thử trên máy PostgreSQL thực tế, dữ liệu cũ và migration production không được chứng minh chỉ bằng SQLite test.
19. **Backup có nhất quán khi đang ghi không?** db:backup dùng VACUUM INTO tạo bản sao SQLite. Phải backup thêm ảnh và n8n credential/encryption key, thử khôi phục vào volume riêng.
20. **Chi phí và giới hạn mở rộng?** Demo chạy ba container tại máy. Chạy thật cần máy chủ, HTTPS/tên miền hoặc tunnel, email, tài khoản dịch vụ và theo dõi quota. Giá cụ thể chưa khảo sát. Khi tăng tải cần PostgreSQL, worker có cơ chế claim đa tiến trình, object storage và theo dõi retry/idempotency.
