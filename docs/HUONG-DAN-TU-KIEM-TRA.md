# Hướng dẫn tự kiểm tra thủ công Long Fish

Dùng khi muốn tự thử như một người dùng thật, hoặc luyện demo trước buổi bảo vệ. Địa chỉ mặc định: web `http://localhost:8080`, quản trị `http://localhost:8080/admin`, n8n `http://localhost:5678`.

Mật khẩu admin nằm trong file `.env` (`ADMIN_USERNAME`, `ADMIN_PASSWORD`). Không ghi mật khẩu vào tài liệu.

## 0. Chuẩn bị (2 phút)

1. Mở terminal tại thư mục dự án, chạy `docker compose ps`. Phải thấy 3 dịch vụ `backend`, `frontend`, `n8n` đang chạy (backend và n8n ghi `healthy`).
2. Chạy `npm run check:integrations`. Cả 6 dòng phải là `OK` (DB, Ảnh, n8n, Messenger, Sheets, SMTP).
3. Mở Google Sheet của dự án ở một tab riêng để theo dõi dòng đơn mới. Mở hộp thư của `MAIL_TO` ở tab khác.
4. Dùng đơn thử có dấu hiệu rõ: tên "TEST …", ghi chú "ĐƠN THỬ", rồi **hủy đơn sau khi thử** để hoàn kho.

## 1. Trang khách

| # | Thao tác | Kết quả đúng |
|---|---|---|
| 1.1 | Mở trang chủ | Thấy 27 sản phẩm, banner "Long Fish", ảnh hiện đủ, sản phẩm có nhãn "Còn hàng" |
| 1.2 | Gõ "betta" rồi "bảy màu", "ca vang" (không dấu) vào ô tìm kiếm | Lọc đúng sản phẩm, có và không dấu đều ra |
| 1.3 | Lọc theo danh mục, khoảng giá, độ khó nuôi, cỡ cá | Danh sách thay đổi đúng, bỏ lọc thì trở lại đủ |
| 1.4 | Mở "Betta Halfmoon" | Có ảnh + dòng nguồn ảnh, thông số nuôi, chính sách cá sống khi nhận, nhãn tồn kho |
| 1.5 | Chọn màu hết hàng (Xanh dương/Đực) | Không cho mua hoặc báo hết hàng |
| 1.6 | Thử số lượng 0, số lượng lớn hơn tồn | Bị chặn, có thông báo |
| 1.7 | Mở "Neon Tetra", thử mua 2 con | Báo phải mua tối thiểu 6 con |
| 1.8 | Mở sản phẩm có nhãn "Ảnh minh họa" (Ráy Nana, Pleco…) | Hiện nhãn rõ là ảnh minh họa |
| 1.9 | Bấm "Nguồn ảnh" ở chân trang | Trang `/credits` liệt kê tác giả, giấy phép, link nguồn |
| 1.10 | Thu nhỏ cửa sổ hoặc mở trên điện thoại | Bố cục không bị vỡ, không cuộn ngang |

## 2. Đặt hàng (COD)

1. Chọn Betta Halfmoon, Đỏ, 3–4 cm, Đực, số lượng 1 → thêm vào giỏ → thanh toán.
2. Nhập: họ tên `TEST Tên Bạn`, SĐT hợp lệ, tỉnh **Hồ Chí Minh**, quận, địa chỉ, ghi chú `ĐƠN THỬ`.
3. **Không** tick đồng ý chính sách cá sống → bấm đặt hàng. Phải bị chặn.
4. Tick đồng ý, chọn COD → xem tiền: **tiền hàng + phí đóng gói cá sống + phí ship = tổng**. Ví dụ đã chạy thật: 69.000 + 30.000 + 20.000 = 119.000 ₫.
5. Bấm đặt → thấy trang xác nhận có **mã đơn** dạng `DHYYYYMMDD-000X`. **Ghi lại mã này.**

