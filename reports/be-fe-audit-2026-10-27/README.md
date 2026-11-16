# Audit BE / FE — 27/10/2026

**Cập nhật sau sửa lỗi:** đã xử lý A01–A21. Xem [báo cáo sửa lỗi và kiểm chứng](FIXES.md). Nội dung bên dưới giữ lại bằng chứng tại thời điểm audit ban đầu.

Rà soát working tree hiện tại của `fashion-commerce`, HEAD `171fd6a`, bao gồm các thay đổi chưa commit đang có. Kết quả: **21 phát hiện về logic/contract/cấu hình: 3 P1, 17 P2, 1 P3**. Cảnh báo dependency được thống kê riêng, không cộng thành các lỗi ứng dụng đã khai thác được.

P1: cần sửa trước đợt phát hành tiếp theo vì có thể làm sai dữ liệu hoặc kẹt nghiệp vụ. P2: lỗi chức năng, tính nhất quán, độ ổn định hoặc kiểm tra đầu vào. P3: sai lệch tài liệu.

Đây là kết quả audit **trước khi sửa mã ứng dụng**. Bộ `repro.spec.ts` cố ý xác nhận hành vi lỗi cũ; 23 test tái hiện pass trong báo cáo ban đầu có nghĩa là lỗi được tái hiện. Bộ kiểm thử hồi quy cho bản sửa hiện nằm tại `tests/audit-regressions.spec.ts`, chạy bằng `npm run test:audit`.

## Phạm vi và bằng chứng

- Đã rà soát xác thực/cookie/session, RBAC/phạm vi nhân viên, catalog/biến thể, cart/quote/order/inventory/voucher, payment/webhook/refund, storage/R2, AI/worker/cleanup, community/reviews/moderation, lookbook, notifications, admin/report/settings, FE services/pages/routes và deployment.
- `npm run build`: pass cả BE và FE production.
- `npm test`: **148 test BE / 30 file pass**.
- `npm run test --workspace @fashion/web`: **38 test FE / 5 file pass**.
- `npm run test:web:config`: **5 test pass**.
- Integration với MongoDB 8 replica set cô lập: **54 test pass, 2 test R2 thật skipped**. [Kết quả](integration-results.json), [log](integration.log).
- Tái hiện bổ sung qua HTTP và DB thật: **5 ca xác nhận** A01, A02, A04, A06 và A08. [Kết quả](http-repro-results.json), [script](http-repro.mts).
- `npm run check:docs`, `check:env`, `check:scripts`: pass.
- Docker Compose riêng FE và BE: kiểm tra cấu hình pass.
- Image BE build thành công; migration chạy thành công từ image; container production trả readiness 200 và CORS origin/credentials đúng cấu hình. [Log build](docker-api-build.log), [migration](docker-api-migration.log), [HTTP readiness/CORS](container-api-results.json).
- Nginx với template/runtime script của repository và bản FE production đã build: URL API riêng, no-store và SPA fallback pass; tái hiện upload 2 MiB bị 413. [Kết quả](container-web-results.json), [script probe](container-web-repro.mjs).
- Clean Docker build FE **chưa xác nhận**: bản mặc định bị dừng sau khi không tiến triển ở `npm ci`; bản chẩn đoán cùng Dockerfile, chỉ bổ sung log/timeout tải gói, ghi nhận `FETCH_ERROR` khi tải `tinybench` từ registry npm. Không phân loại đây là lỗi source/Dockerfile đã chứng minh. [Log gốc](docker-web-build.log), [log chẩn đoán](docker-web-debug.log), [Dockerfile chẩn đoán](Dockerfile.web.debug).
- `node scripts/check-openapi-routes.mjs`: **fail**, thiếu `GET /admin/lookbooks/{lookbookId}` trong OpenAPI.
- Bộ tái hiện audit: **23 test pass**. Chạy từ repository root:

```bash
node node_modules/vitest/vitest.mjs run --config reports/be-fe-audit-2026-10-27/vitest.config.ts
```

Kết quả máy đọc được: [repro-results.json](repro-results.json). Các ca tái hiện gọi logic thực tế với HTTP/DB/storage mock, không thực hiện giao dịch, upload, gửi email hoặc gọi AI thật.

