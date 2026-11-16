# Operations runbook

**OPS-FASHION-001 · v1.1 · 28/10/2026**

Áp dụng cho staging/production. Mọi thao tác thay đổi dữ liệu cần actor, thời gian, ticket/reason và kết quả; không chép secret hoặc PII vào ticket/log.

## 1. Health, logging và correlation

- `/health/live`: process chạy; không gọi dependency. `/health/ready`: Mongo writable, migration đúng version và worker lease hoạt động; provider ngoài không làm API mất readiness nếu flow có thể trả lỗi kiểm soát.
- Mỗi request có `X-Request-Id` hợp lệ hoặc server tạo UUID; response trả lại. Event truyền `correlationId/causationId`.
- Structured log: timestamp UTC, level, service/version/env, requestId, traceId, actorId đã hash khi cần, route template, status, durationMs, errorCode. Cấm log Authorization/cookie/token, password, raw webhook, full email/address/account, signed URL và image payload.

## 2. Metrics và alerts

| Metric | Alert |
|---|---|
| HTTP availability/error/latency theo route | availability dưới 99,5% hoặc 5xx >1%/10 phút; p95 vượt DEC-09 15 phút |
| Mongo connections/replica lag/disk | primary unavailable, lag >30 giây, disk >80% |
| Checkout/payment | transaction failure >2%/10 phút; payment review tăng bất thường; webhook signature failure spike |
| Queue/outbox/email | oldest pending >5 phút, dead event >0, SendGrid permanent failures |
| Expiry/cleanup | worker không heartbeat 2 phút; overdue reservation/media >5 phút so với lịch |

Dashboard tối thiểu: traffic/SLO, Mongo, checkout/payment, workers/outbox, provider health và security events.

## 3. Severity và phản ứng

| Mức | Ví dụ | Phản ứng |
|---|---|---|
| SEV-1 | sai payment/order, lộ secret/PII, hệ thống không phục vụ | acknowledge 15 phút; freeze deploy; cô lập; owner kỹ thuật + nghiệp vụ |
| SEV-2 | checkout/provider/worker lỗi diện rộng, SLO vi phạm | acknowledge 30 phút; giảm tác động/rollback |
| SEV-3 | lỗi chức năng có workaround | xử lý theo backlog có owner |

Chu trình: detect → ghi incident/time → giảm tác động → bảo toàn log/audit → phục hồi → verify bằng synthetic/smoke → postmortem không đổ lỗi trong 5 ngày làm việc.

## 4. Backup, restore và DR

- Mongo backup mã hóa hằng ngày, giữ 30 ngày; snapshot tuần giữ 12 tuần. R2 bật versioning/lifecycle theo purpose; cấu hình/env secret backup trong secret manager, không nằm cùng database dump.
- Job backup phải báo size/checksum/duration; alert nếu quá 26 giờ chưa có backup thành công.
- Mỗi quý restore rehearsal vào môi trường cô lập: kiểm checksum, chạy migration verify, đối chiếu sample order/payment và ghi thời gian thực tế. Mục tiêu RPO ≤24 giờ, RTO ≤4 giờ.
- Restore production: tuyên bố incident → đóng mutation/maintenance mode → chọn restore point → restore Mongo → chạy verify/migration → đối chiếu payment events sau restore point từ nguồn tin cậy → mở read rồi mutation → ghi audit. Không replay webhook/event mù.

## 5. Deploy và rollback

1. Xác nhận CI, migration plan, backup mới, change owner và rollback version.
2. Chạy expand migration; deploy một instance/canary; smoke health/auth/catalog.
3. Bật feature flag theo phase; quan sát error/latency/business metrics tối thiểu 15 phút.
4. Rollout toàn bộ; ghi version/time.

Rollback app khi health/SLO/regression không đạt và schema vẫn backward-compatible. Nếu migration đã ghi dữ liệu, ưu tiên forward-fix; không drop dữ liệu. Payment/webhook feature flag chỉ được tắt sau khi endpoint vẫn ACK/lưu an toàn hoặc webhook được chuyển sang maintenance receiver có kiểm soát.

