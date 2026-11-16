# Rà soát frontend hiện tại — 29/10/2026

Phạm vi: đọc source hiện tại (bao gồm thay đổi chưa commit), đối chiếu API/contracts và chạy reproduction trên các class thật của Angular. Không sửa source ứng dụng. Kiểm tra trình duyệt/ảnh giao diện do agent chính thực hiện riêng.

## Kết quả đã tái hiện

Chạy: `npx vitest run --config reports/review-2026-10-29/frontend-repro.config.mts --reporter=verbose`

Kết quả: **5/5 reproductions xác nhận được hành vi lỗi**. Đây là các kiểm tra ghi nhận bug đang tồn tại, không phải 5 kiểm tra chứng nhận sản phẩm hoạt động đúng. Bằng chứng trong `frontend-repro.spec.ts` và `frontend-repro-results.txt` cùng thư mục. Test dùng class ứng dụng thật và API doubles; không gửi request vào database/provider thật.

### F1 — P2: sửa lại bài cộng đồng sau khi thay ảnh gửi ngược media ID cũ

- Vị trí: `apps/web/src/app/pages/community.page.ts:740-741`; nơi lấy lại ID: dòng 699-703.
- Tái hiện: bài đang có ảnh A → sửa sang ảnh B, lưu thành công → mở sửa lần nữa, chỉ sửa caption → lưu.
- Sau lần đầu, danh sách `posts` chỉ cập nhật `caption`/`mediaUrls`, vẫn giữ `mediaIds` của A. Lần sau `openEditPost()` lấy ID A và PATCH nó lại, mặc dù preview đang hiển thị B.
- Backend `community-post.service.ts:75-87` thay toàn bộ `mediaIds`. Kết quả: ảnh mới bị đổi về ảnh cũ, hoặc request lỗi khi ảnh cũ đã bị cleanup. Test reproduction số 1 xác nhận payload lần hai là `['old-photo']`.
- Hướng xử lý: thay object danh sách bằng response đầy đủ hoặc ít nhất cập nhật đồng bộ `mediaIds`; giữ nguyên toàn bộ ảnh nếu chỉ sửa caption. Có thêm gap: form chỉ giữ ảnh đầu tiên nên edit caption cho post nhiều ảnh sẽ cắt bỏ ảnh thứ 2 trở đi.

### F2 — P2: sửa review tại chi tiết đơn hàng xóa ảnh đính kèm

- Vị trí: `apps/web/src/app/pages/order-detail.page.ts:666-669` làm mất `mediaIds` khi ánh xạ; dòng 758-764 gửi PATCH không có `mediaIds`.
- Tái hiện: review của đơn DELIVERED đã có ảnh → mở review từ chi tiết đơn hàng → chỉ sửa nội dung → lưu.
- API owner lookup trả `mediaIds`, nhưng FE chỉ giữ id/stars/content. Backend `apps/api/src/modules/community/reviews.service.ts:92-100` dùng `dto.mediaIds ?? []`, gán `current.mediaIds = mediaIds` và giải phóng ảnh cũ. Vì vậy lưu text làm review mất ảnh.
- Test reproduction số 2 xác nhận payload không có `mediaIds`. Luồng sửa tại ProductPage đã bảo toàn ảnh, nhưng OrderDetailPage chưa theo cùng cách.
- Hướng xử lý: giữ `mediaIds` trong itemReviews và gửi lại, hoặc định nghĩa PATCH backend bảo toàn ảnh khi thuộc tính bị bỏ qua. Bổ sung regression test cho cả hai nơi sửa review.

### F3 — P2: ngày hiệu lực voucher không khớp nhãn và múi giờ Việt Nam

- Vị trí: `apps/web/src/app/pages/admin/admin-vouchers.page.ts:383-384`; nhãn “Đến hết ngày” dòng 124; khôi phục form dòng 366-367.
- Tái hiện: chọn “Đến hết ngày 30/10/2026”. FE gửi `2026-10-30T00:00:00.000Z`, tương đương **07:00 ngày 30/10 tại Việt Nam**, thay vì cuối ngày.
- `pricing.service.ts:58` so sánh trực tiếp `now > voucher.validTo`, nên mã bị từ chối từ buổi sáng của ngày được quảng bá là còn hiệu lực. `validFrom` cũng bắt đầu từ 07:00 thay vì 00:00. Edit voucher cắt bỏ giờ trong timestamp và lưu lại làm thay đổi hiệu lực ngay cả khi chỉ sửa trường khác.
- Test reproduction số 3 xác nhận mốc hết hạn này.
- Hướng xử lý: dùng ngày kinh doanh Asia/Ho_Chi_Minh; xác định rõ inclusive/exclusive end boundary và bảo toàn timestamp khi không sửa ngày. Có sẵn helper date cho báo cáo để tham khảo, nhưng cần thống nhất với cách backend so sánh hạn voucher.

### F4 — P2: xóa trường ngày trong form voucher làm nút lưu kẹt vĩnh viễn