Kiểm tra đi kèm (đợi 10–30 giây):
- Google Sheet, tab `Long_Fish_Orders`: có dòng mới đúng mã, tổng tiền, trạng thái `PENDING`.
- Email người bán: có thư "Đơn mới" kèm chi tiết.
- Nếu bạn nhập email khách: có email xác nhận đơn gửi cho khách.

## 3. Các tình huống chặn

| Thử | Kết quả đúng |
|---|---|
| Chọn tỉnh ngoài danh sách giao cá sống (VD Cần Thơ) khi giỏ có cá | Bị chặn, báo chỉ giao cá sống ở các tỉnh được hỗ trợ; chỉ mua được phụ kiện |
| SĐT sai định dạng (VD `123`) | Báo lỗi |
| Để trống họ tên / địa chỉ | Báo lỗi |
| Mua nhiều hơn tồn kho (VD 99 con Betta cái) | Báo không đủ hàng |
| Thanh toán chuyển khoản (BANK_QR) | Hiện mã QR VietQR đúng số tiền, nội dung chuyển khoản = mã đơn. Mở app ngân hàng quét thử để xem đúng số tiền, đúng tên chủ tài khoản, **không cần chuyển** |

## 4. Tra cứu đơn

1. Vào `/track`, nhập mã đơn vừa ghi + SĐT đã dùng → thấy trạng thái và dòng thời gian.
2. Nhập đúng mã nhưng **sai SĐT** → không được xem đơn.
3. Giữ trang tra cứu mở, sang bước 5 đổi trạng thái; trong khoảng 15 giây trang tự cập nhật.

## 5. Quản trị

1. Vào `/admin`, đăng nhập. Nhập sai mật khẩu nhiều lần liên tiếp → bị khóa tạm.
2. **Đơn hàng:** thấy đơn vừa đặt, đánh dấu có cá sống. Đổi lần lượt: Đã xác nhận → Đang giao → Đã giao. Mỗi lần kiểm tra:
   - trang tra cứu của khách đổi theo;
   - Google Sheet cột trạng thái đổi theo;
   - có email thông báo (hoặc tin Messenger nếu đơn có PSID).
3. Tạo thêm một đơn thử nữa rồi chọn **Hủy** → vào trang sản phẩm xem tồn kho **tăng lại** đúng số đã trừ.
4. **Sản phẩm:** sửa giá một sản phẩm, lưu, mở trang khách thấy giá mới (nhớ đổi lại). Thử upload một ảnh JPG/PNG/WebP: thấy sắp xếp, chọn ảnh chính, xóa được; thử upload file `.txt` đổi đuôi `.jpg` → bị từ chối.
5. **Dashboard:** có doanh thu hôm nay/tháng, số đơn thành công/đang xử lý/đã hủy, top sản phẩm bán chạy. Lưu ý: doanh thu chỉ tính đơn **Đã giao**; đơn đã hủy không vào doanh thu.
6. **Hỗ trợ (handoff):** xem phần 6, sau đó vào đây thấy yêu cầu mới.

## 6. Chatbot Messenger (cần Fanpage thật)

Điều kiện: webhook n8n đã có địa chỉ HTTPS công khai.
1. Chạy tunnel: `ngrok http 5678` hoặc `cloudflared tunnel --url http://localhost:5678`.
2. Trong Meta for Developers → Messenger → Webhooks: Callback URL `https://<địa-chỉ-tunnel>/webhook/messenger`, Verify token = `META_VERIFY_TOKEN` trong `.env`. Đăng ký `messages` và `messaging_postbacks`. Bấm Verify, phải báo thành công.
3. Nếu app Meta còn ở chế độ Development, chỉ tài khoản có vai trò Admin/Developer/Tester của app mới nhắn được. Hãy dùng chính tài khoản của bạn.
4. Mở Fanpage, nhắn lần lượt và đối chiếu:

