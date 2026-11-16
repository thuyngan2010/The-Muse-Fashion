# ĐẶC TẢ YÊU CẦU HỆ THỐNG (SRS)

**SRS-FASHION-001** · **Phiên bản:** 1.0 · **Ngày:** 23/10/2026 · **Trạng thái:** Baseline yêu cầu

## 1. Giới thiệu

### 1.1 Mục đích

Định nghĩa yêu cầu hệ thống website thương mại điện tử thời trang nhằm thống nhất sản phẩm giữa Product Owner, Business Analyst, kỹ sư frontend, backend, QA và DevOps. Tài liệu này là nguồn chuẩn cho phạm vi, quy tắc nghiệp vụ và nghiệm thu; luồng thực thi từng tính năng được mô tả trong [37 Use Case](use-cases/README.md).

### 1.2 Phạm vi sản phẩm

Hệ thống cung cấp cửa hàng sản phẩm thời trang có biến thể size/màu, Lookbook, tư vấn size, AI Virtual Try-on/Mix & Match, giỏ và đơn hàng, thanh toán chuyển khoản VietQR được đối soát qua GPM Pay hoặc SePay, cộng đồng thời trang, quản trị vận hành, email giao dịch và thông báo in-app. Khách chưa đăng nhập có thể duyệt nội dung công khai; tài khoản đăng nhập có 3 vai trò Customer, Admin, Staff.

### 1.3 Công nghệ bắt buộc

| Lớp | Công nghệ / ranh giới |
|---|---|
| Frontend | **Angular 22** standalone, TypeScript, responsive, giao tiếp JSON/HTTPS |
| Backend | **NestJS 12 / TypeScript 6**, REST API, Swagger/OpenAPI, validation và RBAC server-side |
| Database | **MongoDB 8 / Mongoose**, index unique, atomic update, transaction ở nghiệp vụ nhiều bản ghi |
| Hình ảnh | **Cloudflare R2**, S3-compatible SDK, signed URL ngắn hạn, private bucket cho ảnh nhạy cảm |
| Email | **Twilio SendGrid** (`@sendgrid/mail`), domain/sender authenticated; xử lý trạng thái gửi, không lộ API key |
| AI | Dịch vụ AI bên ngoài; job bất đồng bộ, hạn mức, consent và xóa ảnh theo chính sách |
| Thanh toán | **GPM Pay hoặc SePay** nhận biến động số dư; hệ thống tự dựng VietQR, tự đối soát mã/số tiền qua webhook HMAC của GPM Pay hoặc API Key của SePay; không lưu dữ liệu thẻ |
| Runtime & Dev | Node 24.15+, npm workspaces, Docker Compose cho MongoDB |

### 1.4 Các thuật ngữ

- **Guest:** khách chưa đăng nhập, không phải role lưu trong tài khoản.
- **Customer/Staff/Admin:** ba vai trò đăng nhập cố định. Permission giới hạn thao tác Staff.
- **SKU:** mã duy nhất của biến thể size/màu được theo dõi tồn kho.
- **Order snapshot:** tên, giá, SKU, phí, giảm giá, địa chỉ tại lúc đặt; không thay đổi khi catalog thay đổi.
- **Payment attempt:** lần yêu cầu thanh toán, phân biệt với trạng thái đơn.
- **R2 object key:** định danh nội bộ đối tượng ảnh, không đồng nghĩa URL công khai.
- **Email event:** sự kiện cần gửi email, có khóa chống gửi trùng và trạng thái xử lý.

## 2. Tác nhân và phân quyền

| Actor | Quyền cơ bản |
|---|---|
| Guest | Duyệt/tìm kiếm sản phẩm, Lookbook, cộng đồng công khai; đăng ký, khôi phục mật khẩu |
| Customer | Quản lý tài khoản của mình, giỏ/đơn/thanh toán, AI, review, bài viết, thông báo |
| Admin | Quản lý người dùng, Staff permissions, danh mục, giá, đơn, kho, khuyến mãi, báo cáo, cấu hình, kiểm duyệt |
| Staff | Vận hành đơn, vận chuyển, kho, Lookbook, sản phẩm, kiểm duyệt theo quyền và phân công |
| GPM Pay | Gửi webhook biến động số dư của tài khoản nhận tiền; không giữ trạng thái Order và không tạo checkout session |
| SePay | Gửi webhook biến động số dư của tài khoản nhận tiền; xác thực API Key và phản hồi `{"success":true}` |
| Dịch vụ AI | Xử lý job ảnh do backend yêu cầu và trả kết quả |
| SendGrid | Nhận yêu cầu phát email từ backend; quản lý trạng thái phát của provider |

