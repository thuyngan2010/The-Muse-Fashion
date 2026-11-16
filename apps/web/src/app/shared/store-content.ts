// Nội dung mẫu, nhóm cần xác nhận trước khi báo cáo.
export const STORE_CART_CONTENT = {
  deliveryNote: 'Thời gian giao hàng dự kiến được xác nhận tại bước thanh toán.',
  assurances: [
    'Điều kiện đổi trả được áp dụng theo chính sách hiện hành tại thời điểm mua.',
    'Thanh toán được xử lý theo phương thức hiển thị tại bước thanh toán.',
    'Hỗ trợ khách hàng: 1900 6868.',
  ],
} as const;

export const STORE_ORDERS_CONTENT = {
  pendingPaymentNote: 'Đơn hàng có thể tự hủy nếu chưa được thanh toán.',
} as const;

export const STORE_ORDER_DETAIL_CONTENT = {
  vatNote: 'Đã bao gồm VAT.',
  addressSnapshotNote: 'Địa chỉ nhận hàng được lưu theo thông tin tại thời điểm đặt đơn.',
  supportDescription: 'MUSE hỗ trợ kiểm tra thông tin liên quan đến đơn hàng của bạn.',
  supportLabel: 'Hỗ trợ đơn hàng: 1900 6868',
  supportHref: 'tel:19006868',
} as const;

export const STORE_PROFILE_CONTENT = {
  securityNotes: [
    'Mật khẩu cần từ 12 đến 128 ký tự, có chữ hoa, chữ thường và số.',
    'Không chia sẻ mật khẩu hoặc thông tin phiên đăng nhập với người khác.',
    'Sau khi đổi mật khẩu, bạn sẽ được yêu cầu đăng nhập lại.',
  ],
} as const;

export const STORE_ADDRESSES_CONTENT = {
  checkoutAddressNote: 'Địa chỉ mặc định được ưu tiên khi bạn chọn địa chỉ nhận hàng ở bước thanh toán.',
} as const;

export const STORE_NOTIFICATIONS_CONTENT = {
  subtitle: 'Cập nhật mới nhất về đơn hàng và hoạt động của bạn tại MUSE.',
  emptyDescription: 'Khi có cập nhật về đơn hàng hoặc hoạt động tài khoản, thông báo sẽ xuất hiện tại đây.',
} as const;

export const STORE_AI_TRY_ON_CONTENT = {
  tips: 'Chọn ảnh toàn thân chụp thẳng, đủ sáng và trang phục hiện tại không che khuất vóc dáng.',
  privacy: 'Ảnh của bạn chỉ được xử lý để tạo kết quả thử đồ theo phiên hiện tại.',
  processingTime: 'Thời gian xử lý tham khảo khoảng 3 giây và có thể thay đổi theo trạng thái hệ thống.',
  commitments: [
    { title: 'Dữ liệu riêng tư', description: 'Ảnh được sử dụng cho phiên thử đồ của bạn.' },
    { title: 'Kết quả trực quan', description: 'Kết quả là hình ảnh mô phỏng để tham khảo.' },
    { title: 'Trang phục thật', description: 'Lựa chọn được lấy từ sản phẩm đang có tại MUSE.' },
    { title: 'Lịch sử đồng bộ', description: 'Các phiên đã tạo được hiển thị từ tài khoản của bạn.' },
  ],
} as const;
