# Tích hợp SePay cho chuyển khoản ngân hàng

SePay là lựa chọn provider thứ hai cho UC26–29. Hệ thống tạo `PaymentAttempt`, mã đối soát và VietQR; SePay gửi webhook khi tài khoản merchant có biến động. Không cần API tạo payment session tại SePay.

## Cấu hình

1. Kết nối tài khoản nhận tiền trên SePay. Cấu hình `SEPAY_BANK_BIN`, `SEPAY_ACCOUNT_NUMBER`, `SEPAY_ACCOUNT_NAME` đúng tài khoản này.
2. Đặt `PAYMENT_PROVIDER=SEPAY` trong môi trường API. Mỗi deployment chỉ xử lý một provider; webhook GPM Pay sẽ trả 404 khi SePay đang được chọn. Nếu không đặt biến, hệ thống dùng GPM Pay để tương thích cấu hình cũ.
3. Tạo webhook JSON đến `POST /api/v1/webhooks/payment/sepay`, chọn **Cả hai** để nhận tiền vào và tiền ra, xác thực **API Key**. Đặt khóa của webhook vào `SEPAY_WEBHOOK_API_KEY`. Header SePay gửi là `Authorization: Apikey <key>`. Bật retry khi endpoint trả lỗi.
4. Mã đối soát `FC...` nằm trong `content` của chuyển khoản. Nếu dùng bộ lọc mã thanh toán của SePay, cấu hình nhận diện tiền tố `FC`; backend vẫn đọc mã từ `content`, không tin riêng trường `code`.
5. Giữ khóa ở backend và dùng HTTPS cho endpoint công khai.

## Tạo thanh toán

Gửi `POST /api/v1/payments/attempts` với `Idempotency-Key` và body `{"orderId":"..."}`. Client không truyền provider; API dùng `PAYMENT_PROVIDER` đang chạy. Một đơn chỉ có một attempt đang chờ. Response chứa `provider`, số tiền, mã đối soát và `qrImageUrl` từ `https://vietqr.app/img` với `acc`, `bank` (BIN), `amount`, `des` và `template=compact`. Attempt chỉ thành công sau webhook đối soát, không phải khi ảnh QR được tải.

Trước khi chuyển provider trên một deployment, hoàn tất hoặc để hết hạn các attempt đang chờ, ngừng webhook của provider cũ và đối soát giao dịch đến muộn bằng sao kê. Attempt lịch sử vẫn xem được, nhưng API không cấp lại QR hoặc xử lý webhook cho provider đã tắt.

## Webhook và đối soát

- Kiểm tra API Key trước khi đọc payload. Payload cần `id` nguyên dương, `transferType` là `in` hoặc `out`, số tiền VND nguyên dương, thời gian, tài khoản và nội dung. `transactionDate` dạng `YYYY-MM-DD HH:mm:ss` được hiểu theo UTC+7.
- Lưu `provider=SEPAY`, `eventId=String(id)`, `authenticationMethod=API_KEY` và `signatureVerified=false` (SePay không dùng chữ ký HMAC trong cấu hình này); unique index `(provider,eventId)` giúp ACK retry mà không ghi nhận hai lần. Phản hồi thành công luôn là HTTP 200 với body `{"success":true}`; lỗi DB trả 5xx để SePay retry.
- Tiền vào chỉ tự khớp khi tài khoản nhận đúng cấu hình, nội dung có đúng một mã của attempt SePay đang `PENDING`, số tiền bằng toàn bộ số phải thu, attempt và order còn hạn. Xác nhận order, attempt, payment event và outbox trong cùng MongoDB transaction. Sai/mất/trùng mã hoặc quá hạn vào hàng chờ review.
- Payload SePay được tài liệu hóa không có số tài khoản/BIN của người nhận tiền ra. Vì vậy webhook `out` luôn lưu `REQUIRES_REVIEW`, không tự đánh dấu refund thành công. Admin phải kiểm tra sao kê và chứng từ qua luồng hoàn tiền thủ công.
- Nếu hệ thống kiểm thử nội bộ gửi `test: true`, backend ACK mà không tạo payment event. SePay Test Mode gửi payload giao dịch bình thường; phải dùng webhook, khóa và tài khoản thử riêng, không trỏ Test Mode vào endpoint production.

## Nguồn

Đối với hàng đợi review, dùng [quy trình đối soát hai người](26-AUDIT-REMEDIATION.md): bắt buộc chứng từ private của từng Admin, kiểm độc lập, không tự chuyển tiền hoặc hồi sinh đơn. Cờ `hasOpenReview` trả cho FE bao gồm các attempt cũ của cùng đơn. Ghi nhận khoản chi đã đối soát không tự hoàn tất một Refund; Refund tiếp tục dùng quy trình riêng.

- [Hướng dẫn tích hợp webhook SePay](https://docs.sepay.vn/tich-hop-webhooks.html)
- [Tạo QR động qua VietQR](https://docs.sepay.vn/tao-qr-code-vietqr-dong.html)
- [SePay Test Mode](https://docs.sepay.vn/test-mode.html)
