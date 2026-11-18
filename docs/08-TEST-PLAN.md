# Test Plan và tiêu chí nghiệm thu

**QA-FASHION-001 · v1.0**

## 1. Phạm vi

37 Use Case có điều kiện AC-UCxx-01..04 và 37 FR có điều kiện chấp nhận tại SRS. Mỗi UC được xây testcase success, alternate, failure, authorization, negative/edge, retry và data consistency nếu phát sinh side effects.

## 2. Các lớp kiểm thử

| Lớp | Nội dung | Cách chạy |
|---|---|---|
| Unit | Giá tiền, voucher, validator, state machine, quota | Vitest/Jest, mock provider |
| Component | Angular forms/lifecycle/loading | Angular testing/testing-library |
| API integration | Nest + test Mongo replica set, ownership/roles, indexes | Testcontainers / staging DB |
| Contract | DTO/OpenAPI, status, error envelope, FE types | openapi schema diff |
| End-to-end | đăng ký, sản phẩm, checkout, hoàn, cộng đồng | Playwright |
| Security | IDOR, privilege escalation, token replay, XSS, mass assignment | test automation + review |
| Load | catalog, checkout, webhook retries | k6 + metrics p95/error |
| UAT | 37 UC theo checklist QA | PO/BA/QA ký |

## 3. Ma trận kịch bản trọng yếu

| UC/FR | Positive | Negative/edge | Đồng thời/idempotency |
|---|---|---|---|
| UC01/FR-01 | xác minh email kích hoạt | email trùng/link hết hạn, SendGrid thất bại | resend/throttle không cấp nhiều token hợp lệ |
| UC02/FR-02 | role user vào đúng vùng | tài khoản chưa active, sai password, Staff thiếu quyền | brute force/throttle |
| UC07–09 | lọc product, SKU/size | hidden product, SKU trùng, invalid price | concurrent price update |
| UC12–13 | AI tạo ảnh và consent | ảnh lỗi/quota cạn/provider timeout | repeat job không trừ quota ngoài chính sách |
| UC14–17 | giỏ, quote, order, hủy | sold-out/voucher expired | 2 checkout cuối SKU không oversell; retry không trùng đơn |
| UC18–21 | vận hành đơn/kho/voucher | state invalid, Staff 403 | lost update, voucher limit race |
| UC22–25 | review/post/comment/moderate | chưa mua, edit post người khác, XSS | duplicate review, repeat moderation |
| UC26–29 | VietQR/GPM Pay/SePay webhook tiền vào, refund QR/chuyển khoản thủ công | HMAC/API Key sai, `SIMULATED` GPM Pay prod, sai provider/mã/tiền/tài khoản, SePay tiền ra cần review | duplicate `(provider,eventId)`, retry/out-of-order, expiry race, một event gắn một refund, không hoàn lặp |
| UC30–32 | RBAC/config/report | last Admin lock, cross scope | simultaneous role change |
| UC33–37 | email/notifications | SendGrid 4xx/5xx, private recipient | dedup event, retry, mark-read repeat |
| Chat hỗ trợ (mở rộng) | khách tạo → nhân sự trả lời → thông báo `SUPPORT_REPLY` → khách đọc → giải quyết → khách mở lại → đóng | khách khác 404, Staff không `order.read` 403, Staff ASSIGNED ngoài phiếu được giao 404, phiếu `CLOSED` 409, vượt 20 tin/phút hoặc 5 phiếu/giờ 429 | polling `after` không trùng tin; claim lần hai 409; đóng lặp lại không lỗi |

## 4. Quality gates

- Build tất cả package; lint/types; unit tests.
- Không có critical/high security defects; tất cả đường truy cập riêng tư có IDOR/RBAC tests.
- 37 UC có AC chính xác; trạng thái triển khai không tự động là `Done` khi chưa UAT.
- Tất cả demo/QA chỉ dùng dữ liệu giả, không upload ảnh/thông tin thẻ thật.

## 5. Test fixture

Tối thiểu Customer A/B, Staff có/không `order.manage`, Admin 1/2; 20 sản phẩm nhiều biến thể; kho cạn/tồn thấp; voucher hết hạn/hết lượt; order trạng thái đa dạng; một webhook trùng/callback sai; một AI job fail; 2 community posts moderated.

## 6. Cấu trúc testcase

Mỗi testcase cần `TC-UCxx-nn`, precondition/setup, steps, expected API+DB+notification, trace FR/AC, screenshot/evidence, execution result/date. Bộ case thực thi tối thiểu và exit rule nằm tại [test-cases/README.md](test-cases/README.md); policy baseline đã chốt tại Decision Log.

## 7. Smoke tests thủ công cho scaffold

1. `GET /api/v1/health` trả 200 và status ok.
2. `GET /api/v1/products` trả danh sách (rỗng nếu chưa seed).
3. `POST /api/v1/auth/register` với SendGrid chưa cấu hình trả 503 (không giả trạng thái mail đã gửi); nếu có key thật, kiểm inbox thật.
4. Login email chưa verified bị từ chối.
5. GET `/api/v1/auth/me` không token trả 401, token không hợp lệ trả 401.
6. POST `/api/v1/products` không token trả 401, Customer token trả 403.
7. POST `/api/v1/storage/presign` có token nhưng thiếu R2 secrets không tạo URL và báo lỗi cấu hình.

## 8. Kiểm thử Chat hỗ trợ

- **Backend:** `apps/api/src/modules/support/support.service.spec.ts` (nghiệp vụ, phạm vi, rate limit, toàn luồng với kho dữ liệu giả), `support.dto.spec.ts` (validate), `support.access.spec.ts` (vai trò được phép gọi từng route: API khách chỉ `CUSTOMER`, API quản trị không mở cho khách, phân công chỉ `ADMIN`).
- **Frontend:** `apps/web/src/app/pages/support-chat.spec.ts` (polling dùng `after`, bỏ qua khi tab ẩn và dừng khi rời trang; gửi lỗi giữ nội dung ô soạn; phiếu `CLOSED` không gửi và không dựng ô soạn) cho cả trang khách và nhân sự.
- **Thủ công (chưa tự động hóa):** đi lại toàn luồng với 3 tài khoản (khách, Admin, Staff ASSIGNED) và mobile 390 px; kiểm tra số chưa đọc trên menu; trang giỏ hàng, đơn hàng, admin đơn hàng không đổi hành vi. Chưa có integration test HTTP/MongoDB riêng cho support.
