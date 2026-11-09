# Sao lưu và diễn tập khôi phục

`npm run db:backup -- --docker` tạo snapshot SQLite bằng `VACUUM INTO` và chép về `data/backups`. Tệp database và ảnh upload có thể chứa dữ liệu cá nhân. Giữ cả hai trong thư mục hạn chế truy cập và bỏ khỏi Git.

## Diễn tập trên project riêng

Giữ stack nguồn `long-fish` đang chạy ở chế độ mock, sau đó chạy:

```powershell
pwsh -File scripts/rehearse-restore.ps1
```

Script gọi `docker compose -p long-fish exec` để snapshot DB và đóng gói volume ảnh. `docker compose cp` chép cả hai về `data/`. Script chạy container tạm của project `long-fish-restore-<timestamp>`, đưa database vào `/data/store.db` và giải nén ảnh vào `/uploads-data`. Sau đó script khởi động backend/frontend trên cổng 18082 và so sánh hash đơn, tồn kho, danh sách ảnh và từng file WebP. Bản ghi kết quả xuất hiện ở `docs/restore-rehearsal.json` sau khi kiểm tra khớp.

Ngày 09/11/2026 đã chạy thật với project đích `long-fish-restore-20261109144601`: khớp 48 đơn, 71 biến thể, 32 sản phẩm và 2 tệp WebP trước khi reset. Reset sau backup xóa đúng 16 đơn TEST, 5 sản phẩm thử, chuyển 1 thư mục ảnh thử vào archive. Bản demo còn 32 đơn, 27 sản phẩm hoạt động; chạy lại không xóa thêm bản ghi nào. Thiếu `--yes` trả mã lỗi 1. Stack nguồn giữ nguyên dữ liệu. Mở bản demo sạch tại http://localhost:18082; tài khoản lấy từ `.env` hoặc tệp admin-password riêng, không đưa mật khẩu vào tài liệu.

## Dọn dữ liệu demo

```powershell
npm run demo:reset -- --yes --project=long-fish-restore-<timestamp>
```

Script từ chối khi thiếu `--yes`, khi chỉ vào stack mặc định `long-fish`, khi tắt mock hoặc khi không dùng SQLite. Script tạo backup trước, chỉ xử lý fixture khớp dấu hiệu tên, ghi chú và quan hệ sản phẩm. Ảnh fixture được chuyển vào `.reset-archive` trong volume nếu không còn sản phẩm tham chiếu. Ảnh upload mồ côi thiếu thông tin về chủ sở hữu vẫn nằm trong volume. Script giữ đơn mẫu cũ hợp lệ và bổ sung đủ 30 đơn mẫu nếu còn thiếu. CSV mock là bản sao của n8n, dùng project riêng hoặc tạo lại CSV từ dữ liệu cần trình bày nếu muốn loại các hàng cũ khỏi bản sao.

Khi dọn một project diễn tập sau buổi bảo vệ, xác nhận tên project và đã giữ bản sao rồi mới chạy `docker compose -p <project-thử-nghiệm> down -v`. Kiểm tra `docker compose ls` trước khi chạy. Stack `long-fish` đang chạy cần quy trình khôi phục riêng của người vận hành.

## Bootstrap từ volume trắng đã chạy thật

Đã snapshot SQLite bằng `node dist/src/backup.js`, đóng gói uploads và n8n bằng tar, chép ra `data/bootstrap-backup/` trước khi chạy:

```powershell
$env:FRONTEND_PORT='18080'
$env:N8N_PORT='15678'
docker compose -p long-fish-e2e down -v
docker compose -p long-fish-e2e up -d --build --wait
```

Chỉ project kiểm thử trên bị xóa volume. Sau đó health xanh, seed 27 sản phẩm/khoảng 30 đơn, log import 5 và activate đủ 5 workflow; UI 8/8 và HTTP 8/8 PASS. Xem bootstrap-rehearsal.json và e2e-results.json. N8n có thể báo ready trước lúc kích hoạt xong webhook; outbox giữ sự kiện và gửi lại, không bỏ đơn.

## PostgreSQL riêng

Dùng `docker-compose.postgres.yml` cùng compose mặc định, profile `postgres`. Đặt mật khẩu ngẫu nhiên vào `POSTGRES_PASSWORD`, URL tương ứng vào `POSTGRES_DATABASE_URL` (`postgresql://long_fish:<mật-khẩu>@postgres:5432/long_fish`), cổng 18081/15681, mock=true. Không đưa mật khẩu vào tài liệu/log/Git.

```powershell
docker compose -p long-fish-e2e-pg -f docker-compose.yml -f docker-compose.postgres.yml --profile postgres up -d --no-build --wait
```

Image phải được build/tag cho project này trước. Backend tự dùng migration PostgreSQL riêng và seed JavaScript đã biên dịch. Đặt E2E_COMPOSE_PROJECT=long-fish-e2e-pg, TEST_BASE_URL=http://localhost:18081, TEST_N8N_URL=http://localhost:15681 rồi chạy npm run test:e2e. Đã thực hiện và PASS cả 8 kịch bản. Sau diễn tập đã stop project PostgreSQL để giảm tải máy, giữ toàn bộ volume.
