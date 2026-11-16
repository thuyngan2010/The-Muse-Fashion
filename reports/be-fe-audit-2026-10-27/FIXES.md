# Kết quả sửa lỗi BE / FE — 27/10/2026

Đã áp dụng bản sửa cho **21/21 phát hiện A01–A21** của báo cáo audit. Các thay đổi có sẵn trong working tree; chưa triển khai lên server production.

## Các lỗi đã xử lý

| ID | Bản sửa |
| --- | --- |
| A01 | Mã voucher bất biến, tránh làm mất liên kết với đơn hàng cũ. FE khóa ô mã khi sửa. Đã kiểm chứng hủy đơn giải phóng cả tồn kho và lượt dùng voucher. |
| A02 | POST thêm quyền giữ nguyên quyền cũ; PATCH thay thế toàn bộ. FE đọc quyền hiện tại trước khi sửa. Transaction ghi phiên bản quyền trên tài khoản để tuần tự hóa các cập nhật đồng thời. |
| A03 | Thêm API chi tiết sản phẩm quản trị, trả đúng cả biến thể ngừng bán. FE sử dụng dữ liệu thật cho sản phẩm nháp và bỏ fallback tự tạo size/màu/giá/trạng thái. |
| A04 | Tách API từ chối đề xuất đang chờ duyệt khỏi API báo chuyển khoản thất bại. Trường hợp thất bại sau duyệt vẫn bắt buộc tải bằng chứng. Lưu lý do, audit và kiểm tra idempotency. |
| A05 | Giữ QR sau phê duyệt và cho Admin đọc lại QR/nội dung chuyển khoản ở danh sách, chi tiết. Nhân viên vẫn nhận thông tin tài khoản đã che. |
| A06 | Áp dụng limit thực tế cho danh sách đơn quản trị, sổ kho, đánh giá công khai và lịch sử job AI. |
| A07 | Thêm điều khiển phân trang và tổng số bản ghi cho các danh sách FE đã rà soát; hủy request cũ khi đổi trang và đưa về trang hợp lệ khi dữ liệu giảm. |
| A08 | Bộ chọn nhân viên dùng limit 50 hợp lệ, lọc STAFF đang hoạt động trên BE và có nút tải thêm. |
| A09 | Thêm API lấy đánh giá của chủ đơn để khôi phục ID/nội dung sau tải lại. Sửa/xóa tại chi tiết đơn; không mở thao tác sửa khi chưa tải được đánh giá. Cho tạo lại đánh giá đã xóa mềm. |
| A10 | Lỗi mạng hoặc lỗi server tạm thời khi tải hồ sơ không xóa phiên cục bộ. Có thể khôi phục access token bằng refresh cookie khi khởi động FE. |
| A11 | Các API auth cần đăng nhập cũng được refresh rồi thử lại khi access token hết hạn. Refresh lỗi tạm thời không xóa phiên. |
| A12 | Hủy request sản phẩm cũ khi chuyển slug, đồng thời hủy subscription khi rời trang. |
| A13 | Chặn thao tác giỏ hàng chồng lấn và vô hiệu hóa nút trong lúc ghi. Checkout thành công chỉ reset trạng thái cục bộ vì BE đã xóa giỏ trong transaction. |
| A14 | Hai màn AI dùng polling có backoff cho lỗi mạng/429/5xx, không tạo request chồng lấn; dừng và hiển thị trạng thái khi hoàn tất, thất bại hoặc hết hạn. |
| A15 | Cleanup tôn trọng hạn lưu media được gia hạn và job còn hoạt động. Claim media trước khi xóa để job mới không gắn vào ảnh đang bị dọn; hỗ trợ cả record legacy thiếu expiresAt. Đã kiểm chứng bằng MongoDB thật, storage được stub. |
| A16 | Giải mã/re-encode JPEG/PNG/WebP bằng Sharp, bỏ metadata, từ chối container không có pixel, sai MIME và ảnh vượt 16 triệu pixel. Kiểm tra lại kích thước sau re-encode. |
| A17 | Mật khẩu mới dùng scrypt có version, kiểm tra đủ chuỗi UTF-8 thay vì cắt tại 72 byte. Giữ hỗ trợ bcrypt và nâng hash sau đăng nhập thành công. |
| A18 | Thêm API danh mục quản trị chứa cả danh mục đã ẩn; FE dùng API này để tiếp tục quản lý/khôi phục danh mục. |
| A19 | Nginx cho phép body 11 MiB để chứa file 10 MiB và multipart overhead. Đã kiểm chứng 10 MiB đi đến proxy, 12 MiB bị chặn 413. |
| A20 | Hàng kiểm duyệt gộp review/post/comment, có filter trạng thái/loại, tổng số và phân trang. FE có thể tìm nội dung công khai để ẩn và nội dung ẩn để khôi phục. |
| A21 | Bổ sung route chi tiết Lookbook và các route mới vào OpenAPI. CI kiểm tra đủ 111 controller route, chạy regression audit và chặn cảnh báo dependency mức high trở lên. |

