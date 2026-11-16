# Audit lần 2: bản sửa và điều kiện nghiệm thu

Cập nhật 28/10/2026 (Asia/Saigon), đợt audit bắt đầu 27/10/2026. Tài liệu mô tả bản sửa trong source; không phải chấp thuận xử lý tiền production.

## Đối soát có hai người kiểm tra

`PaymentAttempt.state` vẫn biểu diễn kết quả thanh toán của đơn. `hasOpenReview` là cờ đối soát theo toàn bộ các attempt của cùng đơn, gồm tiền đến muộn ở attempt cũ. Cờ này không xác nhận tiền đủ để giao hàng; FE ngừng hướng dẫn chuyển thêm khi đang đối soát. `reviewOutcome=REFUNDED_EXTERNALLY` ghi nhận kết quả hoàn ngoài ứng dụng.

Hàng đợi `GET /admin/payment-events?view=OPEN|RESOLVED|ALL` có phân trang. Admin đọc chi tiết tại `/admin/payment-events/:eventId`; đường dẫn chứng từ private chỉ xuất hiện trong API chi tiết dành cho Admin. Nhân viên chỉ có quyền xem thanh toán GLOBAL có thể xem hàng đợi, không được đề xuất hay duyệt kết quả.

Các thao tác `PATCH /admin/payment-events/:eventId/review`:

1. `ESCALATED`: giữ giao dịch mở, ghi lý do và chứng từ.
2. `REFUNDED_EXTERNALLY`: đề xuất ghi nhận đã trả lại toàn bộ khoản tiền vào, với đúng số tiền bank event, mã chứng từ và bằng chứng private đã finalize thuộc người đề xuất.
3. `OUTGOING_RECONCILED`: đề xuất ghi nhận khoản chi merchant đã được đối chiếu bên ngoài ứng dụng, với đúng số tiền/mã chứng từ/bằng chứng.
4. `CLOSED_NO_ACTION`: chỉ dùng cho tiền vào tài khoản không phải merchant. Không được dùng để đóng tiền merchant đã nhận mà chưa có phương án xử lý.
5. Các đề xuất vào `PENDING_APPROVAL`. Một Admin khác xem chứng từ, tải bằng chứng kiểm tra độc lập và dùng `APPROVE` hoặc `REJECT_PROPOSAL`. Không tự duyệt đề xuất của mình. Mã chứng từ của một settlement không được dùng lại cho settlement review khác của cùng provider.

Ứng dụng **không chuyển tiền**, không tự gán tiền lệch vào đơn và không khôi phục đơn đã hủy. Chỉ ghi nhận công việc bên ngoài đã có chứng từ; không thực hiện lại khoản chi khi ghi nhận. Thao tác hoàn tiền của payment đã thành công vẫn dùng quy trình Refund hiện có. Hai Admin và nhân sự đối soát chịu trách nhiệm đối chiếu sao kê, người nhận và chứng từ thực tế trước khi xác nhận.

Giao dịch legacy từng bị `CLOSED_NO_ACTION` cần được kiểm kê khi nâng cấp để phát hiện khoản tiền chưa xử lý; migration không tự quyết định lại tiền hay lịch sử kiểm toán.

## Phiên đăng nhập và quyền

- Access token/user snapshot nằm trong memory; xóa token cache legacy khỏi localStorage/sessionStorage. Khôi phục phiên bằng refresh cookie HttpOnly.
- FE dùng Web Locks để tuần tự hóa refresh giữa các tab trong browser hỗ trợ trên secure context (HTTPS hoặc localhost). BE vẫn thu hồi token family khi phát hiện replay. Không nới replay detection để che race.
- `remember=false` tạo session cookie và được giữ qua rotation; không ghi access token xuống browser storage.
- Login, refresh và profile trả snapshot permission. Menu, route và nút xử lý đơn xét grant/scope; BE tiếp tục là biên bảo vệ thực.
- CSP chặn script inline/eval và script ngoài origin; Angular vẫn cần inline styles. Đây là giảm rủi ro XSS, không phải bảo đảm miễn nhiễm XSS.

## Checkout, vận đơn và thanh toán

