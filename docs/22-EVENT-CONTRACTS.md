# Hợp đồng event và outbox

**EVENT-FASHION-001 · v1.0 · 24/10/2026**

Event nội bộ là thông báo bất đồng bộ sau khi domain transaction đã commit. Không dùng event để né transaction bắt buộc giữa Order, stock, voucher và Payment.

## 1. Envelope canonical

```json
{
  "eventId": "uuid",
  "eventType": "order.status_changed",
  "eventVersion": 1,
  "occurredAt": "2026-10-24T03:00:00.000Z",
  "producer": "orders",
  "aggregateType": "order",
  "aggregateId": "orderId",
  "aggregateVersion": 3,
  "correlationId": "uuid",
  "causationId": "request-or-event-id",
  "actor": { "type": "USER", "id": "userId" },
  "data": {}
}
```

`eventId` là idempotency key toàn cục. Không đặt password/token, raw webhook, secret, signed URL, full bank account hoặc ảnh trong event. Consumer phải lấy dữ liệu nhạy cảm qua service/repository có quyền.

## 2. Event catalog và payload v1

| Event | `data` tối thiểu | Consumer |
|---|---|---|
| `user.created` | `userId`, `email`, `verificationTokenId` | email |
| `user.password_reset_requested` | `userId`, `email`, `resetTokenId` | email |
| `order.created` | `orderId`, `customerId`, `code`, `payableTotal`, `paymentDueAt` | email, notification |
| `order.status_changed` | `orderId`, `customerId`, `from`, `to`, `reason` | email, notification |
| `payment.verified` | `orderId`, `customerId`, `paymentAttemptId`, `amount`, `paidAt` | email, notification |
| `refund.completed` | `orderId`, `customerId`, `refundId`, `amount`, `refundedAt` | email, notification |
| `post.commented` | `postId`, `postOwnerId`, `commentId`, `actorId` | notification |
| `lookbook.published` | `lookbookId`, `version` | notification when feature enabled |
| `ai.job.completed` | `jobId`, `ownerId`, `expiresAt` | notification |

Email address chỉ được mang trong identity event tới email consumer nội bộ; không ghi payload vào application log.

## 3. Outbox state machine

`PENDING → PROCESSING → PUBLISHED`; transient failure quay về `PENDING` với `nextAttemptAt`; quá 10 lần hoặc payload/schema lỗi → `DEAD`. Worker claim bằng atomic lease 60 giây; lease hết hạn có thể claim lại. Delivery là at-least-once, vì vậy mọi consumer lưu unique `consumerName + eventId` hoặc dùng unique business `dedupKey`.

Thứ tự chỉ được bảo đảm theo một aggregate bằng `aggregateVersion`. Consumer gặp version nhảy có thể retry tối đa 5 phút rồi lấy state hiện tại; event cũ hơn state đã xử lý được ACK idempotent. Không bảo đảm thứ tự toàn cục.

## 4. Versioning

- Chỉ thêm field optional giữ nguyên `eventVersion`.
- Xóa/đổi nghĩa/type field phải tăng version và chạy dual-publish trong ít nhất một release.
- Consumer phải bỏ qua field không biết và từ chối version không hỗ trợ vào `DEAD` kèm alert.
- JSON Schema/TypeScript contract đặt trong `packages/contracts`; contract test khóa producer và consumer cùng version.

## 5. Retry, replay và dead-letter

- Retry outbox: 10 giây, 30 giây, 2 phút, 10 phút, 1 giờ, 6 giờ rồi tối đa mỗi 6 giờ đến lần 10, có jitter.
- Replay chỉ Admin vận hành qua command máy chủ, bắt buộc `eventId`, consumer đích, ticket/reason và dry-run; replay không sửa payload lịch sử.
- Với email, retry riêng theo DEC-11 và `dedupKey`; publish event thành công không có nghĩa email delivered.
- Alert khi event `DEAD`, oldest pending >5 phút hoặc publish error rate >1% trong 10 phút.

## 6. Transaction boundaries

Producer ghi domain state và outbox trong cùng Mongo transaction. Dispatcher không gọi provider khi transaction chưa commit. Webhook GPM Pay ghi `payment_event`, cập nhật attempt/Order và outbox trong cùng transaction; handler ACK sau commit. Notification/email failure không rollback Order hoặc Payment.

## 7. Contract tests

Kiểm schema mọi event, duplicate delivery, worker crash sau side effect trước ACK, lease recovery, out-of-order aggregate version, unsupported version, dead-letter/replay và redaction logs. Trace mỗi test tới UC33–UC37 hoặc producer UC tương ứng.