MongoDB audit được tạo riêng trên `127.0.0.1:27187`, không gắn volume/database ứng dụng. API test dùng secret sinh riêng và provider mock, không đọc `.env` của ứng dụng. Script HTTP chỉ cho phép đúng localhost/cổng audit và tự dọn database do nó tạo.

**Giới hạn:** chưa kiểm tra trình duyệt trên hai server triển khai thực tế, chưa chạy E2E với R2/SendGrid/AI/payment thật. Hai test R2 live được bỏ qua vì thiếu cấu hình dịch vụ thật. Build/unit/integration test pass không chứng minh toàn bộ nghiệp vụ không có lỗi.

Các container BE/MongoDB/Nginx tạm được dọn sau kiểm tra. Các tag image audit được xóa; không dùng/xóa database, volume, container hay image ứng dụng khác. Kết quả kiểm tra FE runtime dựa trên bản FE build cục bộ và Nginx thật; không thay thế xác nhận clean Docker build FE.

## Phát hiện cần ưu tiên

### A01 · P1 · Đổi mã voucher đã sử dụng có thể làm kẹt hủy đơn và giải phóng tồn kho

**Vị trí:** [voucher.service.ts:42](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/commerce/voucher.service.ts:42), [inventory-reservation.service.ts:135](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/commerce/inventory-reservation.service.ts:135).

`update()` cho sửa `code` kể cả khi `usedCount > 0`. Đơn hàng lưu `voucherCode` cũ; `releaseVoucherUsage()` tìm voucher bằng mã cũ và ném exception nếu không cập nhật được. Hủy đơn và hết hạn thanh toán đều gọi hàm này trong transaction, nên transaction rollback và tồn kho tiếp tục bị giữ.

**Tái hiện:** tạo đơn dùng `OLD`, sửa voucher thành `NEW`, hủy đơn cũ hoặc để hết hạn. Đã xác nhận qua API/replica set thật: rename trả 200, hủy trả 409 `Voucher usage cannot be released`, order vẫn `PENDING_PAYMENT` và reserved stock vẫn bằng 1 sau rollback. Có thể nghiêm trọng hơn nếu tạo voucher mới mang mã `OLD`: việc release có thể tác động voucher khác.

**Hướng sửa:** dùng ID voucher ổn định trong quote/order và thao tác usage; trước mắt chặn đổi mã khi đã sử dụng hoặc còn đơn tham chiếu.

### A02 · P1 · Nút “Thêm quyền” có thể thu hồi toàn bộ quyền nhân viên đang có

**Vị trí:** [admin-users.page.ts:139](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-users.page.ts:139), [admin.controller.ts:48](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/admin/admin.controller.ts:48), [admin-users.page.ts:546](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-users.page.ts:546).

FE mô tả POST là bổ sung quyền, nhưng POST và PATCH đều gọi `replaceStaffPermissions()`, vốn xóa các grant cũ. Modal luôn mở với tất cả checkbox tắt và không tải quyền hiện tại.

**Tái hiện:** nhân viên đang có `inventory.manage`; mở modal, chọn thêm `order.read`, bấm “+ Thêm quyền”. Request chỉ có quyền mới và BE thay thế toàn bộ. Đã xác nhận bằng API thật: POST trả 201, MongoDB sau request chỉ còn `order.read`; grant `inventory.manage` cũ bị xóa. Bộ tái hiện FE cũng xác nhận modal không nạp grant cũ.

**Hướng sửa:** làm POST bổ sung grant thực sự, hoặc thống nhất chỉ một thao tác thay thế được ghi rõ; cần endpoint đọc grant hiện tại và điền modal trước khi cho lưu.

### A03 · P1 · Sửa biến thể của sản phẩm nháp có thể ghi đè size, màu, giá và trạng thái bằng dữ liệu giả

**Vị trí:** [admin-products.page.ts:899](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-products.page.ts:899), [admin-products.page.ts:973](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-products.page.ts:973).

Trang quản trị đọc biến thể qua endpoint public chỉ trả sản phẩm `PUBLISHED` và biến thể `ACTIVE`. Với sản phẩm nháp/archived, fallback lấy inventory, ghép bằng **tên sản phẩm**, tự đặt size/màu `—`, giá bằng giá sản phẩm, status `ACTIVE`. Khi lưu, FE gửi tất cả giá trị này về API như dữ liệu thật. Nhân viên có `catalog.manage` nhưng không có `inventory.manage` còn có thể bị chặn luôn ở fallback.

