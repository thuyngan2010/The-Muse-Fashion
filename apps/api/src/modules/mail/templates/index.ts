import { ACCOUNT_TEMPLATES, buildDefaultEmail, type EmailMessage } from './account-templates.js';
import { ORDER_TEMPLATES, type OrderEmailData } from './order-templates.js';
import type { MailContext } from './layout.js';

export type { EmailMessage } from './account-templates.js';
export { createMailContext, type MailContext } from './layout.js';
export { escapeHtml, formatVnd, formatVnDateTime, orderStatusLabel } from './escape.js';
export { mapOrderDocument, type OrderEmailData, type OrderEmailItem } from './order-templates.js';

/** Mẫu mang token một lần: nội dung và xử lý token giống hệt nhau. */
export const TOKEN_TEMPLATES: ReadonlySet<string> = new Set(['user.verify_email', 'user.reset_password', 'staff.invite']);

/** Mẫu cần đọc thêm dữ liệu đơn hàng theo `orderId`. */
export const ORDER_DATA_TEMPLATES: ReadonlySet<string> = new Set(Object.keys(ORDER_TEMPLATES));

/** Tên mọi mẫu đang có (dùng cho lệnh xem trước). */
export const KNOWN_TEMPLATES = ['user.verify_email', 'user.reset_password', 'staff.invite', 'user.password_changed',
  'order.created', 'order.status_changed', 'payment.succeeded', 'refund.succeeded'] as const;

/**
 * Dựng email cho một mẫu. Không bao giờ ném lỗi vì dữ liệu thiếu: phần thiếu bị ẩn,
 * mẫu lạ dùng mẫu mặc định. Với mẫu có token, `payload.token` phải là token đã giải mã.
 * `order` là dữ liệu đơn đọc thêm (có thể không có).
 */
export function buildEmailMessage(
  template: string,
  payload: Record<string, unknown>,
  ctx: MailContext,
  to?: string,
  order?: OrderEmailData,
): EmailMessage {
  const account = ACCOUNT_TEMPLATES[template];
  if (account) return account({ payload, to, ctx });
  const orderTemplate = ORDER_TEMPLATES[template];
  if (orderTemplate) return orderTemplate({ payload, order, ctx });
  return buildDefaultEmail({ payload, to, ctx });
}
