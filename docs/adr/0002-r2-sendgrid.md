# ADR-0002 — Cloudflare R2 và Twilio SendGrid

**Trạng thái:** Accepted · **Ngày:** 23/10/2026

## Bối cảnh

Ứng dụng cần lưu ảnh sản phẩm, Lookbook, ảnh cộng đồng và ảnh AI nhạy cảm; đồng thời gửi email xác minh và cập nhật đơn hàng.

## Quyết định

Cloudflare R2 S3-compatible SDK dùng cho lưu trữ ảnh. Backend phát presigned upload/download URL sau kiểm quyền; ảnh nhạy cảm private với retention. Twilio SendGrid (`@sendgrid/mail`) dùng cho email, sender/domain authenticated và credentials server-only. Luồng email bền vững phải có event log, queue và dedup.

## Hệ quả

Cần R2 credentials, bucket CORS/lifecycle và SendGrid API key + SPF/DKIM. Phải có cleanup, retry/dedup và giám sát, không coi request SendGrid được chấp nhận là email đã đến inbox.
