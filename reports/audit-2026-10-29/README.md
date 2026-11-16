# Audit hệ thống Fashion Commerce — 29/10/2026

Cập nhật sau yêu cầu sửa lỗi: xem [bản sửa và kết quả kiểm chứng](FIXES.md). Phần bên dưới giữ nguyên kết quả audit trước khi sửa.

Audit source và kiểm thử local trên HEAD `59a7b94` cùng 36 file frontend đang có thay đổi chưa commit. Không sửa source nghiệp vụ, không commit, không triển khai. Các thay đổi có sẵn của người dùng được giữ nguyên.

**Kết quả: 7 lỗi đã xác nhận — 6 lỗi P2 và 1 lỗi P3.** Có thêm 1 advisory dependency gốc mức thấp, ảnh hưởng 4 package trong chuỗi SendGrid. Chưa có bằng chứng từ đợt kiểm tra này để kết luận có lỗ hổng chiếm quyền hoặc có giao dịch tiền thật bị sai.

P2: lỗi chức năng hoặc tính nhất quán cần sửa trong kế hoạch gần nhất. P3: lỗi hiển thị có ảnh hưởng nhỏ hơn. Thứ tự dưới đây là thứ tự sửa đề xuất trong cùng mức độ.

## Các lỗi đã xác nhận

### A29-01 — P2: Hoàn đủ tiền đồng thời nhưng đơn vẫn chờ hoàn

- **Vị trí:** `apps/api/src/modules/payments/refund.service.ts:288`, điều kiện ghi Order tại dòng 297; nhánh replay trả sớm tại dòng 169.
- **Tình huống:** Đơn có payment 100.000đ; tạo hai đề xuất hoàn 50.000đ qua API, Admin khác duyệt, sau đó hủy đơn. Hai yêu cầu hoàn tất chạy đồng thời đều trả 200 và cả hai Refund thành `SUCCEEDED`, tổng 100.000đ, nhưng Order vẫn `CANCEL_PENDING_REFUND`.
- **Bằng chứng:** 9/10 cặp trong [refund-concurrency-results.json](refund-concurrency-results.json) giữ sai trạng thái. Kiểm tra bổ sung qua đầy đủ API propose → approve → cancel → complete tái hiện 3/3 cặp; replay cùng key vẫn không sửa Order: [http-contract-results.json](http-contract-results.json).
- **Nguyên nhân:** Mỗi transaction chỉ cập nhật Refund riêng và tính tổng trong snapshot của mình. Nếu cả hai chỉ thấy 50.000đ, không transaction nào ghi Order để tạo write conflict/retry. Không có bước tổng hợp lại sau commit.
- **Ảnh hưởng:** Trạng thái đơn và tổng tiền hoàn không nhất quán, đơn treo dù các khoản hoàn đã được ghi nhận đầy đủ. Bằng chứng này không chứng minh hệ thống chuyển tiền hai lần; ứng dụng ghi nhận hoàn bên ngoài.
- **Đề xuất:** Tuần tự hóa completion theo payment/order bằng một cập nhật version chung trước khi tính tổng, hoặc dùng tổng hoàn atomic trong cùng transaction; kiểm tra cả completion thủ công và webhook. Bổ sung regression cho hai Refund khác nhau cùng payment, không chỉ hai request cùng một Refund.

### A29-02 — P2: Đơn 0đ được tạo nhưng không thể đi tiếp

- **Vị trí:** `apps/api/src/modules/commerce/order.service.ts:143`; tổng tiền có thể bằng 0 tại `pricing.service.ts:64`; SePay yêu cầu số tiền dương tại `apps/api/src/modules/payments/sepay-webhook.service.ts:44`.
- **Tình huống:** Voucher PERCENT 100% hợp lệ, sản phẩm 1.000.000đ và miễn phí vận chuyển. Quote trả `payableTotal: 0`; tạo đơn và payment attempt đều 201 nhưng lần lượt là `PENDING_PAYMENT` và `PENDING`, amount 0.
- **Bằng chứng:** Webhook SePay 0đ trả 400; Admin xác nhận đơn trả 422 với thông báo cần payment thành công. Tồn kho vẫn reserve 1: [commerce-results.json](commerce-results.json).
- **Ảnh hưởng:** Khuyến mại được hệ thống chấp nhận nhưng đơn không thể thanh toán/fulfill; tồn bị giữ tới khi hủy hoặc hết hạn.
- **Đề xuất:** Chốt policy đơn 0đ và xử lý trước khi giữ tồn/tạo đơn: hỗ trợ luồng xác nhận không cần giao dịch ngân hàng với audit đầy đủ, hoặc từ chối tổng bằng 0 rõ ràng. Không nới xác thực webhook ngân hàng để chấp nhận giao dịch 0đ.

