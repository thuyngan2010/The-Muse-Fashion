# Ma trận quyền và sở hữu dữ liệu (RBAC + Permission + Ownership)

## 1. Vai trò

- `CUSTOMER`: quản lý đối tượng của mình. Không cho phép CRUD quản trị.
- `ADMIN`: vận hành toàn hệ thống, nhưng thao tác nhạy cảm có audit; giữ tối thiểu 1 Admin active.
- `STAFF`: chỉ các permission được cấp cùng scope/phân công.
- Guest: không là role DB. Hệ thống/SendGrid/AI/payment là tác nhân tích hợp, không là user role.

## 2. Permission matrix

| Nghiệp vụ | Guest | Customer | Admin | Staff |
|---|---|---|---|---|
| Xem catalog/Lookbook public | ✓ | ✓ | ✓ | ✓ |
| Đăng ký, khôi phục mật khẩu | ✓ | — | — | — |
| Xem/sửa hồ sơ và địa chỉ | — | Own | Own | Own |
| Tạo giỏ/checkout | — | Own | — | — |
| Xem/hủy đơn | — | Own; chỉ hủy PENDING_PAYMENT | All | Assigned/Global + `order.read`/`order.cancel` |
| Quản lý sản phẩm và Lookbook | — | — | All | `catalog.manage`, scope GLOBAL |
| Kho | — | — | All | `inventory.manage`, scope GLOBAL |
| Voucher | — | — | All | — |
| AI jobs | — | Own | Metrics/settings | — |
| Bài viết/bình luận/review | View | Own | Moderate | `content.moderate` |
| Thanh toán | — | Own | Read/manage | `payment.read`, Assigned/Global |
| Hoàn tiền | — | — | Approve/complete; maker ≠ checker | `refund.propose`, Assigned/Global |
| Báo cáo và cấu hình | — | — | All | — |
| Tạo Staff / cấp quyền | — | — | All | — |
| Thông báo | — | Own | Own + admin ops | Own |
| Chat hỗ trợ (phiếu và tin nhắn) | — | Own | All; phân công phiếu chỉ Admin | `order.read`: GLOBAL thấy tất cả và được nhận phiếu, ASSIGNED chỉ thấy phiếu có `assignedStaffId` là mình |

Chat hỗ trợ **không thêm permission mới**: Staff dùng `order.read` và phạm vi của nó. Phạm vi được kiểm trong service theo từng phiếu (như `GET /admin/orders`), phiếu ngoài phạm vi trả `404`. Phân công phiếu (`PATCH /admin/support/tickets/:id/assign`) chỉ Admin; người được giao phải là Staff đang hoạt động có `order.read`.

**Own** = phải so khớp principal user ID với owner ID từ DB, không chỉ kiểm token hợp lệ. **Assigned** = phải kiểm cả staff assignment hoặc phạm vi được cấp.

### Permission Staff canonical

`catalog.manage`, `inventory.manage`, `order.read`, `order.manage`, `order.cancel`, `shipment.manage`, `payment.read`, `refund.propose`, `content.moderate`. Scope chỉ `GLOBAL` hoặc `ASSIGNED`; permission catalog/inventory/moderation chỉ dùng `GLOBAL`. Staff không quản lý user/permission, voucher, setting, report/quota và không approve/complete refund.

## 3. Backend enforcement

Mỗi route khai báo Public hoặc AuthGuard, Roles hoặc permission metadata. Quy tắc record ownership nằm trong service query (ví dụ `{ _id, customerId: req.user.sub }`). `403` khi principal có xác thực nhưng thiếu quyền; `404` cho tài nguyên riêng để tránh lộ sự tồn tại khi phù hợp; `401` khi không xác thực. Permission và status đọc từ DB, không chỉ role trong JWT.

## 4. Protected invariants

- Không nâng quyền trên endpoint cập nhật hồ sơ.
- Không thể tạo Admin từ public register.
- Không khóa Admin cuối cùng; hành động admin quan trọng ghi audit before/after.
- Nhân viên không đọc địa chỉ, ảnh AI hoặc giao dịch ngoài phạm vi được giao.
- Không truy cập media private thông qua objectKey đoán được.

## 5. Test suite bắt buộc

Dùng cùng fixture thử ở 4 actor; với mọi API sở hữu, thử IDOR (Customer B truy cập A) và role escalation (Staff không quyền/Customer vào admin); khóa user phải vô hiệu hóa truy cập mới. Tham chiếu [Test Plan](08-TEST-PLAN.md).
