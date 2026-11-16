# Thứ tự triển khai theo dependency

Các phase dưới đây biểu diễn dependency kỹ thuật, không biểu diễn ngày hoàn thành hoặc phân công nhân sự.

| Phase | Mục tiêu | UC | Dependency / release gate |
|---|---|---|---|
| P0 — Foundation | Auth/session, RBAC, migrations, SendGrid verification, observability | UC01–UC06, UC30, UC33 | DEC-04/08/11; OpenAPI; M0 migration; P0 testcase; log/metrics |
| P1 — Catalog | Products, variants, size guide, Lookbook, media finalize | UC07–UC11 | R2 private/public, SKU indexes, product UI |
| P2 — Core commerce | Cart, price quote, reservation, checkout, order, voucher/stock | UC14–UC21 | Mongo replica set + M2 migration; DEC-02/06; event contract; concurrency tests |
| P3 — Payment | VietQR payment/refund, GPM Pay webhook tiền vào/ra, đối soát, lịch sử, chuyển khoản refund thủ công, notification | UC26–UC29, UC34–UC35 | tài khoản merchant có webhook `out`, HMAC secret; raw body; Simulator; DEC-03; mã refund unique, dữ liệu tài khoản đối ứng, idempotency; payment/refund testcase |
| P4 — Experience | AI jobs, quota, community, moderation, notification center | UC12–UC13, UC22–UC25, UC36–UC37 | R2 private, AI provider, consent, rate control |
| P5 — Admin/Go-live | Dashboard, settings, audit, backup/recovery, release UAT | UC31–UC32 | payment-derived KPIs; SLO/load report; privacy/retention; restore rehearsal; runbook/UAT sign-off |

## Điều kiện hoàn thành phase

Mỗi phase chỉ hoàn thành khi FR/UC, OpenAPI, schema/index/migration, UI states, authorization, [testcase](test-cases/README.md) và [Implementation Status](12-IMPLEMENTATION-STATUS.md) đã đồng bộ; các release gate trong bảng phải đạt.
