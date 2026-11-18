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

## 5. Mẫu email

Mỗi email gửi cả HTML và bản chữ thuần (`text`). Mã nguồn nằm ở `apps/api/src/modules/mail/templates/`: `layout.ts` (khung chung), `components.ts` (nút, bảng thông tin, khung nhắc nhở), `escape.ts` (escape HTML, định dạng tiền `1.250.000đ`, ngày giờ `dd/MM/yyyy HH:mm` giờ Việt Nam), `account-templates.ts` (các mẫu tài khoản) và `index.ts` (`buildEmailMessage`).

| Mẫu | Tiêu đề thư | Nút → đường dẫn |
|---|---|---|
| `user.verify_email` | Xác thực email để kích hoạt tài khoản MUSE | XÁC THỰC EMAIL → `/verify-email?token=` |
| `user.reset_password` | Đặt lại mật khẩu tài khoản MUSE | ĐẶT MẬT KHẨU MỚI → `/reset-password?token=` |
| `staff.invite` | Lời mời tham gia hệ thống quản trị MUSE | ĐẶT MẬT KHẨU & KÍCH HOẠT → `/reset-password?token=`; nhắc đăng nhập tại `/admin/login` |
| `user.password_changed` | Mật khẩu tài khoản MUSE vừa được thay đổi | ĐẶT LẠI MẬT KHẨU → `/forgot-password`; LIÊN HỆ HỖ TRỢ → `mailto:` (chỉ khi có `MAIL_SUPPORT_EMAIL`) |
| mẫu khác / mặc định | Thông báo từ MUSE | MỞ MUSE → trang chủ |

Email đơn hàng và thanh toán (`templates/order-templates.ts`):

| Mẫu | Tiêu đề thư | Nội dung chính / nút |
|---|---|---|
| `order.created` | MUSE đã nhận đơn hàng #<mã> | bảng mã đơn/ngày đặt/trạng thái, danh sách sản phẩm, tạm tính, phí ship ("Miễn phí" khi 0), voucher, TỔNG THANH TOÁN, địa chỉ giao. Đơn chờ thanh toán: khung nhắc VietQR, nút THANH TOÁN NGAY → `/payment/<id>` và XEM ĐƠN HÀNG → `/orders/<id>`; trạng thái khác chỉ có XEM ĐƠN HÀNG |
| `order.status_changed` | theo trạng thái mới: "Đơn #<mã> đã được xác nhận", "MUSE đang chuẩn bị đơn #<mã>", "Đơn #<mã> đang trên đường giao đến bạn", "Đơn #<mã> đã giao thành công", "Đơn #<mã> đã được hủy", "Đơn #<mã> đang chờ hoàn tiền" | thanh tiến trình 5 bước (hủy/chờ hoàn tiền dùng khung thông báo kèm lý do), đơn vị vận chuyển và mã vận đơn khi đang giao, nút ĐÁNH GIÁ SẢN PHẨM → `/orders/<id>?action=review` khi đã giao |
| `payment.succeeded` | Thanh toán thành công cho đơn #<mã> | dấu tích xanh, số tiền, "Chuyển khoản VietQR", thời gian, mã đơn |
| `refund.succeeded` | MUSE đã hoàn tiền cho đơn #<mã> | số tiền hoàn, mã tham chiếu ngân hàng, thời gian, ghi chú 1–3 ngày làm việc |

Dữ liệu: payload của event chỉ có mã, số tiền, trạng thái. Khi gửi, `EmailDispatchService` **đọc thêm** (không ghi) đơn `orders`, `shipments`, `product_variants` (màu/size) và `order_events` (lý do hủy) theo `orderId`. Không tìm thấy đơn hoặc đọc lỗi thì email vẫn gửi bằng dữ liệu trong payload (phần thiếu bị ẩn; thiếu mã đơn thì dùng 8 ký tự cuối của `orderId`). Ảnh sản phẩm 64px chỉ hiện khi có URL `https://` công khai. Nhãn trạng thái tiếng Việt nằm ở `templates/escape.ts` (khớp `apps/web/src/app/shared/labels.ts`); trạng thái lạ hiện "Đang cập nhật", không lộ mã tiếng Anh.

Quy tắc:

- Khung bằng `<table role="presentation">` rộng tối đa 600px, CSS inline; `<style>` trong `<head>` chỉ có media query mobile (dưới 600px) và dark mode. Không flex, grid, position, JavaScript, ảnh nền. Có `meta color-scheme = light only` và preheader ẩn.
- Mọi dữ liệu động đi qua `escapeHtml`; link chỉ tạo từ `PUBLIC_WEB_URL` và `encodeURIComponent(token)`. Token và link có token không bao giờ được ghi log.
- Thiếu dữ liệu trong payload (tên, thời điểm...) thì phần đó bị ẩn, email vẫn gửi được.
- Logo ảnh `PUBLIC_WEB_URL/assets/brand/muse-logo-black.png` chỉ dùng khi `PUBLIC_WEB_URL` bắt đầu bằng `https://`; ngược lại hiện chữ MUSE.
- Chân thư lấy liên hệ từ `MAIL_SUPPORT_EMAIL`, `MAIL_SUPPORT_PHONE`, `MAIL_ADDRESS` (đều tùy chọn; để trống thì bỏ dòng tương ứng).
- Lời mời nhân viên dùng mẫu `staff.invite` nhưng vẫn xử lý token như `user.reset_password`. Email `user.reset_password` cũ còn chờ gửi vẫn gửi bình thường.

Xem trước (không gửi email, không cần MongoDB):

```bash
npm run email:preview --workspace @fashion/api
```

Lệnh ghi HTML và TXT của mọi mẫu (dữ liệu giả, có tên dài và ký tự `< > &`) vào `apps/api/.email-preview/` và tạo `index.html` hiển thị từng mẫu ở độ rộng desktop và mobile. Thư mục này nằm trong `.gitignore`. Đặt `PUBLIC_WEB_URL=https://...` trong `.env` để xem cả ảnh logo.

## 6. Thực trạng code

`EmailDispatchService` xử lý các template xác minh, reset, đổi mật khẩu, đơn hàng, thanh toán và hoàn tiền qua outbox. Nếu cấu hình từng thiếu trong phiên bản cũ, worker tự đưa các event không chứa token có `lastError = "SendGrid is not configured"` từ `PERMANENT_FAILURE` về `PENDING` khi cấu hình được khôi phục và event còn hạn. Event xác minh/reset cũ đã xóa `tokenCiphertext` không thể phát lại: người dùng cần gọi resend verification hoặc forgot password để nhận token mới. Không requeue mù các lỗi 4xx khác; xác minh nguyên nhân với SendGrid trước.

Envelope event, outbox lease, replay và dead-letter theo [Event Contracts](22-EVENT-CONTRACTS.md).

**Tài liệu chính thức:** https://www.twilio.com/docs/sendgrid/for-developers/sending-email/quickstart-nodejs
