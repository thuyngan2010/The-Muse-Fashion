# Fashion Commerce

Monorepo website thương mại điện tử thời trang gồm Angular web, NestJS API, MongoDB, Cloudflare R2, Twilio SendGrid và thanh toán chuyển khoản VietQR đối soát qua GPM Pay.

## Yêu cầu chạy

- Node.js **24.15+** (`.nvmrc`), npm 10.9+
- Docker (MongoDB local)
- SendGrid và R2 chỉ bắt buộc khi chạy chức năng email hoặc upload

## Quick start

```bash
cp apps/api/.env.example apps/api/.env
npm ci
npm run build:api
docker compose up -d mongo
docker compose run --rm mongo-init
npm run migrate --workspace @fashion/api
npm run seed
npm run dev:api
# Terminal khác:
npm run dev:web
```

Các mẫu cấu hình: [API](apps/api/.env.example), [FE dev/build](apps/web/.env.example) và [Docker Compose deploy](deploy/.env.example). Biến mới dùng trong code hoặc Compose phải được thêm vào mẫu tương ứng; `npm run check:env` kiểm tra việc này trong CI.

- Frontend: http://localhost:4200
- Backend: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/api/docs

## Cấu trúc

```text
apps/api/                  NestJS API
apps/web/                  Angular storefront
packages/contracts/        TypeScript types dùng chung
scripts/                   Kiểm tra tính nhất quán tài liệu
.github/                   CI
docs/                      Yêu cầu, thiết kế, vận hành và trạng thái triển khai
```

## Tài liệu

- [Danh mục và nguồn chuẩn](docs/00-INDEX.md)
- [Trạng thái code hiện tại](docs/12-IMPLEMENTATION-STATUS.md)
- [Hướng dẫn phát triển](docs/07-DEVELOPMENT.md)
- [Chạy local và triển khai](docs/06-DEPLOYMENT.md)
- [OpenAPI máy đọc được](docs/openapi.yaml)
- [Roadmap và release gate](docs/18-BACKLOG-ROADMAP.md)

## Quy ước

Vai trò đăng nhập gồm `CUSTOMER`, `ADMIN`, `STAFF`; Guest là trạng thái chưa đăng nhập. Không đưa secret hoặc credential tích hợp xuống frontend.

Backend đã có xử lý nghiệp vụ cho các route trong OpenAPI, không còn route scaffold trả `501`. Xem [trạng thái triển khai](docs/12-IMPLEMENTATION-STATUS.md) và bằng chứng kiểm thử trước khi nghiệm thu; việc có mã nguồn không thay thế nghiệm thu provider/nghiệp vụ trên staging.

## Kiểm tra

```bash
npm run check:docs
npm run check:env
npm run build
npm test
```

## Triển khai

- Vercel/static: import repository root, cấu hình `PUBLIC_API_BASE_URL`, dùng [vercel.json](vercel.json).
- Docker/VPS/PaaS: build [Dockerfile.api](Dockerfile.api) và [Dockerfile.web](Dockerfile.web); cấu hình runtime theo [compose.deploy.yaml](compose.deploy.yaml).
- Hai server riêng: dùng [compose.web.yaml](compose.web.yaml) cho FE và [compose.api.yaml](compose.api.yaml) cho BE. FE đặt `PUBLIC_API_BASE_URL=https://api.example.com/api/v1`; BE đặt origin FE và `API_CORS_CREDENTIALS=true`. Với dev/static build, FE đọc biến từ `apps/web/.env`.
- Chi tiết contract, health checks, CORS/proxy và các mô hình hosting: [Deployment](docs/06-DEPLOYMENT.md).

Admin ban đầu: đăng ký + xác minh email, rồi `ADMIN_EMAIL=... ADMIN_CONFIRM=YES npm run admin:grant --workspace @fashion/api` (xem `docs/07-DEVELOPMENT.md`).
