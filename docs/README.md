# Long Fish

Kiểm thử giao diện dùng Chromium headless. Chạy `npx playwright install chromium`, rồi `npm run test:ui`. Mặc định chỉ đọc ở cổng 8080. Để chạy tạo đơn và upload, tạo project riêng với `FRONTEND_PORT=18080`, `N8N_PORT=15678`, `MOCK_INTEGRATIONS=true`. Chạy `docker compose -p long-fish-e2e up -d --build --wait` và đặt `E2E_COMPOSE_PROJECT=long-fish-e2e`, `E2E_BASE_URL=http://localhost:18080`, `E2E_WRITE=1`. `E2E_SCREENSHOTS=1` cho phép ghi ảnh, chỉ dùng dữ liệu giả. `npm run verify:all` chạy các bước tuần tự và tổng hợp kết quả.

`npm run demo:reset -- --yes --project=long-fish-restore` chỉ dành cho một project demo riêng. Script tự lưu SQLite backup, gỡ dữ liệu fixture nhận diện được và giữ ảnh đã gỡ trong kho lưu trữ phục hồi. Tài khoản admin đọc `ADMIN_USERNAME`/`ADMIN_PASSWORD` từ `.env` hoặc dùng mật khẩu do stack demo sinh. [Khôi phục và reset trên stack riêng](backup-restore.md).

Hồ sơ kiểm thử và bảo vệ mới nằm trong [test-report.md](test-report.md), [GO-LIVE.md](GO-LIVE.md), [security-review.md](security-review.md) và [kịch bản demo 10 phút](bao-ve/kich-ban-demo.md). HTTP và upload cũng bắt buộc dùng project kiểm thử riêng:

```powershell
$env:E2E_COMPOSE_PROJECT='long-fish-e2e'
$env:TEST_BASE_URL='http://localhost:18080'
$env:TEST_N8N_URL='http://localhost:15678'
npm run test:e2e
npx tsx scripts/verify-upload.ts
```

Các lệnh tạo dữ liệu giả và ẩn sản phẩm thử sau khi hoàn tất. Upload xác minh cả ảnh tồn tại sau restart backend. Bản demo sạch đã diễn tập ở http://localhost:18082; dùng [quy trình khôi phục/reset](backup-restore.md) để tạo lại từ nguồn đang chạy.

Đồ án bán cá cảnh và sản phẩm thủy sinh qua Facebook Messenger, website và n8n. Website và API dùng chung địa chỉ để chạy được trong trình duyệt tích hợp của Messenger. SQLite giữ dữ liệu chính. Google Sheets là bản sao phục vụ vận hành.

## Chạy demo

Cần Docker Desktop hoặc Docker Engine có Compose v2. Từ thư mục gốc, chạy:

```sh
docker compose up --build -d --wait
```

