const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape mọi dữ liệu động trước khi đưa vào HTML (nội dung và thuộc tính). */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Cắt chuỗi quá dài (tên người dùng, địa chỉ...) để không phá khung thư. */
export function clip(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** 1250000 → "1.250.000đ". Giá trị không hợp lệ cho "0đ". */
export function formatVnd(amount: unknown): string {
  const number = typeof amount === 'number' ? amount : Number(amount);
  const rounded = Number.isFinite(number) ? Math.round(number) : 0;
  const digits = String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${rounded < 0 ? '-' : ''}${digits}đ`;
}

const VN_DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** dd/MM/yyyy HH:mm theo giờ Việt Nam. Giá trị không hợp lệ dùng `fallback`. */
export function formatVnDateTime(value: unknown, fallback: Date = new Date()): string {
  let date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : NaN);
  if (Number.isNaN(date.getTime())) date = fallback;
  const parts: Record<string, string> = {};
  for (const part of VN_DATE_TIME.formatToParts(date)) parts[part.type] = part.value;
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}

/** Nhãn trạng thái đơn (khớp apps/web/src/app/shared/labels.ts). */
const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Chờ thanh toán',
  CONFIRMED: 'Đã xác nhận',
  PREPARING: 'Đang chuẩn bị',
  SHIPPING: 'Đang giao',
  DELIVERED: 'Đã giao',
  CANCELLED: 'Đã hủy',
  CANCEL_PENDING_REFUND: 'Chờ hoàn tiền',
};

/** Trạng thái đơn hiển thị tiếng Việt; mã lạ hoặc thiếu không bao giờ lộ ra dạng tiếng Anh. */
export function orderStatusLabel(status: unknown): string {
  const key = typeof status === 'string' ? status.trim().toUpperCase() : '';
  return ORDER_STATUS_LABELS[key] ?? 'Đang cập nhật';
}
