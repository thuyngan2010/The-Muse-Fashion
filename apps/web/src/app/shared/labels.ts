import type { AiJob, OrderStatus, SupportTicketCategory, SupportTicketStatus } from '@fashion/contracts';

/** Nhãn trạng thái đơn hàng hiển thị cho khách. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  CONFIRMED: 'Đã xác nhận',
  PREPARING: 'Đang chuẩn bị',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  CANCEL_PENDING_REFUND: 'Chờ hoàn tiền',
};

/** Nhãn trạng thái phiên AI. */
export const AI_JOB_STATE_LABELS: Record<AiJob['state'], string> = {
  PENDING: 'Đang chờ',
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn tất',
  FAILED: 'Thất bại',
  EXPIRED: 'Hết hạn',
};

/** Nhãn loại tác vụ AI. */
export const AI_JOB_TYPE_LABELS: Record<string, string> = {
  TRY_ON: 'Thử đồ',
  MIX_MATCH: 'Mix & Match',
};

/** Trạng thái lần thanh toán (PaymentAttempt) mà trang thanh toán xử lý. */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  SUCCEEDED: 'Đã thanh toán',
  REQUIRES_REVIEW: 'Đang đối soát',
  FAILED: 'Thất bại',
};

function pick(table: Record<string, string>, value: string | null | undefined): string {
  const raw = value ?? '';
  return Object.prototype.hasOwnProperty.call(table, raw) ? table[raw] : raw;
}

export function orderStatusLabel(value: string | null | undefined): string { return pick(ORDER_STATUS_LABELS, value); }
export function aiJobStateLabel(value: string | null | undefined): string { return pick(AI_JOB_STATE_LABELS, value); }
export function aiJobTypeLabel(value: string | null | undefined): string { return pick(AI_JOB_TYPE_LABELS, value); }
export function paymentStatusLabel(value: string | null | undefined): string { return pick(PAYMENT_STATUS_LABELS, value); }

/** Nhãn trạng thái sản phẩm trong khu quản trị. */
export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đang bán',
  ARCHIVED: 'Đã lưu trữ',
};

/** Nhãn trạng thái danh mục. */
export const CATEGORY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hiển thị',
  HIDDEN: 'Đã ẩn',
};

/** Nhãn trạng thái biến thể (SKU). */
export const VARIANT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang bán',
  INACTIVE: 'Ngừng bán',
};

/** Nhãn trạng thái Lookbook. */
export const LOOKBOOK_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã xuất bản',
  HIDDEN: 'Đã ẩn',
  ARCHIVED: 'Đã lưu trữ',
};

/** Nhãn loại biến động trong sổ cái tồn kho. */
export const LEDGER_TYPE_LABELS: Record<string, string> = {
  RESERVE: 'Giữ hàng cho đơn',
  RELEASE: 'Nhả hàng giữ',
  SALE: 'Xuất bán',
  VOUCHER_RELEASE: 'Nhả hàng (mã giảm giá)',
  MANUAL_ADJUST: 'Điều chỉnh thủ công',
};

export function productStatusLabel(value: string | null | undefined): string { return pick(PRODUCT_STATUS_LABELS, value); }
export function categoryStatusLabel(value: string | null | undefined): string { return pick(CATEGORY_STATUS_LABELS, value); }
export function variantStatusLabel(value: string | null | undefined): string { return pick(VARIANT_STATUS_LABELS, value); }
export function lookbookStatusLabel(value: string | null | undefined): string { return pick(LOOKBOOK_STATUS_LABELS, value); }
export function ledgerTypeLabel(value: string | null | undefined): string { return pick(LEDGER_TYPE_LABELS, value); }

/** Nhãn trạng thái vận chuyển của đơn hàng. */
export const SHIPMENT_STATUS_LABELS: Record<string, string> = {
  READY: 'Sẵn sàng lấy hàng',
  PICKED_UP: 'Đã bàn giao bưu tá',
  IN_TRANSIT: 'Đang luân chuyển',
  DELIVERED: 'Giao thành công',
  FAILED: 'Giao thất bại',
};

export function shipmentStatusLabel(value: string | null | undefined): string { return pick(SHIPMENT_STATUS_LABELS, value); }

/** Nhãn trạng thái khoản hoàn tiền. */
export const REFUND_STATE_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt, chờ chuyển tiền',
  PROCESSING: 'Đang xử lý',
  SUCCEEDED: 'Đã hoàn tiền',
  FAILED: 'Thất bại',
  REQUIRES_REVIEW: 'Cần đối soát',
};

/** Nhãn kết quả khớp / xử lý của sự kiện thanh toán. */
export const PAYMENT_EVENT_RESOLUTION_LABELS: Record<string, string> = {
  MATCHED: 'Đã khớp đơn',
  REQUIRES_REVIEW: 'Cần kiểm tra',
  UNMATCHED: 'Không khớp đơn nào',
  ESCALATED: 'Đang đối soát tiếp',
  PENDING_APPROVAL: 'Chờ Admin xác nhận',
  REFUNDED_EXTERNALLY: 'Đã hoàn ngoài hệ thống',
  CLOSED_NO_ACTION: 'Đã đóng, không xử lý',
  OUTGOING_RECONCILED: 'Đã đối chiếu khoản chi',
};

/** Nhãn quyết định đánh giá kiểm toán sự kiện thanh toán. */
export const PAYMENT_REVIEW_DECISION_LABELS: Record<string, string> = {
  ESCALATED: 'Tiếp tục đối soát',
  REFUNDED_EXTERNALLY: 'Đề xuất: đã hoàn ngoài hệ thống',
  CLOSED_NO_ACTION: 'Đề xuất: đóng, không xử lý',
  OUTGOING_RECONCILED: 'Đề xuất: đã đối chiếu khoản chi',
  APPROVE: 'Đã xác nhận đề xuất',
  REJECT_PROPOSAL: 'Đã từ chối đề xuất',
};

