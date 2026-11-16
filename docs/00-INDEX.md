# Danh mục tài liệu dự án

| Tài liệu | Nội dung / người dùng chính |
|---|---|
| [01-SRS.md](01-SRS.md) | Nguồn chuẩn cho phạm vi, FR, BR, NFR và trạng thái nghiệp vụ |
| [use-cases/README.md](use-cases/README.md) | Danh mục và luồng chi tiết UC01–UC37 |
| [10-USE-CASE-OVERVIEW.md](10-USE-CASE-OVERVIEW.md) | Sơ đồ nhóm nghiệp vụ, không lặp chi tiết UC |
| [02-ARCHITECTURE.md](02-ARCHITECTURE.md) | Ranh giới hệ thống và luồng xử lý |
| [03-DATA-MODEL.md](03-DATA-MODEL.md) | Nguồn chuẩn cho collection, index và transaction |
| [04-RBAC.md](04-RBAC.md) | Nguồn chuẩn cho role, permission và ownership |
| [05-API.md](05-API.md) | Route đã có và hợp đồng API chưa triển khai |
| [06-DEPLOYMENT.md](06-DEPLOYMENT.md) | Contract triển khai đa nền tảng: static, container, VPS và PaaS |
| [07-DEVELOPMENT.md](07-DEVELOPMENT.md) | Setup, quy ước và Definition of Done |
| [08-TEST-PLAN.md](08-TEST-PLAN.md) | Ma trận kiểm thử và quality gate |
| [09-SECURITY.md](09-SECURITY.md) | Threat model, kiểm soát và khoảng trống production |
| [11-DECISION-LOG.md](11-DECISION-LOG.md) | Nguồn chuẩn cho policy và quyết định đã chốt |
| [12-IMPLEMENTATION-STATUS.md](12-IMPLEMENTATION-STATUS.md) | Nguồn chuẩn duy nhất cho trạng thái code |
| [13-EMAIL-SENDGRID.md](13-EMAIL-SENDGRID.md) | Hợp đồng tích hợp email |
| [14-STORAGE-R2.md](14-STORAGE-R2.md) | Hợp đồng lưu trữ media |
| [15-INTEGRATIONS.md](15-INTEGRATIONS.md) | Hợp đồng AI và event nội bộ; payment chỉ được tham chiếu |
| [16-PAYMENT-GPMPAY.md](16-PAYMENT-GPMPAY.md) | Hợp đồng thanh toán GPM Pay |
| [17-GLOSSARY.md](17-GLOSSARY.md) | Thuật ngữ canonical |
| [18-BACKLOG-ROADMAP.md](18-BACKLOG-ROADMAP.md) | Thứ tự triển khai theo dependency |
| [19-HANDOVER-CHECKLIST.md](19-HANDOVER-CHECKLIST.md) | Điều kiện bàn giao và go-live |
| [20-UI-FLOWS.md](20-UI-FLOWS.md) | Nguồn chuẩn cho route màn hình, flow và UI states |
| [21-DATABASE-MIGRATIONS.md](21-DATABASE-MIGRATIONS.md) | Migration, index, seed, backfill và rollback |
| [22-EVENT-CONTRACTS.md](22-EVENT-CONTRACTS.md) | Envelope, versioning, outbox, retry và replay event |
| [23-DATA-PRIVACY.md](23-DATA-PRIVACY.md) | Phân loại, retention, consent, export và xóa dữ liệu |
| [24-OPERATIONS-RUNBOOK.md](24-OPERATIONS-RUNBOOK.md) | Logging, metrics, incident, backup/restore và deploy rollback |
| [25-PAYMENT-SEPAY.md](25-PAYMENT-SEPAY.md) | Hợp đồng thanh toán SePay |
| [26-AUDIT-REMEDIATION.md](26-AUDIT-REMEDIATION.md) | Bản sửa audit lần 2, đối soát hai người và điều kiện nghiệm thu |
| [openapi.yaml](openapi.yaml) | Hợp đồng HTTP máy đọc được; nguồn chuẩn cho DTO/types |
| [test-cases/README.md](test-cases/README.md) | Testcase thực thi tối thiểu theo phase |
| [adr/0001-monorepo.md](adr/0001-monorepo.md) | Architecture decision: npm workspaces |
| [adr/0002-r2-sendgrid.md](adr/0002-r2-sendgrid.md) | Architecture decision: R2 + SendGrid |

## Quy tắc nguồn chuẩn

- Không ghi trạng thái “đã làm” ngoài [12-IMPLEMENTATION-STATUS.md](12-IMPLEMENTATION-STATUS.md) và bảng route implemented trong [05-API.md](05-API.md).
- Không lặp schema, permission hoặc hợp đồng provider trong UC; UC liên kết tới tài liệu chuyên biệt.
- Nếu phát sinh policy chưa chốt, chỉ ghi `OPEN` trong [11-DECISION-LOG.md](11-DECISION-LOG.md), không dùng giá trị tạm như yêu cầu bắt buộc.
- Mọi thay đổi FR phải cập nhật UC tương ứng, API/data model liên quan, test plan và implementation status.
- `openapi.yaml` là nguồn chuẩn cho HTTP schema/status/error; `05-API.md` giải thích phạm vi và policy, không được mâu thuẫn với OpenAPI.
- Không đánh dấu phase hoàn thành nếu migration, testcase và operation gate tương ứng chưa đạt.