### A29-03 — P2: Bộ lọc ngày báo cáo loại giao dịch trong ngày được chọn

- **Vị trí:** `apps/web/src/app/pages/admin/admin-reports.page.ts:306` và dòng 313; `apps/api/src/modules/admin/report-range.util.ts:25`; truy vấn dùng cận trên loại trừ tại `sales-report.service.ts:23`.
- **Tình huống:** UI gửi nguyên `YYYY-MM-DD` cho “Từ ngày/Đến ngày”. JavaScript phân tích thành 00:00 UTC, tương đương 07:00 Việt Nam; API lọc `paidAt >= from && paidAt < to`.
- **Bằng chứng:** Giao dịch 100.000đ lúc 10:00 Việt Nam ngày 27/10 không có trong khoảng UI kết thúc 27/10 (doanh thu 0), nhưng truy vấn đủ ngày Việt Nam trả 100.000đ. Chọn từ và đến cùng ngày trả 400. Xem [frontend-results.json](frontend-results.json) và [http-contract-results.json](http-contract-results.json).
- **Ảnh hưởng:** Báo cáo mặc định bỏ các giao dịch sau 07:00 của ngày cuối, đồng thời bỏ 7 giờ đầu ngày bắt đầu; trước 07:00 Việt Nam, việc lấy ngày bằng `toISOString()` còn có thể chọn ngày UTC trước đó. Không thể lọc một ngày bằng hai date input cùng giá trị.
- **Đề xuất:** Chuyển ngày bắt đầu thành 00:00 `Asia/Ho_Chi_Minh`, ngày kết thúc thành 00:00 ngày kế tiếp; giữ cận trên exclusive. Thêm kiểm tra theo giờ Việt Nam ở đầu ngày/cuối ngày và hiển thị lỗi tải báo cáo.

### A29-04 — P2: Xóa bài cộng đồng không lên lịch xóa ảnh sau retention

- **Vị trí:** `apps/api/src/modules/community/community-post.service.ts:86`; finalize gỡ `expiresAt` tại `apps/api/src/modules/storage/storage.service.ts:193`; cleanup chỉ chọn media hết hạn tại dòng 348.
- **Tình huống:** Media community đã finalize không có `expiresAt`. Tạo rồi xóa bài chỉ cập nhật Post/Comment, không đánh dấu hay lên lịch dọn MediaObject.
- **Bằng chứng:** POST bài 201, DELETE 204; mô phỏng thời điểm xóa đã cách 40 ngày rồi chạy cleanup: chọn 0 object, không gọi xóa R2, media vẫn `READY`. [security-retention-results.json](security-retention-results.json).
- **Ảnh hưởng:** Ảnh bài đã xóa tiếp tục lưu vô thời hạn, trái DEC-10 và retention 30 ngày trong `docs/23-DATA-PRIVACY.md:28`.
- **Giới hạn bằng chứng:** Luồng Post dùng HTTP và MongoDB thật trong database test; thao tác R2 của finalize/cleanup được stub để không gọi cloud thật.
- **Đề xuất:** Theo dõi reference của media và lên lịch dọn khi không còn bài/review hợp lệ tham chiếu, theo thời hạn đã chốt; tránh xóa ảnh đang được nhiều nội dung dùng chung. Thêm regression xóa/thay ảnh và retry DB/R2.

### A29-05 — P2: Xóa giới hạn giảm tối đa của voucher không được lưu

