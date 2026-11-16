# Kết quả sửa audit lần 2 — Fashion Commerce

Đợt sửa bắt đầu 27/10/2026, hoàn tất kiểm tra local ngày 28/10/2026 (Asia/Saigon). Phạm vi là 20 mã BE/FE/UX/QA trong báo cáo người dùng cung cấp. Không cộng lại 21 mã A01–A21 của audit trước.

Cập nhật sau kiểm thử: theo yêu cầu ngày 28/10/2026, đã gỡ Playwright/axe-core, browser runtime của project, suite/cấu hình browser và bước CI liên quan. Các kết quả browser dưới đây là bằng chứng lịch sử của lượt đã chạy, không phải công cụ còn cài trong project.

**18 phát hiện về source/tài liệu đã được xử lý. QA-01 đã bổ sung kiểm thử nhưng còn UAT toàn diện; QA-02 còn là release gate cần môi trường thực.** Không coi kết quả local là chấp thuận xử lý tiền production. Chưa deploy production trong đợt sửa này.

## Ma trận xử lý

| ID | Kết quả bản sửa | Kiểm chứng / giới hạn |
| --- | --- | --- |
| BE-01 | READY chỉ chuyển sang PREPARING; pickup/transit mới SHIPPING; chặn lùi trạng thái, duplicate idempotent | HTTP/MongoDB: READY, IN_TRANSIT, DELIVERED, replay và rollback |
| BE-02 | `hasOpenReview` theo toàn bộ attempt của đơn; FE đọc được review của attempt cũ, ẩn QR/yêu cầu trả thêm | HTTP/MongoDB + browser trạng thái review |
| BE-03 | Access token trong memory, refresh đồng bộ trong tab và giữa tab bằng Web Locks; giữ nguyên thu hồi family khi replay | 5 tab thật trên Chromium/Firefox pass; token cũ replay trả 401. HTTPS cross-site staging còn cần UAT |
| BE-04 | Join/count/pagination payment trong MongoDB; bỏ danh sách toàn bộ order IDs trong Node | Phân quyền customer/assigned staff; fixture 100k orders + explain |
| BE-05 | Catalog variant join/group/facet tại DB; tìm kiếm dùng text index thay regex | Fixture 100k variants + explain; `q` nay là tìm từ khóa đầy đủ trên tên/mô tả |
| BE-06 | Loại token/user cache legacy khỏi browser storage; refresh HttpOnly, logout có thu hồi; CSP cho Nginx/Vercel | Browser kiểm token storage, Docker kiểm CSP trên HTML/config/JS/404. Không tuyên bố miễn nhiễm XSS |
| BE-07 | Quy trình ghi nhận hoàn/đối soát ngoài ứng dụng: hai Admin độc lập, chứng từ private bắt buộc, số tiền chính xác, audit, mã chứng từ không dùng lại giữa settlement review | HTTP/MongoDB chặn tự duyệt/sai bằng chứng/sai tiền/duplicate reference; không chuyển tiền hay hồi sinh đơn |
| FE-01 | Giữ quote/idempotency key theo user đến khi biết kết quả; reload replay cùng yêu cầu để lấy đơn đã commit | Browser thật cắt response sau commit, reload tới đúng payment, chỉ có một order; ký webhook test để xác nhận payment |
| FE-02 | Hủy request catalog cũ và request khi destroy | Unit + browser đảo thứ tự response |
| FE-03 | Snapshot permission từ API, menu/route/nút xét quyền và assignment; màn hình 403, landing theo grant | Unit/build, HTTP ownership và browser staff chỉ có order.read |
| FE-04 | Xóa thông tin ngân hàng/chủ tài khoản giả; QR load/error/retry; nói rõ chỉ hỗ trợ quét QR | Browser ảnh QR lỗi. Giữ số tài khoản che; không triển khai chuyển khoản thủ công đầy đủ |
| FE-05 | Gỡ đúng visibility listener; hủy subscription/timer khi ẩn/destroy | Unit + browser điều hướng SPA 5 lần, số listener về 0 mỗi lần rời trang |
| FE-06 | Lỗi địa chỉ hiển thị riêng và có nút thử lại | Browser 503 rồi retry thành công |
| UX-01 | Native dialog, focus trap/restore, nền inert, khóa scroll, nhãn riêng | Keyboard + axe trên dialog được kiểm tra; NVDA/VoiceOver chưa chạy |
| UX-02 | AI dropdown dùng button, Enter/Space/click, Escape/outside close và ARIA | Chromium/Firefox keyboard + axe header; sửa thêm contrast logo phát hiện lúc chạy axe |
| UX-03 | Admin mobile topbar/drawer, menu theo quyền, bảng cuộn trong vùng nội dung | Viewport 320/375/768/1024; [Chromium](admin-mobile-chromium.png), [Firefox](admin-mobile-firefox.png) |
| UX-04 | Hướng dẫn đang chờ/đối soát/quá hạn/hoàn ngoài; deadline không đồng nghĩa đã hoàn, không yêu cầu trả thêm khi review | Browser review/QR/lifecycle; UAT toàn bộ bố cục payment còn cần thiết |
| QA-01 | Thêm Playwright Chromium/Firefox + axe vào CI và 20 browser regressions | Đã chạy local đủ 20, không skip/flaky. Chưa phủ browser mọi UC, Safari/iOS, screen reader, Core Web Vitals |
| QA-02 | Bổ sung benchmark lớn, diễn tập restore local, Docker/migration smoke và bảng release gates | **Chưa đóng gate production**: chưa gọi provider thật, chưa chạy tải chuẩn 50 RPS, chưa chứng nhận RPO/RTO production hay diễn tập ngân hàng thật |
| QA-03 | Đồng bộ README/status/OpenAPI, thêm DEC-13, UC27, runbook và tài liệu quy trình | Check docs/env/scripts/routes + parse OpenAPI |