- Vị trí: `apps/web/src/app/pages/admin/admin-vouchers.page.ts:372-384`; nút submit dòng 143 chỉ xét `saving()`/`formCode`.
- Tái hiện: mở tạo/sửa voucher → xóa ngày bắt đầu hoặc ngày kết thúc → nhấn Lưu.
- Form dùng FormsModule; Angular áp `novalidate` mặc định. Không xét `NgForm.invalid`. `saveVoucher()` đặt `saving=true`, rồi `new Date('').toISOString()` ném RangeError trước khi tạo observable/request. Không có nhánh reset loading, toast hay field error.
- Test reproduction số 4 xác nhận RangeError, API chưa gọi, saving vẫn true. Hướng xử lý: validate ngày/range trước khi đặt saving, dùng form.valid, thêm lỗi ngay dưới input.

### F5 — P2: kết quả thử đồ cũ dẫn mua nhầm sản phẩm đang được chọn

- Vị trí: `apps/web/src/app/pages/ai-try-on.page.ts:157-165`, `:736-738`, `:830-835`; cùng kiểu vấn đề ở `ai-mix-match.page.ts:120-130`, `:461-463`.
- Tái hiện: mở lịch sử job thử váy A trong khi form đang chọn áo B. `selectHistoricalJob()` chỉ cập nhật job, nhưng CTA “Xem chi tiết & Mua ngay” gọi `getSelectedProduct()` từ `selectedProductId` hiện tại, nên dẫn đến B. Đổi lựa chọn trong lúc job đang chạy cũng làm phần sản phẩm cạnh ảnh kết quả thay đổi.
- Test reproduction số 5 dùng completed job có `detectedItems.productId='old-dress'`, trong khi CTA product vẫn là `new-shirt`.
- Hướng xử lý: gắn metadata/snapshot sản phẩm với job và render CTA từ job đã tạo; không dùng state form đang chỉnh để diễn giải kết quả cũ. API hiện chưa trả danh sách productIds gốc (chỉ detectedItems), cần bổ sung contract để có định danh tin cậy kể cả job cũ.

## Lỗi xác nhận bằng source

### F6 — P2: người dùng bàn phím không thể hoàn thành lựa chọn Mix & Match

- `apps/web/src/app/pages/ai-mix-match.page.ts:57-61`: phần chọn sản phẩm là `<div (click)>`, không tabindex/keyboard handler/role. Tương tự Try-On dòng 48-52.
- Mix & Match mặc định chọn 1 sản phẩm (`:435`), nhưng nút tạo cần ít nhất 2 (`:86`). Người chỉ dùng Tab/Enter không thể chọn thêm sản phẩm nên không thể hoàn thành luồng.
- Hướng xử lý: button hoặc checkbox/radio có accessible name và selected state; kiểm tra keyboard-only từ upload → chọn sản phẩm → consent → submit.

## Các phần nên bổ sung để hoàn thiện UI/UX (không khẳng định là lỗi chặn toàn bộ hệ thống)

- **Chính sách có trang đọc được:** footer `footer.component.ts:40-43` là các span, route chưa có chính sách; checkout yêu cầu đồng ý điều khoản và AI có consent nhưng không có link nội dung tương ứng. Cần trang giao hàng/đổi trả/bảo mật/AI consent và thông tin hỗ trợ đã xác thực. Đây là gap nội dung/UX, không phải kết luận pháp lý.
- **Chọn sản phẩm AI đầy đủ:** cả hai trang chỉ gọi `products({ limit: 12 })`, không có search/pagination. Mix & Match không thể chọn phần lớn catalog khi có trên 12 sản phẩm; preselect từ detail vào Try-On có thể chỉ có ID không có card/metadata.
- **Chọn phong cách Mix & Match:** class có 4 styles nhưng template không có control; `selectedStyle` luôn mặc định office. Cần đưa lựa chọn vào UI hoặc bỏ lời hứa lựa chọn dịp/phong cách nếu chưa hỗ trợ.
- **Notification dẫn đến đối tượng:** hiện click chỉ markRead, bỏ qua `reference`. Cần link tới đơn/job/comment liên quan; thêm thao tác bằng bàn phím.
- **Lỗi mạng phân biệt với không có dữ liệu:** admin orders/products/users/vouchers/moderation, notifications và lịch sử AI có nhánh error chỉ tắt loading, dễ hiển thị empty state như dữ liệu không tồn tại hoặc giữ dữ liệu cũ mà không báo stale. Cần inline error và retry.
- **404 đúng nghĩa:** wildcard route redirect về cửa hàng; nên có trang không tìm thấy với đường quay lại, nhất là link sản phẩm/chính sách hết hiệu lực.
- **Lọc và chọn biến thể:** sizes/colors lấy union, nên vô hiệu hóa cặp size/màu không tồn tại hoặc tự chọn cặp hợp lệ; thông báo hết hàng riêng với không có biến thể.
- **Khôi phục checkout sau login chậm:** cart guest merge chạy bất đồng bộ nhưng CheckoutPage tự tạo quote ngay sau tải địa chỉ, không đợi merge. Nếu quote chạy trước merge có thể lỗi cart trống hoặc quote bị outdated; cần kiểm tra E2E mạng chậm và đợi cart sync trước quote.

## Giới hạn

Không xác nhận provider ngân hàng/email/R2/AI thật bằng các reproductions này. Không suy ra các luồng còn lại đều đúng chỉ vì build/unit tests đạt. Vẫn cần E2E có dữ liệu đa dạng, mạng chậm/lỗi, hai tab và ba vai trò CUSTOMER/STAFF/ADMIN.