**Chính sách truy cập:** Backend kiểm tra quyền và ownership trên mọi tài nguyên; không dựa vào trạng thái nút UI. Không có tài khoản Admin tự đăng ký; phải duy trì ít nhất một Admin đang hoạt động. Staff không cấp quyền cho người khác.

## 3. Nhóm chức năng

| Module | Phạm vi | UC |
|---|---|---|
| FC-01 | Tài khoản và xác thực | UC01–UC06 |
| FC-02 | Sản phẩm, Lookbook và AI | UC07–UC13 |
| FC-03 | Giỏ hàng, đơn hàng, kho và voucher | UC14–UC21 |
| FC-04 | Cộng đồng thời trang | UC22–UC25 |
| FC-05 | Thanh toán và hoàn tiền | UC26–UC29 |
| FC-06 | Quản trị hệ thống | UC30–UC32 |
| FC-07 | Email qua SendGrid | UC33–UC34 |
| FC-08 | Thông báo trong ứng dụng | UC35–UC37 |

## 4. Yêu cầu chức năng

Các yêu cầu FR có mã duy nhất, đều cần kiểm thử và liên kết một UC. **Triển khai code hiện tại được theo dõi riêng tại `12-IMPLEMENTATION-STATUS.md`.**

<a id="yeu-cau-chuc-nang"></a>