**Tái hiện:** mở quản lý biến thể sản phẩm `DRAFT`, chọn sửa một SKU, chỉ sửa SKU rồi lưu. Bộ tái hiện xác nhận payload chứa size/màu `—`, giá của sản phẩm và status `ACTIVE`. Hai sản phẩm trùng tên còn có thể bị trộn biến thể.

**Hướng sửa:** thêm API quản trị đọc chi tiết/biến thể theo product ID, gồm cả `INACTIVE`; không tạo dữ liệu thay thế có thể ghi ngược vào DB.

## Các lỗi chức năng và độ ổn định

### A04 · P2 · Luồng từ chối/đánh dấu hoàn tiền thất bại không khớp contract BE

**Vị trí:** [admin-refunds.page.ts:812](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-refunds.page.ts:812), [refunds.dto.ts:22](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/payments/refunds.dto.ts:22), [refund.service.ts:202](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/payments/refund.service.ts:202).

FE chỉ gửi `{reason}`; `FailRefundDto` bắt buộc `evidenceObjectKey`, nên request bị 400. Modal cũng không có ô upload chứng từ. Ngoài ra FE hiện nút “Từ chối” ở `PENDING_APPROVAL`, nhưng service chỉ nhận `APPROVED`, nên bổ sung chứng từ vẫn chưa làm luồng này đúng.

**Tái hiện:** mở modal fail và gửi lý do. Đã kiểm tra payload FE bằng DTO validator thật; request HTTP thật trả 400 với field error `evidenceObjectKey`.

**Hướng sửa:** tách rõ reject proposal và failed bank transfer, đồng bộ trạng thái cho phép, form upload, type FE và DTO BE.

### A05 · P2 · Không có thông tin chuyển khoản đầy đủ để thực hiện hoàn tiền sau khi phê duyệt

**Vị trí:** [admin-refunds.page.ts:951](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-refunds.page.ts:951), [refund.service.ts:279](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/payments/refund.service.ts:279), [refund.mapper.ts:31](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/payments/refund.mapper.ts:31).

API approve trả QR chứa tài khoản đích và mã đối soát; FE bỏ response này rồi tải danh sách lại. GET/list chỉ trả tài khoản che số, không dựng lại QR, và template không hiển thị QR/transfer content. Sau reload không thể lấy thông tin chuyển tiền đầy đủ qua màn hình này.

**Tái hiện:** phê duyệt, callback FE bỏ `qrImageUrl`; danh sách và detail chỉ còn thông tin che số. Bộ tái hiện xác nhận QR bị bỏ.

**Hướng sửa:** giữ và hiển thị response approve; cho người có quyền đọc lại QR/thông tin chuyển khoản của refund `APPROVED` và hiển thị nội dung chuyển khoản cần dùng.

### A06 · P2 · Bốn endpoint BE khai báo phân trang nhưng không giới hạn số bản ghi trả về

**Vị trí:** [ai.service.ts:58](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/ai/ai.service.ts:58), [inventory.service.ts:53](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/commerce/inventory.service.ts:53), [order.service.ts:213](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/commerce/order.service.ts:213), [reviews.service.ts:54](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/community/reviews.service.ts:54).

`GET /ai/jobs`, `/admin/inventory/ledger`, `/admin/orders`, `/reviews` gọi `.skip()` nhưng thiếu `.limit(safeLimit)`. `limit=1` vẫn trả toàn bộ dữ liệu còn lại; các trang chồng lặp. Với AI còn phát sinh ký URL kết quả cho nhiều job ngoài yêu cầu.

**Tái hiện:** mỗi model có 4 row; gọi page 1, limit 1. Cả bốn service đều trả 4 row và metadata `limit: 1`, đã xác nhận bằng 4 test. Riêng `/admin/orders` đã kiểm chứng thêm với HTTP/MongoDB thật: 4 item khi request limit 1.

**Hướng sửa:** thêm limit vào cả bốn query, kiểm tra page 1/2 với dữ liệu lớn hơn một trang.

### A07 · P2 · Nhiều danh sách FE không truy cập được dữ liệu ngoài trang đầu

