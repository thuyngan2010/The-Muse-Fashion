# Implementation Status / Ma trận triển khai

**Cập nhật:** 28/10/2026 (Asia/Saigon). Backend đã có xử lý nghiệp vụ cho các route, không còn endpoint scaffold trả `501`. Đã bổ sung sửa lỗi từ hai đợt audit, browser regression, đối soát thủ công hai người và migration index mới. Trạng thái này chưa phải nghiệm thu provider thật hoặc cho phép dùng thanh toán thật.

| Phần | Trạng thái mã nguồn | Điều kiện nghiệm thu còn thiếu |
|---|---|---|
| NestJS API | Route, DTO, RBAC, worker và các luồng UC01–UC37 đã có triển khai; đã chạy integration qua HTTP/MongoDB | Provider sandbox/live, UAT toàn bộ UC |
| MongoDB | Schema, transaction cho checkout/refund, migration CLI và kiểm tra replica set khi khởi động production | Chạy migration trên replica set test/staging, kiểm thử đồng thời và dữ liệu cũ |
| Auth | Đăng ký, xác minh, đăng nhập, refresh, logout, reset/change password; browser regression 5 tab và replay đã pass Chromium/Firefox | Cookie cross-site trên HTTPS staging, throttle nhiều instance, UAT auth đầy đủ |
| Catalog/Commerce | Catalog, giỏ, báo giá, đơn, kho, voucher, vận đơn | E2E giao dịch và thử tải theo NFR |
| Payment/Refund | Chọn một provider mỗi deployment qua `PAYMENT_PROVIDER`: GPM Pay HMAC hoặc SePay API Key; VietQR, đối soát tiền vào, review, hoàn tiền và giới hạn ngân sách hoàn | Kiểm thử SePay Test Mode/Live, sao kê thật và quy trình vận hành; SePay tiền ra review thủ công |
| R2/AI | Bucket public/private riêng, xác nhận upload, dọn dẹp và AI worker | Cấu hình R2/AI, kiểm thử ảnh thật và kiểm tra nội dung nâng cao |
| SendGrid | Email queue, lease/retry, token mã hóa khi lưu | Cấu hình SendGrid và chạy thử gửi thật |
| Angular | Có màn hình catalog/commerce/AI/community/admin; đã thêm phân quyền, modal/dialog, mobile nav và browser regression | UAT toàn bộ UC, thiết bị thật và screen reader |
| Chat hỗ trợ | API khách và quản trị (`/support/*`, `/admin/support/*`), schema và index, thông báo `SUPPORT_REPLY`; trang `/support` cho khách và `/admin/support` cho nhân sự; polling 5 giây; không thêm permission mới (dùng `order.read`) | Chưa có tệp đính kèm; chưa có integration test HTTP/MongoDB; UAT 3 tài khoản và kiểm tra mobile/thiết bị thật; "sản phẩm đầu" của đơn trong drawer cần API trả thêm |
| CI | Build, unit test, kiểm tra docs/env/script, Mongo integration, migration từ source và API image; bộ Playwright/axe đã gỡ theo yêu cầu ngày 28/10/2026 | Browser regression chạy lại khi có công cụ phù hợp; E2E với provider thật, security và performance gates |

`docs/openapi.yaml` liệt kê các route đã có code với trạng thái `partial` khi chưa qua nghiệm thu tích hợp. Xem [05-API.md](05-API.md) để biết policy và [08-TEST-PLAN.md](08-TEST-PLAN.md) để xây dựng kiểm thử.

Quy trình đối soát mới và release gates: [26-AUDIT-REMEDIATION.md](26-AUDIT-REMEDIATION.md). Bằng chứng audit không phải chứng nhận production hoặc thay thế kiểm tra sao kê thực tế.
