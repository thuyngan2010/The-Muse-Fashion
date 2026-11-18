# Hợp đồng REST API

**API-FASHION-001 · v1.1** · Base path `/api/v1`, JSON UTF-8, UTC ISO-8601 timestamp, monetary integer VND. [OpenAPI 3.1](openapi.yaml) là nguồn chuẩn máy đọc được cho request/response/status/error và dùng để sinh shared types. File này giải thích phạm vi và policy.

## 1. Route đã có mã nguồn

| Method | Endpoint | Auth | Mô tả | Trạng thái |
|---|---|---|---|---|
| GET | `/health` | Public | health probe | Implemented |
| POST | `/auth/register` | Public | register Customer, gửi SendGrid verification | Partial UC01 |
| GET | `/auth/registration-status?token=` | Public | tab đăng ký hỏi `PENDING`/`VERIFIED`/`EXPIRED`; 60 lần/phút/IP, không trả email | Partial UC01 |
| POST | `/auth/verify-email` | Public | sử dụng token một lần | Partial UC01 |
| POST | `/auth/login` | Public | JWT access token | Partial UC02 |
| POST | `/auth/google` | Public | đăng nhập/đăng ký bằng Google ID token; trả phiên như `/auth/login` | Partial UC01/02 |
| GET | `/auth/me` | Bearer | principal | Implemented |
| GET | `/products?q=&page=&limit=` | Public | danh sách published, search name, paging | Partial UC07 |
| GET | `/products/:slug` | Public | chi tiết published | Partial UC08 |
| POST | `/products` | ADMIN | tạo sản phẩm mức basic | Partial UC09 |
| POST | `/storage/presign` | Bearer | signed PUT R2 | Infrastructure partial |
| GET/PATCH | `/users/me` | Bearer | hồ sơ của principal, cập nhật tên/phone/avatar media đã READY | Partial UC04 |
| GET/POST/PATCH/DELETE | `/users/me/addresses` | Bearer Customer | địa chỉ của chính mình, tối đa một mặc định | Partial UC04 |

**Swagger:** `/api/docs`. Sau `R2 presign`, client gọi `/storage/finalize` để backend kiểm tra và ghi object đã xử lý. Các route dưới đây đã có triển khai nghiệp vụ; cần kiểm thử tích hợp trước khi dùng production.

## 2. API nghiệp vụ đã triển khai