**Vị trí ví dụ:** [orders.page.ts:285](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/orders.page.ts:285), [admin-users.page.ts:484](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-users.page.ts:484), [notifications.page.ts:220](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/notifications.page.ts:220).

Order history, users, products, refunds, community, notifications, moderation và audit logs dùng page mặc định nhưng không có state/control chuyển trang hoặc tải tiếp. Một số API đang thiếu limit ở A06 làm che giấu lỗi này trên các màn hình liên quan. Ví dụ khách có 55 đơn chỉ thấy 20 đơn mới nhất; quản trị không tìm được tài khoản cũ để khóa/mở.

**Tái hiện:** API trả 20 item, total 55; `OrdersPage` chỉ giữ item, bỏ total và không có page state. Các màn hình còn lại đã đối chiếu source/template.

**Hướng sửa:** bổ sung pagination hoặc tải tiếp dựa trên `total`, giữ filter/page nhất quán; sửa cùng A06.

### A08 · P2 · Dropdown phân công nhân viên luôn gọi API với limit không hợp lệ

**Vị trí:** [admin-orders.page.ts:469](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-orders.page.ts:469), [pagination-query.dto.ts:8](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/common/pagination-query.dto.ts:8).

FE gọi `adminListUsers(1, 100)`; DTO BE đặt `@Max(50)`, nên API trả 400 và dropdown không có nhân viên. Ô nhập ID thủ công là đường vòng hiện còn hoạt động.

**Tái hiện:** mở phân công, kiểm tra request, chạy validator trên query thật; request HTTP `/admin/users?page=1&limit=100` cũng trả 400.

**Hướng sửa:** endpoint tìm nhân viên có filter role/status và pagination; không chỉ đổi 100 thành 50 vì danh sách users có thể toàn khách hàng.

### A09 · P2 · Người mua không sửa/xóa được đánh giá cũ sau khi tải lại trang

**Vị trí:** [order-detail.page.ts:636](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/order-detail.page.ts:636), [reviews.service.ts:58](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/community/reviews.service.ts:58), [product.page.ts:817](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/product.page.ts:817).

`itemReviews` chỉ nằm trong memory, không được khôi phục từ API khi mở đơn. Sau reload FE nghĩ chưa có review và POST lại, BE trả 409. Trang sản phẩm cũng không khắc phục được vì response review public không có owner/orderItemId mà FE cần để hiện nút quản lý và gửi PATCH. FE còn hiện quyền quản lý cho admin, trong khi route BE chỉ cho CUSTOMER.

**Tái hiện:** gửi review, reload chi tiết đơn, mở review lần nữa; editing ID rỗng. Hai test xác nhận trạng thái mất và dữ liệu public thiếu trường.

**Hướng sửa:** trả review của chính người mua theo order/orderItem hoặc endpoint riêng; nạp lại mapping và đồng bộ quyền FE/BE. Không cần công khai thêm thông tin người mua trên endpoint public.

### A10 · P2 · Lỗi mạng tạm thời khi khởi động FE làm mất phiên đăng nhập cục bộ

**Vị trí:** [auth.service.ts:101](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/services/auth.service.ts:101).

`initAuth()` xóa token/user với mọi lỗi profile, kể cả status 0/502/503. BE hồi phục vẫn không khôi phục phiên vì lần init sau thấy không có access token và không thử cookie refresh. Lỗi mạng bị xử lý như xác thực thất bại.

**Tái hiện:** giữ token hợp lệ, profile request status 0; token và currentUser bị xóa. Đã tái hiện.

**Hướng sửa:** chỉ kết thúc phiên với lỗi xác thực xác định; giữ state trong lỗi tạm thời, cho retry/khôi phục bằng refresh cookie.

### A11 · P2 · Access token hết hạn ở API auth có bảo vệ không được refresh

**Vị trí:** [auth.interceptor.ts:49](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/services/auth.interceptor.ts:49).

Interceptor bỏ qua refresh cho toàn bộ `/auth/*`, bao gồm `change-password` và `me` là route có bảo vệ. Người dùng mở profile quá một giờ rồi đổi mật khẩu nhận 401 dù refresh cookie còn hợp lệ; yêu cầu này không được retry.

**Tái hiện:** token hết hạn, POST `/auth/change-password` trả 401; mock refresh không được gọi. Đã xác nhận.

