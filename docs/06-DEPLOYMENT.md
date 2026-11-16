# Chạy local và triển khai đa nền tảng

Repository dùng hai artifact độc lập: API container và web static/container. Cùng một source có thể chạy trên VPS Docker Compose, container PaaS, Kubernetes hoặc frontend static như Vercel; khác biệt chỉ nằm ở biến môi trường, secret và adapter của nền tảng.

## 1. Local (mặc định)

```bash
nvm use
npm ci
cp apps/api/.env.example apps/api/.env
# Đặt JWT_SECRET, REFUND_ENCRYPTION_KEY, EMAIL_TOKEN_ENCRYPTION_KEY; tùy chọn SendGrid / R2
npm run build:api
docker compose up -d mongo
docker compose run --rm mongo-init
npm run migrate --workspace @fashion/api
npm run seed
npm run dev:api
# terminal khác:
npm run dev:web
```

- Web: http://localhost:4200 (proxy `/api` → API port 3000)
- API: http://localhost:3000/api/v1 · Swagger: `/api/docs`
- MongoDB: Docker `compose.yaml`, URI mặc định trong `.env.example`

Email và ảnh R2 **tùy chọn** khi dev: register đưa email vào queue; worker sẽ retry khi SendGrid chưa cấu hình. Upload trả 503 nếu R2 chưa cấu hình.

Thanh toán local/staging dùng GPM Pay Simulator hoặc CLI gửi webhook đã ký. Webhook local cần một URL HTTPS public/tunnel để cấu hình trên Dashboard; payload `SIMULATED` tuyệt đối không được làm đơn thành công ở production.

## 2. Contract artifact

| Artifact | Build | Runtime contract |
|---|---|---|
| API | `Dockerfile.api` | HTTP `PORT` (mặc định 3000); health `/api/v1/health/live` và `/ready`; migration runner `node apps/api/dist/scripts/migrate.js`; state nằm ở Mongo/R2/provider ngoài container |
| Web container | `Dockerfile.web` | HTTP 8080; `PUBLIC_API_BASE_URL` cấu hình browser lúc container start (`API_BASE_URL` là alias cũ); `API_UPSTREAM` cho proxy same-origin |
| Web static | `npm run build:web:prod` | đọc `PUBLIC_API_BASE_URL` từ môi trường hoặc `apps/web/.env`; output `apps/web/dist/browser`; SPA fallback về `index.html` |

API image không chứa `.env`; web image không nhúng secret. API image mang source migration để kiểm checksum nhưng chỉ thực thi JavaScript đã biên dịch. `runtime-config.js` chỉ chứa URL public và được trả `Cache-Control: no-store`.

## 3. Biến môi trường API (`apps/api/.env`)

Mẫu đầy đủ tại [`apps/api/.env.example`](../apps/api/.env.example). Đặt secret riêng cho từng môi trường; giữ `ADMIN_CONFIRM` rỗng trong cấu hình chạy thường ngày. Production sẽ từ chối khởi động khi thiếu khóa mã hóa, cấu hình merchant của `PAYMENT_PROVIDER` đang chọn, MongoDB không hỗ trợ transaction hoặc migration baseline chưa hoàn tất.