| Method | Endpoint dự kiến | UC | Quy tắc chính |
|---|---|---|---|
| POST | `/auth/logout` | UC03 | revoke current session |
| POST | `/auth/refresh` | UC02/03 | rotate refresh token, replay revokes token family |
| POST | `/auth/forgot-password` | UC05/33 | anti-enumeration + one-use token |
| POST | `/auth/reset-password` | UC05 | token verified, hash password |
| POST | `/auth/change-password` | UC06 | current password |
| GET/POST/PATCH | `/categories`, `/admin/products/:id/variants` | UC09 | ADMIN/permission |
| GET | `/lookbooks`, `/lookbooks/:id` | UC10 | public only |
| POST/PATCH | `/admin/lookbooks` | UC11 | permission, tags |
| POST | `/ai/try-on` | UC12 | consent, quota, job ID |
| POST | `/ai/mix-match` | UC13 | validate outfit |
| GET | `/ai/jobs/:id` | UC12/13 | own jobs |
| GET/PUT/DELETE | `/cart` | UC14 | own, current prices |
| POST | `/checkout/quote` | UC15 | recompute server-side |
| POST | `/orders` | UC15 | idempotency key, stock transaction |
| GET | `/orders`, `/orders/:id` | UC16 | own/admin/assigned |
| POST | `/orders/:id/cancel` | UC17 | state guarded, reason |
| PATCH | `/admin/orders/:id/status` | UC18 | state machine, audit |
| PATCH | `/admin/orders/:id/shipment` | UC19 | assigned staff |
| GET/PATCH | `/admin/inventory` | UC20 | atomic adjust, ledger |
| CRUD | `/admin/vouchers` | UC21 | ADMIN only |
| POST/PATCH | `/reviews` | UC22 | verified purchase |
| CRUD | `/community/posts` | UC23 | own/mode |
| GET/POST | `/community/posts/:id/comments` | UC24 | public read, authenticated write |
| PATCH | `/admin/moderation/:id` | UC25 | permission, reason |
| POST | `/payments/attempts` | UC26 | body chỉ có orderId; backend dùng `PAYMENT_PROVIDER` của môi trường, tạo mã đối soát, amount từ Order và trả VietQR |
| POST | `/webhooks/payment/gpmpay` | UC27 | raw body + HMAC; test payload ACK; lọc `in`/source/account, khớp mã và amount, dedup payload.id |
| POST | `/webhooks/payment/sepay` | UC27 | `Authorization: Apikey ...`; trả 200 `{"success":true}`; đối soát tiền vào, dedup `id`; tiền ra cần review thủ công |
| GET | `/payments`, `/payments/:id` | UC28 | owner filter; không trả secret/raw signature/dữ liệu đối ứng không cần thiết |
| POST | `/admin/refunds` | UC29 | Admin hoặc Staff có `refund.propose`; idempotency, amount/reason, tài khoản nhận |
| PATCH | `/admin/refunds/:id/beneficiary` | UC29 | Bổ sung tài khoản nhận cho đề nghị do hủy đơn tạo tự động; chỉ trước khi duyệt |
| PATCH | `/admin/refunds/:id/approve` | UC29 | Admin khác proposer duyệt; sinh mã đối soát và VietQR hướng tới Customer |
| GET | `/admin/refunds/:id` | UC29 | Tác nhân vận hành có quyền xem trạng thái và QR/hướng dẫn chuyển khoản |
| PATCH | `/admin/refunds/:id/complete` | UC29 | Fallback review thủ công khi webhook không đủ dữ liệu; Admin cần bankReference và bằng chứng sao kê |
| PATCH | `/admin/refunds/:id/fail` | UC29 | Admin xác nhận giao dịch chưa thực hiện, có lý do/bằng chứng; webhook đến muộn vào review |
| GET/PATCH | `/admin/users`, `/admin/staff/:id/permissions` | UC30 | audit and last admin |
| POST | `/admin/staff/:staffId/invitation` | UC30 | Đưa email mời Staff vào queue để gửi lại; chỉ Admin |
| GET | `/admin/reports/sales` | UC31 | payment-derived revenue |
| GET/PATCH | `/admin/settings`, `/admin/ai-quotas` | UC32 | validated config |
| internal | `email_events` job | UC33/34 | SendGrid, dedup and retry |
| internal | `order.status.changed` event | UC35 | notification owner |
| internal | `community.event` | UC36 | notification/consent |
| GET/PATCH | `/notifications` | UC37 | own read state |
| POST/GET | `/support/tickets` | Chat hỗ trợ | Customer tạo phiếu (kèm tin đầu, `orderId` phải là đơn của chính khách; tối đa 5 phiếu/giờ) và xem phiếu của mình |
| GET | `/support/tickets/:id`, `/support/tickets/:id/messages?after=&limit=` | Chat hỗ trợ | chi tiết phiếu của mình; tin nhắn tăng dần, `after` (ISO-8601) chỉ trả tin mới hơn để polling 5 giây |
| POST | `/support/tickets/:id/messages`, `/support/tickets/:id/read`, `/support/tickets/:id/close` | Chat hỗ trợ | gửi tin (tối đa 20 tin/phút; phiếu `RESOLVED` được mở lại, `CLOSED` trả 409), đánh dấu đã đọc, tự đóng phiếu |
| GET | `/admin/support/tickets`, `/admin/support/tickets/:id`, `/admin/support/tickets/:id/messages`, `/admin/support/stats` | Chat hỗ trợ | Admin hoặc Staff có `order.read`; phạm vi GLOBAL thấy tất cả, ASSIGNED chỉ thấy phiếu giao cho mình |
| POST/PATCH | `/admin/support/tickets/:id/messages`, `/claim`, `/assign`, `/status`, `/read` | Chat hỗ trợ | trả lời (tạo thông báo `SUPPORT_REPLY` cho khách), nhận phiếu (Admin/GLOBAL), phân công (chỉ Admin), đổi trạng thái, đánh dấu đã đọc; phân công/nhận/đổi trạng thái ghi audit `support_ticket` |

Các route phục vụ giao diện quản trị và đối soát đã bổ sung: `GET /admin/orders`, `PATCH /admin/orders/:id/assign`, `GET /admin/products`, `GET /admin/lookbooks`, `GET /admin/refunds`, `GET /admin/inventory/ledger`, `GET /admin/moderation`, `GET /admin/payment-events`, `PATCH /admin/payment-events/:id/review`, `POST /admin/staff`, `GET /ai/jobs` và `GET /reviews?productId=...`. Xem [OpenAPI](openapi.yaml) để có danh sách method/path đầy đủ.