- Cửa hàng tại [localhost:8080](http://localhost:8080). Trang [quản trị](http://localhost:8080/admin) dùng tên `admin` mặc định. Lấy mật khẩu được tạo riêng cho lần cài này bằng `docker compose exec backend cat /data/admin-password`. Có thể đặt `ADMIN_PASSWORD` trong `.env` trước lần khởi động đầu tiên.
- n8n tại [localhost:5678](http://localhost:5678). Tạo tài khoản chủ sở hữu khi mở giao diện lần đầu. Compose tự import 5 workflow và publish workflow khi volume n8n còn mới. WF lỗi được chọn trong Settings của từng workflow chính. Trước khi chạy mô phỏng lần đầu, đợi log n8n báo WF1 đã hoạt động.
- Dữ liệu mẫu gồm 27 sản phẩm, nhiều phân loại theo dòng, cỡ, giới tính và 30 đơn và lịch sử trạng thái. Volume giữ dữ liệu khi chạy `docker compose down` rồi bật lại. Seed giữ nguyên dữ liệu đã có và mật khẩu của tài khoản đã tạo.
- `docker compose logs -f backend n8n` hiển thị hoạt động mock. `docker compose exec backend cat /data/mock/Long_Fish_Orders.csv` đọc CSV sau khi đặt đơn đầu tiên. Lệnh `docker compose cp backend:/data/mock/Long_Fish_Orders.csv ./data/Long_Fish_Orders.csv` xuất file nếu thư mục `data` đã tồn tại.

Nếu Docker Desktop trên Windows báo lỗi BuildKit chứa `x-docker-expose-session-sharedkey` khi đường dẫn có dấu, ánh xạ thư mục hiện tại qua một ký tự ổ đĩa còn trống rồi chạy từ đó:

```powershell
subst M: "$((Get-Location).Path)"
Set-Location M:\
docker compose up --build -d --wait
```

## Dữ liệu và giao cá sống

Compose dùng project `long-fish` và volume mới để bản demo có danh mục cá cảnh sạch. Dữ liệu của bản demo trước vẫn nằm trong volume cũ. Khi nâng cấp một SQLite cũ tạo bằng `prisma db push`, hãy sao lưu, đặt `DATABASE_URL` trỏ tới bản sao, rồi chạy từ thư mục `backend`:

```sh
npx prisma migrate resolve --applied 20261108000000_initial
npx prisma migrate deploy
```

Chỉ đánh dấu migration đầu nếu cơ sở dữ liệu đã có đúng schema ban đầu và chưa có lịch sử migration. Migration mới giữ đơn, tồn và ID cũ. Có thể ẩn danh mục mẫu cũ trong quản trị khi dùng cơ sở dữ liệu đã nâng cấp. Với PostgreSQL, thao tác chuyển dữ liệu là một bước riêng.

Phí mặc định là 30.000 ₫ cho túi oxy và thùng xốp trên mỗi đơn có cá sống. Miễn phí vận chuyển từ 600.000 ₫ tiền hàng, phí đóng gói vẫn áp dụng. Vùng giao mẫu gồm Hồ Chí Minh, Hà Nội và Đà Nẵng, cấu hình bằng `LIVE_FISH_PROVINCES_JSON`. Địa phương ngoài vùng vẫn đặt được phụ kiện. Đơn có cá sống yêu cầu khách xác nhận đã đọc DOA. Giờ nhận mong muốn là yêu cầu để cửa hàng xác nhận lại.

Thông số nuôi là giá trị tham khảo. Dung tích thực, số cá, lọc, nhiệt độ và bạn bể ảnh hưởng đến việc chọn loài. Koi mini trong danh mục là cá non và cần hồ lớn khi trưởng thành. Nguồn tổng hợp gồm [hướng dẫn cá nước ngọt OATA](https://ornamentalfish.org/what-we-do/advice-information/care-sheets/caresheets-tropical-freshwater-fish/), [hướng dẫn cá hồ OATA](https://ornamentalfish.org/what-we-do/advice-information/care-sheets/caresheets-coldwater-fish/how-to-look-after-pond-fish/) và [FishBase về cá thần tiên](https://www.fishbase.se/summary/Pterophyllum-scalare.html).

Hình minh họa SVG do dự án tự vẽ. Để thay ảnh thật, dán URL HTTPS bạn có quyền sử dụng trong **Quản trị → Sản phẩm → Địa chỉ ảnh**. Có thể đặt ảnh JPEG, PNG hoặc WebP vào `frontend/public/catalog/`, build lại frontend và điền đường dẫn như `/catalog/betta-that.jpg`. Dùng ảnh HTTPS công khai khi gửi qua Messenger.

## Chạy để phát triển

Dùng Node.js 20. Sao chép `.env.example` thành `.env`, đặt `ADMIN_PASSWORD` từ 12 ký tự và `JWT_SECRET` từ 32 ký tự. Với backend chạy trực tiếp, URL n8n phải trỏ đến host có thể truy cập từ máy thay vì hostname Compose `n8n`.

```sh
npm ci
npm run db:setup
npm run lint
npm run build
npm test
```

Chạy `npm run dev -w backend` và `npm run dev -w frontend` ở hai terminal. Vite proxy `/api` đến `127.0.0.1:3001`. Backend mặc định dùng `backend/prisma/long-fish.db` khi chạy local. Dùng `DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB` để khởi tạo trên PostgreSQL đã có sẵn. Trong Docker, PostgreSQL trên host Windows có thể truy cập qua `host.docker.internal`. SQLite chạy `prisma migrate deploy` theo thứ tự. PostgreSQL dùng schema riêng và `prisma db push`. Chuyển dữ liệu từ SQLite sang PostgreSQL cần thao tác nhập dữ liệu riêng.

## Kiến trúc

```mermaid
flowchart LR
  M[Khách Messenger] -->|Webhook GET và POST| N[n8n]
  N -->|Bot, đọc đơn và báo cáo| B[API Express]
  B -->|Send API| M
  M -->|Link sản phẩm có PSID| F[Website React]
  C[Khách và quản trị] --> F
  F -->|REST JSON| B
  B -->|Prisma| D[(SQLite hoặc PostgreSQL)]
  D -->|Hàng đợi lưu cùng giao dịch| B
  B -->|Đơn mới hoặc đổi trạng thái| N
  N --> G[Google Sheets hoặc CSV mock]
  N --> E[SMTP hoặc log mock]
```

API dùng Zod, giới hạn tần suất yêu cầu công khai và xác thực JWT cho quản trị. Các API nội bộ cần `x-api-key`. Frontend Nginx chỉ chuyển tiếp API công khai và quản trị. Mỗi đơn giữ giá, tên và phân loại tại thời điểm đặt. Giao dịch cập nhật bộ đếm ngày, trừ tồn với điều kiện đủ hàng và ghi sự kiện outbox. Hủy đơn hoàn tồn trong cùng giao dịch với nhật ký trạng thái. Hàng đợi gửi n8n sau khi đơn đã lưu và thử lại nếu webhook lỗi hoặc thiếu xác nhận. Cập nhật thanh toán cũng đồng bộ sang Sheets. Khi mất phản hồi sau khi gửi thành công, Sheets vẫn chỉ có một dòng mỗi mã đơn, còn email hoặc Messenger có thể được gửi lại. Tra cứu website và Messenger cần cả mã đơn và SĐT.

Dashboard và WF4 dùng múi giờ Việt Nam. Doanh thu gồm phí đóng gói và phí vận chuyển, tính trên đơn đã giao và nhóm theo ngày đặt. Báo cáo định kỳ ghi ảnh chụp số liệu tại lúc chạy. Nếu đơn của kỳ trước được giao sau giờ tổng hợp, chạy lại kỳ tương ứng nếu cần đối soát.

## Chuyển sang tích hợp thật

Đặt `MOCK_INTEGRATIONS=false` trong `.env`, điền khóa, cấu hình credential trong n8n rồi khởi động lại Compose. Với cơ sở dữ liệu mới dành cho cửa hàng thật, đặt `SEED_DEMO=false` và cấu hình tài khoản quản trị. Dùng tài khoản chủ sở hữu n8n và giữ cổng trình biên tập ở loopback. Khi public, reverse proxy chỉ cần công bố `/webhook/messenger` cho Meta và website cho khách. Các workflow sử dụng biểu thức đọc biến môi trường nên chỉ cấp quyền sửa workflow cho quản trị viên đáng tin cậy.

### Meta App, Page và webhook

1. Vào [Meta for Developers](https://developers.facebook.com/), tạo ứng dụng phù hợp với Messenger, thêm Messenger và kết nối Fanpage bạn quản lý.
2. Lấy App Secret trong cài đặt ứng dụng và Page Access Token từ thiết lập Messenger. Điền `META_APP_SECRET` và `META_PAGE_ACCESS_TOKEN`. Tự chọn chuỗi xác thực ngẫu nhiên cho `META_VERIFY_TOKEN`.
3. Tạo HTTPS public bằng reverse proxy, ngrok hoặc Cloudflare Tunnel. Ví dụ khi demo, `ngrok http 5678` hoặc `cloudflared tunnel --url http://localhost:5678` tạo URL n8n. Giới hạn đường dẫn qua reverse proxy khi đưa vào vận hành. Tạo tunnel website riêng qua cổng 8080, đặt `SITE_URL` và `FRONTEND_ORIGIN` bằng origin HTTPS của website, `WEBHOOK_URL` bằng URL n8n và bật cookie an toàn cho n8n nếu dùng trình biên tập qua HTTPS.
4. Publish WF1, cấu hình Callback URL là `https://<n8n>/webhook/messenger`, nhập đúng verify token, đăng ký trường `messages` và đăng ký Page với ứng dụng. WF1 xác minh challenge GET và chữ ký SHA-256 trên byte gốc của POST.
5. Kiểm thử bằng tài khoản có vai trò trong App ở chế độ Development. Khi phục vụ khách thật, hoàn tất App Review/quyền `pages_messaging` và tuân thủ cửa sổ nhắn tin Messenger. Workflow dùng `RESPONSE`, nên thông báo giao hàng ngoài cửa sổ được Meta cho phép cần cơ chế gửi đã được phê duyệt. Nếu Send API từ chối, xem Executions và log backend.
6. Link bot thêm chữ ký `context` cùng PSID ở chế độ thật. Khách đi thẳng vào website vẫn đặt đơn được. Ảnh minh họa dùng SVG local khi demo. Nếu Meta không nhận định dạng ảnh đó cho carousel, dùng HTTPS URL ảnh JPEG/PNG trong phần quản trị sản phẩm.

Tài liệu [Messenger Platform](https://developers.facebook.com/docs/messenger-platform/) và [Webhooks](https://developers.facebook.com/docs/messenger-platform/webhooks/).

### Google Sheets

1. Tạo spreadsheet và lấy ID nằm giữa `/d/` và `/edit` trong URL. Điền `GOOGLE_SHEET_ID`.
2. Tạo tab `Long_Fish_Orders` với dòng tiêu đề chính xác: `code,createdAt,customer,phone,address,products,quantity,subtotal,shippingFee,total,paymentMethod,paymentStatus,status,gender,packingFee,hasLiveFish,preferredDelivery,deliveryNote`. Tạo `Daily_Revenue` và `Monthly_Revenue` với `period,orders,revenue,cancelled`. Mỗi tên là một cột.
3. Trên Google Cloud bật Google Sheets API và Google Drive API. Tạo Service Account, cấp quyền Editor trên spreadsheet cho email của Service Account, tạo khóa JSON và lưu Private Key cùng email vào credential Google Service Account của n8n.
4. Có thể dùng OAuth2 thay thế. Tạo OAuth client Web, thêm callback do n8n hiển thị vào Authorized redirect URIs, hoàn thành consent screen, tạo credential Google Sheets OAuth2. Đổi Authentication sang OAuth2 trong các node Sheets.
5. Gán credential cho các node Sheets trong WF2, WF3, WF4 rồi publish lại. Long_Fish_Orders upsert theo `code`, hai tab báo cáo upsert theo `period`. Điều này giữ một dòng mỗi mã khi webhook được gửi lại.

Xem [Google Service Account trong n8n](https://docs.n8n.io/integrations/builtin/credentials/google/service-account/) và [Google Sheets node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googlesheets/).

### SMTP và VietQR

- Tạo credential SMTP trong n8n. Với Gmail có thể dùng `smtp.gmail.com`, cổng 465 SSL hoặc 587 STARTTLS, địa chỉ Gmail và App Password nếu chính sách tài khoản cho phép. Gán credential cho các node SMTP trong WF1, WF2, WF4 và WF lỗi. Đặt `MAIL_FROM`, `MAIL_TO`, rồi publish.
- Điền mã ngân hàng hoặc BIN và số tài khoản vào `VIETQR_BANK`, `VIETQR_ACCOUNT`. Backend dựng URL theo mẫu `img.vietqr.io` và đưa đúng tổng tiền, mã đơn vào tham số `amount`, `addInfo`. Có thể bật đối soát tự động bằng `BANK_WEBHOOK_SECRET` và webhook `POST /api/payments/bank`; nếu không, quản trị viên ghi nhận PAID sau khi đối chiếu sao kê. Dữ liệu QR demo chỉ dùng minh họa.

### Import lại workflow

Trong n8n chọn **Import from File**, nhập các JSON trong `n8n/workflows`. Với instance đã có workflow, cập nhật workflow tương ứng để tránh trùng webhook path. Chọn lại WF lỗi trong Settings, gán credential rồi publish WF lỗi và WF1–WF4. Nếu triển khai ngoài Compose, thay hostname `backend:3001` trong các HTTP Request node bằng địa chỉ backend riêng. Các node có chú thích mô tả nhiệm vụ.

## Biến môi trường

Sao chép [mẫu .env](../.env.example) khi cần tùy chỉnh. Không đưa `.env` vào Git. Giá trị mặc định phù hợp cho máy cục bộ.

| Biến | Công dụng |
|---|---|
| `PORT`, `FRONTEND_ORIGIN`, `SITE_URL` | Cổng API local, origin được phép, URL công khai cho link bot. |
| `DATABASE_URL`, `SEED_DEMO` | Nguồn DB và bật seed danh mục/đơn. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET` | Tài khoản seed, mật khẩu (≥12 ký tự) và khóa ký (≥32 ký tự). |
| `INTERNAL_API_KEY`, `N8N_WEBHOOK_SECRET` | Xác thực n8n → backend và backend → n8n. |
| `N8N_ORDER_CREATED_WEBHOOK`, `N8N_ORDER_STATUS_WEBHOOK` | Hai URL đích cho outbox. |
| `MOCK_INTEGRATIONS`, `MOCK_DATA_DIR` | Chuyển sang mock và thư mục CSV (Compose dùng `/data/mock`). |
| `SHIPPING_FREE_THRESHOLD`, `SHIPPING_DEFAULT_FEE`, `SHIPPING_FEES_JSON` | Ngưỡng miễn phí, phí mặc định và bảng phí theo tỉnh/thành. |
| `SHOP_NAME`, `LIVE_FISH_PROVINCES_JSON`, `LIVE_FISH_PACKING_FEE` | Tên trong chính sách giao cá, danh sách tỉnh hỗ trợ và phí túi oxy, thùng xốp cho mỗi đơn có cá sống. |
| `VIETQR_BANK`, `VIETQR_ACCOUNT` | Ngân hàng và số tài khoản nhận chuyển khoản. |
| `META_VERIFY_TOKEN`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN`, `META_GRAPH_VERSION` | Thông số Meta và phiên bản Graph API. |
| `AI_ENABLED`, `AI_API_KEY`, `AI_MODEL` | Bật node gợi ý cụm tìm kiếm từ OpenAI, tắt mặc định. |
| `GOOGLE_SHEET_ID`, `MAIL_FROM`, `MAIL_TO` | Spreadsheet và địa chỉ email. Credential lưu mã hóa trong n8n. |
| `N8N_ENCRYPTION_KEY`, `WEBHOOK_URL`, `N8N_SECURE_COOKIE` | Khóa mã hóa n8n, URL webhook public và chế độ cookie. |
| `SIMULATE_MESSENGER_URL`, `SIMULATE_PSID` | URL/PSID riêng cho script mô phỏng. |

[Xem bộ ảnh kiểm thử desktop và mobile](screenshots/README.md).

## Kịch bản bảo vệ đồ án

1. Bật Compose, mở cửa hàng ở độ rộng mobile. Thử lọc độ khó và cỡ trưởng thành. Mở Betta Halfmoon, chọn **Xanh dương** để thấy hết hàng. Chọn **Đỏ / 3–4 cm / Đực** để mua.
2. Chạy `npm ci` nếu máy chưa có thư viện, rồi `npm run simulate`. Xem log backend để thấy lời chào Long Fish, carousel cá dễ nuôi, chọn Betta, dòng/màu, cỡ cm, giới tính, số lượng và link có PSID. Mở link được in trong log.
3. Dùng họ tên giả và SĐT `0901234567`. Chọn tỉnh ngoài vùng để kiểm tra chặn cá sống và tùy chọn bỏ cá khỏi giỏ. Đổi địa chỉ sang Hồ Chí Minh, chọn giờ nhận mong muốn, đọc và xác nhận DOA rồi đặt COD. Ghi mã đơn, thử tra cứu với số sai rồi với số đúng. Xem `Long_Fish_Orders.csv` và log Messenger/email.
4. Thử Neon Tetra với số lượng tối thiểu 6 con. Đặt thêm đơn VietQR. Đối chiếu mã đơn, số tiền và nội dung chuyển khoản trên màn hình xác nhận. Gọi webhook đối soát mô phỏng nếu đã đặt `BANK_WEBHOOK_SECRET`, hoặc dùng trang quản trị để đánh dấu đã thanh toán.
5. Xem nhãn ưu tiên cá sống và ghi chú nhận hàng trong admin. Đổi đơn COD sang đã xác nhận, đang giao và đã giao. Giữ trang tra cứu mở để xem tự cập nhật sau tối đa 15 giây. Đối chiếu trạng thái trong CSV và log Messenger. Với một đơn khác, kiểm tra tồn trước và sau khi hủy.
6. Chạy `npm run simulate -- --psid 100000000002 "xyz" "abc"`. Vào **Quản trị → Hỗ trợ**, kiểm tra yêu cầu mở và chọn hoàn tất. Gửi lời chào tiếp để thấy bot trả lời lại. Dùng `--duplicate` để kiểm tra cùng một mid chỉ được xử lý một lần.
7. Mở **Tổng quan** để xem doanh thu, đồ thị 30 ngày và 12 tháng, số đơn theo trạng thái, top sản phẩm bán chạy và tiền hàng theo danh mục. WF4 tự chạy 23:55 mỗi ngày và 00:10 ngày đầu tháng. Để chạy thử cả hai kỳ ngay trong buổi demo, dùng lệnh bên dưới.
```sh
docker compose exec n8n sh -c 'export INTERNAL_API_KEY="${INTERNAL_API_KEY:-$(cat /shared/api-key 2>/dev/null)}" N8N_RUNNERS_BROKER_PORT=5681; n8n execute --id=lfxReports000004'
docker compose exec backend ls /data/mock
```




## Ảnh chụp và ghi nguồn

Từ thư mục gốc, chạy các lệnh sau. Script tìm ảnh theo `scripts/images/queries.json`, xếp hạng tối đa 15 ứng viên mỗi sản phẩm và chỉ tải các ảnh có trong danh sách `approved` đã được xem và duyệt.

```sh
npm run images:fetch -- --dry-run
npm run images:fetch
npm run images:apply -- --docker --dry-run
npm run images:apply -- --docker
```

Với backend local, dùng `npm run images:apply` và cùng `DATABASE_URL` với backend. Đường dẫn SQLite tương đối được Prisma phân giải theo thư mục schema. Lệnh apply cập nhật riêng `Product.images`, giữ dữ liệu đơn hàng và tồn kho. Sản phẩm đã có ảnh do quản trị viên đặt sẽ được giữ nguyên. Seed mới dùng danh sách ảnh đã duyệt trong `backend/prisma/photo-manifest.ts`.

Hai script đều hỗ trợ `--only <slug>`, `--dry-run`, `--refresh`. `images:fetch` dùng lại tệp hiện có và bổ sung ứng viên mới được duyệt cho đến khi đủ ba ảnh. Dùng `--refresh` để dựng lại bộ ảnh từ danh sách đã duyệt. Với apply, `--refresh` có thể đưa sản phẩm về SVG dự phòng nếu manifest đã bỏ ảnh đó, và vẫn giữ ảnh tùy chỉnh của quản trị viên.

Ảnh lớn nằm ở `frontend/public/catalog/photos/<slug>-N.webp`, thumbnail ở `<slug>-N-thumb.webp`. Ảnh được căn giữa về 4:3, cạnh dài tối đa 1200 px, chất lượng ưu tiên 82 và dung lượng không quá 250 KB. Thumbnail có cạnh dài tối đa 480 px. Script xác minh magic bytes, kích thước nguồn, giấy phép và hash để loại trùng. Các ảnh dự phòng SVG vẫn có trong dự án.

Nguồn chính là API Wikimedia Commons. Openverse chỉ cung cấp kết quả có giấy phép cho phép sử dụng thương mại và chỉnh sửa. Nếu có `PEXELS_API_KEY` hoặc `PIXABAY_API_KEY` trong `.env`, script có thể tìm thêm qua API tương ứng. Thiếu khóa thì bỏ qua. `IMAGE_CONTACT_EMAIL` được đưa vào User-Agent liên hệ. API chính thức được dùng theo quyền cho phép trong yêu cầu này. robots.txt được kiểm tra khi tải tệp ảnh. Các yêu cầu cách nhau tối thiểu 1,1 giây và lỗi tạm thời được thử lại với backoff. Khi nhà cung cấp yêu cầu chờ lâu, thời điểm được lưu trong `scripts/images/.rate-limits.json`, lượt sau không truy cập lại host trước hạn.

`UNSPLASH_ACCESS_KEY` được dành sẵn trong mẫu môi trường. Script hiện bỏ qua Unsplash vì yêu cầu lưu tệp cục bộ cần thỏa thuận hosting riêng với họ. Xem [hướng dẫn hotlink của Unsplash](https://help.unsplash.com/en/articles/2511271-guideline-hotlinking-images). Không tải hoặc dùng lại ảnh từ Google Images, mạng xã hội hay cửa hàng khác.

Mỗi ảnh chụp có tác giả, giấy phép, liên kết giấy phép và trang nguồn trong `credits.json`, hiển thị dưới ảnh chi tiết và tại **Nguồn ảnh** trong footer. Bản chuyển đổi WebP/cắt khung tiếp tục mang giấy phép ghi trên ảnh. Với CC BY-SA, giữ điều kiện chia sẻ tương tự cho ảnh được chỉnh sửa khi phân phối. Xem [hướng dẫn tái sử dụng Commons](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) và [tài liệu Openverse](https://api.openverse.org/v1/).

Ảnh là tham khảo loài hoặc loại sản phẩm, có thể khác màu hoặc cấu hình thực tế. Danh sách thiếu ảnh và lý do nằm trong [images-todo.md](images-todo.md). Để thêm ảnh, sửa từ khóa, chạy dry-run, xem ảnh và kiểm tra giấy phép trên trang nguồn, rồi thêm `File:Tên ảnh.jpg` của Commons hoặc URL trang nguồn của Openverse/Pexels/Pixabay vào `approved`. Có thể đặt `openverseTerm` riêng khi ảnh được tìm qua một truy vấn Openverse cụ thể. Chạy fetch, apply và build frontend.

Để thay ảnh bằng ảnh tự chụp, đặt tệp trong `frontend/public/catalog/`, build frontend rồi sửa đường dẫn ảnh trong quản trị. Khi tự nhập ảnh có giấy phép, thêm đầy đủ bản ghi nguồn vào `credits.json`. Giữ bản gốc và bằng chứng giấy phép để đối chiếu.

Messenger dùng ảnh thumbnail và URL tuyệt đối từ `PUBLIC_BASE_URL`, mặc định dùng `SITE_URL`. Khi tích hợp Meta thật, public website qua ngrok/cloudflared, ví dụ `ngrok http 8080`, rồi đặt `PUBLIC_BASE_URL=https://<tunnel-website>/` và `SITE_URL=https://<tunnel-website>`. URL localhost chỉ dùng demo cục bộ. Khởi động lại backend sau khi đổi biến. Frontend Docker tự copy ảnh qua Vite build. Nginx cache WebP một ngày, `credits.json` dùng no-cache để cập nhật ghi nguồn.

Ảnh mới chỉ xuất hiện trong container frontend sau khi chạy `docker compose up --build -d frontend backend`. Trên Windows có tên thư mục chứa dấu, dùng cách ánh xạ ổ đĩa đã mô tả phía trên.

## Tải ảnh sản phẩm từ quản trị

Mở Quản trị → Sản phẩm, kéo thả hoặc chọn nhiều ảnh qua ô Tải ảnh lên. Mỗi tệp tối đa 5 MB, chỉ JPEG/PNG/WebP. Ảnh được kiểm tra bằng chữ ký tệp và giải mã, cắt giữa về 4:3, xuất WebP cạnh dài tối đa 1200 px và thumbnail tối đa 480 px, mỗi bản tối đa 250 KB. Chọn Đặt làm ảnh chính hoặc Lên/Xuống để sắp xếp, rồi bấm Lưu sản phẩm. Danh sách có tối đa sáu ảnh và vẫn hỗ trợ dán URL HTTPS.

Xóa khỏi sản phẩm rồi Lưu sẽ gỡ liên kết ảnh. Tệp tải lên vẫn được giữ trong volume để các đơn hoặc liên kết đang dùng ảnh tiếp tục mở được. Volume Docker `uploads-data` gắn vào `/uploads-data`. Khi chạy backend trực tiếp, `UPLOADS_DIR` mặc định là `backend/data/uploads`. Sao lưu cả database lẫn volume này. Ảnh đang dùng ở sản phẩm công khai được liệt kê tự động tại /credits với dòng “Ảnh do Long Fish cung cấp”. Người tải ảnh chịu trách nhiệm có quyền sử dụng ảnh đó.

Endpoint POST /api/admin/uploads yêu cầu Bearer JWT và trường multipart `image`, trả về `file`. Gửi từng tệp, sau đó lưu danh sách đường dẫn qua API sản phẩm. Ảnh dùng tên UUID, được phục vụ qua /uploads/ và cache 30 ngày vì nội dung của mỗi URL cố định.

## Tài nguyên và môi trường thử

Dùng `npm run docker:cleanup-temp` để in danh sách project tạm; thêm `--yes` mới backup từng volume rồi gỡ. Chỉ nhận long-fish-e2e[-...] và long-fish-restore-<14 chữ số>, từ chối stack gốc. Backup chứa dữ liệu/credential nên giữ trong data/ ngoài Git.

Compose mới giới hạn backend/frontend/n8n 512/128/768 MiB, restart unless-stopped và log 10 MB ×3. Đã đo trên project thử: backend 136,3 MiB, frontend 8,695 MiB, n8n 284,7 MiB; baseline stack chính trước đó 50,58/8,734/233,1 MiB. Hai instance/tải khác nhau nên không kết luận giảm RAM. Tác vụ Docker Scout trước đây tốn khoảng 2 GB, không phải n8n. Xem resource-usage.json. Stack chính không được recreate trong bước 5.

Cấu hình HTTPS, Cloudflare, backup cron và smoke ngoài Internet: [DEPLOY.md](DEPLOY.md).