**Hướng sửa:** chỉ bỏ qua chính refresh/login và các endpoint public không được retry; cho refresh/retry các endpoint auth có bảo vệ.

### A12 · P2 · Response sản phẩm cũ có thể ghi đè sản phẩm của URL hiện tại

**Vị trí:** [product.page.ts:697](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/product.page.ts:697).

Mỗi thay đổi route tạo subscription HTTP độc lập; không cancel hoặc kiểm tra slug khi nhận response. Khi chuyển nhanh từ A sang B, response A tới sau có thể hiển thị A ở URL B, và nút mua cũng dùng variant của A.

**Tái hiện:** phát response B trước rồi A sau; `product().id` kết thúc là A. Đã xác nhận.

**Hướng sửa:** dùng route param stream + `switchMap`, hủy subscription khi destroy; làm tương tự cho review/related data của sản phẩm.

### A13 · P2 · Cập nhật giỏ hàng đồng thời có thể khôi phục món đã xóa

**Vị trí:** [cart.service.ts:178](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/services/cart.service.ts:178), [cart.service.ts:184](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/services/cart.service.ts:184).

`addItem`/`updateQuantity` kiểm tra loading nhưng `removeItem`/`clearCart` không kiểm tra. Các mutation gửi toàn bộ cart từ snapshot cũ; response không có kiểm tra phiên bản/thứ tự. Nút xóa trên template cũng không bị khóa lúc request đang chạy.

**Tái hiện:** tăng số lượng đang pending, xóa món, response xóa tới trước rồi response tăng số lượng tới sau; FE hiện lại món đã xóa. Đã xác nhận bằng hai Subject độc lập.

**Hướng sửa:** tuần tự hóa mutation hoặc áp dụng lock nhất quán, kiểm soát version và bỏ response cũ; đồng bộ clear sau checkout với state cục bộ thay vì thêm mutation không cần thiết.

### A14 · P2 · Polling AI dừng vĩnh viễn sau một lỗi HTTP/mạng

**Vị trí:** [ai-try-on.page.ts:806](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/ai-try-on.page.ts:806), [ai-mix-match.page.ts:496](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/ai-mix-match.page.ts:496).

Error handler chỉ `clearInterval()`, không retry, không báo trạng thái gián đoạn, không có resume. Job vẫn hiện PROCESSING; try-on còn khóa nút tạo lại dựa trên state này dù job BE có thể đã hoàn tất.

**Tái hiện:** một lần get job lỗi mạng rồi tiến clock 30 giây; cả hai page chỉ gọi API một lần và giữ PROCESSING. Đã xác nhận.

**Hướng sửa:** retry có backoff, cho retry thủ công, dừng đúng các terminal state và hủy request khi đổi job/destroy.

### A15 · P2 · Cleanup AI có thể xóa ảnh đầu vào đang được job mới sử dụng

**Vị trí:** [ai-cleanup.worker.ts:56](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/ai/ai-cleanup.worker.ts:56), [ai.service.ts:109](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/ai/ai.service.ts:109).

API cho tái sử dụng media đầu vào và gia hạn expiresAt. Cleanup lại duyệt từng job cũ theo terminalAt, xóa input key mà không kiểm tra deadline mới hoặc job khác còn tham chiếu. Job cũ đủ 24 giờ có thể xóa ảnh của job mới đang xử lý/chờ polling.

**Tái hiện:** job cũ hoàn tất 25 giờ trước; media READY đã gia hạn thêm 7 ngày. Cleanup vẫn gọi delete trên media này. Đã xác nhận; chưa kiểm chứng race qua MongoDB/R2 thật.

**Hướng sửa:** quyết định expiry theo media và các job còn hoạt động, hoặc dùng key input độc lập cho từng job; cleanup cần kiểm tra tham chiếu trước khi xóa.

### A16 · P2 · Bộ kiểm tra ảnh chấp nhận PNG/WebP không chứa pixel ảnh

**Vị trí:** [image-sanitize.util.ts:40](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/storage/image-sanitize.util.ts:40), [image-sanitize.util.ts:60](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/storage/image-sanitize.util.ts:60).

PNG chỉ được kiểm signature, cấu trúc chunk và IEND; không yêu cầu IHDR/IDAT. WebP chỉ kiểm RIFF/WEBP và độ dài chunk, không yêu cầu VP8/VP8L. Container 20 byte không có ảnh vẫn pass sanitize. Finalize và AI provider dùng hàm này làm bước kiểm tra ảnh.