**Chat hỗ trợ.** Phiếu có mã `TKT-xxxxxx`, loại `ORDER | SIZE | PAYMENT_REFUND | PRODUCT | ACCOUNT | OTHER`, trạng thái `OPEN → IN_PROGRESS → RESOLVED → CLOSED`. Nội dung tin nhắn là chữ thuần 1–2000 ký tự (client hiển thị bằng nội suy, không render HTML); chưa hỗ trợ tệp đính kèm. Cập nhật mới bằng polling 5 giây phía client, không dùng WebSocket. `POST .../messages` trả về tin nhắn vừa lưu. Phía khách chỉ thấy tên hiển thị của nhân viên, không thấy email nội bộ. Vượt hạn mức trả `429` với `code=RATE_LIMITED` và thông báo tiếng Việt.

## 3. Request samples

### Register

```http
POST /api/v1/auth/register
Content-Type: application/json

{"fullName":"Nguyen Van A","email":"customer@example.com","password":"ExampleSecure123"}
```

`201 Created`: `{"id":"...","message":"Verification email queued","registrationToken":"<64 hex>"}`. `registrationToken` (32 byte ngẫu nhiên, lưu dạng băm SHA-256, hiệu lực 24 giờ) chỉ trả ở đây; client dùng nó gọi `GET /auth/registration-status?token=...` để biết đã xác thực chưa. Token sai hoặc hết hạn đều trả `EXPIRED`. Email được đưa vào queue để worker gửi; phản hồi này chưa xác nhận SendGrid đã nhận email.

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"customer@example.com","password":"ExampleSecure123"}
```

`201` trả body `{"accessToken":"...","tokenType":"Bearer","expiresIn":3600,"user":{"id":"...","email":"customer@example.com","fullName":"Nguyen Van A","role":"CUSTOMER","status":"ACTIVE"}}` và đặt refresh token bằng cookie `HttpOnly; Secure; SameSite=Lax` trong production. Nếu mật khẩu đúng nhưng email chưa xác minh, API trả `401` với `code: "EMAIL_NOT_VERIFIED"` và thông báo tiếng Việt; mật khẩu sai vẫn trả `INVALID_CREDENTIALS` nên không lộ email nào đã đăng ký.

### Đăng nhập bằng Google

```http
POST /api/v1/auth/google
Content-Type: application/json

{"credential":"<Google ID token>","remember":true}
```

Backend xác minh ID token với `audience = GOOGLE_CLIENT_ID` và bắt buộc `email_verified = true`, rồi cấp phiên bằng đúng hàm của `/auth/login` (`201`, cùng body, cùng cookie refresh).

- Đã có user với `googleSub` này: đăng nhập user đó.
- Chưa có nhưng có user `CUSTOMER` cùng email: liên kết `googleSub`; nếu đang `PENDING_VERIFICATION` thì kích hoạt (Google đã xác minh email) và thay mật khẩu đã đặt lúc đăng ký bằng chuỗi ngẫu nhiên (`hasPassword=false`).
- Không có user nào: tạo `CUSTOMER` `ACTIVE` với `hasPassword=false`.
- `STAFF`/`ADMIN`: `403` "Tài khoản quản trị chỉ đăng nhập bằng mật khẩu". `SUSPENDED`: `401` như đăng nhập thường. Chưa cấu hình `GOOGLE_CLIENT_ID`: `503` "Đăng nhập Google chưa được cấu hình". Giới hạn 30 lần/15 phút/IP.

Tài khoản `hasPassword=false` gọi `POST /auth/change-password` nhận `400` "Tài khoản chưa có mật khẩu, vui lòng dùng Quên mật khẩu để đặt mật khẩu."; đặt lại mật khẩu thành công thì `hasPassword=true`.

### Presigned upload

```http
POST /api/v1/storage/presign
Authorization: Bearer <token>
Content-Type: application/json

