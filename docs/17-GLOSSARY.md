# Thuật ngữ và quy ước

| Thuật ngữ | Định nghĩa |
|---|---|
| SRS | Software Requirements Specification — đặc tả hệ thống |
| UC | Use Case — trường hợp sử dụng có mục tiêu nghiệp vụ |
| FR | Functional Requirement — yêu cầu chức năng kiểm thử được |
| NFR | Non-Functional Requirement — bảo mật, hiệu năng, vận hành |
| AC | Acceptance Criteria — điều kiện nghiệm thu |
| Guest | Trạng thái chưa đăng nhập, không lưu role |
| Customer | Khách có tài khoản và email đã xác minh |
| Staff | Nhân viên vận hành được cấp permission theo phạm vi |
| Admin | Quản trị viên có quyền hệ thống, bảo vệ tài khoản cuối cùng |
| R2 | Cloudflare R2 — lưu ảnh/object theo giao thức S3-compatible |
| SendGrid | Dịch vụ gửi email giao dịch của hệ thống |
| SKU | Mã định danh duy nhất của một biến thể sản phẩm |
| Snapshot | Bản sao dữ liệu bất biến tại lúc tạo đơn |
| Idempotency | Gửi yêu cầu nhiều lần nhưng nghiệp vụ chỉ có hiệu ứng một lần |
| Outbox | Persist event trong transaction để dispatch async không mất sự kiện |
| AI Job | Tác vụ ảnh bất đồng bộ có owner/status/quota/expiry |
| Presigned URL | URL có chữ ký và thời hạn cho thao tác R2 cụ thể |
| GPM Pay | Dịch vụ gửi webhook biến động số dư để hệ thống tự đối soát chuyển khoản; không giữ Order |
| VietQR | Mã QR chuyển khoản theo chuẩn NAPAS/EMVCo, chứa tài khoản nhận, amount và nội dung đối soát |
| Mã đối soát | Chuỗi duy nhất do hệ thống sinh cho PaymentAttempt và đặt trong nội dung chuyển khoản |
| Simulator | Công cụ GPM Pay tạo event `SIMULATED` để test webhook; không đại diện tiền thật và không được xác nhận payment production |
| UAT | User Acceptance Testing — nghiệm thu với người dùng nghiệp vụ |
| RBAC | Role Based Access Control, kết hợp permission và ownership |
| TTL | Time To Live — thời gian sống của token/object |
| Maker/checker | Người đề nghị và người phê duyệt là hai actor khác nhau cho thao tác nhạy cảm |
| RPO | Recovery Point Objective — lượng dữ liệu tối đa chấp nhận mất theo thời gian |
| RTO | Recovery Time Objective — thời gian tối đa mục tiêu để phục hồi dịch vụ |
| Terminal state | Trạng thái kết thúc một vòng đời, không tự quay lại luồng xử lý thường |
| Dead-letter | Event không thể xử lý sau retry và cần vận hành điều tra/replay có kiểm soát |