**Tái hiện:** PNG chỉ có signature+IEND, WebP chỉ có JUNK chunk đều được trả về thành công. Hai test đã xác nhận.

**Hướng sửa:** decode/re-encode bằng thư viện ảnh tin cậy, kèm giới hạn pixel/dimension và kiểm tra nội dung thực; không coi strip metadata là xác thực khả năng giải mã ảnh.

### A17 · P2 · Contract mật khẩu 128 ký tự vượt giới hạn 72 byte của bcrypt

**Vị trí:** [auth.dto.ts:6](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/auth/auth.dto.ts:6), [auth.service.ts:48](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/auth/auth.service.ts:48).

DTO/FE cho 12–128 ký tự nhưng BE hash bằng bcrypt trực tiếp. bcryptjs đang cài bỏ qua phần sau 72 byte. Hai password khác nhau nhưng trùng 72 byte đầu đều được chấp nhận; Unicode làm giới hạn byte đạt sớm hơn 72 ký tự. Đổi mật khẩu chỉ khác ở hậu tố có thể bị hiểu là chưa đổi.

**Tái hiện:** hash chuỗi 72 byte + `original`; compare chuỗi cùng prefix + `different` trả true. Đã xác nhận bằng bcryptjs đang cài. Đây không phải bằng chứng có thể đoán được password của người dùng.

**Hướng sửa:** đồng bộ giới hạn theo UTF-8 bytes, hoặc chuyển thuật toán hash phù hợp; có kế hoạch giữ tương thích password hash đã lưu.

### A18 · P2 · Danh mục sau khi ẩn biến mất khỏi cả màn hình quản trị

**Vị trí:** [admin-products.page.ts:718](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-products.page.ts:718), [catalog-scaffold.controller.ts:15](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/catalog/catalog-scaffold.controller.ts:15).

Trang admin dùng `categories()` public; controller luôn gọi `listCategories(true)`, chỉ trả ACTIVE. Sau khi đặt HIDDEN rồi reload, danh mục không có trong bảng để sửa hoặc bật lại. Tạo mới một danh mục HIDDEN cũng có kết quả tương tự.

**Xác minh:** đối chiếu call FE, filter service và route public; chưa chạy E2E trình duyệt.

**Hướng sửa:** thêm danh sách category quản trị có phân quyền và filter status; FE admin dùng endpoint này.

### A19 · P2 · Nginx mặc định chặn upload fallback lớn hơn khoảng 1 MiB

**Vị trí:** [default.conf.template:18](C:/Users/htech/Downloads/fashion-commerce/deploy/nginx/default.conf.template:18), [storage.controller.ts:23](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/storage/storage.controller.ts:23).

Template reverse proxy không đặt `client_max_body_size`, trong khi upload fallback cho phép file tới 10 MiB và giới hạn R2 mặc định là 5 MiB. Nginx mặc định giới hạn body 1 MiB và trả 413 khi vượt ngưỡng, theo [tài liệu chính thức](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size). Khi PUT R2 trực tiếp lỗi, ảnh hợp lệ 2 MiB cũng không dùng được fallback trong mô hình same-origin qua web container.

**Tái hiện container:** chạy Nginx 1.27-alpine với đúng template/script và bản FE production cục bộ, upstream cố ý không có API. Multipart 1 KiB đến proxy và nhận 502 do không có upstream; multipart 2 MiB bị Nginx chặn trước bằng **413**. Đã xác nhận bằng HTTP thật, không gọi R2.

**Hướng sửa:** đặt giới hạn riêng cho route upload phù hợp giới hạn file và overhead multipart, đồng bộ reverse proxy trên server BE khi tách server.

### A20 · P2 · Màn hình kiểm duyệt không có cách tìm bài đăng/bình luận công khai để ẩn

**Vị trí:** [moderation.service.ts:27](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/community/moderation.service.ts:27), [community-post.service.ts:66](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/community/community-post.service.ts:66), [admin-moderation.page.ts:209](C:/Users/htech/Downloads/fashion-commerce/apps/web/src/app/pages/admin/admin-moderation.page.ts:209).

