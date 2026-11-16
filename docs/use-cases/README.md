# Use Case Specification — 37 Use Case

**Mã tài liệu:** UCS-FASHION-001 · **Phiên bản:** 1.0 · **Ngày:** 23/10/2026 · **Trạng thái:** Baseline yêu cầu

Mỗi Use Case chứa luồng và quy tắc riêng của nghiệp vụ. Quy tắc dùng chung không lặp lại trong từng file: role/ownership theo [RBAC](../04-RBAC.md), API theo [API contract](../05-API.md), schema theo [Data Model](../03-DATA-MODEL.md), kiểm thử theo [Test Plan](../08-TEST-PLAN.md), trạng thái code theo [Implementation Status](../12-IMPLEMENTATION-STATUS.md).

Ba tiêu chí chung áp dụng cho mọi `UCxx`: `AC-UCxx-01` kiểm luồng chính và hậu điều kiện; `AC-UCxx-02` kiểm validation/authorization không cập nhật ngoài phạm vi; `AC-UCxx-03` kiểm các ngoại lệ ở mục 5 không tạo trạng thái thành công giả hoặc side effect lặp. Mỗi file chỉ ghi `AC-UCxx-04` riêng của nghiệp vụ.

| Mã | Use Case | Module | FR | Tài liệu |
|---|---|---|---|---|
| [UC01](UC01.md) | Đăng ký tài khoản | FC-01 | FR-01 | [UC01.md](UC01.md) |
| [UC02](UC02.md) | Đăng nhập | FC-01 | FR-02 | [UC02.md](UC02.md) |
| [UC03](UC03.md) | Đăng xuất | FC-01 | FR-03 | [UC03.md](UC03.md) |
| [UC04](UC04.md) | Quản lý hồ sơ cá nhân và địa chỉ | FC-01 | FR-04 | [UC04.md](UC04.md) |
| [UC05](UC05.md) | Khôi phục mật khẩu | FC-01 | FR-05 | [UC05.md](UC05.md) |
| [UC06](UC06.md) | Đổi mật khẩu | FC-01 | FR-06 | [UC06.md](UC06.md) |
| [UC07](UC07.md) | Duyệt, tìm kiếm và lọc sản phẩm | FC-02 | FR-07 | [UC07.md](UC07.md) |
| [UC08](UC08.md) | Xem chi tiết sản phẩm và hướng dẫn size | FC-02 | FR-08 | [UC08.md](UC08.md) |
| [UC09](UC09.md) | Quản lý danh mục, sản phẩm và biến thể | FC-02 | FR-09 | [UC09.md](UC09.md) |
| [UC10](UC10.md) | Xem Lookbook và khám phá outfit | FC-02 | FR-10 | [UC10.md](UC10.md) |
| [UC11](UC11.md) | Quản lý Lookbook | FC-02 | FR-11 | [UC11.md](UC11.md) |
| [UC12](UC12.md) | Thử đồ ảo bằng AI (Virtual Try-on) | FC-02 | FR-12 | [UC12.md](UC12.md) |
| [UC13](UC13.md) | Phối đồ bằng AI (Mix & Match) | FC-02 | FR-13 | [UC13.md](UC13.md) |
| [UC14](UC14.md) | Quản lý giỏ hàng | FC-03 | FR-14 | [UC14.md](UC14.md) |
| [UC15](UC15.md) | Đặt hàng và áp dụng voucher | FC-03 | FR-15 | [UC15.md](UC15.md) |
| [UC16](UC16.md) | Xem lịch sử và theo dõi đơn hàng | FC-03 | FR-16 | [UC16.md](UC16.md) |
| [UC17](UC17.md) | Hủy đơn hàng | FC-03 | FR-17 | [UC17.md](UC17.md) |
| [UC18](UC18.md) | Xử lý đơn hàng | FC-03 | FR-18 | [UC18.md](UC18.md) |
| [UC19](UC19.md) | Cập nhật thông tin vận chuyển | FC-03 | FR-19 | [UC19.md](UC19.md) |
| [UC20](UC20.md) | Quản lý tồn kho | FC-03 | FR-20 | [UC20.md](UC20.md) |
| [UC21](UC21.md) | Quản lý voucher khuyến mãi | FC-03 | FR-21 | [UC21.md](UC21.md) |
| [UC22](UC22.md) | Đánh giá sản phẩm đã mua | FC-04 | FR-22 | [UC22.md](UC22.md) |
| [UC23](UC23.md) | Đăng và quản lý bài viết outfit | FC-04 | FR-23 | [UC23.md](UC23.md) |
| [UC24](UC24.md) | Xem, tìm kiếm và bình luận cộng đồng | FC-04 | FR-24 | [UC24.md](UC24.md) |
| [UC25](UC25.md) | Kiểm duyệt nội dung cộng đồng | FC-04 | FR-25 | [UC25.md](UC25.md) |
| [UC26](UC26.md) | Thanh toán đơn hàng | FC-05 | FR-26 | [UC26.md](UC26.md) |
| [UC27](UC27.md) | Xác nhận kết quả thanh toán (webhook) | FC-05 | FR-27 | [UC27.md](UC27.md) |
| [UC28](UC28.md) | Xem lịch sử giao dịch | FC-05 | FR-28 | [UC28.md](UC28.md) |
| [UC29](UC29.md) | Xử lý hoàn tiền cho đơn đã thanh toán | FC-05 | FR-29 | [UC29.md](UC29.md) |
| [UC30](UC30.md) | Quản lý tài khoản và phân quyền | FC-06 | FR-30 | [UC30.md](UC30.md) |
| [UC31](UC31.md) | Xem dashboard và báo cáo bán hàng | FC-06 | FR-31 | [UC31.md](UC31.md) |
| [UC32](UC32.md) | Cấu hình vận hành và hạn mức AI | FC-06 | FR-32 | [UC32.md](UC32.md) |
| [UC33](UC33.md) | Gửi email xác minh và khôi phục tài khoản | FC-07 | FR-33 | [UC33.md](UC33.md) |
| [UC34](UC34.md) | Gửi email xác nhận và cập nhật đơn hàng | FC-07 | FR-34 | [UC34.md](UC34.md) |
| [UC35](UC35.md) | Tạo thông báo trạng thái đơn hàng | FC-08 | FR-35 | [UC35.md](UC35.md) |
| [UC36](UC36.md) | Tạo thông báo tương tác cộng đồng và BST | FC-08 | FR-36 | [UC36.md](UC36.md) |
| [UC37](UC37.md) | Xem và quản lý thông báo | FC-08 | FR-37 | [UC37.md](UC37.md) |
