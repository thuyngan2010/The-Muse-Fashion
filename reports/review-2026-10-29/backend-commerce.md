# Backend commerce/payment review — 2026-10-29

Rà soát working tree hiện tại; không sửa source. Các kết quả sau dựa trên call chain hiện tại và `commerce-repro.mjs`, chạy trên API dist vừa build. Harness dùng model/transaction giả, không truy cập MongoDB hoặc provider; không nên gọi đây là kiểm thử HTTP/integration.

## C1 — P1: Một mã giao dịch ngân hàng có thể hoàn tất nhiều refund

- Vị trí chính: `apps/api/src/modules/payments/refund.service.ts:174-183`; schema `apps/api/src/modules/payments/payment.schemas.ts:87`.
- Trigger: Tạo và duyệt hai refund 50.000đ của cùng payment 100.000đ; hoàn tất thủ công cả hai bằng cùng `bankReference` và bằng chứng của một giao dịch 50.000đ.
- Thực tế: Cả hai thành `SUCCEEDED`, cộng thành 100.000đ và đóng order `CANCEL_PENDING_REFUND` thành `CANCELLED`, phát hai `refund.completed`. Không lookup/claim giao dịch tiền ra; `Refund.bankReference` không có unique index. Idempotency chỉ bảo vệ từng refund/request, không bảo vệ giao dịch ngân hàng dùng lại cho refund khác.
- Yêu cầu: UC29 dòng 19 nói một giao dịch tiền ra thực tế gắn duy nhất với Refund.
- Tác động: Lỗi thao tác lặp của vận hành có thể khiến khách mới nhận một phần tiền nhưng hệ thống thông báo hoàn đủ; số liệu hoàn tiền/doanh thu sai.
- Hướng sửa: Claim giao dịch ngân hàng trong transaction với khóa duy nhất đủ scope (provider/tài khoản merchant/mã tham chiếu); dùng chung cho đường manual, webhook và xử lý đối soát nếu cùng settlement. Không chỉ dựa vào tên file evidence.
- Regression cần thêm: Hai refund khác nhau dùng chung bank reference, cả tuần tự và đồng thời; manual/webhook cùng giao dịch; request replay của cùng refund vẫn idempotent.
- Bằng chứng: `node reports/review-2026-10-29/commerce-repro.mjs` trả `accepted=[SUCCEEDED,SUCCEEDED]`, `orderState=CANCELLED`, `bankReferenceUniqueIndex=false`.

## C2 — P2: API đề nghị tạo lại phiên thanh toán nhưng luôn từ chối sau đổi provider

- Vị trí chính: `apps/api/src/modules/payments/payment.service.ts:222-223`; xung đột với guard dòng 113.
- Trigger: Có attempt `GPMPAY/PENDING` còn hạn, deployment đổi `PAYMENT_PROVIDER=SEPAY`, customer mở lại trang thanh toán.
- Thực tế: GET payment trả `canRetry=true` vì `attempt.provider !== activeProvider`; FE `payment.page.ts:69` hiển thị “Tạo lại phiên thanh toán”. Nhấn gọi POST attempts và nhận 409 `Order already has a pending attempt with another provider`.
- Tác động: Nút hành động đưa khách vào ngõ cụt và thông báo sai khả năng thanh toán. UC26 luồng thay thế 2b chủ ý cấm tạo attempt khác provider khi attempt cũ PENDING, nên cần sửa contract/UI đúng policy hoặc triển khai quy trình đổi provider an toàn, không bỏ guard tài chính.
- Regression cần thêm: Thay provider khi attempt còn PENDING; GET không đề nghị retry không khả thi và UI có thông báo/hướng xử lý.
- Bằng chứng: Script trên trả `canRetry=true`, `retryError.status=409`.

## C3 — P2: Hoàn đủ tiền đóng đơn nhưng thiếu mốc cuối trong lịch sử đơn

- Vị trí: `apps/api/src/modules/payments/refund.service.ts:301-303`.
- `maybeCloseOrder()` đổi order từ `CANCEL_PENDING_REFUND` sang `CANCELLED`, nhưng không tạo `OrderEvent` hoặc `order.status_changed`; service không inject model OrderEvent.
- `OrderService.getOrder()` đọc `statusHistory` trực tiếp từ `order_events`, frontend `order-detail.page.ts:188-193` hiển thị danh sách đó. Sau hoàn đủ, nhãn trạng thái hiện CANCELLED nhưng lịch sử kết thúc ở CANCEL_PENDING_REFUND, thiếu thời điểm đóng đơn.
- UC16 yêu cầu lịch sử/chi tiết/trạng thái hiển thị đúng; UC18 BR03 yêu cầu lịch sử phục vụ truy vết.
- Hướng sửa: Ghi OrderEvent (và outbox đổi trạng thái nếu đó là contract) trong cùng transaction khi đủ tiền. Test hoàn từng phần + lần cuối + replay, xác nhận chỉ một mốc cuối.
- Mức kiểm chứng: Đọc call chain; harness xác nhận nhánh này đổi state, chưa kiểm thử HTTP timeline.

## Điểm nghiệp vụ chưa hoàn thiện, không kết luận là lỗi trái policy

- Shipment `FAILED` là terminal trong `OrderService.updateShipment`, order `SHIPPING` chỉ được chuyển `DELIVERED`, và `staffMayCancel` không cho hủy SHIPPING. Chưa có workflow giao lại/trả hàng/nhập lại tồn hoặc trạng thái xử lý ngoại lệ. Theo policy hiện tại cấm hủy SHIPPING, cần quyết định nghiệp vụ và thêm UC/state phù hợp trước khi mở cho vận hành thực tế.
- `InventoryService.list()` và `VoucherService.list()` vẫn lấy toàn bộ collection; cần phân trang trước khi dữ liệu lớn. Đây là khoảng trống quy mô, chưa có đo tải để kết luận lỗi hiệu năng hiện tại.

## Phần được kiểm tra trong mã nguồn

Đặt đơn/quote/pricing/cart, giữ/giải phóng/chốt tồn, voucher usage, cancel/expire, chuyển trạng thái và shipment, tạo payment/replay/provider, webhook vào/ra, refund approval/completion và budget, scope quyền đọc/thao tác. Không thấy lỗi oversell mới rõ ràng: các thay đổi tồn và order được thực hiện trong commerce transaction, có điều kiện stock/version và ledger/event key.
