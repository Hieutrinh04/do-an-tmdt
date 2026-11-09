# PROMPT CHO CODEX (bước 2) – Tự tìm và tải ảnh cá thật cho Long Fish

Dự án Long Fish đã được chuyển sang cá cảnh (lint pass, 12 test pass). Hiện ảnh sản phẩm vẫn là **SVG minh họa tự vẽ** trong `frontend/public/catalog/*.svg`. Nhiệm vụ lần này: **viết script tự tìm kiếm và tải ảnh thật** của từng sản phẩm về máy, thay SVG, mà không làm hỏng gì đang chạy tốt.

## 1. Phạm vi sản phẩm cần ảnh (đọc `backend/prisma/aquatic-catalog.ts`)

Cá: betta-halfmoon, betta-plakat-koi, betta-crowntail, guppy-fancy, guppy-full-red, guppy-snake-skin, neon-tetra, cardinal-tetra, molly-den, platy-do, ca-vang-ranchu, ca-vang-oranda, koi-mini, ca-la-han, ca-than-tien, ca-dia, ca-chuot-dong, pleco-bristlenose.
Phụ kiện: hat-betta, artemia-say, be-kinh-40, loc-thac, den-led, suoi-be-ca, sui-oxy, ray-nana, vi-sinh.

Mỗi sản phẩm cần **2–3 ảnh** (ảnh chính + 1–2 ảnh phụ khác góc/ngữ cảnh). Nếu danh sách trong file khác, lấy theo file là chuẩn.

## 2. Nguồn ảnh – CHỈ dùng nguồn hợp pháp, không scrape tùy tiện

Không cào ảnh từ Google Images, Facebook, shop khác hay trang không rõ giấy phép (vi phạm bản quyền, dễ bị gỡ/khiếu nại khi bảo vệ đồ án). Dùng theo thứ tự ưu tiên:

1. **Wikimedia Commons** (API `https://commons.wikimedia.org/w/api.php`, `action=query&generator=search&prop=imageinfo&iiprop=url|extmetadata|size`) – lọc giấy phép CC0 / CC BY / CC BY-SA / Public Domain.
2. **Openverse API** (`https://api.openverse.org/v1/images/`) – lọc `license_type=commercial,modification` .
3. **Pexels / Pixabay / Unsplash API** nếu tôi cung cấp khóa trong `.env` (`PEXELS_API_KEY`, `PIXABAY_API_KEY`, `UNSPLASH_ACCESS_KEY`); thiếu khóa thì bỏ qua nguồn đó, không dừng cả script. Tuân thủ điều khoản từng API (rate limit, ghi nguồn).

Quy tắc:
- Từ khóa tìm kiếm theo **tên khoa học + tên phổ thông** (VD "Betta splendens halfmoon", "Paracheirodon innesi", "Poecilia reticulata", "Carassius auratus ranchu", "Symphysodon", "Pterophyllum scalare", "Hypostomus/Ancistrus"), thêm từ khóa tiếng Anh cho phụ kiện ("aquarium filter", "aquarium heater", "fish food flakes", "planted aquarium", "air pump aquarium"). Cấu hình từ khóa nằm trong file `scripts/images/queries.json` để tôi sửa được.
- Loại ảnh có logo/watermark/chữ lớn, ảnh người là chủ thể chính, ảnh minh họa/vẽ tay, ảnh nhiều loài lẫn lộn, ảnh quá nhỏ (cạnh ngắn < 600 px), tỉ lệ quá dị.
- Chỉ chấp nhận giấy phép cho phép dùng thương mại; **ghi lại** tác giả, tên giấy phép, URL trang gốc.
- Lịch sự với máy chủ: đặt `User-Agent` rõ ràng (VD `LongFishStudentProject/1.0 (liên hệ qua email trong .env)`), giới hạn ~1 request/giây, retry có backoff, tôn trọng `robots.txt`/rate limit.

## 3. Chọn ảnh đúng loài (quan trọng)

Tìm kiếm thường trả về ảnh sai loài. Với mỗi sản phẩm:
1. Lấy tối đa 15 ứng viên từ các nguồn, chấm điểm theo: tiêu đề/mô tả/danh mục chứa đúng tên loài, độ phân giải, giấy phép, tỉ lệ khung hình.
2. Nếu môi trường của bạn có khả năng xem ảnh, **mở ảnh ứng viên hàng đầu và tự kiểm tra bằng mắt** đúng loài/đúng loại thiết bị, không watermark; nếu không xem được, ưu tiên ảnh có metadata khớp tuyệt đối tên khoa học.
3. Không chắc chắn → **đừng đoán**: để sản phẩm đó giữ ảnh SVG cũ và ghi vào báo cáo `docs/images-todo.md` kèm gợi ý để tôi chọn tay.