Queue chỉ trả review/post `PENDING_REVIEW`, không query comment. Post mới và comment lại luôn được tạo PUBLIC; FE admin chỉ dùng queue này. Dù API moderate hỗ trợ POST/COMMENT theo ID, màn hình không hiển thị chúng để nhân viên phát hiện, chọn và xử lý. Nội dung đã ẩn cũng không có danh sách để restore.

**Xác minh:** đối chiếu create status, query queue, endpoint và các thao tác FE. Không khẳng định người có quyền không thể gọi API trực tiếp khi biết ID.

**Hướng sửa:** phân biệt hàng chờ duyệt và quản lý toàn bộ nội dung; bổ sung danh sách/filter/search theo status/targetType cùng thao tác ẩn/khôi phục.

### A21 · P3 · OpenAPI thiếu endpoint lấy chi tiết Lookbook quản trị

**Vị trí:** [lookbooks.controller.ts:31](C:/Users/htech/Downloads/fashion-commerce/apps/api/src/modules/lookbooks/lookbooks.controller.ts:31), [openapi.yaml](C:/Users/htech/Downloads/fashion-commerce/docs/openapi.yaml).

Route `GET /admin/lookbooks/{lookbookId}` có code và FE sử dụng nhưng không có trong OpenAPI. Checker chuyên biệt thất bại trong khi `check:docs` vẫn pass; workflow chưa gọi checker này.

**Hướng sửa:** bổ sung endpoint/response/auth metadata vào OpenAPI và đưa route checker vào CI sau build.

## Dependency: cảnh báo và điều kiện áp dụng

Hai báo cáo được lấy trực tiếp từ registry npm ngày 27/10/2026:

- [npm-audit.json](npm-audit.json): **8 package bị gắn cờ — 2 critical, 4 high, 1 moderate, 1 low**.
- [npm-audit-production.json](npm-audit-production.json): **3 package high, 0 critical** trong cây dependency production.

Đây là số package bị gắn cờ, gồm cả package cha bị ảnh hưởng qua dependency; không phải 8 lỗi độc lập và không phải 8 đường khai thác đã được chứng minh.

| Nhóm | Package | Đánh giá trong repository này |
|---|---|---|
| BE runtime | `multer@2.4.0`, `@nestjs/platform-express`, `@nestjs/core` | Audit gắn high qua Multer. [Advisory của Multer](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) yêu cầu async fileFilter và request teardown. FileInterceptor hiện tại không cấu hình async fileFilter, nên chưa xác nhận đường crash này áp dụng cho route hiện có. Cần nâng dependency tương thích; không coi cảnh báo này là bằng chứng BE đang bị DoS không xác thực. |
| Dev/test | `tinypool@1.1.1`, `vitest@3.2.7`, `@vitest/mocker` | Hai critical thuộc cây tool test. [Advisory Tinypool](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3) mô tả gadget khi có nguồn prototype pollution; chưa tìm thấy nguồn đó trong ứng dụng này. Không suy diễn thành RCE trực tiếp trên BE production. |
| FE dev/build | `vite`, `@angular/build` | Audit gắn high/low theo cây build/dev server. Ví dụ [advisory launch-editor trên Windows](https://github.com/advisories/GHSA-698v-4r3x-3vcv) có điều kiện attacker tạo file/đầu vào đặc biệt. Không có Vite server trong artifact FE static production. |

Không chạy `npm audit fix --force`: đề xuất tự động có thể đổi major hoặc hạ version framework. Cần chọn bản vá/override tương thích, kiểm lại lockfile, build, unit test và integration. Không dùng dev server làm production server.

## Thứ tự xử lý đề xuất

1. A01–A03: tính toàn vẹn voucher, quyền nhân viên và dữ liệu biến thể.
2. A04–A09: hoàn tiền, paging và các contract FE/BE đang làm hỏng chức năng.
3. A10–A17: phiên đăng nhập, request race, vòng đời AI và kiểm tra đầu vào.
4. A18–A21 và dependency: hoàn thiện màn hình quản trị, proxy, OpenAPI/CI và vá package phù hợp.
5. Sau khi sửa, chạy lại unit/integration và các ca tái hiện đã chuyển sang kỳ vọng đúng; kiểm thử trình duyệt trên hai origin HTTPS, upload >1 MiB và các luồng hoàn tiền với dữ liệu test trước khi phát hành.
