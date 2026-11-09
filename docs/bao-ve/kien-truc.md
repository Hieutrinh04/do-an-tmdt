# Kiến trúc Long Fish

Frontend React/Vite phục vụ cửa hàng và admin. Express kiểm tra dữ liệu, xác thực, giữ kho và lưu đơn qua Prisma. SQLite là nguồn dữ liệu chính. Outbox trong cùng transaction với đơn lưu ý định gửi sự kiện, n8n thực hiện đồng bộ và thông báo. Website đọc ảnh local có giấy phép và ảnh upload trong volume.

```mermaid
flowchart LR
  Customer[Khách] --> Page[Fanpage Messenger]
  Customer --> Web[React và Nginx]
  Page --> Bot[n8n WF1]
  Bot --> API[Express API]
  Web --> API
  Admin[Người bán] --> Web
  API --> DB[(SQLite qua Prisma)]
  API --> Upload[(Volume uploads-data)]
  DB --> Outbox[Worker outbox]
  Outbox --> WF[n8n WF2 WF3 WF4]
  WF --> Sheets[Google Sheets hoặc CSV]
  WF --> Mail[SMTP hoặc log mock]
  WF --> API
  API --> Send[Messenger Send API]
```

```mermaid
sequenceDiagram
  participant K as Khách
  participant A as Express
  participant D as SQLite
  participant O as Outbox worker
  participant N as n8n
  K->>A: POST orders với variantId và quantity
  A->>D: BEGIN và giảm kho có điều kiện
  A->>D: Đọc giá, lưu đơn, dòng hàng, history, outbox
  D-->>A: COMMIT
  A-->>K: Mã đơn và tổng tiền, QR URL
  O->>D: Đọc sự kiện đến hạn
  O->>N: Webhook có x-webhook-secret
  N->>A: Đọc đơn qua API nội bộ
  N->>N: Upsert Sheet, gửi email và Messenger
  N-->>O: ok true
  O->>D: Đánh dấu sentAt
```

```mermaid
erDiagram
  Product ||--o{ ProductVariant : has
  ProductVariant ||--o{ OrderItem : referenced_by
  Order ||--|{ OrderItem : contains
  Order ||--|{ OrderStatusLog : records
  Product { string id PK
    string slug UK
    int price
    json images
    boolean isLiveFish }
  ProductVariant { string id PK
    string productId FK
    string sku UK
    int stock
    int minQty }
  Order { string id PK
    string code UK
    string psid
    int total
    string status }
  OrderItem { string id PK
    string orderId FK
    string variantId FK
    int unitPrice
    int quantity }
  OrderStatusLog { string id PK
    string orderId FK
    string toStatus
    datetime changedAt }
  ConversationState { string psid PK
    datetime lastInboundAt
    boolean handoff
    json selection }
  HandoffRequest { string id PK
    string psid
    string status }
  OutboxEvent { int id PK
    string kind
    json payload
    datetime sentAt }
  MessengerReceipt { string mid PK }
  AdminUser { string id PK
    string username UK
    string passwordHash }
  OrderSequence { string day PK
    int value }
```

PSID trong Order, HandoffRequest và ConversationState là khóa nghiệp vụ, hiện không khai báo foreign key giữa các bảng này. Outbox tham chiếu đơn bằng code trong payload. Tệp upload dùng UUID và được tham chiếu từ Product.images, chưa có bảng media riêng.

## Quyết định công nghệ

| Công nghệ | Lý do và giới hạn |
|---|---|
| Node.js 20, Express, TypeScript | Cùng ngôn ngữ với frontend, phù hợp webhook và JSON API. Cần quản lý vòng đời Node và phụ thuộc khi triển khai lâu dài. |
| Prisma, SQLite | Transaction và schema rõ, chạy demo đơn giản bằng một volume. SQLite có một writer, cần đánh giá PostgreSQL khi nhiều đơn đồng thời. |
| React, Router, Tailwind, Recharts | Một ứng dụng cho khách/admin, chọn phân loại và giá theo trạng thái, có biểu đồ. Chưa có kết quả Lighthouse đo mới. |
| n8n | Trình bày luồng tích hợp trực quan, credential dịch vụ nằm trong n8n. Workflow chỉ import tự động một lần, bản cập nhật cần import/publish. |
| Outbox | Đơn và ý định phát sự kiện commit cùng nhau, retry có backoff. Các bước thông báo có thể lặp nếu workflow lỗi sau khi đã gửi, chưa có exactly-once toàn hệ thống. |
| Sharp, WebP và volume ảnh | Xác minh ảnh và tạo thumbnail trên server. Cần backup volume cùng database. |

Giá VND dùng số nguyên. Doanh thu gồm tổng tiền đơn DELIVERED theo ngày đặt ở Asia/Ho_Chi_Minh. Doanh thu danh mục chỉ gồm tiền hàng, phần ship và đóng gói không phân bổ vào danh mục. Thống kê top cá chỉ lấy dòng hàng isLiveFish.

## Bảng API

Danh sách đầy đủ được trích từ route Express trong [api-reference.md](../api-reference.md). Public dùng rate limit, admin dùng Bearer JWT audience long-fish-admin, nội bộ dùng x-api-key. Nginx chặn truy cập /api/internal từ cổng public. /uploads chỉ phục vụ tên tệp UUID WebP hợp lệ.

Tài liệu chính xác về schema nằm ở `backend/prisma/schema.prisma`, transaction ở `backend/src/orders.ts`, worker ở `backend/src/outbox.ts`, workflow ở `n8n/workflows`.