- Checkout giữ quote/idempotency key theo user trong sessionStorage đến khi biết kết quả. Reload/timeout replay cùng POST để lấy đúng đơn đã commit; không tạo yêu cầu mới khi kết quả chưa rõ.
- READY chỉ đưa CONFIRMED sang PREPARING. PICKED_UP/IN_TRANSIT đưa PREPARING sang SHIPPING. Chặn lùi trạng thái và cập nhật trùng không tạo thêm event/commit tồn kho.
- `GET /payments/order/:orderId/latest` cho phép đọc lại attempt sau hủy/hết hạn với ownership/scope hiện có. Khi BE cho phép `canRetry`, khách mới được tạo lại phiên.
- Thanh toán khách hàng dùng quét QR; xử lý lỗi tải QR và thử lại. Số tài khoản vẫn che, không dùng placeholder ngân hàng/chủ tài khoản giả và không gọi đây là chuyển khoản thủ công đầy đủ.

## Query và migration

Catalog lọc variants và danh sách payment theo customer/assignment join, count, sort và phân trang trong MongoDB. Không tải toàn bộ ID khớp về Node. Tìm kiếm từ khóa catalog dùng text index của tên/mô tả. Index mới hỗ trợ lookup variants, latest attempt và payment review.

Migration `202610270001_review_query_indexes` tạo index bổ sung, có preflight và verify. Runner áp dụng pending migration trước khi gọi historical verifiers đang tham chiếu registry schema hiện tại; checksum migration cũ được giữ nguyên. Đã có regression nâng cấp database đã áp dụng hai migration cũ.

Triển khai BE trước FE, chạy migration và verify trên backup/staging trước production. Dừng các instance BE cũ khi chuyển sang policy đối soát mới để tránh một instance cũ vẫn cho phép thao tác đóng kiểu cũ.

## Kiểm tra có thể chạy lại

```bash
npm ci --no-audit
npm run build
npm test
npm run test --workspace @fashion/web
npm run test:audit
npm run check:routes
# MONGODB_TEST_URI phải là MongoDB replica set test, không phải database ứng dụng.
npm run test:integration
npm run test:performance --workspace @fashion/api
```

Đợt audit đã chạy browser tests với bundle production cùng CSP, gồm order commit rồi mất response và refresh 5 tab kèm replay. Theo yêu cầu ngày 28/10/2026, Playwright, axe-core, browser runtime, suite browser và bước CI liên quan đã được gỡ. Báo cáo/ảnh chụp giữ lại làm bằng chứng lịch sử; project hiện không có lệnh chạy lại suite browser.

Performance suite tạo riêng 100.000 orders, 100.000 attempts, 100.000 variants và 1.000 products; lưu explain/p50/p95. Budget mặc định 5 giây là **smoke budget**, không phải NFR-12. NFR-12 vẫn đòi tải chuẩn 50 RPS và báo cáo máy/dataset/tải/thời lượng/error rate.

## Release gates vẫn cần bằng chứng staging/production

| Gate | Bằng chứng bắt buộc trước go-live |
| --- | --- |
| Provider | SePay/GPM Pay sandbox đúng merchant, webhook in/out/duplicate/mismatch/late, đối chiếu sao kê và chứng từ; provider thật chưa được gọi trong đợt sửa này. |
| Hoàn tiền/đối soát | Hai người thực hiện và kiểm tra quy trình ngân hàng thực; xác minh recipient, mã chứng từ, số tiền và hạch toán. Không suy từ test mock ra tiền đã chuyển. |
| Load | Tải chuẩn 50 RPS: catalog p95 ≤500 ms, mutation ≤1 s, ACK webhook ≤2 s, server error <1%, theo NFR-12. |
| Backup/restore | Production RPO ≤24 giờ, RTO ≤4 giờ; backup lưu đúng nơi, quyền truy cập/retention, restore rehearsal có owner và thời gian đo. Restore local bằng dữ liệu giả không chứng nhận backup production. |
| Vận hành | Alert review tồn đọng/PENDING_APPROVAL, outbox/email/job fail và đối soát tiền ra; owner trực, least privilege, rotation secrets. |
| Browser/UAT | UAT toàn bộ UC và thiết bị thật, Safari/iOS và NVDA/VoiceOver; axe/keyboard không phải chứng nhận WCAG toàn hệ thống. |

Chưa có đủ các bằng chứng trên thì giữ NO-GO cho tiền thật. Xem [runbook](24-OPERATIONS-RUNBOOK.md) và [báo cáo lần 2](../reports/audit-2-2026-10-27/README.md).
