# Triển khai Long Fish

Tài liệu chuẩn bị cấu hình, chưa triển khai lên Internet và chưa mua domain/VPS. Stack chính trên máy phát triển không bị thay đổi trong bước 5. Production cần xử lý các CVE image được ghi trong security-review.md trước khi nhận đơn.

## VPS Ubuntu 22.04

1. Chuẩn bị VPS từ 2 vCPU/4 GB RAM, domain, SSH key; thay mọi placeholder. Cài Docker Engine và Compose plugin theo [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Không dùng Docker package cũ của Ubuntu. Compose cần >=2.24.4 để hỗ trợ `!reset` khi bỏ cổng từ compose gốc. Cài Node >=20 và chạy npm ci để dùng script quản trị; không cài thư viện development vào container runtime.
2. Trỏ A/AAAA của domain đến VPS, kiểm tra DNS cả IPv4/IPv6. Tại firewall nhà cung cấp và ufw: cho phép SSH từ IP quản trị, cho phép 80/tcp, 443/tcp (443/udp tùy HTTP/3), chặn các cổng khác. Ví dụ `sudo ufw allow OpenSSH`, `sudo ufw allow 80/tcp`, `sudo ufw allow 443/tcp`, rồi `sudo ufw enable` khi đã giữ phiên SSH dự phòng. Docker publish có thể vượt ufw: cấu hình compose mới chính là lớp ngăn lộ 3001/5678/8080.
3. Chép source sạch lên thư mục /opt/long-fish. `cp .env.production.example .env.production`, `chmod 600 .env.production`; tạo từng secret ngẫu nhiên bằng `openssl rand -hex 32`, không dùng cùng một giá trị cho các secret. Điền ADMIN_PASSWORD mạnh, domain và email ACME; giữ file ngoài Git. Bản ví dụ phân biệt biến bắt buộc/tùy chọn. Các URL PUBLIC_BASE_URL, SITE_URL, FRONTEND_ORIGIN và WEBHOOK_URL được override theo cùng PUBLIC_DOMAIN.
4. Lúc dựng hạ tầng giữ MOCK_INTEGRATIONS=true; SEED_DEMO=false để không sinh đơn mẫu. Chuyển dữ liệu đã duyệt qua quy trình restore riêng, hoặc nhập sản phẩm qua admin. Đừng chép volume n8n giữa hai encryption key khác nhau.

```sh
cd /opt/long-fish
npm ci
docker compose --env-file .env.production -p long-fish-prod -f docker-compose.yml -f docker-compose.prod.yml --profile tls config --quiet
docker compose --env-file .env.production -p long-fish-prod -f docker-compose.yml -f docker-compose.prod.yml --profile tls up -d --build --wait
```

Caddy chỉ publish 80/443, tự cấp/gia hạn chứng chỉ khi DNS và cổng đúng. Gateway nội bộ định tuyến đúng GET/POST `/webhook/messenger` tới n8n; `/webhook/order-created`, `/webhook/order-status`, `/webhook-test/*`, `/rest/*` và API nội bộ không public. Website/admin ứng dụng vẫn đi qua HTTPS và JWT. N8n UI không public; quản trị/import credential qua SSH và n8n CLI. JWT hiện lưu trong sessionStorage, không phải cookie; không có cờ Secure cho JWT này. N8n cookie bật Secure; gateway/Caddy thêm HSTS. Không ghi log URL tra cứu có SĐT.

```sh
curl -I https://TEN_DOMAIN
# Chỉ chạy với URL thật do chủ dự án quyết định, META_VERIFY_TOKEN lấy từ môi trường riêng:
npm run smoke:public -- https://TEN_DOMAIN
```

Smoke kiểm TLS native (không bỏ verify), health, HTML, ảnh, header, đường dẫn private và verify Meta đúng/sai token. Nó không đặt đơn/gửi tin. Cần sản phẩm thật và META_VERIFY_TOKEN trước khi chạy; script từ chối khi không truyền URL. Smoke công khai và ACME hiện **chưa kiểm chứng – cần domain/VPS của chủ dự án**.

Sau khi điền Facebook/Google/SMTP/ngân hàng, import credential riêng vào n8n, chạy check:integrations với CHECK_BASE_URL/CHECK_N8N_URL thích hợp. Kiểm tra qua SSH vì n8n không public. Chỉ đổi MOCK_INTEGRATIONS=false sau khi các kiểm tra dịch vụ thật thành công. Xem GO-LIVE.md.

## Cloudflare Tunnel thay Caddy

Dùng profile `tunnel` thay `tls`, điền CLOUDFLARE_TUNNEL_TOKEN, cấu hình Public Hostname trong Cloudflare trỏ tới `http://gateway:80`. Không chọn đồng thời hai profile. Không cần inbound 80/443 cho nhánh này; chỉ SSH từ IP quản trị và outbound kết nối Cloudflare. TLS ở edge Cloudflare; route riêng gateway vẫn chặn n8n UI và API nội bộ. Không route trực tiếp hostname đến n8n/frontend.

```sh
docker compose --env-file .env.production -p long-fish-prod -f docker-compose.yml -f docker-compose.prod.yml --profile tunnel up -d --build
```

Token tunnel không xuất hiện trong command line; chỉ nằm trong env file riêng và container config có quyền quản trị Docker. Không công khai quyền Docker/SSH.

## Quick Tunnel cho buổi demo từ máy cá nhân

Chỉ chủ dự án chủ động chạy các lệnh sau; tác vụ tự động không mở tunnel. Dùng project demo riêng, dữ liệu giả và MOCK_INTEGRATIONS=true. Tạo tệp override local (bỏ khỏi Git) thêm `gateway.ports: ["127.0.0.1:18090:80"]`, chạy backend/frontend/n8n/gateway với compose base + prod + override này, không chọn profile tls/tunnel. Chạy cloudflared native:

```sh
cloudflared tunnel --url http://localhost:18090
```

Lấy hostname trycloudflare.com được in ra, cập nhật PUBLIC_DOMAIN và các URL trong env demo rồi recreate đúng project demo. Đăng ký webhook Meta tại `https://<hostname>/webhook/messenger`. Không tunnel thẳng cổng 5678 hoặc 8080 vì thiếu lớp chặn public route. Quick Tunnel đổi hostname khi khởi động, không có SLA; dừng cloudflared sau demo. Không dùng cơ chế xác thực email tương tác trước webhook vì Meta cần truy cập không tương tác. [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Cập nhật, log và backup

Trước cập nhật: ghi image digest/version hiện tại; sao lưu DB, uploads, .env.production, encryption key và n8n-data vào nơi riêng được mã hóa. Không xóa volume production. Kiểm thử source/image mới ở project riêng, sau đó chạy lại compose prod `up -d --build --wait`. Khi rollback cần cả image và database tương thích; không tự chạy migration ngược.

Xem `docker compose -p long-fish-prod logs --tail 100 backend n8n` qua SSH; không chia sẻ log khách. Compose dùng restart unless-stopped và json-file 10 MB ×3 mỗi service. N8n tắt diagnostics/version notifications/templates/personalization, giữ execution tối đa 7 ngày/1000 bản. Không dùng Docker Scout đồng thời với benchmark Lighthouse.

Script `npm run backup:rotate` snapshot SQLite và tar uploads vào một thư mục timestamp, giữ 14 thư mục gần nhất; mặc định data/backups/daily. Không hỗ trợ PostgreSQL: PostgreSQL phải dùng pg_dump/pg_restore riêng. Mỗi bản sao gồm cả DB và ảnh; kiểm tra restore định kỳ theo [backup-restore.md](backup-restore.md).

Cron ví dụ (chủ dự án kiểm tra quyền file, Node/npm PATH và dung lượng trước):

```cron
15 2 * * * cd /opt/long-fish && COMPOSE_PROJECT_NAME=long-fish-prod /usr/bin/npm run backup:rotate >> /opt/long-fish/data/backup-cron.log 2>&1
```

Backup tự động không sao lưu credential/key ngoài DB. N8n-data cần snapshot nhất quán trong cửa sổ bảo trì riêng; encryption key giữ ở kho bí mật. Chép backup sang máy khác, giới hạn quyền 600/700 và kiểm tra định kỳ. Restore trên project mới trước, so khớp đơn/kho/ảnh, rồi mới chuyển DNS. Không thay volume stack đang chạy khi chưa có kế hoạch bảo trì.

## Nguồn cấu hình

[Compose merge/reset](https://docs.docker.com/reference/compose-file/merge/), [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https), [n8n deployment variables](https://docs.n8n.io/hosting/configuration/environment-variables/deployment/). Cấu hình được kiểm tra local; việc cấp chứng chỉ, tunnel và dịch vụ thật vẫn cần chủ dự án thực hiện.