| ID | Use Case | Yêu cầu | Điều kiện chấp nhận |
|---|---|---|---|
| FR-01 | [UC01](use-cases/UC01.md) | Hệ thống cho Guest đăng ký Customer bằng email duy nhất, mật khẩu đạt chính sách; chỉ kích hoạt khi xác minh email hợp lệ. | Email trùng/không hợp lệ bị từ chối; link hết hạn không kích hoạt tài khoản. |
| FR-02 | [UC02](use-cases/UC02.md) | Hệ thống xác thực email/mật khẩu cho 3 role đăng nhập, kiểm tra tài khoản hoạt động và cấp phiên theo quyền. | Sai thông tin hoặc tài khoản khóa không tạo phiên; API kiểm tra quyền ở server. |
| FR-03 | [UC03](use-cases/UC03.md) | Người dùng có thể đăng xuất phiên hiện tại; refresh token/phiên bị thu hồi theo cơ chế xác thực đã chọn. | Phiên bị thu hồi không cấp token truy cập mới. |
| FR-04 | [UC04](use-cases/UC04.md) | Người dùng được sửa hồ sơ của chính mình; Customer thêm/sửa/xóa địa chỉ và chọn một địa chỉ mặc định. | Không sửa hồ sơ người khác; đơn cũ giữ nguyên địa chỉ chụp khi checkout. |
| FR-05 | [UC05](use-cases/UC05.md) | Guest yêu cầu liên kết khôi phục mật khẩu một lần; hệ thống cập nhật mật khẩu sau khi token và mật khẩu mới hợp lệ. | Phản hồi không tiết lộ email tồn tại; token đã dùng/hết hạn không đổi được mật khẩu. |
| FR-06 | [UC06](use-cases/UC06.md) | Người dùng đăng nhập thay mật khẩu sau khi xác thực mật khẩu hiện tại và kiểm tra chính sách mật khẩu mới. | Không chấp nhận mật khẩu cũ sai hoặc mật khẩu mới không đạt chính sách. |
| FR-07 | [UC07](use-cases/UC07.md) | Guest/Customer được duyệt, tìm, lọc và sắp xếp sản phẩm công khai theo các tiêu chí được hỗ trợ, có phân trang. | Sản phẩm ẩn không xuất hiện; kết quả không có dữ liệu hiển thị trạng thái rỗng. |
| FR-08 | [UC08](use-cases/UC08.md) | Guest/Customer xem thông tin, giá/tồn theo biến thể, ảnh, đánh giá và Size Guide/gợi ý size tham khảo. | Biến thể hết hàng không được thêm giỏ; giá hiển thị theo biến thể hiện hành. |
| FR-09 | [UC09](use-cases/UC09.md) | Admin hoặc Staff có quyền quản lý danh mục, nội dung sản phẩm và các biến thể SKU/size/màu/giá. | SKU trùng, giá âm và thao tác ngoài quyền bị từ chối; không xóa mất tham chiếu đơn cũ. |
| FR-10 | [UC10](use-cases/UC10.md) | Guest/Customer khám phá Lookbook công khai và mở liên kết từ thẻ sản phẩm đến chi tiết hàng đang có. | Lookbook ẩn không công khai; liên kết sản phẩm không còn hiệu lực được xử lý an toàn. |
| FR-11 | [UC11](use-cases/UC11.md) | Admin/Staff có quyền tạo, sửa, lưu nháp, xuất bản và ẩn Lookbook kèm ảnh và sản phẩm liên kết. | Không công khai Lookbook thiếu ảnh chính hoặc thẻ sản phẩm không hợp lệ. |
| FR-12 | [UC12](use-cases/UC12.md) | Customer đồng ý xử lý ảnh, chọn sản phẩm và tạo tác vụ AI Virtual Try-on; hệ thống theo dõi, trả ảnh hoặc lỗi. | Kiểm tra quota/ảnh; chỉ chủ tác vụ xem được kết quả; mỗi ảnh tạm có `expiresAt` và cleanup theo DEC-05. |
| FR-13 | [UC13](use-cases/UC13.md) | Customer chọn tổ hợp sản phẩm hợp lệ và đầu vào ảnh để yêu cầu AI Mix & Match tạo ảnh outfit. | Tổ hợp không hợp lệ/hết quota bị từ chối; kết quả chỉ chủ sở hữu truy cập. |
| FR-14 | [UC14](use-cases/UC14.md) | Customer thêm, điều chỉnh số lượng và xóa biến thể khỏi giỏ; hệ thống tính tạm tính theo giá hiện hành. | Số lượng không hợp lệ/hết tồn bị từ chối; thêm giỏ không giữ chỗ tồn kho. |
| FR-15 | [UC15](use-cases/UC15.md) | Customer đặt hàng từ giỏ, chọn địa chỉ, áp voucher và dùng thanh toán chuyển khoản VietQR; backend chốt giá, phí và tồn kho nhất quán. | Thiếu tồn/voucher sai bị từ chối; gửi lại yêu cầu không tạo đơn trùng. |
| FR-16 | [UC16](use-cases/UC16.md) | Customer xem danh sách, chi tiết, trạng thái và lịch sử giao vận của các đơn do mình sở hữu. | Không thể truy cập đơn người khác; hiển thị snapshot mặt hàng/địa chỉ lúc đặt. |
| FR-17 | [UC17](use-cases/UC17.md) | Customer hoặc nhân sự có quyền hủy đơn khi còn đủ điều kiện; hệ thống ghi lý do, giải phóng kho đúng một lần. | Không hủy đơn ngoài trạng thái; đơn đã thu tiền cần luồng hoàn riêng. |
| FR-18 | [UC18](use-cases/UC18.md) | Admin/Staff có quyền xử lý và chuyển trạng thái đơn theo quy trình vận hành, kèm nhật ký thao tác. | Không chuyển trái sơ đồ trạng thái hoặc trái điều kiện thanh toán. |
| FR-19 | [UC19](use-cases/UC19.md) | Admin/Staff có quyền cập nhật đơn vị vận chuyển, mã vận đơn và trạng thái giao hàng bằng thao tác vận hành. | Không cho giao đơn đã hủy; không ghi đè địa chỉ giao nhận chụp lúc đặt. |
| FR-20 | [UC20](use-cases/UC20.md) | Admin/Staff có quyền nhập và điều chỉnh tồn theo SKU, ghi lý do và lịch sử thay đổi. | Không cho tồn khả dụng âm; checkout và điều chỉnh đồng thời không gây mất cập nhật. |
| FR-21 | [UC21](use-cases/UC21.md) | Admin tạo/sửa/vô hiệu voucher có mã duy nhất, thời gian, số lượt và điều kiện áp dụng để checkout kiểm tra. | Voucher không hợp lệ/hết lượt bị từ chối; giảm giá không khiến tổng phải trả âm. |
| FR-22 | [UC22](use-cases/UC22.md) | Customer đủ điều kiện mua được đánh giá sao 1–5, bình luận và ảnh sản phẩm, có kiểm soát trùng đánh giá. | Không đánh giá với giao dịch mua không hợp lệ hoặc trùng khóa uniqueness theo DEC-07. |
| FR-23 | [UC23](use-cases/UC23.md) | Customer đăng bài ảnh outfit, sửa và ẩn/xóa mềm bài của mình; công khai theo trạng thái kiểm duyệt. | Không sửa bài người khác; bài bị ẩn không xuất hiện trong bảng tin. |
| FR-24 | [UC24](use-cases/UC24.md) | Guest/Customer đọc và tìm bài công khai; Customer được bình luận và quản lý bình luận của chính mình. | Guest không đăng bình luận; bài ẩn/khóa không nhận bình luận mới. |
| FR-25 | [UC25](use-cases/UC25.md) | Admin/Staff có quyền kiểm duyệt được giữ, ẩn hoặc khôi phục nội dung và lưu dấu vết xử lý. | Nội dung ẩn không hiển thị công khai; thao tác thiếu quyền bị từ chối. |
| FR-26 | [UC26](use-cases/UC26.md) | Customer tạo payment attempt chuyển khoản, nhận VietQR có số tiền VND và mã đối soát duy nhất rồi theo dõi trạng thái chờ xác nhận. | Client không quyết định số tiền/mã; sinh QR không đồng nghĩa đã thanh toán; không tạo attempt cho đơn đã thanh toán/hủy/hết hạn. |
| FR-27 | [UC27](use-cases/UC27.md) | Backend xác thực webhook HMAC GPM Pay hoặc API Key SePay, lọc tiền vào, trích mã đối soát, so khớp provider/tài khoản/số tiền và cập nhật Payment/Order idempotent theo `(provider,eventId)`. | Webhook test/giả/trùng/sai tiền/sai mã, tiền ra hoặc `SIMULATED` GPM Pay ở production không ghi nhận thanh toán. |
| FR-28 | [UC28](use-cases/UC28.md) | Customer xem giao dịch thuộc đơn của mình; Admin/Staff được tra cứu theo quyền, không hiển thị dữ liệu nhạy cảm. | Không thể truy cập giao dịch ngoài phạm vi; lịch sử không sửa từ UI. |
| FR-29 | [UC29](use-cases/UC29.md) | Staff có `refund.propose` hoặc Admin tạo đề nghị; một Admin khác proposer kiểm tra tài khoản nhận và phê duyệt. Backend tạo VietQR/mã hoàn tiền để chuyển khoản thủ công; webhook tiền ra khớp đủ điều kiện tự xác nhận, ngoại lệ được review bằng sao kê/bằng chứng. | Không hoàn vượt tiền đã thu; hủy đơn/quét QR/webhook tiền ra chưa khớp không đồng nghĩa hoàn tiền thành công. |
| FR-30 | [UC30](use-cases/UC30.md) | Admin xem/khóa/mở tài khoản, tạo Staff, cấp/thu hồi quyền vận hành và lưu audit log. | Không nâng quyền qua đăng ký; không vô hiệu Admin hoạt động cuối cùng. |
| FR-31 | [UC31](use-cases/UC31.md) | Admin xem dashboard theo thời gian gồm đơn, doanh thu thanh toán hợp lệ và sản phẩm bán chạy. | Đơn chưa thanh toán/hủy không tính doanh thu thực nhận; trạng thái rỗng là 0. |
| FR-32 | [UC32](use-cases/UC32.md) | Admin chỉnh ngưỡng tồn, phí giao hàng mẫu và quota AI được dùng cho nghiệp vụ phát sinh mới. | Cấu hình không hợp lệ bị từ chối; đơn đã chốt không bị tính lại. |
| FR-33 | [UC33](use-cases/UC33.md) | Hệ thống gửi email xác minh/khôi phục một lần qua dịch vụ email và ghi nhận kết quả gửi. | Không gửi mật khẩu rõ; lỗi email không tự kích hoạt tài khoản. |
| FR-34 | [UC34](use-cases/UC34.md) | Hệ thống gửi email theo sự kiện đặt đơn, thanh toán hoặc trạng thái vận hành được cấu hình. | Không gửi dữ liệu thanh toán nhạy cảm; lỗi gửi không rollback đơn/giao dịch. |
| FR-35 | [UC35](use-cases/UC35.md) | Hệ thống tạo thông báo in-app cho chủ đơn khi trạng thái đơn hoặc thanh toán thay đổi hợp lệ. | Thông báo chỉ thuộc chủ đơn; thông báo lỗi không làm rollback nghiệp vụ. |
| FR-36 | [UC36](use-cases/UC36.md) | Hệ thống tạo thông báo tương tác cộng đồng; thông báo BST khi chức năng phát hành được bật và đối tượng hợp lệ. | Không thông báo nội dung ẩn hoặc sang tài khoản không liên quan. |
| FR-37 | [UC37](use-cases/UC37.md) | Người dùng đăng nhập xem thông báo của mình và đánh dấu đã đọc, mở liên kết đến nội dung còn đủ quyền. | Không xem/sửa thông báo của người khác; liên kết đích luôn kiểm tra quyền lại. |

