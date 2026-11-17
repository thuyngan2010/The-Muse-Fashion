import type { AiJob, OrderStatus } from '@fashion/contracts';

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
export function paymentStatusLabel(value: string | null | undefined): string { return pick(PAYMENT_STATUS_LABELS, value); }
