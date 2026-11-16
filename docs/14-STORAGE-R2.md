# Cloudflare R2 — Image Storage Design

## 1. Loại hình ảnh

| Purpose | ACL | TTL/Lifecycle | UC |
|---|---|---|---|
| `product` | public sau xuất bản; draft private | giữ cho tới archive/cleanup | UC08/09 |
| `lookbook` | public sau xuất bản | theo trạng thái Lookbook | UC10/11 |
| `avatar` | private | bản bị thay/xóa giữ 7 ngày rồi cleanup | UC04 |
| `community` | public khi bài approved | soft-delete 30 ngày rồi cleanup | UC22/23 |
| `tryon` | **private** | input 24 giờ, output 7 ngày sau terminal | UC12/13 |

## 2. Upload workflow

1. FE xác thực và yêu cầu `POST /storage/presign` với `contentType`, `sizeBytes`, `purpose`.
2. BE kiểm owner/permission/purpose/quota, cấp key dạng `{purpose}/{userId}/{uuid}.{ext}`, presigned PUT 300s ký `Content-Type`, `Content-Length` đúng `sizeBytes` và `If-None-Match: *`.
3. FE PUT đúng số byte đã khai báo và gửi `Content-Type`, `If-None-Match: *`. Trình duyệt tự đặt `Content-Length` theo `File/Blob`; không tự gán header này bằng JavaScript.
   Nếu PUT lỗi mạng hoặc bị từ chối, FE thử một lần qua endpoint cùng origin `POST /storage/upload` (multipart `objectKey`, `file`, Bearer token). Backend kiểm owner, trạng thái, hạn upload, MIME và kích thước trước khi ghi private object. Không có proxy tới URL tùy ý. Cả hai đường đều phải qua finalize; retry không ghi đè object đã tồn tại.
4. FE gọi **finalize**: BE HEAD object xác nhận tồn tại, size, MIME, kiểm tra cấu trúc ảnh, loại bỏ metadata và chuyển media sang `READY`. Trạng thái `FINALIZING` có lease để tránh cleanup và finalize ghi đè nhau.
5. GET public ảnh đã publish qua custom domain; GET private phải kiểm quyền trước khi cấp presigned GET thời hạn ngắn.
6. Worker xóa upload còn `PENDING`/`REJECTED` sau 24 giờ, khi presigned URL đã hết hạn; avatar cũ sau 7 ngày; product/lookbook/community soft-delete sau 30 ngày; AI theo DEC-05.

Media `community` đã finalize nhưng chưa gắn với nội dung vẫn có hạn orphan 24 giờ. Post/Review gắn/gỡ ảnh trong transaction: ảnh còn được nội dung chưa xóa mềm tham chiếu (kể cả hidden/pending) được giữ; khi gỡ tham chiếu cuối cùng, đặt hạn 30 ngày. Dùng lại trước hạn hủy lịch dọn. Cleanup đánh dấu ảnh trước khi xóa để chặn gắn mới trong lúc R2 đang xử lý, kiểm tra lại tham chiếu và retry nếu thất bại. Worker đối soát theo batch cả media community legacy thiếu expiry; không thay thời hạn riêng của ảnh AI.

Upload `product` và `lookbook` được finalize trong bucket private. Sau khi entity được publish, BE copy ảnh sang bucket public rồi cập nhật visibility; khi không còn entity đã publish tham chiếu, BE chuyển ảnh về private. Worker đối soát lặp lại thao tác chuyển bucket nếu R2 tạm lỗi. Trong lúc chuyển bucket, endpoint public của entity đã publish có thể cấp presigned GET ngắn hạn từ bucket private.

Sanitizer hiện xác thực cấu trúc và bỏ metadata; yêu cầu decode/re-encode ảnh và quét nội dung chuyên dụng vẫn cần triển khai riêng.

## 3. Endpoint và SDK

S3-compatible endpoint: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`. Dùng AWS SDK v3 `S3Client`, `PutObjectCommand`, `getSignedUrl`, header `Content-Type` khớp pre-sign. Credentials không xuất xuống frontend. Code scaffold: `apps/api/src/modules/storage/`.

## 4. Bucket/CORS

- Cấu hình R2 bucket CORS cho origin Angular, methods PUT/GET và headers `Content-Type`, `If-None-Match`, không mở `*` cho private.
- Custom domain chỉ cho media public đã publish; không dùng URL công khai cho ảnh AI/cá nhân.
- Điều chỉnh `R2_UPLOAD_MAX_BYTES` (tối đa 10 MiB) và chặn loại file khác jpeg/png/webp; finalize kiểm cấu trúc, kích thước và loại metadata.
- `sizeBytes` trong body presign chỉ trở thành ràng buộc sau khi backend ký `Content-Length` tương ứng vào PUT URL; finalize vẫn HEAD và kiểm kích thước thực trước khi dùng.

### Upload từ localhost bị chặn trước khi tạo AI job

Nếu request `OPTIONS` trả 403 với thông báo `CORS not configured for this bucket`, cần cấu hình CORS trên chính bucket được đặt trong `R2_PRIVATE_BUCKET`. Cấu hình CORS của NestJS không thay thế cấu hình bucket vì trình duyệt PUT ảnh trực tiếp lên R2.

Trong Cloudflare Dashboard → R2 → bucket tương ứng → Settings → CORS Policy, thêm policy trong [config/r2-cors.local.json](../config/r2-cors.local.json). File này dành cho origin `http://localhost:4200`; thêm từng origin cụ thể nếu dùng địa chỉ khác. Nếu bucket đã có policy, gộp rule mới với các rule đang dùng. Giữ bucket private, không cần bật Public Access.

Sau khi lưu, đợi policy cập nhật (có thể tới 30 giây), chọn lại ảnh để lấy presigned URL mới và upload lại. Kỳ vọng: preflight cho `PUT` với headers `content-type,if-none-match` trả header `Access-Control-Allow-Origin: http://localhost:4200`, sau đó PUT thành công và frontend gọi `/storage/finalize`.

Nếu `GetBucketCors` trả `AccessDenied`, khóa S3 hiện tại không đọc được policy. Dùng dashboard với tài khoản có quyền quản lý bucket; không đưa khóa quản trị xuống frontend. [Tài liệu CORS chính thức của Cloudflare](https://developers.cloudflare.com/r2/buckets/cors/).

## 5. Xóa và bảo vệ dữ liệu

DB chỉ lưu object key và trạng thái, không lưu URL ký lâu dài. Xóa object trên R2 theo lifecycle/cleanup job, có log. Cấp quyền private theo owner và purpose; không chỉ tin client gửi objectKey.

**Tài liệu chính thức:** https://developers.cloudflare.com/r2/get-started/s3/

Phân loại dữ liệu, consent, export/xóa tài khoản và retention metadata theo [Data Privacy](23-DATA-PRIVACY.md).