## 5. Luồng nghiệp vụ xuyên module

1. **Đăng ký:** Guest → UC01 → tạo token → UC33 SendGrid → xác minh → UC02.
2. **Mua hàng:** UC07/08 → UC14 → UC15 tính giá/giữ tồn → UC26/27 → UC18/19 → UC16, UC34, UC35.
3. **AI Try-on/Mix & Match:** UC12/13 → xác nhận đồng ý, giới hạn lượt, lưu R2 private → provider async → trả ảnh, dọn ảnh hết hạn.
4. **Hủy/hoàn:** UC17 → giải phóng tồn một lần → UC29 nếu có tiền đã nhận → UC34/35.
5. **Cộng đồng:** UC23/24/22 → UC25 nếu cần kiểm duyệt → UC36 thông báo tương tác.

## 6. Quy tắc nghiệp vụ chung

| ID | Tên | Quy tắc |
|---|---|---|
| BR-01 | Role và phân quyền | Role đăng nhập chỉ gồm CUSTOMER/ADMIN/STAFF; Guest và tác vụ hệ thống không phải role. Backend kiểm tra quyền từng API. |
| BR-02 | Sở hữu dữ liệu | Customer chỉ truy cập hồ sơ, giỏ, đơn, giao dịch, ảnh AI, bài viết và thông báo thuộc mình; Staff theo permission/phân công. |
| BR-03 | Xác thực tài khoản | Email đăng ký duy nhất theo chuẩn hóa; Customer phải xác minh email trước khi mua; mật khẩu được băm an toàn, token có hạn. |
| BR-04 | Sản phẩm và SKU | SKU biến thể duy nhất; giá/tồn không âm; chỉ nội dung public xuất hiện ở cửa hàng; không xóa lịch sử đơn cũ. |
| BR-05 | Giỏ và chốt giá | Giá trên giỏ là tham khảo; backend tính lại tồn, giá, voucher và vận chuyển trước khi tạo đơn. |
| BR-06 | Đơn và kho | Tạo đơn có chống lặp; cập nhật/giữ chỗ/giải phóng tồn nhất quán; một lần hủy không được trả kho hai lần. |
| BR-07 | Trạng thái đơn | Chỉ chuyển trạng thái hợp lệ và lưu lịch sử actor, thời gian, lý do; không đi từ CANCELLED/DELIVERED về đang xử lý. |
| BR-08 | Thanh toán | Mỗi deployment chỉ bật provider được chọn bởi `PAYMENT_PROVIDER`. Webhook xác thực của provider đó là nguồn xác nhận; chỉ tự khớp một giao dịch `in` đúng provider, mã đối soát và toàn bộ số tiền VND; `(provider,eventId)` chống lặp; event bất thường vào hàng đợi review. |
| BR-09 | Hoàn tiền | Refund tách Order cancellation; giữ tổng đề nghị/đã duyệt/đã hoàn không vượt tiền đã thu. QR hướng tới tài khoản Customer; tự hoàn thành chỉ sau webhook `out` khớp đầy đủ hoặc Admin đối chiếu sao kê có bằng chứng. Lưu lý do, người thao tác và mã tham chiếu. |
| BR-10 | AI và quyền riêng tư | Chỉ xử lý ảnh khi Customer đồng ý; tổng quota 5 job/ngày UTC, hoàn lượt đúng một lần khi provider/hệ thống lỗi; input xóa sau 24 giờ và output sau 7 ngày kể từ terminal theo DEC-05. |
| BR-11 | Cộng đồng | Đánh giá sản phẩm phải đủ điều kiện mua; người dùng chỉ sửa nội dung của mình; nội dung ẩn không công khai. |
| BR-12 | Thông báo đa kênh | Email giao dịch (FC-07) và thông báo in-app (FC-08) độc lập; lỗi phát thông báo không làm sai nghiệp vụ nguồn. |
| BR-13 | Quản trị và audit | Thao tác quyền, giá, kho, đơn, hoàn tiền và cấu hình phải có audit; luôn còn ít nhất một Admin có toàn quyền. |
| BR-14 | Dữ liệu lịch sử | Chi tiết đơn và địa chỉ lưu snapshot tại thời điểm đặt; thay đổi catalogue hoặc địa chỉ về sau không sửa chứng cứ cũ. |

