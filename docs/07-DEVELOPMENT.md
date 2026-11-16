# Developer Handbook

## 1. Cấu trúc workspace

- Root npm workspaces: `apps/api`, `apps/web`, `packages/contracts`.
- Backend NestJS module: controller (transport), DTO validation, service (business logic), schema/repository, tests.
- FE Angular standalone pages/routes; API services typed bằng shared `@fashion/contracts`.
- Shared contract package chỉ gồm types/constants; không mang DB model hay runtime secrets.

## 2. Setup

1. `nvm use` (Node >=24.15; Node 22.16 trong một số môi trường **không đủ** cho Angular 22).
2. `npm ci` cài đúng dependency từ root `package-lock.json`; chỉ dùng `npm install` khi chủ động cập nhật dependency và commit lockfile cùng thay đổi.
3. `npm run build:api`.
4. `cp apps/api/.env.example apps/api/.env`, đổi secret.
5. `docker compose up -d mongo`.
6. `docker compose run --rm mongo-init`, rồi `npm run migrate --workspace @fashion/api`.
7. `npm run dev:api` và `npm run dev:web` ở hai terminal.
8. Mở Swagger, health, thử GET products; cấu hình SendGrid để test xác minh email.

## 3. Branch/PR workflow

Tên branch `feature/UC15-checkout` hoặc `fix/UC02-login-rate-limit`. PR liên kết FR+UC, thay đổi API schema, unit/integration tests, xem lại NFR/quyền; không merge trực tiếp vào `main`. Reviewer BE kiểm transaction/ownership, FE kiểm UX, QA kiểm acceptance.

## 4. Coding conventions

- TypeScript strict; không `any` ở service trừ adapter vendor có lớp kiểm tra.
- REST paths danh từ số nhiều; DTO parse/filter; không tự tin dữ liệu client; dùng UTC ISO date.
- Financial values integer VND; tránh floating point; trạng thái enum canonical.
- TypeScript ESM NestJS relative imports dùng hậu tố `.js` trong `.ts` vì NodeNext.
- Không console log payload chứa token, thông tin thẻ, ảnh cá nhân; log request ID và safe metadata.
- Migrations, unique indexes trước API traffic; idempotency cho side effects.
- UI responsive; HTML semantic; hiển thị lỗi/empty/loading; các nút không giả chức năng.

## 5. Definition of Done (DoD)

- [ ] FR/UC và quyết định nghiệp vụ liên quan đã được duyệt
- [ ] Controller/DTO/service/DB/indexes, migration/verify, validation và ownership hoàn chỉnh
- [ ] `openapi.yaml` cập nhật schema/status/error cho feature; generated/shared types đồng bộ và contract diff đạt
- [ ] Unit + integration + authorization + happy/error + idempotency tests; testcase phase có evidence
- [ ] Không lộ secrets; có logs/metrics tối thiểu; thử provider failure
- [ ] FE đủ trạng thái trong UI Flow, responsive/WCAG keyboard behavior
- [ ] Logs/metrics/alerts/runbook và rollback được cập nhật nếu thêm failure mode vận hành
- [ ] QA ký testcase và PR được review
- [ ] Cập nhật 12-IMPLEMENTATION-STATUS.md từ partial sang done khi đạt UAT

## 6. Troubleshooting

- API fail start: kiểm `JWT_SECRET` và MongoDB URI/health; `MongooseModule` cần DB sẵn.
- FE fail compile: kiểm đúng Node 24.15+ / Angular 22 / TypeScript 6.
- Register trả 503: SendGrid chưa cấu hình hoặc sender chưa xác thực; user có thể ở PENDING_VERIFICATION, cần chức năng resend theo UC01.
- R2 503: thiếu account/access secret/bucket; presigned PUT chỉ cấp URL, không thay việc xác thực file.
- Docker Mongo dev chưa replica set: chưa chạy transaction checkout nhiều document; trước UC15 phải nâng cấu hình DB.
- Vercel build fail `PUBLIC_API_BASE_URL`: cấu hình URL public đầy đủ tới `/api/v1`; project phải dùng repository root để thấy npm workspace.
- Container web trả SPA nhưng API lỗi: kiểm `PUBLIC_API_BASE_URL` (browser; `API_BASE_URL` là alias cũ) và `API_UPSTREAM` (Nginx proxy). Khi tách server, xem `compose.web.yaml` và cấu hình CORS/cookie trong [Deployment](06-DEPLOYMENT.md).