| Biến | Khi nào cần | Ghi chú |
|---|---|---|
| `MONGODB_URI` | Luôn | Local: `mongodb://127.0.0.1:27017/fashion_commerce` |
| `JWT_SECRET` | Luôn | ≥32 byte ngẫu nhiên, không commit |
| `REFUND_ENCRYPTION_KEY` / `EMAIL_TOKEN_ENCRYPTION_KEY` | Luôn trên production | Mỗi khóa 32 byte ngẫu nhiên ở dạng 64 ký tự hex; giữ ổn định qua các lần deploy và quản lý trong secret manager |
| `HOST` / `PORT` | Runtime | Mặc định `0.0.0.0:3000`; PaaS có thể inject `PORT` |
| `PUBLIC_WEB_URL` | Gửi email xác minh | URL web (local hoặc domain) |
| `API_CORS_ORIGIN` | FE và API khác origin | VD production: `https://shop.example.com` |
| `API_CORS_CREDENTIALS` | FE và API khác origin | Phải là `true` vì FE gửi request với credentials; origin cụ thể, không dùng `*` |
| `REFRESH_COOKIE_SAME_SITE` | Cookie đăng nhập | `lax` mặc định; hai site khác nhau dùng `none` và `REFRESH_COOKIE_SECURE=true` qua HTTPS |
| `TRUST_PROXY` | Sau load balancer/reverse proxy | `true` để IP/protocol đúng; không bật khi client truy cập process trực tiếp |
| `SWAGGER_ENABLED` | API docs | Mặc định tắt khi `NODE_ENV=production` |
| `SENDGRID_*` | Gửi mail thật | Xem [13-EMAIL-SENDGRID.md](13-EMAIL-SENDGRID.md) |
| `R2_*` | Upload ảnh thật | Xem [14-STORAGE-R2.md](14-STORAGE-R2.md) |
| `R2_PRIVATE_BUCKET` | Upload ảnh thật | Bucket riêng với `R2_BUCKET`; không gắn public URL |
| `PAYMENT_PROVIDER` | Chọn một provider thanh toán | `GPMPAY` (mặc định) hoặc `SEPAY`; không chọn theo từng request; hoàn tất attempt cũ trước khi đổi |
| `GPMPAY_WEBHOOK_SECRET` | Nhận webhook | Secret HMAC chỉ hiện một lần; không commit/log |
| `GPMPAY_BANK_BIN` / `GPMPAY_ACCOUNT_NUMBER` / `GPMPAY_ACCOUNT_NAME` | Dựng VietQR | Cấu hình merchant phía server, không nhận từ client |
| `SEPAY_WEBHOOK_API_KEY` | Nhận webhook SePay | Khóa API của webhook, chỉ lưu server-side; dùng cấu hình riêng cho Test Mode và Live |
| `SEPAY_BANK_BIN` / `SEPAY_ACCOUNT_NUMBER` / `SEPAY_ACCOUNT_NAME` | Dựng VietQR SePay | Phải khớp tài khoản nhận tiền đã kết nối trên SePay |
| `ADMIN_EMAIL` / `ADMIN_CONFIRM` | Chạy `admin:grant` một lần | Chỉ đặt `ADMIN_CONFIRM=YES` khi chủ động chạy script; để rỗng khi chạy API |

## 4. Mẫu A — VPS hoặc máy chủ có Docker

1. Cài Docker Engine/Compose; tạo `apps/api/.env` chỉ trên server và điền secret/provider/Mongo URI.
2. Copy [`deploy/.env.example`](../deploy/.env.example) thành `deploy/.env`, trỏ `API_IMAGE`/`WEB_IMAGE` tới registry mong muốn hoặc giữ image local. File này chỉ chứa biến nội suy Compose; API secrets ở `apps/api/.env`.
3. Sao lưu Mongo, rồi build/chạy tại source checkout:

```bash
docker compose --env-file deploy/.env -f compose.deploy.yaml build
docker compose --env-file deploy/.env -f compose.deploy.yaml up -d
docker compose --env-file deploy/.env -f compose.deploy.yaml ps
```

Compose chạy `api-migrate` bằng chính API image và đợi job hoàn tất trước khi khởi động API. Migration lỗi sẽ chặn rollout; xem log bằng `docker compose --env-file deploy/.env -f compose.deploy.yaml logs api-migrate`. Khi dùng PaaS/Kubernetes, chạy `node apps/api/dist/scripts/migrate.js` từ cùng image/tag dưới dạng release job một lần trước rollout.

Web mặc định chỉ bind `127.0.0.1:8080`; reverse proxy/load balancer của host cấp TLS tới cổng này. Container web proxy `/api/` tới API nên browser dùng `/api/v1`, không cần CORS. MongoDB production là dịch vụ ngoài compose; `MONGODB_URI` có thể trỏ Atlas, managed Mongo hoặc replica set tự quản.