## 4. Xử lý và lưu ảnh

- Tạo script `scripts/images/fetch-images.ts` (chạy bằng `npm run images:fetch`) và `scripts/images/apply-images.ts` (`npm run images:apply`). Hỗ trợ cờ `--only <slug>`, `--dry-run`, `--refresh`.
- Tải về **thư mục local** `frontend/public/catalog/photos/<slug>-1.webp`, `-2.webp`…; **không hotlink** ảnh từ máy chủ ngoài.
- Dùng `sharp` (thêm vào devDependencies gốc): cắt/resize về tối đa 1200×1200 (giữ tỉ lệ, đồng nhất khung 4:3 hoặc 1:1 cho thẻ sản phẩm bằng `cover` có điểm nhìn trung tâm), xuất WebP chất lượng ~82, mỗi file ≤ 250 KB; tạo thêm bản thumb 480 px (`-1-thumb.webp`) cho danh sách/carousel Messenger.
- Kiểm tra tải về thật sự là ảnh (magic bytes), loại trùng lặp (hash), bỏ ảnh lỗi.
- Ghi `frontend/public/catalog/photos/credits.json`: theo slug → `[{ file, title, author, license, licenseUrl, sourceUrl }]`.
- Idempotent: chạy lại không tải trùng nếu đã có (trừ khi `--refresh`).

## 5. Gắn ảnh vào hệ thống

- Cập nhật `aquatic-catalog.ts`/seed để `images` của mỗi sản phẩm trỏ tới `/catalog/photos/<slug>-N.webp` (validator `catalog.ts` đã chấp nhận `/catalog/...webp`). Sản phẩm chưa có ảnh thật vẫn dùng SVG cũ.
- Với database **đang có sẵn**, viết `apply-images` cập nhật cột `images` của `Product` theo slug (không xóa sản phẩm/đơn, không reset DB).
- Bot Messenger: carousel phải dùng URL ảnh **công khai tuyệt đối** (`PUBLIC_BASE_URL` + đường dẫn ảnh); với bản thumb khi cần. Kiểm tra `bot.ts` đang lấy `images[0]` có ghép đúng base URL không, sửa nếu thiếu. Khi chạy ở localhost, ảnh Messenger sẽ không hiện – ghi chú trong README cách dùng ngrok/cloudflared + `PUBLIC_BASE_URL`.
- Frontend: thẻ sản phẩm dùng thumb, trang chi tiết dùng ảnh lớn; thêm `width`/`height`/`loading="lazy"`, ảnh lỗi thì fallback về SVG; trang chi tiết có dòng nhỏ **"Ảnh: <tác giả> – <giấy phép> (<nguồn>)"** (lấy từ `credits.json`) và thêm trang `/credits` liệt kê toàn bộ nguồn ảnh, link ở footer.
- Cập nhật `frontend/nginx.conf` nếu cần cache ảnh (`Cache-Control` dài cho `/catalog/photos/`), và Dockerfile frontend phải copy được thư mục ảnh.

## 6. Nghiệm thu

1. `npm run images:fetch -- --dry-run` in ra danh sách ứng viên + điểm; `npm run images:fetch` tải thật; `npm run images:apply` gắn vào DB.
2. ≥ 80% sản phẩm có ảnh thật đúng loài; phần còn lại giữ SVG và được liệt kê trong `docs/images-todo.md` kèm lý do.
3. Mỗi ảnh thật đều có dòng ghi nguồn trong `credits.json` và hiển thị được ở `/credits`.
4. `npm run lint`, `npm run build`, `npm test` đều pass (bổ sung test cho phần chọn/chấm điểm ứng viên và validator đường dẫn ảnh).
5. Chạy dev server, chụp ảnh trang chủ, chi tiết 3 loại cá khác nhau, giỏ hàng/checkout và admin ở mobile + desktop để xác nhận ảnh hiển thị đúng, không méo, không vỡ.
6. Cập nhật `docs/README.md`: cách chạy script, cách thêm khóa API, cách thay ảnh thủ công, lưu ý bản quyền.

## 7. Quy tắc

- Không commit khóa API; không tải ảnh ngoài các nguồn đã nêu; không lưu ảnh ngoài thư mục dự án.
- Không sửa logic đặt hàng/tồn kho/n8n trong bước này.
- Cuối cùng báo cáo ngắn: bao nhiêu sản phẩm có ảnh thật, bao nhiêu còn SVG, nguồn nào đóng góp nhiều nhất, và những gì tôi cần làm tay.

Bắt đầu thực hiện.