## 6. Runbook tình huống

### GPM Pay webhook lỗi hoặc backlog

Giữ endpoint online; kiểm signature failure, clock skew, secret version, Mongo/outbox. Không đánh dấu paid thủ công chỉ từ ảnh chuyển khoản. Với event hợp lệ bị lỗi DB, sửa dependency để provider retry; với event vào review, Admin đối chiếu eventId/account hash/amount/code rồi xử lý qua audited workflow.

### SePay webhook lỗi hoặc backlog

Kiểm cấu hình API Key, tài khoản ngân hàng nhận, HTTP 200 cùng body `{"success":true}`, Mongo/outbox và nhật ký webhook SePay. Event `out` của SePay luôn cần đối soát thủ công bằng sao kê vì webhook không cung cấp đủ thông tin tài khoản người nhận. Khi đổi khóa, cập nhật cấu hình webhook và backend đồng bộ; Test Mode và Live phải tách biệt.

### Tiền lệch, đến muộn và đề xuất đang chờ duyệt

Theo [quy trình đối soát hai người](26-AUDIT-REMEDIATION.md): Admin thứ nhất kiểm sao kê và ghi đề xuất kèm chứng từ; Admin khác kiểm tra độc lập, tải chứng từ của mình rồi duyệt hoặc từ chối. Không dùng `CLOSED_NO_ACTION` cho tiền merchant đã nhận. Không chuyển tiền từ ứng dụng, không trả tiền lần nữa khi chỉ cần ghi nhận khoản đã hoàn bên ngoài và không khôi phục đơn hủy.

Owner đối soát kiểm hàng đợi OPEN/PENDING_APPROVAL mỗi ca; trước production phải chốt người trực, thời hạn xử lý và alert quá hạn theo SLA nghiệp vụ. Khi rollout policy mới, dừng instance BE cũ; kiểm kê các event legacy đã đóng và bảo toàn audit/chứng từ. Hai Admin phải được cấp riêng theo quy trình quản lý quyền hiện có.

### Lộ secret

Thu hồi/rotate ngay tại provider, cập nhật secret manager, rolling restart, kiểm access/audit từ thời điểm nghi ngờ, revoke session nếu JWT/refresh bị ảnh hưởng. Không xóa bằng chứng. GPM Pay webhook secret rotation phải test HMAC trước khi bỏ secret cũ.

### Mongo primary/down hoặc disk đầy

Chặn mutation nếu không bảo đảm transaction, không chuyển sang write standalone. Kiểm replica election/space; scale/cleanup log theo retention, không xóa collection nghiệp vụ. Sau phục hồi chạy consistency checks cho reservation/order/payment/outbox.

### SendGrid/R2/AI outage

Email và AI chuyển queue/retry/failed theo policy; Order/Payment đã commit không rollback. R2 lỗi chặn finalize chứ không tạo media record giả. Tắt feature AI nếu provider chưa ổn định; catalog không phụ thuộc AI.

Khi khôi phục SendGrid, kiểm tra `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, sender đã xác thực và `PUBLIC_WEB_URL`, rồi restart worker. Event `PENDING` còn hạn được gửi tiếp; worker tự requeue event cũ `PERMANENT_FAILURE` chỉ khi `lastError` là thiếu cấu hình và template không chứa token. Theo dõi `email_events` đến khi backlog giảm, xác nhận một email thử tới hộp thư kiểm soát. Với verification/reset event cũ đã hết hạn hoặc mất `tokenCiphertext`, yêu cầu người dùng tạo token mới qua resend verification/forgot password; không sửa payload hay phát lại token cũ. Các lỗi SendGrid 4xx khác cần điều tra trước khi can thiệp thủ công.

## 7. Security và UAT sign-off

Trước go-live phải có: dependency/secret scan, RBAC/IDOR suite, webhook HMAC/replay tests, restore rehearsal, load report theo DEC-09, UAT 37 UC, danh sách known issue được chấp nhận và người phê duyệt. Bằng chứng release liên kết version commit/image, migration version, config version và testcase run.