- **Vị trí:** `apps/web/src/app/pages/admin/admin-vouchers.page.ts:381`.
- **Tình huống:** Sửa voucher đang có `maxDiscount: 50000`, xóa trống ô “Để trống nếu không giới hạn”, rồi lưu.
- **Nguyên nhân:** `this.formMaxDiscount || undefined` làm JSON bỏ trường khỏi PATCH. API hiểu là giữ giá trị hiện tại; backend hỗ trợ xóa bằng `maxDiscount: null`.
- **Bằng chứng:** Gọi chính handler frontend cho thấy request thiếu trường; HTTP PATCH thiếu trường giữ 50.000đ, PATCH null xóa thành công. [frontend-results.json](frontend-results.json), [http-contract-results.json](http-contract-results.json).
- **Ảnh hưởng:** UI báo lưu nhưng voucher vẫn áp trần cũ, sai cấu hình khuyến mại người vận hành mong muốn.
- **Đề xuất:** Gửi null rõ ràng khi xóa trần; dùng kiểm tra null/undefined thay cho truthiness và đọc lại trạng thái server sau lưu.

### A29-06 — P2: Nút sửa/xóa review trên trang sản phẩm lệch quyền và dữ liệu API

- **Vị trí:** `apps/web/src/app/pages/product.page.ts:850`; API public serializer tại `apps/api/src/modules/community/reviews.service.ts:68`; quyền ghi chỉ CUSTOMER tại `community.controller.ts:18`.
- **Tình huống:** `canManageReview()` cần `customerId/authorId`, nhưng response public không có các trường này hoặc `orderItemId`. Customer không thấy nút cho review của mình; Admin lại thấy nút vì nhánh `isAdmin()` dù API không cho Admin gọi PATCH/DELETE review.
- **Bằng chứng:** Test dùng serializer backend thật cùng handler frontend trả false cho chủ review. HTTP xác nhận response chỉ có `id, productId, stars, content, mediaIds`; Admin PATCH và DELETE đều 403. [frontend-results.json](frontend-results.json), [http-contract-results.json](http-contract-results.json).
- **Ảnh hưởng:** Chức năng quản lý review tại trang sản phẩm không sử dụng được đúng như UI thiết kế. Customer vẫn có luồng quản lý khác tại chi tiết đơn; không kết luận toàn bộ chức năng review bị hỏng.
- **Đề xuất:** Dùng dữ liệu review thuộc người dùng từ endpoint có xác thực hoặc một contract `canEdit/canDelete` phù hợp; cung cấp `orderItemId` đúng cho request sửa. Admin dùng endpoint moderation thay vì hiển thị quyền sửa nội dung của Customer.

### A29-07 — P3: Số lượt dùng voucher luôn hiển thị 0

- **Vị trí:** `apps/web/src/app/pages/admin/admin-vouchers.page.ts:52`; type dùng `usageCount` tại `packages/contracts/src/index.ts:356`; API trả `usedCount` tại `apps/api/src/modules/commerce/voucher.service.ts:108`.
- **Bằng chứng:** Fixture `usedCount: 8` được API trả đúng, nhưng bảng đọc `usageCount || 0` nên hiển thị 0. [frontend-results.json](frontend-results.json), [http-contract-results.json](http-contract-results.json).
- **Ảnh hưởng:** Người quản trị nhìn sai số lượt đã dùng. Kiểm tra hạn mức phía backend vẫn dùng `usedCount`; chưa thấy bằng chứng vượt quota vì lỗi hiển thị này.
- **Đề xuất:** Thống nhất một tên trường giữa serializer, shared contract và template; kiểm tra contract bằng response có usedCount lớn hơn 0.

## Dependency

`npm audit` chạy ngày 29/10/2026 trả 0 critical, 0 high, 0 moderate, 4 low. Đây là **1 advisory gốc** về prototype poisoning trong `deepmerge`, lan truyền qua `@sendgrid/helpers`, `@sendgrid/client`, `@sendgrid/mail`; không phải 4 lỗ hổng độc lập.

