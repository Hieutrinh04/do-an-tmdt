# Chạy lại Long Fish sau khi tắt máy / mở lại dự án

Thư mục dự án: `D:\Đồ án TMĐT`. Tên project Docker: `long-fish` (đã khai báo `name: long-fish` trong `docker-compose.yml`). Các lệnh dưới đây chạy trong PowerShell hoặc Git Bash tại thư mục dự án.

## 1. Bật hệ thống (3 dịch vụ)

1. Mở **Docker Desktop**, chờ đến khi báo "Engine running".
2. Chạy:
   ```bash
   docker compose up -d
   ```
3. Kiểm tra:
   ```bash
   docker compose ps
   ```
   Phải thấy `backend` và `n8n` ghi `healthy`, `frontend` đang `Up`.
4. Mở thử `http://localhost:8080` (cửa hàng) và `http://localhost:8080/admin` (quản trị; tài khoản và mật khẩu nằm trong `.env`: `ADMIN_USERNAME`, `ADMIN_PASSWORD`). n8n ở `http://localhost:5678`.
5. Kiểm tra các tích hợp (Facebook, Google Sheets, email):
   ```bash
   npm run check:integrations
   ```
   Cả 6 dòng phải là `OK`.

**Nếu mở `localhost:8080` không được** dù `docker compose ps` báo chạy (thường sau khi vừa bật lại Docker Desktop), chạy:
```bash
docker restart long-fish-frontend-1
```

## 2. Bật tunnel để Messenger và link chia sẻ hoạt động

Facebook chỉ gọi được vào địa chỉ HTTPS công khai. Mỗi lần bật tunnel tạm sẽ cho **địa chỉ mới**, nên phải làm lại các bước sau. Mở **2 cửa sổ PowerShell riêng**, để chạy suốt buổi demo (đóng cửa sổ là tunnel chết):

```bash
cloudflared tunnel --url http://localhost:5678
```
```bash
cloudflared tunnel --url http://localhost:8080
```

Mỗi cửa sổ in ra một địa chỉ dạng `https://xxxx.trycloudflare.com`. Cái cho cổng **5678** là địa chỉ n8n, cái cho cổng **8080** là địa chỉ web.

1. Mở file `.env`, sửa 4 dòng:
   - `WEBHOOK_URL=` địa chỉ n8n (có dấu `/` ở cuối)
   - `SITE_URL=`, `PUBLIC_BASE_URL=`, `FRONTEND_ORIGIN=` cùng địa chỉ web
2. Nạp lại cấu hình:
   ```bash
   docker compose up -d
   ```
3. Vào Meta for Developers, app **Long Fish Bot**, Trường hợp sử dụng **Messenger**, **Tùy chỉnh**, **Cài đặt API**. Đặt:
   - **URL gọi lại**: `địa-chỉ-n8n/webhook/messenger`
   - **Mã xác minh**: giá trị `META_VERIFY_TOKEN` trong `.env`
   - Bấm **Xác minh và lưu**.
4. Nhắn `Xin chào` cho Fanpage, rồi mở `http://localhost:5678`, workflow "Long Fish – Messenger Chatbot", mục Executions xem có lần chạy mới không.

Tính năng tự nhắn khi có bình luận chạy bằng bộ quét trong backend (mỗi 60 giây), không cần cấu hình thêm.

## 3. Nếu mã Trang Facebook bị mất quyền hoặc hết hạn

1. Vào **Công cụ**, **Trình khám phá API Đồ thị**: app Long Fish Bot, **Mã người dùng**, thêm quyền `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_metadata`, `pages_messaging`, bấm **Generate Access Token**.
2. Dán mã vào file `data\user-token.txt` (một dòng), chạy:
   ```bash
   npx tsx scripts/meta-page-token.ts
   docker compose up -d
   ```

## 4. Sau khi sửa mã nguồn: dựng lại

Đường dẫn có dấu tiếng Việt làm `docker compose --build` báo lỗi, nên ánh xạ tạm thư mục sang ổ `X:` (PowerShell):

```powershell
subst X: "D:\Đồ án TMĐT"
Set-Location X:\
docker compose -p long-fish up -d --build backend frontend
Set-Location D:\
subst X: /d
```

Muốn nạp lại workflow n8n sau khi sửa file trong `n8n/workflows/` (Git Bash; thêm `MSYS_NO_PATHCONV=1` để không đổi đường dẫn):

```bash
docker compose -p long-fish up -d --build n8n
MSYS_NO_PATHCONV=1 docker exec long-fish-n8n-1 n8n import:workflow --input=/workflows/1-messenger.json
MSYS_NO_PATHCONV=1 docker exec long-fish-n8n-1 n8n publish:workflow --id=lfxMessenger0001
docker restart long-fish-n8n-1
```
(đổi tên file và id cho workflow khác: `2-order-created.json` / `lfxCreated000002`, `3-order-status.json` / `lfxStatus0000003`).

## 5. Kiểm tra toàn bộ trước buổi bảo vệ

```bash
npm run lint
npm test
npm run test:ui
npm run seo:audit
npm run lighthouse
```
Làm theo `docs/HUONG-DAN-TU-KIEM-TRA.md` để tự thử luồng đặt hàng, tra cứu, admin, chatbot.

## 6. Dữ liệu và dọn dẹp

- Đơn thử để lại có dấu `TEST`/`ĐƠN THỬ`: hủy trong admin để hoàn kho. Muốn đưa dữ liệu demo về sạch: `npm run demo:reset` (hỏi xác nhận và tự sao lưu trước).
- Sao lưu trước khi làm việc nguy hiểm: `npm run db:backup`.
- **Tắt tất cả khi xong:** `docker compose stop` (giữ dữ liệu). Không dùng `docker compose down -v` vì sẽ xóa dữ liệu.

## 7. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|---|---|
| Bot không trả lời | Tunnel đã tắt hoặc địa chỉ đã đổi: làm lại mục 2 |
| `check:integrations` báo FAIL ở DB hoặc Ảnh | `docker restart long-fish-frontend-1` |
| Trang trắng sau khi sửa giao diện | Mở F12, tab Console xem lỗi; dựng lại frontend (mục 4) |
| QR thanh toán không hiện | Cần `PAYMENT_SANDBOX=true` (thử) hoặc điền `VIETQR_BANK`, `VIETQR_ACCOUNT` |
| Điểm SEO thấp trên PageSpeed | Đang đo qua tunnel tạm; cần domain thật (`docs/SEO.md`) |
