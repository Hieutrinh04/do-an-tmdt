# API Long Fish

Trích route từ backend/src/app.ts. Admin yêu cầu Bearer JWT, nội bộ yêu cầu x-api-key, public chịu rate limit. Body chi tiết xem Zod schema tại catalog.ts và domain.ts.

| Method | Đường dẫn | Quyền |
|---|---|---|
| GET | /api/health | Public |
| POST | /api/orders | Public |
| GET | /api/products | Public |
| GET | /api/products/:id/stock | Public |
| GET | /api/products/:slug | Public |
| GET | /api/photo-credits | Public |
| GET | /api/shipping/provinces | Public |
| GET | /api/shipping/policy | Public |
| POST | /api/shipping/quote | Public |
| GET | /api/orders/track | Public |
| POST | /api/payments/bank | Public, header `x-bank-secret` |
| GET | /api/internal/products/search | x-api-key |
| GET | /api/internal/orders/:code | x-api-key |
| POST | /api/internal/orders/track | x-api-key |
| GET | /api/internal/stats/daily | x-api-key |
| GET | /api/internal/stats/monthly | x-api-key |
| POST | /api/internal/handoff | x-api-key |
| POST | /api/admin/login | Public, giới hạn lần sai |
| GET | /api/admin/products | Admin JWT |
| POST | /api/admin/products | Admin JWT |
| PATCH | /api/admin/products/:id | Admin JWT |
| DELETE | /api/admin/products/:id | Admin JWT |
| POST | /api/admin/products/:id/variants | Admin JWT |
| PATCH | /api/admin/products/:id/variants/:variantId | Admin JWT |
| DELETE | /api/admin/products/:id/variants/:variantId | Admin JWT |
| GET | /api/admin/orders | Admin JWT |
| PATCH | /api/admin/orders/:id/status | Admin JWT |
| PATCH | /api/admin/orders/:id/payment | Admin JWT |
| GET | /api/admin/stats/overview | Admin JWT |
| PATCH | /api/admin/orders/:id/details | Admin JWT |
| GET | /api/admin/handoffs | Admin JWT |
| PATCH | /api/admin/handoffs/:id | Admin JWT |
| POST | /api/admin/uploads | Admin JWT, multipart image, tối đa 5 MB |
| GET | /uploads/:uuid.webp | Public, tệp WebP đã dựng |
| GET | /uploads/:uuid-thumb.webp | Public, thumbnail |

`POST /api/payments/bank` nhận `{ "code": "DH20261109-0001", "amount": 120000, "reference": "FT..." }` hoặc `{ "content": "CK DH20261109-0001", "amount": 120000 }`. Yêu cầu `BANK_WEBHOOK_SECRET` và header `x-bank-secret`; chỉ ghi PAID khi mã đơn tồn tại, đơn dùng BANK_QR, chưa hủy và số tiền khớp tuyệt đối. Webhook lặp không tạo thêm log hay thông báo.