## 7. Quy trình bổ sung 1 Use Case

Duyệt `docs/use-cases/UCxx.md` và decision liên quan → cập nhật OpenAPI → model/index/migration → service/DTO/controller → integration/contract/security test → Angular screen/state → QA evidence → cập nhật implementation status.

## 8. Seed và bootstrap tài khoản quản trị

```bash
npm run seed # tạo 3 sản phẩm demo, idempotent
# Chỉ sau khi đã có một tài khoản verified và đăng nhập được:
cd apps/api
ADMIN_EMAIL=admin@example.com ADMIN_CONFIRM=YES npm run admin:grant
```

Lệnh cấp Admin dành riêng cho lần khởi tạo đầu tiên, yêu cầu thao tác người có quyền máy chủ. Trong production phải có audit/deployment ticket, và không tiếp tục dùng script khi đã có Admin.

## 9. Kiểm thử tích hợp backend

Khởi động MongoDB replica set, đặt `MONGODB_TEST_URI` trỏ vào replica set, rồi chạy `npm run build:api` và `npm run test:integration`. Suite kiểm 20 checkout tranh tồn kho/voucher, 20 request checkout lặp cùng idempotency key, tạo payment attempt cạnh tranh với cancel/expire, refund webhook cạnh tranh với hoàn tiền thủ công, và AI POST redirect 307/308 qua HTTP cục bộ.

Ca upload lên Cloudflare R2 thật chỉ chạy khi đặt `R2_E2E_ENABLED=true` cùng `R2_E2E_ACCOUNT_ID`, `R2_E2E_ACCESS_KEY_ID`, `R2_E2E_SECRET_ACCESS_KEY`, `R2_E2E_PUBLIC_BUCKET` và `R2_E2E_PRIVATE_BUCKET`. Dùng hai bucket thử nghiệm riêng; test gửi PUT qua presigned URL, finalize ảnh và kiểm body vượt `Content-Length` đã ký bị từ chối. CI không có thông tin R2 nên ca này được skip theo mặc định.

## 10. Mock AI provider cho QA giao diện

Backend đã có `AiWorkerService`; không cần thay worker để kiểm tra vòng đời job khi chưa có model thật. Chạy provider giả lập riêng từ repository root:

```powershell
npm run dev:ai-mock
```

Trong terminal chạy API, đặt các biến sau rồi chạy `npm run dev:api` (khởi động lại API nếu đang chạy):

```powershell
$env:AI_ENABLED = 'true'
$env:AI_API_BASE_URL = 'http://127.0.0.1:3669/v1'
$env:AI_API_KEY = 'local-ai-mock'
$env:AI_TRY_ON_MODEL = ''
$env:AI_MIX_MATCH_MODEL = ''
npm run dev:api
```

Mock chỉ lắng nghe loopback và không chạy với `NODE_ENV=production`. API key mặc định là `local-ai-mock`; có thể đổi bằng `AI_MOCK_API_KEY` trong terminal mock và đặt cùng giá trị vào `AI_API_KEY` của API. `AI_MOCK_PORT` đổi cổng mặc định 3669. Đặt `$env:AI_MOCK_MODE = 'failure'` trước khi chạy mock để kiểm thử job thất bại; mặc định `success`.

QA thử cả `/ai/try-on` và `/ai/mix-match`: chọn sản phẩm, tải ảnh, đồng ý consent, tạo job và đợi trạng thái cuối. Mock nhận job qua HTTP 202 rồi trả ảnh PNG fixture cố định khi worker poll; lần poll kế tiếp có thể mất khoảng 30–35 giây. Chế độ `failure` trả lỗi để kiểm tra UI và hoàn quota. Mock không tải ảnh đầu vào, không sửa tài khoản/sản phẩm và không cung cấp suy luận AI thật. Luồng upload, lưu kết quả và URL ảnh vẫn cần cấu hình R2 sandbox hợp lệ của API.