- Nguồn advisory do npm trả về: [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
- Dữ liệu audit: [npm-audit.json](npm-audit.json).
- Chưa chứng minh có đường khai thác từ input người dùng của ứng dụng tới advisory này. Cần đánh giá bản sửa upstream/override có tương thích và kiểm thử email; không tự động downgrade SendGrid theo gợi ý major-change của npm.

## Kiểm tra đã thực thi

Môi trường Node 24.18.0, npm 11.16.0, Windows. MongoDB 8 replica set tạm chỉ mở tại `127.0.0.1:27029`, không đọc `.env` ứng dụng trong harness. Container test `fashion-audit-20261029` đã dừng và tự xóa sau khi hoàn tất.

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| Build contracts + API + Angular production | Pass | `npm run build` |
| API unit | 156 pass | `npm test` |
| Frontend unit | 41 pass | `npm run test --workspace @fashion/web` |
| Audit regression có sẵn | 22 pass | `npm run test:audit` |
| Runtime config | 5 pass | `npm run test:web:config` |
| Docs/env/scripts/OpenAPI routes | Pass | 71 Markdown, 37 UC, 113 controller routes |
| MongoDB integration | 70 pass, 2 skip, 0 fail | [integration-results.json](integration-results.json) |
| Diagnostic frontend mới | 5 pass, xác nhận hành vi lỗi hiện tại | [frontend-results.json](frontend-results.json) |
| HTTP contract + refund lifecycle bổ sung | Pass các assertion tái hiện lỗi | [http-contract-results.json](http-contract-results.json) |
| Retention diagnostic | Tái hiện được | [security-retention-results.json](security-retention-results.json) |
| Dependency audit | 4 low package entries từ 1 advisory | [npm-audit.json](npm-audit.json) |

Hai integration test skip là Cloudflare R2 thật vì không bật credential test. Chúng không được tính là pass. Lượt chạy integration đầu bị sandbox chặn socket localhost (`EACCES`), đã hủy và chạy lại với quyền truy cập môi trường audit; kết quả cuối trong JSON là lượt chạy thành công.

Các script diagnostic kiểm tra hành vi lỗi đang tồn tại. Việc chúng pass nghĩa là tái hiện được lỗi, không nghĩa hệ thống đã sửa lỗi.

## Chạy lại bằng chứng

Tạo MongoDB replica set test riêng rồi đặt URI; không trỏ vào database ứng dụng. Build API trước khi dùng harness.

```powershell
$env:MONGODB_TEST_URI='mongodb://127.0.0.1:27029/?replicaSet=auditrs'
npm run build:api
npm run test:integration --workspace @fashion/api
npx vitest run --config reports/audit-2026-10-29/frontend-repro.config.ts
node reports/audit-2026-10-29/commerce-repro.mjs
node reports/audit-2026-10-29/refund-concurrency-repro.mjs
node reports/audit-2026-10-29/http-contract-repro.mjs
node reports/audit-2026-10-29/security-retention-repro.mjs
```

Mỗi script HTTP tạo database tên riêng và xóa trong finally. Concurrency phụ thuộc lịch transaction; test bổ sung có assertion cần ít nhất một lượt tái hiện.

## Phạm vi chưa chứng nhận và điểm cần chốt

- Không chạy giao dịch ngân hàng thật, SendGrid/R2/AI thật, không deploy và không gửi email cho người thật.
- Không cài lại Playwright/axe hoặc browser runtime đã được gỡ trước đó. Không có kiểm thử tương tác browser, mobile/Safari/screen reader mới trong đợt này; build và test handler không thay thế kiểm tra giao diện trên thiết bị.
- Không chạy lại benchmark 100k, tải 50 RPS hoặc diễn tập backup/restore production. Các release gate đã ghi trong `docs/26-AUDIT-REMEDIATION.md` vẫn cần bằng chứng môi trường thực.
- Shipment `FAILED` sau `SHIPPING` hiện không chuyển lại `IN_TRANSIT` và không hủy được qua luồng thường. Chưa tính thành lỗi mới vì DEC-03 cấm hủy SHIPPING và UC19 chưa chốt return/retry; cần quyết định quy trình giao lại/hoàn hàng.
- Không tính thời hạn ảnh AI đã chia sẻ thành lỗi riêng: UC23 cho phép ảnh AI nhưng DEC-05 vẫn yêu cầu xóa output sau 7 ngày, chưa có ngoại lệ cho bài cộng đồng.

Ưu tiên sửa A29-01/A29-02/A29-03 trước, sau đó retention và các contract frontend. Chỉ sửa source khi có yêu cầu tiếp theo; audit này chỉ bổ sung báo cáo và bằng chứng trong thư mục hiện tại.
