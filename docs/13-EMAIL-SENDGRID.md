# Tích hợp email — Twilio SendGrid

**Provider duy nhất của hệ thống: Twilio SendGrid.** Email giao dịch đi qua backend NestJS; không gửi trực tiếp từ Angular.

## 1. Cấu hình và xác thực

1. Tạo SendGrid account, bật 2FA.
2. Xác thực domain/sender trong SendGrid (Domain Authentication, SPF/DKIM theo hướng dẫn của provider).
3. Tạo API key giới hạn **Mail Send** và lưu secret manager.
4. Cấu hình backend `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`, `PUBLIC_WEB_URL`.
5. Bật test gửi tới inbox test, kiểm lỗi từ API, subject/link đúng origin HTTPS.

Mẫu `.env`: `apps/api/.env.example`. API chỉ xác nhận email đã được đưa vào `email_events`; worker gửi sau khi có cấu hình SendGrid hợp lệ.

## 2. Email event catalog

| Event / template | UC | Recipient | Nội dung tối thiểu | Quy tắc |
|---|---|---|---|---|
| `user.verify_email` | UC01, UC33 | email đăng ký | link một lần, hạn dùng | chỉ kích hoạt khi token hợp lệ |
| `user.reset_password` | UC05, UC33 | email đã đăng ký | reset link, không lộ tình trạng tài khoản | anti-enumeration |
| `user.password_changed` | UC06, UC34 | chủ tài khoản | cảnh báo bảo mật | không chứa mật khẩu/token |
| `order.created` | UC15, UC34 | chủ đơn | mã đơn, tiền, phương thức | dedup per order |
| `order.status_changed` | UC18/19, UC34 | chủ đơn | code, trạng thái, link | idempotent event |
| `payment.succeeded` | UC27, UC34 | chủ đơn | trạng thái, số tiền, tham chiếu | sau webhook verified |
| `refund.succeeded` | UC29, UC34 | chủ đơn | số tiền được hoàn và mã tham chiếu ngân hàng | chỉ sau webhook tiền ra khớp đầy đủ hoặc Admin đối chiếu sao kê có bằng chứng; GPM Pay không ra lệnh refund |

## 3. Thiết kế gửi bền vững

- Transaction nghiệp vụ tạo `email_events` (`dedupKey` ổn định, state `PENDING`) cùng user/token/order tương ứng.
- Dispatcher gửi qua SendGrid, lưu `providerId` và state `SENT` nếu API chấp nhận.
- Tối đa 5 lần gồm lần đầu; retry transient 429/5xx/timeout có jitter ở khoảng 1 phút, 5 phút, 30 phút, 2 giờ. Lỗi provider 4xx trừ 429 vào `PERMANENT_FAILURE` để vận hành xử lý.
- Khi thiếu `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` hoặc `PUBLIC_WEB_URL`, worker giữ event `PENDING` và không tiêu hao số lần thử. Sau khi cấu hình được bổ sung và worker khởi động lại, event chưa hết hạn được gửi theo lịch.
- Lưu trạng thái Delivered/Bounced/Blocked từ provider Event Webhook nếu tích hợp; webhook này cần xác thực chữ ký.
- Không gửi lại email cùng dedupKey khi retry worker; token verification/reset phải dùng một lần.
- Tách email giao dịch bắt buộc khỏi marketing (opt-out, consent, unsubscribe).

## 4. Bảo mật template

- Template HTML escape mọi biến; không chèn input user dưới dạng HTML trực tiếp.
- Link dùng `PUBLIC_WEB_URL` allowlist, token ngắn hạn, không đưa token ra logs.
- Không gửi thông tin thẻ, password, R2 private signed URLs dài hạn trong email.

## 5. Thực trạng code

`EmailDispatchService` xử lý các template xác minh, reset, đổi mật khẩu, đơn hàng, thanh toán và hoàn tiền qua outbox. Nếu cấu hình từng thiếu trong phiên bản cũ, worker tự đưa các event không chứa token có `lastError = "SendGrid is not configured"` từ `PERMANENT_FAILURE` về `PENDING` khi cấu hình được khôi phục và event còn hạn. Event xác minh/reset cũ đã xóa `tokenCiphertext` không thể phát lại: người dùng cần gọi resend verification hoặc forgot password để nhận token mới. Không requeue mù các lỗi 4xx khác; xác minh nguyên nhân với SendGrid trước.

Envelope event, outbox lease, replay và dead-letter theo [Event Contracts](22-EVENT-CONTRACTS.md).

**Tài liệu chính thức:** https://www.twilio.com/docs/sendgrid/for-developers/sending-email/quickstart-nodejs