## Kết quả đã thực thi

| Kiểm tra | Kết quả | Bằng chứng |
| --- | --- | --- |
| API unit | 156 pass | [JSON](unit-api-results.json) |
| FE unit | 41 pass | [JSON](unit-web-results.json) |
| MongoDB integration | 70 pass, 2 skip | [JSON](integration-results.json) |
| Browser Chromium + Firefox | 20 pass, 0 skip, 0 flaky | [JSON](browser-results.json) |
| Regression audit trước | 22 pass | `npm run test:audit` |
| Benchmark MongoDB lớn | 1 pass, smoke budget p95 5 giây | [Kết quả](performance-results.json), [samples + explain](performance.json) |
| Docker API + FE | Build thành công; production readiness 200, CORS credentials/allowlist, Linux sharp, FE API URL riêng, CSP, upload boundary | [Smoke source](container-smoke.mjs), [kết quả](container-results.json) |
| Migration | Fresh database 3 migrations; rerun idempotent; upgrade DB đã áp dụng 2 migration cũ | [Integration](integration-results.json), [5 ca migration](migration-results.json) |
| Backup/restore local | Hash dữ liệu nghiệp vụ khớp; 0 fixture bị mất; restore + migration verify 4.949 ms | [Kết quả](restore-results.json) |
| Dependency audit | 0 vulnerability, toàn bộ dependencies | [JSON](npm-audit.json) |

Hai ca skip là upload/finalize qua Cloudflare R2 thật (presigned upload và API fallback). Chúng không được tính là pass. Chứng từ trong test đối soát là media fixture PRIVATE/READY; kiểm thử này không xác nhận đối tượng đã được upload ở R2 thật.

Benchmark dùng 100.000 orders, 100.000 attempts, 100.000 variants và 1.000 products; 10 mẫu tuần tự mỗi endpoint. Payment p50/p95 khoảng **840/1.001 ms**, catalog filter + search + sort khoảng **243/348 ms**. Đây là kiểm tra truy vấn và phân trang với dataset lớn, chưa phải chứng nhận NFR ở 50 RPS. Không so sánh trực tiếp với production khác cấu hình máy/tải.

Browser sử dụng bundle production và CSP tương ứng. Chromium chạy Windows, Firefox chạy qua Playwright server trong container Linux chính thức do Firefox Windows không khởi động được (`spawn UNKNOWN`). Chỉ expose origin test `127.0.0.1:41879`; không mở profile người dùng. Mỗi kịch bản full-stack có API riêng để không cộng dồn quota request giữa các lượt browser; giữ nguyên rate limit và chống replay trong source ứng dụng. Các request HTTPS của browser bị chặn để không gọi QR/AI/provider thật. Cách chạy remote theo [Playwright Docker](https://playwright.dev/docs/docker).

## Quy trình nghiệp vụ đã chốt

Chủ sản phẩm chọn **đối soát và hoàn thủ công trong hệ thống: hai người kiểm tra, bắt buộc chứng từ, không tự chuyển tiền**. Đã triển khai dưới dạng Admin đề xuất → PENDING_APPROVAL → Admin khác duyệt/từ chối. Mỗi người phải có chứng từ private đã finalize của mình. Tiền merchant nhận không thể đóng bằng CLOSED_NO_ACTION. Tiền lệch/đến muộn được ghi nhận hoàn toàn bộ khoản bank event bên ngoài, không tự ghép vào đơn hay giữ phần tiền thừa.

OUTGOING_RECONCILED ghi nhận đối soát bank event đã kiểm chứng; không tự hoàn tất Refund có sẵn. Unique bank reference ở workflow này chỉ chống dùng lại giữa các settlement review cùng provider; không thay thế sổ cái ngân hàng/đối chiếu chéo với quy trình Refund. Người vận hành phải kiểm sao kê, người nhận và chứng từ thực, tránh chuyển tiền lần hai.

Xem [hướng dẫn đầy đủ](../../docs/26-AUDIT-REMEDIATION.md) và [runbook](../../docs/24-OPERATIONS-RUNBOOK.md). Khi nâng cấp cần chạy migration mới, provision hai Admin riêng, dừng BE cũ trước áp dụng policy mới và kiểm kê event legacy đã đóng. FE và BE tiếp tục deploy độc lập: FE nhận `PUBLIC_API_BASE_URL`, BE cấu hình origin/credentials/cookie đúng môi trường.

## Điều kiện chưa thể nghiệm thu local

Provider SePay/GPM Pay sandbox đúng merchant, tiền vào/ra và chứng từ thực; R2/SendGrid/AI thật; UAT toàn bộ 37 UC, Safari/iOS và screen reader; load chuẩn 50 RPS; alert/owner/SLA; backup production RPO ≤24 giờ, RTO ≤4 giờ. Chưa có các bằng chứng này thì chưa mở xử lý tiền thật. Không có giao dịch hay deployment production nào trong lượt sửa này.
