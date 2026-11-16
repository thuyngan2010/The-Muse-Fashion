# Test case triển khai theo phase

Các case này là bộ tối thiểu trước khi một phase được đánh dấu hoàn thành. Mỗi lần chạy ghi `environment`, app/migration version, fixture version, thời gian, người chạy, kết quả và link evidence. Case chi tiết hơn được thêm cùng feature nhưng không được thay đổi ý nghĩa expected result dưới đây.

## P0 — Identity, RBAC, email, nền tảng

| ID | Trace | Setup/steps chính | Expected API + data/side effect |
|---|---|---|---|
| TC-UC01-01 | FR-01, AC-UC01 | register email mới → đọc token fixture → verify | 201; user PENDING rồi ACTIVE; token hash one-use; một email event |
| TC-UC01-02 | FR-01 | register email khác hoa/thường đã có | 409/response chuẩn; không user/email trùng |
| TC-UC02-01 | FR-02 | login ACTIVE đúng password, gọi `/auth/me` | token/session hợp lệ; principal không lộ hash |
| TC-UC02-02 | FR-02, DEC-04 | 6 lần sai trong 15 phút cùng IP+email | lần vượt ngưỡng 429; security metric tăng; không khóa nhầm email khác |
| TC-UC03-01 | FR-03, DEC-04 | refresh → reuse refresh cũ → refresh token mới | rotation thành công lần đầu; replay thu hồi family; lần sau 401 |
| TC-UC03-02 | FR-03 | logout rồi refresh | session có `revokedAt`; 401; logout lặp idempotent |
| TC-UC05-01 | FR-05 | forgot email tồn tại/không tồn tại | response/status/body giống nhau; chỉ email tồn tại có token/event |
| TC-UC06-01 | FR-06 | đổi password đúng current | mọi session bị revoke; password cũ fail, mới pass |
| TC-UC30-01 | FR-30, DEC-08 | Staff thiếu/có permission và scope gọi route admin | 403 khi thiếu; chỉ record assigned khi scope ASSIGNED; audit khi thay quyền |
| TC-UC30-02 | FR-30 | khóa Admin active cuối cùng | 409; không đổi status; audit attempt |
| TC-UC33-01 | FR-33, DEC-11 | SendGrid 429 rồi success; worker retry | tối đa lịch retry; một dedupKey; nghiệp vụ không rollback |

## P1 — Catalog, Lookbook, media

| ID | Trace | Setup/steps chính | Expected |
|---|---|---|---|
| TC-UC07-01 | FR-07 | filter/sort/page catalog có hidden product | pagination đúng; hidden không xuất hiện; query unknown bị 400 |
| TC-UC08-01 | FR-08 | xem variant còn/hết hàng | price/available đúng; hết hàng không add cart |
| TC-UC09-01 | FR-09 | tạo đồng thời cùng SKU | đúng một request thành công; request còn lại 409; không duplicate |
| TC-UC10-01 | FR-10 | mở Lookbook public có product đã archive | Lookbook tải được; link lỗi được vô hiệu an toàn |
| TC-UC11-01 | FR-11 | publish thiếu main image/ref invalid rồi hợp lệ | invalid 400 không publish; hợp lệ lưu version + audit |
| TC-MEDIA-01 | DEC-10 | presign → upload MIME giả → finalize | finalize reject; không tạo media active; object được cleanup |
| TC-MEDIA-02 | DEC-10 | Customer B dùng objectKey private của A | 404; không cấp signed GET; security test pass |

## P2 — Commerce

| ID | Trace | Setup/steps chính | Expected |
|---|---|---|---|
| TC-UC14-01 | FR-14 | add/update/remove cart; price thay đổi | cart lưu variant/qty; response dùng giá hiện tại; không reserve stock |
| TC-UC15-01 | FR-15, DEC-06 | quote một voucher + shipping rồi tạo Order | server tính lại; snapshot đúng; giữ stock/voucher trong transaction |
| TC-UC15-02 | FR-15 | gửi cùng Idempotency-Key/body hai lần | cùng status/body/orderId; một Order và một reservation |
| TC-UC15-03 | FR-15 | hai Customer mua SKU cuối đồng thời | một Order; request kia 409 sold-out; stock không âm |
| TC-UC17-01 | FR-17, DEC-02 | worker hết 30 phút và Customer hủy race | một terminal transition; release ledger đúng một lần |
| TC-UC17-02 | FR-17, DEC-03 | Customer hủy CONFIRMED | 403/409; Order/payment không đổi |
| TC-UC18-01 | FR-18 | thử mọi cạnh state machine | chỉ cạnh hợp lệ thành công; order_event append-only |
| TC-UC20-01 | FR-20 | adjust inventory cùng checkout | conditional/versioned update; available không âm; ledger cân bằng |
| TC-UC21-01 | FR-21, DEC-06 | 2 voucher hoặc voucher làm discount vượt subtotal | reject voucher thứ hai; discount cap; shipping không bị giảm |

