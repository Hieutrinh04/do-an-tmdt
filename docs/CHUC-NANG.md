# Chức năng thương mại – đối chiếu Phần D của hướng dẫn đồ án

File hướng dẫn viết cho WooCommerce; dự án này là ứng dụng React + Node riêng nên mỗi mục được thực hiện bằng mã tương ứng. Kiểm chứng: 177 test backend (`npm test`), Playwright (`npm run test:ui`), `docs/seo-audit.json`.

## D1. Sản phẩm & kho hàng

| Yêu cầu | Hiện trạng |
|---|---|
| Nhiều sản phẩm, có biến thể (size/màu) | 27 sản phẩm, 71 phân loại (dòng/màu, cỡ cm, giới tính), mỗi phân loại có giá riêng và ảnh theo sản phẩm. Phân loại hiển thị bằng nút bấm (không chỉ dropdown) |
| Quản lý tồn kho, ngưỡng thấp, "Chỉ còn X" | Mọi phân loại có tồn kho; trừ kho trong giao dịch khi đặt, hoàn kho khi hủy; trang sản phẩm báo **"Chỉ còn N con!"** khi tồn ≤ ngưỡng (`lowStockThreshold`, mặc định 5); admin có cảnh báo tồn thấp |
| SKU duy nhất | Mỗi phân loại có SKU duy nhất (ràng buộc cơ sở dữ liệu) |
| **Giá khuyến mãi** (giá gốc gạch ngang, giá sau giảm, % tiết kiệm, **lịch sale**) | Mới: `salePrice`, `saleStartsAt`, `saleEndsAt` trên sản phẩm. Hiển thị giá gốc gạch ngang + giá giảm + "Tiết kiệm X (−Y%)" ở thẻ sản phẩm và trang chi tiết. Giá luôn do máy chủ tính theo thời điểm đặt hàng (hết lịch là hết giảm). Dữ liệu mẫu: 5 sản phẩm có khuyến mãi, 3 sản phẩm có lịch kết thúc. Admin sửa ở form sản phẩm (kiểm tra giá sale < giá gốc, ngày kết thúc sau ngày bắt đầu) |
| **Upsell / Cross-sell** (≥3 sản phẩm) | Mới: bảng `ProductLink`. Trang sản phẩm có "Mua kèm cho bể của bạn" và "Bạn có thể thích hơn"; giỏ hàng gợi ý mua kèm. Dữ liệu mẫu: 5 sản phẩm có liên kết. Admin chỉnh trong form sản phẩm (nhập slug) |

## D2. Giỏ hàng (`/gio-hang`) và mini cart

- Dòng giỏ có ảnh, tên + phân loại, giá đơn vị (kèm giá gốc nếu giảm), ô số lượng, thành tiền, nút xóa. Đổi số lượng **cập nhật ngay** (không cần nút).
- Ô **mã giảm giá** + nút "Áp dụng", thông báo rõ khi hợp lệ / không tồn tại / hết hạn / chưa đủ điều kiện.
- **Phí giao ước tính theo tỉnh/thành** ngay trong giỏ; tổng gồm Tổng phụ, Phí vận chuyển, Mã giảm giá, Đóng gói cá sống, Tổng cộng.
- Nút "Tiếp tục mua sắm" và "Tiến hành thanh toán" nổi bật.
- **Mini cart** trên header: huy hiệu số lượng (cập nhật ngay), rê chuột/bấm hiện ảnh, tên, giá, tổng tạm tính, nút "Xem giỏ hàng" và "Thanh toán".
- Trang sản phẩm có "Thêm vào giỏ" và "Mua ngay".

## D3. Thanh toán (`/checkout`) và trang cảm ơn

| Trường | Cấu hình |
|---|---|
| Họ và tên, Số điện thoại, **Email** | Bắt buộc; email kiểm tra định dạng, dùng gửi xác nhận |
| Địa chỉ | Bắt buộc: Tỉnh/thành, Quận/huyện, **Phường/xã**, địa chỉ cụ thể |
| Ghi chú đơn hàng, ngày giờ nhận | Tùy chọn |
| **Phương thức vận chuyển** (≥2) | Giao tiêu chuẩn (phí theo tỉnh, miễn phí từ ngưỡng) và **Giao nhanh** (phí theo tỉnh + phụ phí `SHIPPING_EXPRESS_SURCHARGE`); hiển thị giá từng phương thức theo tỉnh |
| **Phương thức thanh toán** (≥2) | COD (chọn sẵn) và chuyển khoản VietQR, mỗi phương thức có mô tả ngắn và nhãn; chế độ Sandbox để thử |
| Tóm tắt đơn | Đồng bộ với giỏ hàng (cùng một báo giá từ máy chủ), có mã giảm giá, không sửa được tổng |

- **Trang cảm ơn** (`/confirmation`): mã đơn, tóm tắt, **thông tin giao hàng**, thông báo **"Chúng tôi đã gửi email xác nhận đến [email]"**, nút "Tiếp tục mua sắm" và "Tra cứu đơn".
- Ghi chú: hướng dẫn tự mâu thuẫn ở chỗ này (mục C1 yêu cầu noindex trang Thank You, mục D3 yêu cầu không noindex). Dự án giữ **noindex** cho trang cảm ơn (trang chứa dữ liệu đơn hàng riêng tư, không nên xuất hiện trên Google); việc đo chuyển đổi không bị ảnh hưởng vì noindex không chặn mã theo dõi.
- **Guest Checkout được bật có chủ đích**: khách đặt hàng không cần tài khoản; có ô "Tạo tài khoản" ngay trong thanh toán.

