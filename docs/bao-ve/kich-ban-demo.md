# Kịch bản demo 10 phút

Người thuyết trình mở website, n8n và trang admin trước khi bắt đầu. Dùng dữ liệu giả, số điện thoại mẫu 0900000001, địa chỉ ghi “Địa chỉ kiểm thử”. Chọn một phân loại Betta còn ít nhất hai con và một phân loại Neon có minQty=6. Chụp hoặc tải ảnh có quyền sử dụng cho phụ kiện trước buổi trình bày.

| Thời gian | Người thao tác và màn hình | Thao tác | Câu thoại gợi ý |
|---|---|---|---|
| 0–1 phút | Người thuyết trình, sơ đồ kiến trúc | Mở kien-truc.md | “SQLite là nguồn dữ liệu chính. n8n nhận sự kiện sau khi đơn đã được commit.” |
| 1–2 phút | Khách, Messenger hoặc terminal | Chào, hỏi cá dễ nuôi, chọn Betta Halfmoon, màu, cỡ, giới tính và số lượng | “Bot đọc tồn thật, lưu ngữ cảnh theo PSID và đưa khách đến trang sản phẩm.” |
| 2–3 phút | Khách, trang chi tiết | Xem ảnh, chọn phân loại, thử minQty | “Thông số nuôi và chính sách cá sống giúp khách kiểm tra trước khi đặt.” |
| 3–4 phút | Khách, checkout | Chọn tỉnh ngoài vùng để thấy chặn, đổi về Hồ Chí Minh, xác nhận DOA, đặt COD | “Server tính lại toàn bộ tiền và trừ kho trong transaction.” |
| 4–5 phút | Người bán, n8n và CSV/Sheet | Mở execution đơn mới, tìm mã đơn trong CSV hoặc Sheet, xem log thông báo | “Nếu n8n tạm dừng, đơn vẫn được lưu và outbox gửi lại.” |
| 5–6 phút | Khách, checkout và xác nhận | Đặt đơn VietQR khác, đối chiếu amount và addInfo, gọi webhook đối soát mô phỏng | “Webhook chỉ ghi PAID khi đúng mã và đúng số tiền; gửi lặp không tạo thêm thông báo.” |
| 6–7 phút | Admin, Đơn hàng | COD qua CONFIRMED → SHIPPING → DELIVERED, khách mở Tra cứu | “Mỗi lần đổi trạng thái có lịch sử. Tra cứu cần mã đơn và số điện thoại khớp.” |
| 7–8 phút | Admin, Đơn hàng và Sản phẩm | Hủy đơn QR còn PENDING, đối chiếu kho | “Chuyển trạng thái sai bị từ chối. Hủy hợp lệ hoàn đúng số lượng.” |
| 8–9 phút | Admin, Dashboard và Hỗ trợ | Xem doanh thu, top sản phẩm, gửi hai câu bot không hiểu rồi xử lý xong | “Doanh thu chỉ gồm đơn đã giao; top tính cả cá và phụ kiện, dữ liệu biểu đồ đọc từ database.” |
| 9–10 phút | Admin, Sản phẩm và Nguồn ảnh | Upload ảnh, chọn chính, lưu, mở /credits và trình bày hạn chế | “Ảnh tự cung cấp được ghi nguồn riêng. Một số tích hợp thật còn cần tài khoản và quyền của chủ shop.” |

## Chuẩn bị dữ liệu và xác minh

1. Chạy `npm run lint`, `npm run build`, `npm test`, `npm run check:integrations -- --docker`.
2. Dùng `npm run db:backup -- --docker` trước khi tạo đơn demo. Kiểm tra website http://localhost:8080 và n8n http://localhost:5678.
3. Ghi lại tài khoản admin theo README. Đăng nhập sẵn trên máy trình chiếu. Giữ secret ngoài màn hình chia sẻ.
4. Kiểm tra tồn của phân loại sẽ dùng. Sau demo hủy các đơn còn chờ theo luồng admin, giữ các đơn đã giao làm minh chứng và ghi rõ là dữ liệu thử.
5. Chạy `npm run simulate -- "Xin chào" "Cá dễ nuôi cho người mới" "Betta Halfmoon" "Đỏ" "3–4 cm" "Đực" "2"` để kiểm tra bot mock.

## Phương án dự phòng

Mất Facebook hoặc chưa được app review thì dùng `MOCK_INTEGRATIONS=true` và lệnh simulate, mở workflow n8n cùng log backend. Mất Google/SMTP thì mở `Long_Fish_Orders.csv` trong `/data/mock` và log Email mock. Mất Internet vẫn dùng ảnh local, SVG, đơn COD và QR URL mẫu. Ảnh VietQR tải từ dịch vụ ngoài cần mạng, khi mất mạng chỉ trình bày URL số tiền/nội dung và báo rõ chưa tải được QR.

Nếu trình duyệt điều khiển tự động bị chặn, người thuyết trình tự thao tác theo bảng. Chỉ dùng ảnh chụp hiện có với ghi chú ngày và phiên bản. Kết quả API nằm trong `docs/e2e-results.json`, các mục chưa kiểm chứng trong `docs/test-report.md`.
