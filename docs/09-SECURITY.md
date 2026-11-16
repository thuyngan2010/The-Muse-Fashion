# Security & Privacy Baseline

## 1. Threat model

Tài sản: thông tin tài khoản, ảnh cá nhân/AI, đơn hàng, payment state, Staff permission, SendGrid API key, R2 credentials, JWT signing key. Đối thủ: guest giả mạo tài khoản, user đọc đơn người khác (IDOR), admin/staff lạm quyền, giả mạo webhook, upload malicious image, stolen API key, XSS ở cộng đồng.

## 2. Kiểm soát

| Rủi ro | Kiểm soát bắt buộc |
|---|---|
| Authentication / credential stuffing | bcrypt/Argon2id, token TTL, refresh rotation/revocation, account lock/rate limiting, generic forgot response |
| RBAC / IDOR | per-request AuthGuard + roles + staff permission + ownership query; 401/403/404 tests |
| Injection / XSS | DTO whitelist; NoSQL allowlist; escape community content; CSP; không render unsafe HTML |
| GPM Pay spoof/replay | HMAC trên `t.raw_body`, constant-time compare, timestamp ≤300s, raw body, unique `payload.id`; allowlist account, `transferType=in`, exact code/amount; production reject `SIMULATED` |
| Email spoof / open redirect | verified sender/domain SendGrid; email links từ configured canonical origin; never token in server log |
| R2 media leak | key with UUID, private bucket, presigned upload/read short TTL, permission check, object validation |
| AI personal data leak | explicit consent, private R2, per-owner access, retention cleanup/lifecycle, delete requests |
| Secrets exposure | env/secret manager, gitignore, minimal scopes, rotation protocol, CI secret scanner |
| Data integrity | unique indexes, DB transactions and business state machine, audit append-only |

## 3. Kiểm soát đã triển khai và phần còn lại trước production

- `AuthService` dùng access JWT gắn `sid`, refresh token rotation, thu hồi session, giới hạn tốc độ đăng nhập/resend/forgot và phản hồi forgot chung để giảm lộ tài khoản. Đăng ký, gửi lại xác minh, tạo reset token và đổi/reset mật khẩu ghi email outbox trong cùng transaction với dữ liệu tương ứng.
- Email giao dịch được ghi vào `email_events`, token trong payload được mã hóa; worker có lease, dedup và retry. Thiếu cấu hình SendGrid giữ event chờ cấu hình được khôi phục. Event cũ lỗi vì thiếu cấu hình được requeue tự động nếu không chứa token và còn hạn; email xác minh/reset cũ đã mất token phải yêu cầu phát hành token mới.
- R2 presigned upload ký `Content-Length` bằng `sizeBytes` đã giới hạn, `If-None-Match: *` và `Content-Type`; finalize vẫn kiểm size/MIME/cấu trúc rồi bỏ metadata. Chưa có decode/re-encode toàn phần hoặc virus/media scan chuyên dụng.
- Swagger hiện cần giới hạn hoặc tắt trên production theo chính sách; CORS/Helmet mới ở mức cơ bản.
- `User` schema có bcrypt hash, nhưng secret protection/rotation/PII retention cần triển khai thêm.

Trước production cần đánh giá các kiểm soát còn thiếu theo dữ liệu và phạm vi triển khai thực tế.

## 4. SendGrid và R2 secrets

- SendGrid API key chỉ scope Mail Send; verified sender domain; tuyệt đối không nhúng vào bundle Angular.
- R2 access key server-side; dùng key scope bucket cụ thể, không public S3 API. Private media không xuất `R2_PUBLIC_BASE_URL`.
- Dùng HTTPS; hạn chế access logs chứa token query verification; sanitize request logs.

## 5. Incident response

Khi có lộ key/đăng nhập trái phép: vô hiệu hóa/rotate credentials, revoke session, tạm chặn endpoint nếu cần, kiểm audit/logs, đánh giá PII, báo người phụ trách theo chính sách. Không xóa lịch sử giao dịch/audit bằng thao tác UI. Phân loại/retention/xóa dữ liệu theo [Data Privacy](23-DATA-PRIVACY.md); quy trình incident chi tiết theo [Operations Runbook](24-OPERATIONS-RUNBOOK.md).