## 7. Dữ liệu và quyền

[Data Model](03-DATA-MODEL.md) là nguồn chuẩn cho collection, field, index và transaction. [RBAC](04-RBAC.md) là nguồn chuẩn cho role, permission và ownership. Entity chưa có trong [Implementation Status](12-IMPLEMENTATION-STATUS.md) không được xem là đã tồn tại trong code.

## 8. Vòng đời và trạng thái

| Đối tượng | Các trạng thái | Bất biến |
|---|---|---|
| Account | PENDING_VERIFICATION → ACTIVE ↔ SUSPENDED | Không tạo phiên cho tài khoản chưa xác thực/khóa. |
| Order | PENDING_PAYMENT → CONFIRMED → PREPARING → SHIPPING → DELIVERED; PENDING_PAYMENT → CANCELLED; đơn đã thu tiền có thể vào CANCEL_PENDING_REFUND → CANCELLED | Customer chỉ tự hủy PENDING_PAYMENT; giữ tồn 30 phút; CANCELLED/DELIVERED kết thúc luồng thường. |
| PaymentAttempt | PENDING → SUCCEEDED hoặc FAILED; PENDING/FAILED → REQUIRES_REVIEW khi có giao dịch bất thường | Một attempt PENDING/Order; hết hạn cùng paymentDueAt; attempt SUCCEEDED không đổi khi hoàn tiền. |
| Refund | PENDING_APPROVAL → APPROVED → SUCCEEDED hoặc FAILED | Checker Admin khác proposer; APPROVED chờ chuyển khoản/đối soát. SUCCEEDED cần webhook `out` khớp đầy đủ hoặc đối chiếu thủ công có mã tham chiếu và bằng chứng sao kê. |
| AIJob | PENDING → PROCESSING → COMPLETED hoặc FAILED; EXPIRED sau thời hạn lưu | Ảnh kết quả chỉ hiển thị khi COMPLETED còn trong hạn. |
| Content | PUBLIC / HIDDEN; PENDING_REVIEW nếu bật | Mặc định chỉ PUBLIC hiện trên trang công khai. |

