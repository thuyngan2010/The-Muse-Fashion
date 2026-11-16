# Bản sửa audit — 29/10/2026

Đã sửa 7 lỗi A29-01–A29-07 trong source, giữ nguyên các thay đổi giao diện có sẵn của người dùng. Không commit hoặc deploy; kiểm thử dùng database tạm và provider giả lập.

## Kết quả xử lý

| ID | Bản sửa | Kiểm chứng |
| --- | --- | --- |
| A29-01 | Mọi refund completion ghi chung `Order.version` trước khi kiểm tra tổng hoàn, buộc transaction xung đột retry với snapshot mới. Áp dụng cả thủ công/webhook và race với hủy đơn. | Các khoản hoàn khác nhau manual/manual và manual/webhook chạy đồng thời; hoàn đủ → CANCELLED; replay giữ đúng 2 outbox event; full refund đồng thời với cancellation. |
| A29-02 | Quote/order từ chối tổng thanh toán 0đ trước khi lưu/giữ tồn bằng `ZERO_PAYABLE_NOT_SUPPORTED`, hướng dẫn bỏ/đổi voucher. Payment attempt mới cho đơn 0đ cũ cũng bị chặn; không cấp QR/retry cho chúng. | Quote 0đ, quote legacy và order legacy bị chặn; giỏ, tồn kho, voucher và quote consumption không đổi. Giảm 100% merchandise nhưng shipping dương vẫn hợp lệ. |
| A29-03 | FE chuyển cả hai date input sang khoảng đầy đủ ngày Việt Nam: từ 00:00 ngày đầu tới 00:00 ngày sau ngày cuối, gửi ISO UTC. Chọn cùng một ngày hợp lệ; ngày mặc định theo Việt Nam. Có hiển thị lỗi và hủy request cũ. | Ranh giới 00:00/23:59:59.999, trước 07:00, ngày nhuận, range sai, HTTP report đúng 200.000đ cho hai giao dịch trong ngày và loại giao dịch ở nửa đêm hôm sau. |
| A29-04 | Post/Review attach/detach media trong transaction, ghi chung media để chống race. Gỡ tham chiếu cuối đặt expiry 30 ngày; dùng lại trước hạn hủy lịch; nội dung hidden/pending vẫn bảo vệ ảnh. Community orphan đã finalize giữ expiry 24 giờ. | Shared Post/Review, replacement, reuse, cleanup-vs-attach, R2 failure/crash retry và legacy deletion 40 ngày; object storage được stub. |
| A29-05 | Voucher gửi `maxDiscount: null` khi xóa trần và giữ đúng giá trị 0. | Test gọi handler lưu rồi kiểm payload JSON, cả null và 0. |
| A29-06 | Khôi phục nút sửa/xóa chỉ cho chủ review. FE lấy dữ liệu của chính khách qua `/reviews/mine?reviewIds=...` giới hạn 50 ID; public response không chứa owner/orderItem. Theo dõi auth khôi phục chậm/đăng xuất/đổi tài khoản, hủy lookup cũ. Sửa giữ ảnh hiện có và tải lại danh sách sau khi chuyển về chờ duyệt. | Frontend test owner/guest/admin, delayed auth và stale response; HTTP own-only lookup, invalid selector, privacy, legacy orderId và phân trang. |
| A29-07 | Shared contract và template thống nhất `usedCount` với response backend. | Build Angular strict template và test voucher dùng dữ liệu usedCount. |

## File chính

- Commerce: `apps/api/src/modules/commerce/pricing.service.ts`, `apps/api/src/modules/payments/refund.service.ts`, `payment.service.ts`.
- Retention: `apps/api/src/modules/community/community-media-retention.util.ts`, `community-post.service.ts`, `reviews.service.ts`; `apps/api/src/modules/storage/storage.service.ts`, `storage-cleanup.worker.ts`, `media-object.schema.ts`.
- Frontend: `apps/web/src/app/pages/product.page.ts`, `pages/admin/admin-reports.page.ts`, `pages/admin/admin-vouchers.page.ts`, `services/report-date-range.ts`, `services/api.service.ts`; `packages/contracts/src/index.ts`.
- Contract/policy: `docs/openapi.yaml`, `docs/11-DECISION-LOG.md`, `docs/14-STORAGE-R2.md`, UC15/UC29/UC31.

## Kiểm thử

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| Contracts + API + Angular production build | Pass | `npm run build` |
| API unit | 159 pass | [JSON](unit-api-fixed-results.json) |
| Web unit | 48 pass | [JSON](unit-web-fixed-results.json) |
| Audit regression | 22 pass | `npm run test:audit` |
| Runtime config | 5 pass | `npm run test:web:config` |
| Docs/env/scripts/routes | Pass | 113 controller routes |
| MongoDB integration | 82 pass, 2 skip, 0 fail | [JSON](integration-fixed-results.json) |
| Whitespace/diff checks | Pass | `git diff --check` |

Regression mới đã được đưa vào các bộ test thông thường để CI chạy lại:

- `apps/api/test/integration/audit-three-commerce.int-spec.ts`.
- `apps/api/test/integration/community-media-retention.int-spec.ts`.
- `apps/api/test/integration/review-owner-lookup.int-spec.ts`.
- `apps/web/src/app/pages/audit-three.spec.ts`.
- Unit pricing/payment/storage trong các file `.spec.ts` tương ứng.

Toàn bộ 12 integration regression mới đều pass trong lượt suite đầy đủ. Hai ca skip vẫn là upload/finalize R2 thật vì không bật credential test; không tính là pass. Tổng các bộ kiểm tra nêu trên là 316 test pass, 2 skip. Container MongoDB tạm `fashion-fix-20261029` đã dừng và tự xóa sau kiểm thử.

Các script `*-repro.mjs` và `frontend-repro.spec.ts` trong thư mục báo cáo là bằng chứng lịch sử của lỗi trước khi sửa. Chúng cố ý assert hành vi cũ; dùng các regression trong source ở trên để kiểm tra bản sửa.

## Ghi chú vận hành

- Checkout hiện chỉ hỗ trợ chuyển khoản có số tiền dương. Policy này đã được ghi vào DEC-06 và UC15; không tạo payment ngân hàng giả để giải quyết đơn miễn phí.
- Schema thêm `retentionVersion` không có index mới. Worker đối soát media community legacy theo batch, không cần migration dữ liệu hàng loạt; nếu không còn lịch sử tham chiếu thì áp grace period 30 ngày từ lần đối soát. Thời hạn riêng của ảnh AI được giữ.
- Triển khai backend trước frontend vì màn hình sản phẩm mới dùng thêm selector `reviewIds` của endpoint hiện có. Không có thay đổi endpoint count hoặc cách gọi `orderId` cũ.
- Không thay dữ liệu hoặc trạng thái đơn/hoàn tiền trong môi trường thật. R2 thật và tương tác browser chưa được kiểm thử trong đợt sửa này; hai ca integration R2 cần credential riêng.

## Advisory dependency còn tồn tại

Không đổi dependency trong đợt sửa này. Kiểm tra npm registry cho thấy bản mới nhất của `deepmerge` vẫn là 4.3.1; [advisory chính thức](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) ghi chưa có bản vá. Advisory mức thấp hiện ảnh hưởng 4 package trong chuỗi SendGrid, như [audit ban đầu](npm-audit.json). Không downgrade SendGrid hoặc thay toàn bộ SDK khi chưa có bản sửa tương thích được kiểm chứng. Chưa xác nhận đường khai thác từ input người dùng của ứng dụng.