{"contentType":"image/jpeg","sizeBytes":204800,"purpose":"avatar"}
```

Trả `{uploadUrl, objectKey, expiresInSeconds, contentLengthBytes, requiredHeaders}`. Client PUT đúng `contentLengthBytes` byte, gửi `Content-Type` và `If-None-Match: *` theo `requiredHeaders`; trình duyệt tự đặt `Content-Length` theo `File/Blob` (không tự gán header này bằng JavaScript). URL chỉ ghi được khi key chưa tồn tại; nếu retry nhận 412 sau một PUT thành công thì gọi `/storage/finalize`. Backend kiểm tra object và loại metadata ảnh trước khi dùng.

Nếu trình duyệt không PUT trực tiếp được, frontend gọi `POST /api/v1/storage/upload` bằng Bearer token và `multipart/form-data` gồm `objectKey` đã cấp cùng `file`. API chỉ nhận upload còn `PENDING`, chưa hết hạn và thuộc người gọi; MIME và số byte phải khớp khai báo. File được ghi vào private bucket với `If-None-Match: *`; request không được cung cấp URL hay bucket đích. Giới hạn multipart tối đa 10 MiB, đồng thời áp dụng `R2_UPLOAD_MAX_BYTES`. Sau response `{uploaded: true}`, vẫn phải gọi `/storage/finalize` để xác thực nội dung trước khi dùng media.

## 4. Contract policies

- Pagination: `1 <= page <= 1,000,000`, `1 <= limit <= 50`; giá trị không phải số nguyên trả 400. Response `{items, page, limit, total}`.
- Authentication: Bearer access token; không đính token vào query string.
- Mutations tài chính/đơn: `Idempotency-Key` UUID; trả cùng kết quả hoặc conflict có giải thích khi request trùng khác body.
- Validation: DTO whitelist + forbid unknown, sanitize output; giá và ownership tính server.
- Chỉ trả thông tin ảnh qua chính sách public/signed; không trả R2 credentials.
- GPM Pay webhook: giữ raw request body, verify `X-GPMPay-Signature` HMAC và timestamp tối đa 300 giây; `test=true` chỉ ACK; lưu unique `payload.id`. Event `in` đối soát payment, event `out` đối soát refund theo mã riêng, amount, tài khoản nguồn và tài khoản đối ứng; thiếu thông tin đối ứng phải review. Không dùng auth mode `NONE` ngoài local.
- Webhook secret GPM Pay chỉ nằm server-side; API public không trả secret hoặc raw signature cho frontend.
- Error envelope canonical: `{statusCode, code, message, requestId, fieldErrors?}`; `code` ổn định cho FE, `message` không chứa stack/secret.
- Refresh token ở cookie `HttpOnly; Secure; SameSite=Lax`, rotate theo DEC-04; CSRF được giảm bằng SameSite và kiểm Origin cho mutation cookie-authenticated.
- Các route chưa mô tả đầy đủ trong `openapi.yaml` không được triển khai ad-hoc: bổ sung path/schema vào OpenAPI cùng PR trước hoặc đồng thời với code.

## 5. Errors

| HTTP | Nghĩa | Hành vi FE |
|---|---|---|
| 400 | Payload sai | hiển thị trường lỗi |
| 401 | Không có hoặc sai token | điều hướng đăng nhập |
| 403 | Không đủ quyền | màn hình từ chối |
| 404 | Không tìm thấy/không thuộc quyền sở hữu | thông báo không tìm thấy |
| 409 | Version/idempotency conflict | tải lại quote/state |
| 429 | Vượt hạn mức | đợi và thử lại |
| 503 | Mail/AI/storage/provider chưa sẵn sàng | không đánh dấu thành công |

`code` canonical không thay đổi theo ngôn ngữ hiển thị:

| Code | HTTP | Dùng khi |
|---|---:|---|
| `VALIDATION_FAILED` | 400 | DTO/query/header không hợp lệ; `fieldErrors` có field/code |
| `WEBHOOK_SIGNATURE_INVALID` | 401 | GPM Pay HMAC sai hoặc timestamp quá 300 giây |
| `AUTH_REQUIRED`, `INVALID_CREDENTIALS`, `SESSION_REVOKED` | 401 | không có auth, login sai, refresh hết hạn/replay |
| `PERMISSION_DENIED` | 403 | có principal nhưng thiếu role/permission/scope |
| `RESOURCE_NOT_FOUND` | 404 | không tồn tại hoặc bị che bởi ownership |
| `DUPLICATE_RESOURCE`, `IDEMPOTENCY_CONFLICT`, `STATE_CONFLICT`, `OUT_OF_STOCK` | 409 | unique/retry khác body/state/concurrency conflict |
| `BUSINESS_RULE_FAILED` | 422 | request hợp lệ về cấu trúc nhưng vi phạm policy |
| `RATE_LIMITED`, `QUOTA_EXCEEDED` | 429 | throttle hoặc hết quota; trả `Retry-After` khi xác định được |
| `PROVIDER_UNAVAILABLE` | 503 | dependency bắt buộc chưa cấu hình hoặc tạm lỗi |

Thông báo FE dựa vào `code`, không parse `message`. Lỗi production không trả stack, Mongo/provider payload hoặc secret.