## 9. Tích hợp

Hợp đồng tích hợp chỉ được định nghĩa tại [SendGrid](13-EMAIL-SENDGRID.md), [R2](14-STORAGE-R2.md), [AI và event nội bộ](15-INTEGRATIONS.md), [GPM Pay](16-PAYMENT-GPMPAY.md), [SePay](25-PAYMENT-SEPAY.md). API ứng dụng được định nghĩa tại [API Contract](05-API.md).

## 10. Yêu cầu phi chức năng (NFR)

| ID | Chủ đề | Tiêu chí và phương pháp xác minh | Mức độ |
|---|---|---|---|
| NFR-01 | Bảo mật truy cập | Các API dữ liệu riêng tư phải xác thực/kiểm tra sở hữu và quyền; kiểm 401/403/IDOR. | Bắt buộc |
| NFR-02 | Mật khẩu và token | Băm mật khẩu bằng thuật toán chuyên dụng (Argon2id/bcrypt); token hết hạn, thu hồi refresh session; không ghi token/mật khẩu rõ vào log. | Bắt buộc |
| NFR-03 | Đường truyền | API ứng dụng và webhook dùng HTTPS/TLS ở môi trường triển khai công khai. | Bắt buộc |
| NFR-04 | Toàn vẹn đơn và kho | Kiểm thử cạnh tranh checkout, timeout, retry; không âm tồn, không trùng order/idempotency, không cộng trả tồn hai lần. | Bắt buộc |
| NFR-05 | Tin cậy thanh toán | Webhook sai HMAC/timestamp/mã/số tiền/tài khoản/source không đổi trạng thái; `payload.id` lặp không nhân bản side effect. | Bắt buộc |
| NFR-06 | Dữ liệu AI | Bảo vệ ảnh cá nhân và quyền truy cập; đồng ý trước xử lý; mỗi media tạm có `expiresAt` và tác vụ cleanup idempotent. | Bắt buộc |
| NFR-07 | Chống tấn công phổ biến | Validate input, chống XSS/NoSQL injection, kiểm loại ảnh, giới hạn auth/reset requests. | Bắt buộc |
| NFR-08 | Khả năng quan sát | Ghi log lỗi tích hợp, audit sự kiện quản trị và tương quan order/payment/job; không log bí mật. | Bắt buộc |
| NFR-09 | UI/UX | Responsive tiếng Việt; hỗ trợ loading/empty/error; thông báo lỗi trường nhập rõ ràng. | Bắt buộc |
| NFR-10 | Bảo trì | Tách module; cấu hình theo môi trường, tài liệu API/README, script seed và checklist triển khai. | Bắt buộc |
| NFR-11 | Sao lưu/phục hồi | Có hướng dẫn backup/restore MongoDB và thử khôi phục dữ liệu mẫu. | Bắt buộc |
| NFR-12 | Độ trễ và tải | Ở tải chuẩn 50 RPS: catalog read p95 ≤500 ms, mutation p95 ≤1 s, webhook ACK p95 ≤2 s, server error <1%; report ghi dataset/máy/tải/thời lượng. | Bắt buộc |
| NFR-13 | Khả dụng/khôi phục | Mục tiêu production 99,5%/tháng; Mongo RPO ≤24 giờ, RTO ≤4 giờ; backup/restore được rehearsal mỗi quý. | Bắt buộc |
| NFR-14 | Giới hạn tích hợp AI | UI không khóa trong lúc xử lý và thể hiện PENDING/PROCESSING/COMPLETED/FAILED/EXPIRED. | Bắt buộc |