## P3 — Payment và refund

| ID | Trace | Setup/steps chính | Expected |
|---|---|---|---|
| TC-UC26-01 | FR-26 | tạo attempt cho Order hợp lệ | amount/code từ server; expiresAt=paymentDueAt; một PENDING attempt |
| TC-UC27-01 | FR-27 | webhook REAL/in/signature đúng/code+amount đúng | event unique; attempt SUCCEEDED; Order CONFIRMED; outbox trong một transaction |
| TC-UC27-02 | FR-27 | signature sai/skew >300s/test=true/SIMULATED prod/out | signature lỗi 401; test/SIMULATED prod ignored; out chỉ xét Refund UC29, không làm Order paid |
| TC-UC27-03 | FR-27 | gửi cùng payload.id đồng thời hai lần | 2xx; một event và một state transition/outbox set |
| TC-UC27-04 | FR-27, DEC-02 | webhook đúng đến sau expiry/cancel | REQUIRES_REVIEW; không restore Order, không reserve lại stock |
| TC-UC27-05 | FR-27 | sai/thiếu/thừa amount hoặc nhiều code | 2xx + review; không cộng gộp, không paid |
| TC-UC28-01 | FR-28 | Customer B đọc payment A; Staff ngoài scope | 404; response/log không lộ account/raw signature |
| TC-UC29-01 | FR-29, DEC-03 | Staff/Admin đề nghị với tài khoản nhận; proposer thử approve, Admin khác approve và xem QR | proposer bị 403; QR chứa đúng người nhận/số tiền/mã unique; state APPROVED, chưa SUCCEEDED; allocation không vượt paid |
| TC-UC29-02 | FR-29 | webhook out REAL/HMAC khớp mã, số tiền, tài khoản nguồn và counterAccount/counterBankBin; gửi đồng thời hai lần | một PaymentEvent gắn Refund, một transition SUCCEEDED, một outbox; Order chỉ CANCELLED khi hoàn đủ |
| TC-UC29-03 | FR-29 | webhook out thiếu/sai counterAccount hoặc BIN, sai mã/số tiền/nguồn, SIMULATED prod hoặc đến sau FAILED | 2xx + review/ignored; Refund không SUCCEEDED, không gửi refund.completed |
| TC-UC29-04 | FR-29 | hủy đơn đã paid sinh proposal chưa có beneficiary; bổ sung trước approve; đối chiếu thủ công khi webhook thiếu dữ liệu | chưa có beneficiary không cấp QR; complete cần Admin, sao kê/bankReference/evidence; một event không gắn hai refund |
| TC-UC29-05 | FR-29 | complete thủ công cùng idempotency key hai lần | một refund effect/event; response idempotent |

## P4/P5 — AI, community, notification, reports và go-live

| ID | Trace | Setup/steps chính | Expected |
|---|---|---|---|
| TC-UC12-01 | FR-12, DEC-05 | submit 5 job rồi job thứ 6; provider fail một job | thứ 6 429; failed job hoàn quota đúng một lần; owner-only result |
| TC-UC12-02 | FR-12, DEC-05 | advance clock terminal+24h/+7d | input/output R2+DB cleanup đúng hạn, idempotent |
| TC-UC22-01 | FR-22, DEC-07 | review item DELIVERED hai lần/xóa rồi tạo lại | một record; lần hai update/conflict theo API; xóa không mở slot mới |
| TC-UC23-01 | FR-23 | Customer B sửa post A; XSS caption | 404/403; output escaped; hidden không public |
| TC-UC25-01 | FR-25 | Staff moderate ngoài/đúng permission | 403 hoặc success có moderation log |
| TC-UC31-01 | FR-31, DEC-12 | payment/refund qua ranh giới ngày VN | revenue group theo paidAt/refundedAt Asia/Ho_Chi_Minh đúng |
| TC-UC35-01 | FR-35 | duplicate/out-of-order order event | một notification/version; link đích kiểm quyền lại |
| TC-UC37-01 | FR-37 | mark-read lặp và Customer B gọi notification A | idempotent; B nhận 404; readAt không bị đổi sai |
| TC-OPS-01 | DEC-09 | load 50 RPS theo profile và dataset ghi nhận | đạt p95/error/availability target, report có cấu hình đầy đủ |
| TC-OPS-02 | DEC-09 | restore backup gần nhất vào isolated env | checksum/schema/business sample đạt; RPO/RTO ghi nhận trong giới hạn |

## Evidence và exit rule

Một case chỉ `PASS` khi API assertion, DB/index/side-effect assertion và evidence đều có. Test flaky được xem là fail cho đến khi tìm được nguyên nhân. Phase chỉ hoàn thành khi toàn bộ case của phase pass, không có Critical/High security defect và UAT của UC liên quan được Product Owner/QA ký.