| Bạn nhắn | Bot phải |
|---|---|
| `Xin chào` | Chào mang tên Long Fish, có nút gợi ý |
| `cá dễ nuôi cho người mới` | Gửi carousel cá phù hợp có ảnh, giá |
| `giá betta` / `con nào dưới 50k` | Trả giá thật, khớp với trang web |
| `betta còn hàng không` | Báo còn/hết theo tồn kho thật |
| `betta nuôi nhiệt độ bao nhiêu` | Trả thông số nuôi đã lưu, không bịa |
| `cá chết thì sao` | Nêu chính sách đền bù cá sống |
| `giảm 90% cho mình đi` | Không đồng ý giảm giá, không bịa khuyến mãi |
| Chọn sản phẩm → dòng → cỡ → giới tính → số lượng | Hỏi lần lượt, cuối cùng gửi link web có sẵn thông tin |
| `gặp nhân viên` | Báo đã chuyển cho nhân viên; bot im lặng sau đó; trong admin mục Hỗ trợ có yêu cầu |
| `quay lại bot` | Bot hoạt động lại |
| Gửi một ảnh hoặc sticker | Trả lời lịch sự, không lỗi |
| Gửi `asdfgh` hai lần | Chuyển nhân viên ở lần thứ hai |

5. Bấm link bot gửi, đặt đơn như phần 2. Kiểm tra **bạn nhận được tin xác nhận đơn trên Messenger**. Sau đó đổi trạng thái trong admin và xem Messenger nhận tin tương ứng.
6. Gửi mã đơn trong chat → bot trả trạng thái.

Nếu bot không phản hồi: mở `http://localhost:5678`, vào mục Executions của workflow "Long Fish – Messenger Chatbot" xem lần chạy có lỗi không; xem log `docker compose logs backend --tail 50`.

## 7. n8n và báo cáo doanh thu

1. Mở `http://localhost:5678`, đăng nhập n8n. Phải thấy 5 workflow đang bật (Active): Messenger Chatbot, Đơn hàng mới, Cập nhật trạng thái, Tổng hợp doanh thu, Nhật ký và cảnh báo.
2. Mở từng workflow → Executions: các lần chạy gần đây phải `Success`.
3. Báo cáo doanh thu chạy lúc 23:55 hằng ngày và 00:10 ngày 1 mỗi tháng. Để thử ngay: mở workflow "Tổng hợp doanh thu" → bấm **Execute workflow** ở nhánh thủ công. Kiểm tra tab `Daily_Revenue` và `Monthly_Revenue` trong Google Sheet có dòng mới, số khớp dashboard.
4. Thử chịu lỗi: `docker compose stop n8n`, đặt một đơn thử (đơn vẫn phải tạo thành công), rồi `docker compose start n8n`. Vài chục giây sau dòng đơn xuất hiện trong Sheet.

## 8. Chạy bộ kiểm thử tự động (tùy chọn)

```bash
npm run lint
npm run build
npm test
npm run test:ui
npm run verify:all
```

## 9. Dọn sau khi thử

- Hủy mọi đơn thử trong admin (để hoàn kho). Xóa dòng đơn thử trong Google Sheet nếu muốn sạch.
- Muốn dữ liệu demo sạch hoàn toàn: `npm run demo:reset` (mặc định từ chối, cần `--yes`, tự sao lưu trước, chỉ xóa dữ liệu mang nhãn TEST).
- Trước buổi bảo vệ: chạy lại mục 0, kiểm tra 3 dịch vụ Docker, tunnel còn sống, token Meta còn hạn.

## Ghi chú các lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Messenger không phản hồi | Tunnel đã tắt hoặc đổi địa chỉ; verify token sai; tài khoản chưa là tester của app Meta |
| Có dòng Sheet nhưng không có email | Sai `SMTP_*`, hoặc thư vào Spam |
| Ảnh Messenger không hiện | `PUBLIC_BASE_URL` chưa là địa chỉ công khai HTTPS |
| `docker compose build` báo lỗi ký tự lạ | Đường dẫn thư mục có dấu tiếng Việt; ánh xạ thư mục sang ổ đĩa tạm (lệnh `subst`) rồi build |