Khi dùng image từ registry, chạy `docker compose pull` trước `up -d`. Tag release phải bất biến (version hoặc digest), không dùng `latest` cho rollback.

## 5. Mẫu B — frontend Vercel/static, API ở dịch vụ khác

FE và BE có thể triển khai trên hai server độc lập. URL API cần có đầy đủ `/api/v1` và truy cập được từ **trình duyệt người dùng**; không dùng hostname Docker như `http://api:3000` cho biến này.

### Cấu hình FE cho dev/build thông thường

Copy [`apps/web/.env.example`](../apps/web/.env.example) thành `apps/web/.env` trên máy chạy dev/build:

```dotenv
PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

`npm run dev:web`, `npm run build:web`, `npm run build:web:prod` và build trong workspace web đều tạo `runtime-config.js` trước khi chạy Angular. Biến do môi trường hosting/CI cung cấp ưu tiên hơn `.env`. Khởi động lại dev server hoặc build lại static files sau khi đổi biến. Khi không cấu hình, FE vẫn dùng `/api/v1` qua proxy cũ. HTTP tới IP/server riêng được hỗ trợ khi dev; production dùng HTTPS cho cả FE và BE.

```bash
npm run build:web:prod
# Host apps/web/dist/browser trên server FE, cấu hình SPA fallback về index.html.
```

Static host cần trả `/runtime-config.js` với `Cache-Control: no-store`; không cache `index.html` lâu để nhận phiên bản mới.

### Docker trên hai server

Trên **server BE**, tạo `apps/api/.env` với secret và cấu hình:

```dotenv
PUBLIC_WEB_URL=https://shop.example.com
API_CORS_ORIGIN=https://shop.example.com
API_CORS_CREDENTIALS=true
REFRESH_COOKIE_SECURE=true
REFRESH_COOKIE_SAME_SITE=lax
```

`API_CORS_ORIGIN` là origin FE, không có path hay dấu `/` cuối; có thể phân tách nhiều origin bằng dấu phẩy. Với `shop.example.com` và `api.example.com` cùng HTTPS, giữ `lax`. Nếu dùng hai site khác nhau (ví dụ domain Vercel và domain API), đặt `REFRESH_COOKIE_SAME_SITE=none`; trình duyệt chặn third-party cookie vẫn có thể chặn refresh. Dùng hai subdomain cùng domain để phiên đăng nhập ổn định hơn. API đã kiểm tra origin cho refresh/logout.

```bash
cp deploy/.env.example deploy/.env
docker compose --env-file deploy/.env -f compose.api.yaml up -d --build
```

[`compose.api.yaml`](../compose.api.yaml) chỉ chạy migration và API. Reverse proxy trên server BE cấp HTTPS tại `https://api.example.com`, chuyển tiếp tới `127.0.0.1:3000`. Có thể đổi `API_BIND_ADDRESS`/`API_PORT` trong `deploy/.env`.

Trên **server FE**, copy `deploy/.env.example` thành `deploy/.env` và đặt:

```dotenv
PUBLIC_API_BASE_URL=https://api.example.com/api/v1
WEB_BIND_ADDRESS=127.0.0.1
WEB_PORT=8080
```

```bash
docker compose --env-file deploy/.env -f compose.web.yaml up -d --build
```

[`compose.web.yaml`](../compose.web.yaml) chỉ chạy FE, không cần file `.env` API hay container BE. Reverse proxy trên server FE cấp HTTPS tại `https://shop.example.com`, chuyển tiếp tới `127.0.0.1:8080`. Browser gọi thẳng BE qua URL public; FE không phụ thuộc kết nối Docker giữa hai server. Khi đổi URL, chạy lại `up -d` để Compose tạo lại container; không cần build lại image. Có thể dùng trực tiếp image với `docker run -e PUBLIC_API_BASE_URL=https://api.example.com/api/v1 -p 8080:8080 fashion-commerce-web:local`.

### Vercel

