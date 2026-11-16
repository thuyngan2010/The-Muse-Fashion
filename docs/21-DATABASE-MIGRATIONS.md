# Kế hoạch migration, index và dữ liệu khởi tạo

**DBOPS-FASHION-001 · v1.0 · 24/10/2026**

Schema mục tiêu nằm tại [Data Model](03-DATA-MODEL.md). Mỗi thay đổi production phải có migration versioned, idempotent, quan sát được và có phương án rollback/forward-fix; không chỉnh tay collection production ngoài runbook sự cố đã ghi audit.

## 1. Quy ước migration

- File: `apps/api/src/migrations/YYYYMMDDHHmm_<name>.ts`; export `id`, `up(db)`, `verify(db)` và `down(db)` khi rollback không làm mất dữ liệu.
- Collection `schema_migrations` có unique `id`, `checksum`, `startedAt`, `completedAt`, `appVersion`, `status`, `error`.
- Runner dùng distributed lock `migration_lock` có lease 10 phút; chỉ một instance chạy. CI kiểm checksum không đổi với migration đã phát hành.
- Triển khai theo expand → backfill → switch-read/write → contract. Không drop/rename field/index trong cùng release bắt đầu ghi field mới.
- Backfill theo batch có cursor bền vững, giới hạn tải, có thể chạy lại; log số scanned/updated/failed nhưng không log PII.

## 2. Thứ tự baseline

| Wave | Collection/index | Gate |
|---|---|---|
| M0 Identity | users email unique; sessions/token TTL; staff permission unique | normalize email và xử lý duplicate trước unique index |
| M1 Catalog/media | category slug, product slug/SKU, media key, status indexes | không publish reference thiếu; R2 finalize contract đạt |
| M2 Commerce | carts, orders/idempotency, inventory ledger/eventKey, voucher code/usage | Mongo replica set; transaction/concurrency test đạt |
| M3 Payment | payment/refund reconciliation code unique, event unique, one succeeded/Order, refund idempotency, recipient snapshot và matchedEventId unique | raw-body HMAC và Simulator contract test `in`/`out` đạt; dữ liệu đối ứng thiếu vào review |
| M4 Experience | review uniqueness, post/comment, AI quota/job TTL | retention worker + ownership test đạt |
| M5 Operations | outbox, email event, notification, settings, audit | worker retry/dedup và backup restore rehearsal đạt |

## 3. Index bắt buộc

| Collection | Index canonical |
|---|---|
| `users` | unique `{emailNormalized:1}`; `{role:1,status:1}` |
| `auth_sessions` | unique `{refreshHash:1}`; TTL `{expiresAt:1}` |
| `email_tokens` | unique `{tokenHash:1}`; TTL `{expiresAt:1}` |
| `product_variants` | unique `{sku:1}`; `{productId:1}` |
| `orders` | unique `{code:1}`; unique `{customerId:1,idempotencyKey:1}`; `{customerId:1,createdAt:-1}`; `{state:1,paymentDueAt:1}` |
| `inventory_ledger` | unique `{eventKey:1}`; `{variantId:1,createdAt:-1}` |
| `vouchers` | unique `{codeNormalized:1}`; `{status:1,validFrom:1,validTo:1}` |
| `payment_attempts` | unique `{provider:1,reconciliationCode:1}`; partial unique `{orderId:1}` where `state='SUCCEEDED'`; `{state:1,expiresAt:1}` |
| `payment_events` | unique `{provider:1,eventId:1}`; `{resolution:1,createdAt:1}` |
| `refunds` | unique `{idempotencyKey:1}`; partial unique `{reconciliationCode:1}` khi có mã; partial unique `{matchedEventId:1}` khi có event; `{state:1,createdAt:1}` |
| `reviews` | unique `{customerId:1,orderItemId:1}` including soft-deleted rows |
| `ai_quotas` | unique `{ownerId:1,type:1,windowStart:1}` |
| `media_objects` | unique `{key:1}`; `{status:1,expiresAt:1}` |
| `outbox_events` | unique `{eventId:1}`; `{status:1,nextAttemptAt:1}` |
| `email_events` | unique `{dedupKey:1}`; `{state:1,nextAttemptAt:1}` |
| `notifications` | `{ownerId:1,createdAt:-1}`; `{ownerId:1,readAt:1}` |
| `audit_logs` | `{createdAt:-1}`; `{entityType:1,entityId:1,createdAt:-1}` |

TTL index chỉ dùng cho record thật sự có thể xóa vật lý. Order, payment, refund, ledger, audit và consent không dùng TTL.

## 4. Replica set và transaction gate

Trước M2, local/CI/staging/prod đều phải kết nối replica set. Startup production fail-fast nếu feature `commerce.enabled=true` nhưng topology không hỗ trợ transaction. Transaction checkout gồm: conditional reserve mọi SKU → reserve voucher usage → insert Order snapshot/idempotency → insert ledger → insert outbox. Bất kỳ bước nào lỗi phải rollback toàn bộ.

## 5. Seed

- Seed idempotent chỉ tạo category/product fixture không PII và setting mặc định: shipping fee, free-shipping threshold, AI quota, low-stock threshold.
- Bootstrap Admin là command riêng, nhận email/password qua prompt/env tạm, không hard-code và không chạy tự động khi deploy.
- Không seed payment event thật, API key, bank account hoặc ảnh người dùng.

## 6. Deploy và rollback

1. Backup và ghi restore point; kiểm replica health/disk.
2. Chạy migration expand/index nền; `verify` phải đạt trước app rollout.
   Runner phát hành: `node apps/api/dist/scripts/migrate.js` từ cùng API image/tag. Docker Compose chạy service `api-migrate` và chờ job hoàn tất trước API.
3. Deploy app tương thích cả schema cũ/mới; chạy backfill; kiểm count/error/latency.
4. Bật read path mới bằng feature flag; quan sát một release.
5. Chỉ contract field/index cũ ở release sau và sau backup mới.

Nếu migration lỗi: dừng rollout, giải phóng lock theo lease, chạy lại idempotent hoặc forward-fix. Không chạy `down` nếu làm mất dữ liệu; khôi phục backup chỉ theo [Operations Runbook](24-OPERATIONS-RUNBOOK.md).

## 7. Kiểm chứng bắt buộc

- Fresh database chạy toàn bộ migration và seed thành công.
- Database ở version trước nâng cấp thành công hai lần liên tiếp mà lần hai không thay đổi dữ liệu.
- `verify` xác nhận collection validator/index/unique constraints và không có duplicate.
- Test transaction rollback, two-checkout-last-stock, voucher limit race, expiry/webhook race và outbox dedup.
- Mỗi migration ghi thời lượng, số bản ghi, index size và kế hoạch dung lượng.