## D4. Tài khoản khách hàng (`/tai-khoan`)

| Mục | Chức năng |
|---|---|
| Đăng nhập & Đăng ký | Cùng một trang, 2 cột. Mật khẩu ≥ 8 ký tự gồm chữ và số, băm bcrypt; email không phân biệt hoa thường; chống dò mật khẩu bằng giới hạn tần suất |
| Tổng quan (Dashboard) | Chào theo tên, liên kết nhanh, 3 đơn gần nhất |
| Đơn hàng | Danh sách (mã, ngày, trạng thái, tổng), chi tiết từng đơn kèm tiến trình, **Hủy đơn** khi đơn đang chờ xác nhận và chưa thanh toán (hoàn kho, trả lại lượt dùng mã) |
| Địa chỉ | Lưu/sửa/xóa địa chỉ giao hàng và thanh toán; **tự điền vào trang thanh toán** lần sau |
| Chi tiết tài khoản | Đổi tên hiển thị, số điện thoại, email (**phải nhập lại mật khẩu hiện tại**), đổi mật khẩu có kiểm tra độ mạnh |
| Đăng xuất | Nút rõ ràng, về trang chủ |
| Quên mật khẩu | Gửi email chứa liên kết đặt lại (hiệu lực 1 giờ, dùng một lần, lưu dạng băm), luôn trả lời như nhau để không lộ email nào đã đăng ký |
| Tab "Tải xuống" | Ẩn (shop không bán hàng số) |

Đơn chỉ gắn vào tài khoản khi đặt lúc đã đăng nhập hoặc tạo tài khoản ngay khi đặt hàng. Hệ thống **không** tự gắn đơn cũ theo email (email chưa được xác minh nên có thể lộ đơn của người khác).

## D5. Email tự động

| Email | Người nhận | Gửi bởi |
|---|---|---|
| Đơn hàng mới | Chủ shop | n8n (workflow "Đơn hàng mới") |
| Xác nhận đơn hàng `[Long Fish] Xác nhận đơn <mã>` | Khách | n8n; có logo, màu nút đồng bộ website, bảng giá gồm giảm giá |
| Đã nhận thanh toán / Đơn hoàn thành / Đơn bị hủy / Đang giao | Khách | n8n (workflow "Cập nhật trạng thái"), cùng khung có logo |
| Đặt lại mật khẩu | Khách | Backend (SMTP) |
| Tài khoản mới (chào mừng + mã WELCOME10) | Khách | Backend (SMTP) |

Logo email: `/logo-email.png`. Cần `SITE_URL` là địa chỉ công khai thì logo mới hiện trong email của khách. Chưa kiểm tra bằng hộp thư thật cho các email mới của bước này (xem mục "Chưa kiểm chứng").

## D6. Mã giảm giá và báo cáo

| Mã | Loại | Điều kiện |
|---|---|---|
| `WELCOME10` | Giảm 10% | Chỉ đơn hàng đầu tiên của khách (nhận diện theo tài khoản, số điện thoại hoặc email); không giới hạn sản phẩm |
| `FREESHIP` | Miễn phí vận chuyển | Đơn từ 300.000 ₫; hết hạn sau 30 ngày kể từ lúc tạo; không miễn phí đóng gói cá sống |
| `SALE20` | Giảm cố định 20.000 ₫ | Chỉ danh mục **Thiết bị**; mỗi khách dùng 1 lần |

- Admin có mục **Mã giảm giá**: xem lượt dùng, tạo mã mới (loại %, số tiền, miễn phí ship; đơn tối thiểu; danh mục; giới hạn mỗi khách và tổng lượt; ngày bắt đầu/hết hạn; đơn đầu tiên), bật/tắt.
- Máy chủ **luôn kiểm tra lại mã khi tạo đơn**, trong cùng giao dịch với việc trừ kho; chống dùng quá giới hạn khi nhiều người đặt cùng lúc (có test 4 đơn song song, chỉ 1 đơn thành công); hủy đơn trả lại lượt dùng.
- **Báo cáo** (admin → Tổng quan): số đơn theo trạng thái, doanh thu ngày/tháng, sản phẩm bán chạy, doanh thu theo danh mục; **Sản phẩm** hiển thị tồn kho từng phân loại và cảnh báo tồn thấp; xuất CSV đơn và doanh thu.

## Chưa làm / chưa kiểm chứng

- **VNPay/MoMo**: chỉ có COD và VietQR (chuyển khoản ngân hàng). Hướng dẫn nêu logo VNPay/MoMo như ví dụ.
- **Chưa kiểm chứng bằng hộp thư thật**: email đặt lại mật khẩu, email chào mừng và email xác nhận mới có logo (chỉ có test cho khung email và luồng đặt lại mật khẩu; chế độ gửi thật phụ thuộc cấu hình SMTP của bạn).
- Cột **mã giảm giá trong Google Sheets**: để không đổi cấu trúc bảng đang dùng, thông tin mã giảm giá được ghi vào cột ghi chú giao hàng.
- 20 kịch bản Playwright có ghi đơn (`flows.spec.ts`, `checkout COD/VietQR…`) đã được cập nhật theo form mới nhưng **chưa chạy lại** (cần stack thử riêng với `E2E_COMPOSE_PROJECT`).
- Phần đánh giá sản phẩm (reviews/sao) chưa có.
