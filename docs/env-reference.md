# Biến môi trường Long Fish

Bắt buộc nghĩa là cần cấu hình khi chạy thật. Docker demo có thể tự sinh secret theo README. Credential Sheets và SMTP còn cần gắn vào node trong n8n.

| Biến | Bắt buộc/tùy chọn | Ví dụ an toàn |
|---|---|---|
| SHOP_NAME | Tùy chọn | Long Fish |
| PORT | Tùy chọn | 3001 |
| FRONTEND_ORIGIN | Bắt buộc khi chạy thật | http://localhost:8080 |
| SITE_URL | Bắt buộc khi chạy thật | http://localhost:8080 |
| PUBLIC_BASE_URL | Bắt buộc khi chạy thật | (để trống trong mẫu) |
| IMAGE_CONTACT_EMAIL | Tùy chọn | (để trống trong mẫu) |
| PEXELS_API_KEY | Tùy chọn | đặt giá trị riêng qua .env |
| PIXABAY_API_KEY | Tùy chọn | đặt giá trị riêng qua .env |
| UNSPLASH_ACCESS_KEY | Tùy chọn | đặt giá trị riêng qua .env |
| DATABASE_URL | Tùy chọn | file:/data/store.db (Docker) |
| SEED_DEMO | Tùy chọn | true |
| ADMIN_USERNAME | Bắt buộc khi chạy thật | admin |
| ADMIN_PASSWORD | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| JWT_SECRET | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| INTERNAL_API_KEY | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| N8N_WEBHOOK_SECRET | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| MOCK_INTEGRATIONS | Bắt buộc khi chạy thật | true |
| ORDER_RATE_LIMIT | Tùy chọn | 20 |
| N8N_ORDER_CREATED_WEBHOOK | Tùy chọn | http://n8n:5678/webhook/order-created |
| N8N_ORDER_STATUS_WEBHOOK | Tùy chọn | http://n8n:5678/webhook/order-status |
| SHIPPING_FREE_THRESHOLD | Tùy chọn | 600000 |
| SHIPPING_DEFAULT_FEE | Tùy chọn | 35000 |
| SHIPPING_FEES_JSON | Tùy chọn | '{"Hồ Chí Minh":20000,"Hà Nội":30000,"Đà Nẵng":30000}' |
| LIVE_FISH_PROVINCES_JSON | Tùy chọn | Danh sách tỉnh giao cá sống, ví dụ '["Hồ Chí Minh","Hà Nội"]'. Đặt '["*"]' để giao cá sống toàn quốc (bản hiện tại). Phí ship tỉnh không có trong SHIPPING_FEES_JSON lấy theo SHIPPING_DEFAULT_FEE. |
| LIVE_FISH_PACKING_FEE | Tùy chọn | 30000 |
| VIETQR_BANK | Tùy chọn | (để trống trong mẫu) |
| VIETQR_ACCOUNT | Tùy chọn | (để trống trong mẫu) |
| VIETQR_ACCOUNT_NAME | Tùy chọn | (để trống trong mẫu) |
| BANK_WEBHOOK_SECRET | Tùy chọn, bắt buộc nếu bật đối soát | đặt giá trị riêng qua .env |
| META_VERIFY_TOKEN | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| META_APP_SECRET | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| META_PAGE_ACCESS_TOKEN | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| META_GRAPH_VERSION | Tùy chọn | v23.0 |
| AI_ENABLED | Tùy chọn | false |
| AI_API_KEY | Tùy chọn | đặt giá trị riêng qua .env |
| AI_MODEL | Tùy chọn | gpt-4o-mini |
| GOOGLE_SHEET_ID | Bắt buộc khi chạy thật | (để trống trong mẫu) |
| GOOGLE_APPLICATION_CREDENTIALS | Bắt buộc khi chạy thật | (để trống trong mẫu) |
| SMTP_HOST | Bắt buộc khi chạy thật | smtp.gmail.com |
| SMTP_PORT | Bắt buộc khi chạy thật | 587 |
| SMTP_USER | Bắt buộc khi chạy thật | (để trống trong mẫu) |
| SMTP_PASSWORD | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| MAIL_FROM | Bắt buộc khi chạy thật | (để trống trong mẫu) |
| MAIL_TO | Bắt buộc khi chạy thật | (để trống trong mẫu) |
| N8N_ENCRYPTION_KEY | Bắt buộc khi chạy thật | đặt giá trị riêng qua .env |
| N8N_SECURE_COOKIE | Tùy chọn | false |
| WEBHOOK_URL | Tùy chọn | https://automation.example.com/ |
| CHECK_BASE_URL | Tùy chọn | http://127.0.0.1:8080 |
| CHECK_N8N_URL | Tùy chọn | http://127.0.0.1:5678 |
| BACKUP_DIR | Tùy chọn | data/backups |
| UPLOADS_DIR | Tùy chọn | ./data/uploads |
