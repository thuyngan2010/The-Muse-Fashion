# Đặc tả tích hợp AI và sự kiện nội bộ

## 1. AI Virtual Try-on / Mix & Match

- Tác nhân: Customer có tài khoản verified; đăng consent cho mỗi upload/sử dụng ảnh; xác thực product đang public.
- Job: `PENDING -> PROCESSING -> COMPLETED | FAILED | EXPIRED`; lưu ownerId/type/inputObjectKeys/outputObjectKeys, quota reservation, createdAt, expiry. Tổng quota mặc định 5 job/ngày UTC cho cả hai loại.
- Adapter AI interface: `submit(job, signedInputUrls, products) -> providerJobId`, `getStatus(providerJobId)`, `cancel` nếu hỗ trợ.
- Backend tạo job bền vững, FE polling với rate limit; không block HTTP chờ render ảnh.
- Timeout/failed: lỗi provider/hệ thống hoàn quota đúng một lần; validation fail không reserve; user cancel sau khi provider đã xử lý không hoàn. Input xóa sau 24 giờ và output sau 7 ngày kể từ terminal. Không gửi ảnh cá nhân sang provider khi chưa consent.
- Callback nếu provider hỗ trợ: xác minh secret/HMAC; tránh update job người khác qua provider ref đoán được.

### Giao thức AI provider

Adapter giữ contract cũ: `POST /images/edits` với `jobId`, `type`, `inputUrl`, `productImageUrls`; provider có thể trả ảnh nhị phân hoặc `202`/`PROCESSING` kèm job ID để poll.

Adapter cũng dùng SDK OpenAI với `AI_API_BASE_URL` tùy chọn cho OpenAI hoặc gateway tương thích. Request JSON Images API gồm `model`, `prompt`, `images: [{ image_url }]`, `n: 1`, `output_format: png`. Ảnh đầu tiên là ảnh Customer, các ảnh sau là sản phẩm. Response `data[0].b64_json` được giải mã, kiểm tra định dạng và giới hạn byte trước khi ghi R2. Có thể cấu hình riêng `AI_TRY_ON_MODEL` và `AI_MIX_MATCH_MODEL`; cả hai phải là model sửa ảnh. Model chat như `gpt-6-thinking` không được dùng cho hai job ảnh này.

Không cần biến chọn giao thức. Khi có model cấu hình, adapter thử OpenAI trước; nếu không, thử contract cũ trước. Chỉ khi provider trả `400`/`422` và chỉ rõ trường bắt buộc của contract còn lại, adapter mới gửi request theo contract đó; contract thành công được nhớ theo base URL. Lỗi mạng, timeout, `5xx`, redirect và lỗi model không kích hoạt fallback vì request đầu có thể đã được xử lý. SDK không tự retry POST. Nếu kết quả submit không rõ hoặc provider không trả job ID khi xử lý bất đồng bộ, worker đánh dấu job lỗi để tránh gửi POST trùng. Chỉ bật `AI_ENABLED=true` sau khi kiểm thử endpoint ảnh, quyền truy cập signed R2 URL và giới hạn ảnh trên provider thực tế.

## 2. Event catalog nội bộ

| Event | Producer | Consumers | Idempotency |
|---|---|---|---|
| `user.created` | Auth | SendGrid verify email | userId + version |
| `user.password_reset_requested` | Auth | SendGrid | token request id |
| `order.created` | Checkout | Inventory, Email, Notification | orderId + version |
| `order.status_changed` | Operations | Email, Notification | orderId + stateVersion |
| `payment.verified` | GPM Pay webhook | Order, Email, Notification | GPM Pay `payload.id` |
| `refund.completed` | Payment | Email, Notification | refund id |
| `post.commented` | Community | Notification | comment id |
| `lookbook.published` | Catalog | Notification | lookbook id + version |
| `ai.job.completed` | AI adapter | Notification | job id + version |

Sự kiện persist bằng outbox nếu gửi async. Envelope, payload v1, versioning, ordering, retry, dead-letter và replay được định nghĩa tại [Event Contracts](22-EVENT-CONTRACTS.md). Không phụ thuộc email success để xác nhận thanh toán/đơn. Phân biệt `processed`, `sent`, `delivered`.

Provider AI cụ thể là cấu hình triển khai. Feature phải `disabled` đến khi adapter, data terms/region, timeout/cost limit, callback verification và contract tests được phê duyệt; không tạo response giả khi thiếu provider.

Hợp đồng thanh toán được định nghĩa tại [16-PAYMENT-GPMPAY.md](16-PAYMENT-GPMPAY.md) và [25-PAYMENT-SEPAY.md](25-PAYMENT-SEPAY.md).
