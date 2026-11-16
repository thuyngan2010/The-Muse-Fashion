# Chính sách bảo mật dự án

Không gửi API keys và dữ liệu nhạy cảm trong issue/PR. Rotate ngay khi lộ. Backend xác thực trên từng request, kiểm tra ownership của mỗi tài nguyên, giới hạn file upload và rate-limit tại reverse proxy. Xem `docs/09-SECURITY.md`.
