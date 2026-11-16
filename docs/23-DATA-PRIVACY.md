# Phân loại, lưu giữ và xóa dữ liệu

**PRIVACY-FASHION-001 · v1.0 · 24/10/2026**

Tài liệu này quy định kỹ thuật xử lý dữ liệu trong phạm vi repository; không thay thế điều khoản/chính sách pháp lý công khai. Chỉ thu thập dữ liệu cần cho chức năng đã mô tả trong SRS.

## 1. Phân loại

| Lớp | Ví dụ | Kiểm soát |
|---|---|---|
| Public | product, Lookbook/bài đã publish | cache/CDN được phép; vẫn chống sửa trái phép |
| Internal | setting không secret, metrics tổng hợp | chỉ staff/admin/service cần thiết |
| Confidential | email, phone, address, Order, IP/security log | TLS, access theo ownership/permission, redacted log/export |
| Restricted | password/refresh hash, token, API key, webhook secret, ảnh AI cá nhân, tài khoản nhận hoàn tiền và bằng chứng refund | mã hóa/secret manager/private R2; QR/thông tin tài khoản đầy đủ chỉ cho vận hành có quyền; truy cập tối thiểu và audit |

Không lưu password/token rõ, dữ liệu thẻ, full secret hoặc raw GPM Pay webhook. Account number chỉ lưu hash + last4 khi cần đối soát.

Khi bật fashion planner, ảnh người và ảnh sản phẩm được gửi tới provider phân tích đã cấu hình nhằm xác định pose, vùng nhìn thấy, loại sản phẩm và phương án thử/phối đồ. Không yêu cầu nhận dạng danh tính hoặc suy luận tuổi, sắc tộc, độ hấp dẫn hay số đo. Checkbox AI mô tả thêm bước phân tích/lập phương án; phiên bản consent mới là `2026-10-fashion-agent-v1`. Plan nội bộ chỉ giữ mô tả, loại sản phẩm và prompt không chứa signed URL; chỉ owner đọc được tóm tắt và danh sách sản phẩm. Không lưu suy luận nội bộ của model. Plan được xóa cùng thời hạn output AI 7 ngày.

## 2. Mục đích và thời hạn

| Dữ liệu | Mục đích | Retention/xóa |
|---|---|---|
| User/profile/address | tài khoản và giao hàng | đến khi user yêu cầu xóa; address không còn dùng xóa/anonymize sau 30 ngày, Order snapshot giữ riêng |
| Auth session/token | xác thực/an ninh | TTL theo DEC-04; record revoke/security tối đa 90 ngày |
| Order/payment/refund/inventory ledger | thực hiện giao dịch, đối soát, audit | 10 năm hoặc lâu hơn nếu nghĩa vụ áp dụng yêu cầu; sau đó anonymize/xóa theo phê duyệt |
| Audit/security log | điều tra và kiểm soát | 12 tháng; log incident nghiêm trọng theo hồ sơ incident |
| Product/Lookbook/community | cung cấp nội dung | public khi active; soft-delete 30 ngày rồi xóa media, metadata moderation cần thiết giữ 12 tháng |
| Avatar/orphan/media AI | hiển thị hoặc xử lý ảnh | theo DEC-05/10; cleanup idempotent cả DB và R2 |
| Consent AI | chứng minh mục đích/phiên bản đồng ý | 24 tháng, không kèm file ảnh |
| Email event | phát và xử lý lỗi | metadata 90 ngày; token theo TTL; không giữ body chứa PII nếu không cần |
| Notification | trải nghiệm user | 12 tháng hoặc khi account được xóa nếu không cần cho giao dịch |

## 3. Consent AI

Mỗi job lưu `userId`, `purpose`, `policyVersion`, `consentedAt`, `withdrawnAt` nếu có và input media IDs. Consent không gộp với marketing. Rút consent chặn job mới và yêu cầu hủy/xóa job chưa xử lý nếu provider hỗ trợ; không hồi tố được output đã được Customer tải xuống. Provider chỉ nhận signed input URL ngắn hạn và dữ liệu sản phẩm tối thiểu.

## 4. Yêu cầu truy cập/xóa tài khoản

1. Xác minh lại người yêu cầu; tạo request ID và audit.
2. Export chỉ dữ liệu thuộc user, định dạng máy đọc được, signed download ngắn hạn; không lộ dữ liệu người khác/nội bộ/provider secret.
3. Khóa account, revoke sessions, dừng notification/marketing, xóa media cá nhân theo lifecycle.
4. Anonymize profile/address/community khi không còn căn cứ giữ. Order/payment/refund bắt buộc giữ được tách khỏi profile đăng nhập, thay định danh trực tiếp bằng pseudonymous reference và giữ snapshot tối thiểu.
5. Worker ghi kết quả từng store/provider; retry lỗi và chỉ hoàn thành khi verify không còn object ngoài exception đã ghi lý do/thời hạn.

## 5. Truy cập và truyền dữ liệu

- Query theo owner/scope ở service; admin access tới dữ liệu restricted phải có mục đích và audit.
- HTTPS cho mọi truyền tải; backup mã hóa; secret manager cho credentials; production data không được copy sang local/test.
- Export CSV chống formula injection; signed URL private hết hạn ngắn và không ghi access log query string.
- Nhà cung cấp AI/SendGrid/R2/GPM Pay chỉ nhận dữ liệu tối thiểu đúng chức năng; phải có owner cấu hình, vùng lưu trữ/điều khoản và quy trình xóa trước khi bật production.

## 6. Kiểm chứng

Test retention worker với clock giả, retry, object thiếu, DB/R2 lỗi từng phần; test user A không export/xóa B; test account deletion không phá Order/payment/audit; kiểm log không chứa token, raw webhook, signed URL, email/address đầy đủ hoặc ảnh.