Vercel Project phải import **root repository** để npm workspace truy cập `packages/contracts`; không đặt Root Directory là `apps/web`. `vercel.json` đã cố định install/build/output/SPA fallback. Thiết lập:

- Dùng [`apps/web/.env.example`](../apps/web/.env.example) làm danh sách biến build; đặt `PUBLIC_API_BASE_URL=https://api.example.com/api/v1` trong Vercel Preview/Production tương ứng. Lệnh `build:web:vercel` yêu cầu biến này được đặt rõ ràng.
- API: `PUBLIC_WEB_URL` trỏ frontend; `API_CORS_ORIGIN` liệt kê đúng domain Vercel/custom; `API_CORS_CREDENTIALS=true` và cấu hình cookie như trên.
- Backend phải ở container/VM/PaaS có process dài hạn và webhook HTTPS; không đưa webhook secret GPM Pay hoặc secret R2/SendGrid vào Vercel frontend.

Khi Git repository được kết nối trong Vercel, push branch tạo Preview và production branch tạo Production deployment. GitHub Actions không giữ Vercel token.

## 6. Mẫu C — container PaaS/Kubernetes

- Deploy `Dockerfile.api`; map platform `PORT` hoặc giữ 3000; probe live/ready theo contract.
- Deploy `Dockerfile.web` nếu cần same-origin/proxy, hoặc host `dist/browser` trên CDN/static service.
- Inject secret qua secret manager; filesystem container được xem là tạm thời; không lưu upload/database trong container.
- Mỗi replica API dùng chung Mongo/R2 và worker locking/outbox; chạy migration như một release job duy nhất trước rollout.
- Terminate TLS ở ingress/load balancer và đặt `TRUST_PROXY=true`; giới hạn network để Mongo/API nội bộ không công khai ngoài nhu cầu.

## 7. CI và phát hành

[GitHub Actions](../.github/workflows/ci.yml) dùng lockfile để kiểm docs, build/test mã nguồn và build cả hai Dockerfile nhưng **không tự đẩy image hoặc deploy**. Đây là ranh giới chủ ý để repository không khóa vào GHCR/Docker Hub/cloud account chưa được chọn.

CI chạy `npm run check:env` để đối chiếu biến được đọc trong API/web build và biến nội suy Compose với ba file `.env.example`.

Khi chọn registry, release workflow chỉ cần login rồi build/push `Dockerfile.api` và `Dockerfile.web` với tag version/digest. Target server chỉ pull hai image và dùng cùng runtime contract; không build lại source trên production.

## 8. Checklist trước khi public

- [ ] `JWT_SECRET` mạnh, `.env` không lộ
- [ ] HTTPS và CORS đúng domain
- [ ] `PUBLIC_API_BASE_URL`, `PUBLIC_WEB_URL`, proxy và callback URL cùng môi trường; không trỏ production sang staging
- [ ] SendGrid sender đã verify (nếu dùng mail)
- [ ] R2 bucket/CORS (nếu dùng ảnh)
- [ ] Tài khoản ngân hàng GPM Pay đã xác minh; webhook HMAC nhận raw body và dùng đúng `GPMPAY_WEBHOOK_SECRET`
- [ ] Đã test `test=true`, chữ ký sai, timestamp quá 300 giây, duplicate event, sai mã/số tiền và `SIMULATED` ở production
- [ ] Đã đổi mật khẩu Mongo mặc định nếu port DB mở ra ngoài (nên chỉ listen `127.0.0.1`)
- [ ] Migration verify, backup mới và restore rehearsal đạt RPO/RTO; dashboard/alerts/runbook có owner
- [ ] UAT/testcase theo phase pass; privacy retention/cleanup worker được kiểm chứng

**Commerce UC15+:** mọi môi trường phải dùng Mongo replica set. Migration/index/verify theo [21-DATABASE-MIGRATIONS.md](21-DATABASE-MIGRATIONS.md); backup, deploy và rollback theo [24-OPERATIONS-RUNBOOK.md](24-OPERATIONS-RUNBOOK.md).