## 11. Giới hạn và phụ thuộc

- Thanh toán dùng GPM Pay hoặc SePay để đối soát chuyển khoản VietQR. Trước production phải xác minh tài khoản ngân hàng, cấu hình HTTPS và xác thực webhook tương ứng, tách biệt SePay Test Mode với Live, chỉ chấp nhận `source=REAL` cho GPM Pay và hoàn tất kiểm thử replay/idempotency.
- Feature AI giữ `disabled` cho đến khi provider cụ thể, điều khoản dữ liệu, quota/cost limit và contract test được cấu hình; policy quota/retention đã chốt tại DEC-05.
- Giai đoạn đầu hỗ trợ một cửa hàng, một đơn vị tiền tệ **VND**, một locale **vi-VN**; báo cáo đa tiền tệ không thuộc phạm vi.

## 12. Nghiệm thu và bàn giao

- Duyệt UX/API/data model trước khi triển khai mỗi nhóm chức năng.
- Mỗi FR phải có UC, testcase success/validation/authz/error/idempotency (nếu có), và liên kết PR tương ứng.
- QA xác minh trên staging, có dữ liệu mẫu/seed, API docs, cấu hình môi trường và biên bản UAT.
- Critical/High defects phải được xử lý trước go-live; backup/restore, giám sát, audit log phải có bằng chứng.
- Policy đã chốt: [Decision Log](11-DECISION-LOG.md). Tình trạng code: [Implementation Status](12-IMPLEMENTATION-STATUS.md).

## 13. Truy vết

Bảng FR → UC → tài liệu được duy trì tại [Use Case Index](use-cases/README.md). `npm run check:docs` kiểm tra đủ FR-01–FR-37, UC01–UC37 và liên kết tương ứng.