## Dependency

Đã cập nhật Vitest 5.0.5, khóa Multer từ 2.5.0 và Vite từ 8.3.5 bằng override, bổ sung Sharp 0.35.5. Tạo lại lockfile để các override thực sự có hiệu lực; `npm ci` sạch đã thành công.

`npm audit`: **0 lỗ hổng**, cả toàn bộ dependency và production. Bằng chứng: [toàn bộ](npm-audit-fixed.json), [production](npm-audit-production-fixed.json).

## Kiểm chứng

| Kiểm tra | Kết quả |
| --- | --- |
| Build BE và FE production | Đạt |
| Unit test BE | [156 đạt](unit-api-fixed-results.json) |
| Test FE | [38 đạt](unit-web-fixed-results.json) |
| Regression BE/FE sau audit | [22 đạt](audit-fixed-results.json) |
| Integration/E2E trên MongoDB replica set riêng | [62 đạt, 2 R2 live bỏ qua](integration-fixed-results.json) |
| Chạy lại 8 regression HTTP/MongoDB, gồm cleanup ảnh legacy | [8 đạt](audit-http-fixed-results.json), thuộc nhóm integration ở trên |
| Cấu hình build/runtime FE | 5 Node test và shell test trên Linux đạt |
| OpenAPI, tài liệu, env mẫu, script targets | Đạt; 111 route khớp controller |
| Docker API | [Build đạt](docker-api-fixed-retry.log); [migration mới + chạy lại, production readiness 200, CORS và giải mã ảnh Linux đạt](container-api-fixed-results.json) |
| Docker FE/nginx | [Build đạt](docker-web-fixed-retry.log); [API URL riêng, no-store, SPA fallback, giới hạn upload đạt](container-web-fixed-results.json) |

Lượt Docker build đầu gặp `EIDLETIMEOUT` từ npm registry. Đã bổ sung ba tarball công khai từ cache máy chủ với SHA-512 khớp lockfile rồi build lại thành công; không bỏ kiểm tra integrity hay thay dependency bằng bản khác.

Smoke test nginx dùng upstream cố ý không có API: status 502 của payload 10 MiB xác nhận request đã qua nginx; payload 12 MiB nhận 413. Đây không phải kiểm thử ghi file lên R2 thật.

Các test dùng database/container riêng và provider giả; không gửi email, gọi AI trả phí hoặc chuyển khoản thật. Hai test R2 live chưa chạy do không bật/cấu hình môi trường R2 test. Chưa chạy browser E2E đầy đủ.

## Khi triển khai

- Cập nhật BE trước FE vì FE dùng các endpoint quản trị, đánh giá và từ chối hoàn tiền mới.
- Dùng lockfile mới và Node theo `package.json`; giữ cấu hình API URL/CORS/refresh cookie đã hướng dẫn cho hai server riêng.
- Không cần buộc người dùng đổi mật khẩu hàng loạt: hash bcrypt hiện có được nâng dần sau đăng nhập thành công.
- Muốn đổi mã khuyến mãi, tạo voucher mới; mã của voucher hiện có được giữ bất biến.

Báo cáo [README](README.md) và các file `*-repro*` giữ lại hiện trạng lỗi ban đầu. Kiểm thử cho hành vi sau sửa nằm trong `tests/audit-regressions.spec.ts` và `apps/api/test/integration/audit-fixes.int-spec.ts`.