export function refundStateLabel(value: string | null | undefined): string { return pick(REFUND_STATE_LABELS, value); }
export function paymentEventResolutionLabel(value: string | null | undefined): string { return pick(PAYMENT_EVENT_RESOLUTION_LABELS, value); }
export function paymentReviewDecisionLabel(value: string | null | undefined): string { return pick(PAYMENT_REVIEW_DECISION_LABELS, value); }

/** Nhãn trạng thái tài khoản người dùng. */
export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  PENDING_VERIFICATION: 'Chờ xác thực',
  SUSPENDED: 'Đã khóa',
};
export function userStatusLabel(value: string | null | undefined): string { return pick(USER_STATUS_LABELS, value); }

/** Nhãn voucher và kiểm duyệt nội dung trong khu quản trị. */
export const VOUCHER_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Đang chạy', DISABLED: 'Ngưng' };
export const VOUCHER_TYPE_LABELS: Record<string, string> = { PERCENT: 'Phần trăm', FIXED: 'Số tiền cố định' };
export const CONTENT_STATUS_LABELS: Record<string, string> = { PUBLIC: 'Công khai', HIDDEN: 'Đã ẩn', PENDING_REVIEW: 'Chờ duyệt' };
export const MODERATION_TYPE_LABELS: Record<string, string> = { REVIEW: 'Đánh giá', POST: 'Bài viết', COMMENT: 'Bình luận' };
export function voucherStatusLabel(value: string | null | undefined): string { return pick(VOUCHER_STATUS_LABELS, value); }
export function voucherTypeLabel(value: string | null | undefined): string { return pick(VOUCHER_TYPE_LABELS, value); }
export function contentStatusLabel(value: string | null | undefined): string { return pick(CONTENT_STATUS_LABELS, value); }
export function moderationTypeLabel(value: string | null | undefined): string { return pick(MODERATION_TYPE_LABELS, value); }

/** Nhãn vai trò, hành động và đối tượng trong nhật ký hoạt động. */
export const ROLE_LABELS: Record<string, string> = { ADMIN: 'Quản trị viên', STAFF: 'Nhân viên', CUSTOMER: 'Khách hàng' };
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'admin.ai_quota_updated': 'Cập nhật hạn ngạch AI',
  'admin.lock_last_admin_blocked': 'Chặn khóa quản trị viên cuối cùng',
  'admin.settings_updated': 'Cập nhật cấu hình hệ thống',
  'admin.staff.created': 'Mời nhân viên mới',
  'admin.staff.invitation_resent': 'Gửi lại lời mời nhân viên',
  'admin.user_status_updated': 'Đổi trạng thái tài khoản',
  'catalog.product.price_changed': 'Đổi giá sản phẩm',
  'catalog.variant.price_changed': 'Đổi giá biến thể',
  'inventory.adjust': 'Điều chỉnh tồn kho',
  'order.assign_staff': 'Giao đơn cho nhân viên',
  'order.cancel': 'Hủy đơn hàng',
  'order.confirm.payment': 'Xác nhận thanh toán đơn',
  'order.create': 'Tạo đơn hàng',
  'order.shipment.update': 'Cập nhật vận đơn',
  'order.status.update': 'Đổi trạng thái đơn hàng',
  'payment.event.review': 'Xem xét sự kiện thanh toán',
  'payment.webhook.invalid_signature': 'Webhook sai chữ ký',
  'payment.webhook.matched': 'Khớp giao dịch thanh toán',
  'refund.approve': 'Duyệt hoàn tiền',
  'refund.beneficiary.set': 'Nhập tài khoản nhận hoàn tiền',
  'refund.complete.manual': 'Hoàn tất hoàn tiền thủ công',
  'refund.fail': 'Hoàn tiền thất bại',
  'refund.propose': 'Đề xuất hoàn tiền',
  'refund.reject': 'Từ chối hoàn tiền',
  'refund.webhook.matched': 'Khớp giao dịch hoàn tiền',
  'voucher.create': 'Tạo voucher',
  'voucher.disable': 'Vô hiệu hóa voucher',
  'voucher.update': 'Cập nhật voucher',
};
export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  order: 'Đơn hàng', product: 'Sản phẩm', variant: 'Biến thể', voucher: 'Mã giảm giá',
  refund: 'Hoàn tiền', user: 'Người dùng / Nhân sự', inventory: 'Tồn kho', payment: 'Thanh toán',
};
export function roleLabel(value: string | null | undefined): string { return pick(ROLE_LABELS, value); }
export function auditActionLabel(value: string | null | undefined): string { return pick(AUDIT_ACTION_LABELS, value); }
export function auditEntityLabel(value: string | null | undefined): string { return pick(AUDIT_ENTITY_LABELS, value); }

/** Nhãn trạng thái phiếu hỗ trợ. */
export const SUPPORT_STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: 'Chưa tiếp nhận',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
};

/** Nhãn loại phiếu hỗ trợ. */
export const SUPPORT_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  ORDER: 'Đơn hàng',
  SIZE: 'Tư vấn size',
  PAYMENT_REFUND: 'Thanh toán & hoàn tiền',
  PRODUCT: 'Sản phẩm',
  ACCOUNT: 'Tài khoản',
  OTHER: 'Khác',
};

export function supportStatusLabel(value: string | null | undefined): string { return pick(SUPPORT_STATUS_LABELS, value); }
export function supportCategoryLabel(value: string | null | undefined): string { return pick(SUPPORT_CATEGORY_LABELS, value); }
