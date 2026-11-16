# Checklist bàn giao repository

## Hồ sơ yêu cầu

- [x] SRS FR-01–FR-37, BR, NFR, acceptance.
- [x] 37 file UC trong `docs/use-cases/` và ma trận FR/UC.
- [x] 10 nhóm UC tổng quát, kiến trúc, RBAC, API/OpenAPI, QA, security, R2, SendGrid.
- [x] UI flow/state, migration/index plan, event contract, privacy policy kỹ thuật và operations runbook.
- [x] Decision Log không còn policy `OPEN`; testcase tối thiểu theo phase đã được baseline.

## Mã nguồn starter (local)

- [x] npm workspaces; Angular + NestJS + contracts.
- [x] MongoDB Docker compose, `.env.example`, Swagger, auth + catalog + presign R2.
- [x] CI: kiểm tra docs/env/script, build, unit, Mongo integration và migration từ API image; seed + bootstrap Admin offline.
- [x] Root `package-lock.json` đồng bộ dependency để CI/Docker dùng `npm ci`.
- [x] API/web có Dockerfile độc lập, runtime frontend config, Compose deploy và Vercel adapter.
- [ ] Triển khai UC còn lại theo backlog và nghiệm thu.

## Điều kiện go-live

- [ ] Xem [06-DEPLOYMENT.md](06-DEPLOYMENT.md): HTTPS, CORS, secret, Mongo không lộ ra internet.
- [ ] Khi bật UC15+, hoàn tất checklist GPM Pay hoặc SePay theo provider sử dụng, Mongo replica set/migration và payment/concurrency testcase; không còn cấu hình merchant placeholder. SePay Test Mode và Live dùng webhook/khóa/tài khoản tách biệt.
- [ ] Trước production: restore rehearsal, SLO/load report, RBAC/IDOR/security suite, retention cleanup và UAT 37 UC đều có evidence/sign-off.

## Liên quan

[00-INDEX](00-INDEX.md) · [12-IMPLEMENTATION-STATUS](12-IMPLEMENTATION-STATUS.md) · [18-BACKLOG-ROADMAP](18-BACKLOG-ROADMAP.md)
