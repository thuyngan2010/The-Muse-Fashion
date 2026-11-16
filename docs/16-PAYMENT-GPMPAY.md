# Tích hợp thanh toán chuyển khoản qua GPM Pay

**PAY-FASHION-001 · v1.0 · 23/10/2026**

Tài liệu này chốt thiết kế payment cho Fashion Commerce theo tài liệu chính thức của [GPM Pay](https://docs.gpmpay.com/). GPM Pay được dùng để nhận biến động số dư và tự động đối soát chuyển khoản ngân hàng; đây không phải luồng checkout thẻ và không tạo order/payment session thay cho hệ thống.

Deployment dùng GPM Pay khi `PAYMENT_PROVIDER=GPMPAY` (mặc định). Khi chọn `SEPAY`, webhook GPM Pay không hoạt động; xem [hướng dẫn SePay](25-PAYMENT-SEPAY.md).

## 1. Phạm vi và giới hạn

- Hệ thống tự tạo `PaymentAttempt`, số tiền VND và mã đối soát; GPM Pay không giữ trạng thái đơn hàng.
- Frontend hiển thị VietQR, số tài khoản, tên chủ tài khoản, số tiền và nội dung chuyển khoản. Không redirect khách sang GPM Pay.
- GPM Pay gửi webhook cho mọi giao dịch của tài khoản ngân hàng đã bật webhook. Backend phải tự lọc tiền vào, tìm mã đối soát và so khớp số tiền.
- GPM Pay không có API tạo phiên thanh toán hoặc API ra lệnh hoàn tiền trong API Reference. Hoàn tiền là chuyển khoản thủ công của nhân viên theo VietQR hướng tới tài khoản Customer; webhook biến động tiền ra có thể tự đối soát khi đủ dữ liệu.
- Luồng thanh toán hiện tại không gọi API GPM Pay; backend dựng VietQR từ cấu hình ngân hàng và nhận webhook để đối soát.

## 2. Cấu hình merchant

1. Tạo tài khoản GPM Pay, thêm và xác minh tài khoản ngân hàng nhận tiền.
2. Đăng ký webhook HTTPS `POST /api/v1/webhooks/payment/gpmpay`, chọn chế độ **HMAC**.
3. Lưu `GPMPAY_WEBHOOK_SECRET`, `GPMPAY_BANK_BIN`, `GPMPAY_ACCOUNT_NUMBER` và `GPMPAY_ACCOUNT_NAME` trong biến môi trường của API. Giữ secret ngoài Angular bundle và log.
4. Cho phép webhook `SIMULATED` ở local/staging để test. Production chỉ được ghi nhận tiền từ `source=REAL`.

Webhook của hệ thống dùng HMAC. Không dùng chế độ `API KEY` hoặc `NONE`.

## 3. Khởi tạo thanh toán và VietQR

1. Customer chọn thanh toán chuyển khoản cho Order `PENDING_PAYMENT` còn hạn.
2. Backend kiểm tra ownership/trạng thái và lấy `payableTotal` từ Order snapshot.
3. Backend sinh mã đối soát khó đoán, duy nhất cho attempt, ví dụ `FC7K9M2Q4`; không tái sử dụng mã của attempt hết hạn.
4. Backend lưu attempt với `provider=GPMPAY`, `reconciliationCode`, `expectedAmount` là số nguyên VND, `currency=VND`, `expiresAt=Order.paymentDueAt`, `state=PENDING`. Order giữ tồn 30 phút từ lúc tạo và chỉ có một attempt PENDING.
5. Backend dựng payload bằng `buildVietQrPayload` của `@gpmpay/sdk`; nội dung tối đa 50 ký tự và chứa nguyên vẹn mã đối soát.
6. API trả dữ liệu hiển thị QR. Frontend tuyệt đối không được tự sửa số tiền/mã đối soát và chỉ polling trạng thái attempt thuộc Customer.

Sinh QR không tạo giao dịch tại GPM Pay. Attempt chỉ thành công sau webhook hợp lệ và đối soát thành công.

## 4. Hợp đồng API chưa triển khai

### `POST /api/v1/payments/attempts`

Request chỉ chứa `orderId`; không nhận `amount`, số tài khoản hoặc nội dung chuyển khoản từ client. Response:

```json
{
  "id": "paymentAttemptId",
  "provider": "GPMPAY",
  "state": "PENDING",
  "amount": 100000,
  "currency": "VND",
  "reconciliationCode": "FC7K9M2Q4",
  "qrImageUrl": "https://img.vietqr.io/image/...",
  "bank": { "bin": "970436", "accountNumber": "0123456789", "accountName": "FASHION COMMERCE" },
  "expiresAt": "2026-10-23T17:00:00.000Z"
}
```

### `POST /api/v1/webhooks/payment/gpmpay`

- Nhận raw body và header `X-GPMPay-Signature: t=...,v1=...`.
- Dùng `constructWebhookEvent()` của `@gpmpay/sdk` trên raw body; từ chối chữ ký sai hoặc timestamp lệch quá 300 giây.
- Nếu `test === true`, trả `2xx` ngay và không ghi nhận payment/event nghiệp vụ.
- Với event thật, chỉ xét `transferType=in`, tài khoản nhận nằm trong allowlist và `source` phù hợp môi trường.
- Trích đúng một `reconciliationCode` từ `content`, tìm attempt còn hợp lệ và đối chiếu `transferAmount === expectedAmount`, `currency=VND` theo cấu hình hệ thống.
- Dùng `payload.id` làm idempotency key. Trong một transaction, insert `payment_event`, chuyển attempt `PENDING -> SUCCEEDED`, chuyển Order `PENDING_PAYMENT -> CONFIRMED` và ghi outbox.
- Event trùng hoặc payment đã thành công trả `2xx` nhưng không phát sinh side effect lần hai.

GPM Pay retry khi endpoint không trả `2xx` hoặc timeout 15 giây: `10s → 30s → 2m → 10m → 1h → 6h`, tối đa 6 lần. Handler phải hoàn tất nhanh; email/notification được đẩy qua outbox sau transaction.

### `GET /api/v1/payments` và `GET /api/v1/payments/:id`

Customer chỉ xem attempt thuộc Order của mình. Kết quả không trả webhook secret, raw signature, toàn bộ số tài khoản hoặc dữ liệu đối ứng không cần thiết.

## 5. Đối soát và ngoại lệ

| Tình huống | Xử lý |
|---|---|
| Chữ ký sai hoặc timestamp quá hạn | Trả `401`, ghi security log đã loại bỏ secret/payload nhạy cảm; không đổi Order/Payment |
| `test=true` | Trả `2xx`, không tạo payment event nghiệp vụ |
| `transferType=out` | Không ghi nhận thanh toán Order; thử đối soát Refund theo mục 7. Event không khớp vào `UNMATCHED/REQUIRES_REVIEW`, vẫn trả `2xx` |
| `source=SIMULATED` ở production | Trả `2xx`, đánh dấu ignored; không ghi nhận thanh toán |
| Không tìm thấy mã đối soát hoặc có nhiều mã | Lưu `UNMATCHED` để Admin đối soát, trả `2xx` |
| Sai số tiền, attempt hết hạn hoặc Order đã hủy | Lưu `REQUIRES_REVIEW`, không tự xác nhận đơn, trả `2xx` |
| Event trùng `payload.id` | Trả `2xx` idempotent |
| Webhook đến sau khi worker hết hạn attempt/Order | Lưu `REQUIRES_REVIEW`; không tự khôi phục Order đã hủy hoặc reserve lại tồn |
| Webhook hợp lệ nhưng DB lỗi | Trả `5xx` để GPM Pay retry; transaction không commit dở dang |

Luồng tự động chỉ khớp **một giao dịch tiền vào đúng toàn bộ số tiền**. Chuyển thiếu, chuyển dư, cộng nhiều giao dịch hoặc một giao dịch chứa nhiều mã đều đi vào hàng đợi đối soát thủ công.

## 6. Dữ liệu tối thiểu

- `payment_attempts`: `orderId`, `provider=GPMPAY`, `reconciliationCode`, `expectedAmount`, `currency`, `state=PENDING|SUCCEEDED|FAILED|REQUIRES_REVIEW`, `expiresAt`, `paidAt`, `matchedEventId`.
- `payment_events`: `provider=GPMPAY`, `eventId`, `gateway`, `accountNumberHash/last4`, `counterAccountHash/last4`, `counterBankBin`, `transferType`, `transferAmount`, `transactionDate`, `referenceCode`, `source`, `content`, `signatureVerified`, `payloadDigest`, `resolution`, `matchedRefundId`.
- Unique index: payment `provider + reconciliationCode`, refund `reconciliationCode` và `matchedEventId` khi có giá trị, `provider + eventId`, và một payment `SUCCEEDED` cho mỗi Order.
- Tiền VND lưu integer. Không lưu raw payload; lưu digest và các field đã chuẩn hóa cần cho audit/đối soát.

## 7. Hoàn tiền

GPM Pay chỉ thông báo biến động tài khoản, không ra lệnh refund cho Order. Admin hoặc Staff có `refund.propose` tạo `PENDING_APPROVAL` với số tiền, lý do và snapshot tài khoản nhận (BIN/số tài khoản/tên). Luồng hủy đơn có thể tạo proposal chưa có tài khoản nhận; phải bổ sung và kiểm tra trước duyệt. Một Admin khác proposer duyệt `APPROVED`; backend sinh `reconciliationCode` refund duy nhất, nội dung chuyển khoản chứa nguyên mã và VietQR hướng tới **tài khoản Customer**, không phải tài khoản merchant. Nhân viên chuyển khoản thủ công từ tài khoản merchant đã bật webhook. QR không tự chuyển tiền và không là bằng chứng đã hoàn.

Webhook `out` dùng cùng raw body/HMAC/timestamp/dedup `payload.id` với webhook `in`. Production chỉ tự đối soát `source=REAL`, tài khoản nguồn thuộc allowlist, `content` chứa đúng một mã refund `APPROVED`, số tiền VND bằng refund, `counterAccount` và `counterBankBin` có mặt/khớp snapshot, `transactionDate >= approvedAt`. Trong một Mongo transaction, lưu event, gắn một event với một refund, chuyển `SUCCEEDED`, lưu `referenceCode` và `refundedAt`, cập nhật Order nếu hoàn đủ, ghi outbox. Event trùng ACK mà không tạo side effect lần hai.

GPM Pay ghi `counterAccount`/`counterBankBin` là nullable tùy dữ liệu ngân hàng. Thiếu một trong hai, sai mã/số tiền/người nhận/nguồn, nhiều mã, Refund chưa duyệt hoặc đã fail: lưu `REQUIRES_REVIEW`/`UNMATCHED`; không tự xác nhận. Admin đối chiếu sao kê, mã tham chiếu và bằng chứng qua endpoint complete idempotent; phải kiểm tra event chưa gắn refund khác. Không dùng QR, ảnh chụp giao dịch riêng lẻ hoặc `referenceCode` đơn độc làm bằng chứng đủ. Tổng refund `PENDING_APPROVAL + APPROVED + SUCCEEDED` không vượt số đã thu. Đơn hủy đã thu tiền ở `CANCEL_PENDING_REFUND` tới khi hoàn đủ mới chuyển `CANCELLED`.

## 8. Kiểm thử bắt buộc

Đối với tiền lệch/đến muộn và bank event chưa khớp, dùng [quy trình đối soát hai người](26-AUDIT-REMEDIATION.md). API trả `hasOpenReview` theo toàn bộ attempt của đơn để FE ngừng hướng dẫn trả thêm; không cần đổi state terminal của attempt. `REFUNDED_EXTERNALLY` ghi nhận hoàn toàn bộ bank event bên ngoài sau hai Admin kiểm chứng; không tự xác nhận lại đơn, không tự chuyển tiền. `OUTGOING_RECONCILED` chỉ đóng việc đối soát bank event; không thay thế endpoint complete của Refund đang tồn tại.

- Dùng GPM Pay Simulator ở local/staging; xác nhận `source=SIMULATED` không thể làm paid ở production.
- Test webhook verification payload `test=true`, signature đúng/sai, timestamp lệch trên 300 giây và raw body bị thay đổi.
- Test event trùng, retry, webhook out-of-order, DB rollback và race giữa expiry/webhook.
- Test tiền vào đúng, tiền ra, sai tiền, sai/mất/trùng mã, attempt hết hạn, Order đã hủy.
- Test QR refund hướng tới đúng Customer; `out` REAL khớp đầy đủ tự hoàn đúng một lần; `counterAccount`/`counterBankBin` null, sai người nhận/số tiền/mã/nguồn, webhook trùng/đến muộn và `SIMULATED` production đều không tự hoàn.
- Test Customer không xem payment người khác và frontend không nhận secret.
- Chạy `npx gpmpay ping`, kiểm scope và dùng CLI `webhook send` cho happy path, bad signature và skew trước khi deploy.

## 9. Nguồn chính thức

- [Bắt đầu với GPM Pay](https://docs.gpmpay.com/bat-dau)
- [Webhook payload, HMAC và retry](https://docs.gpmpay.com/webhook)
- [VietQR và đối soát](https://docs.gpmpay.com/ma-qr)
- [SDK Node.js chính thức](https://docs.gpmpay.com/sdk-nodejs)
- [Simulator](https://docs.gpmpay.com/simulator)
- [API Reference](https://docs.gpmpay.com/api-reference)