Chạy `npm run test --workspace @fashion/web` để kiểm tra fallback voucher, chống báo giá cũ ghi đè khi đổi địa chỉ và khóa đặt hàng khi đang tính giá. Test HTTP mock provider nằm trong `test/integration/ai-provider-http.int-spec.ts` và không cần kết nối model bên ngoài.

## 11. Fashion agent: phân tích trước, tạo ảnh sau

`AiFashionPlannerService` thêm hai bước trước renderer: (1) vision nhận diện đúng một người, các vùng cơ thể nhìn thấy và từng sản phẩm; (2) lập phương án mặc/layer/đặt phụ kiện. Backend kiểm tra JSON, đúng product id, confidence, vùng đặt và xung đột vị trí rồi tạo prompt theo quy tắc từng loại sản phẩm. Không dùng output tool/JSON Schema strict chưa tương thích của gateway làm nguồn lệnh tin cậy. Mỗi bước JSON có tối đa một lần sửa, cùng deadline và giới hạn response 64 KiB.

```dotenv
AI_PLANNER_ENABLED=true
AI_PLANNER_BASE_URL=http://localhost:20128/v1
AI_PLANNER_API_KEY=<server-side-key>
AI_PLANNER_MODEL=ag/gemini-3.8-flash-medium
AI_PLANNER_TIMEOUT_MS=90000
```

`AI_API_BASE_URL`, `AI_API_KEY`, `AI_TRY_ON_MODEL`, `AI_MIX_MATCH_MODEL` vẫn cấu hình **model tạo ảnh**. Không thay chúng bằng model chat/vision chỉ vì model đó phân tích ảnh được. Planner mặc định tắt khi thiếu lựa chọn bật trong cấu hình; bật ở `.env` API rồi khởi động lại API. Key không đưa vào frontend hoặc Git.

Hỗ trợ quy tắc cho áo, quần/chân váy, váy liền, áo khoác, giày, dép/sandal, kính, mũ, túi, thắt lưng, khăn, dây chuyền, bông tai, vòng tay, đồng hồ và nhẫn. Ví dụ thử giày phải thấy chân; thử kính phải thấy mặt. Ảnh thiếu vùng cần thiết, không có/đa người, độ tin cậy thấp hoặc hai sản phẩm cùng vị trí sẽ dừng trước request tạo ảnh và hoàn quota qua luồng lỗi hiện có. Đây là kiểm tra điều kiện từ kết quả vision, không phải cam kết nhận diện chính xác mọi ảnh.

Worker giữ đúng một ảnh cho mỗi sản phẩm theo thứ tự lựa chọn. Plan được lưu trước khi gửi renderer và tái sử dụng khi poll; không gửi lại request tạo ảnh có kết quả chưa rõ. API chỉ trả `phase`, `planSummary`, `detectedItems`, không trả raw prompt hoặc signed URLs trong plan. UI hiển thị `ANALYZING → PLANNING → GENERATING` và các nhóm hàng đã nhận diện. Plan được xóa khi output hết thời hạn lưu giữ.

Lựa chọn phong cách trên trang Mix & Match được gửi qua `style` (`office`, `streetwear`, `evening`, `minimalist`) và đưa vào bước lập phương án. Thay đổi style với cùng idempotency key bị từ chối; không tái sử dụng nhầm job cho một yêu cầu phối khác.

Test unit: `fashion-plan.spec.ts`, `ai-fashion-planner.service.spec.ts`. Test tích hợp: `ai-mock-lifecycle.int-spec.ts` dùng MongoDB test riêng, mock planner/renderer qua HTTP và object storage giả. Nó kiểm cả checkpoint không phân tích lại khi poll và hoàn quota khi ảnh không có người.

Sau `npm run build:api`, có thể thử planner thật với ảnh người/mũ/giày **tổng hợp**, không đọc ảnh khách hàng:

```powershell
node --env-file=apps/api/.env scripts/probe-fashion-agent.mjs
# Chỉ khi muốn gọi thêm renderer đang cấu hình:
$env:AI_FASHION_PROBE_RENDER = 'true'
node --env-file=apps/api/.env scripts/probe-fashion-agent.mjs
```

Probe ghi evidence vào `reports/fashion-agent/`; gọi provider thật có thể phát sinh usage. Ảnh tổng hợp kiểm đường truyền và điều phối, không thay bộ QA ảnh thời trang thật.
