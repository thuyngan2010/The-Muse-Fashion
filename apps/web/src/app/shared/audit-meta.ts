import {
  orderStatusLabel, paymentEventResolutionLabel, paymentReviewDecisionLabel, roleLabel, shipmentStatusLabel,
  supportStatusLabel, userStatusLabel,
} from './labels';

/** Một dòng "Nhãn: giá trị" của chi tiết nhật ký hoạt động. */
export type AuditMetaLine = { label: string; value: string };

const KEY_LABELS: Record<string, string> = {
  code: 'Mã', status: 'Trạng thái', attemptedStatus: 'Trạng thái yêu cầu', before: 'Trước', after: 'Sau',
  from: 'Từ trạng thái', to: 'Sang trạng thái', reason: 'Lý do', amount: 'Số tiền', transferAmount: 'Số tiền',
  oldPrice: 'Giá cũ', newPrice: 'Giá mới', delta: 'Thay đổi tồn kho', staffId: 'Nhân viên phụ trách',
  productId: 'Sản phẩm', eventId: 'Mã giao dịch', bankReference: 'Mã chứng từ ngân hàng', decision: 'Quyết định',
  resolution: 'Kết quả', proposerId: 'Người đề xuất', evidenceObjectKey: 'Chứng từ', keys: 'Cấu hình đã đổi',
  fields: 'Trường đã đổi', dailyJobs: 'Hạn ngạch AI', role: 'Vai trò', email: 'Email', fullName: 'Họ tên',
};

const CODE_LABELS: Record<string, string> = { order: 'Mã đơn hàng', voucher: 'Mã giảm giá' };

const SETTING_LABELS: Record<string, string> = {
  standardShippingFee: 'Phí giao hàng chuẩn', freeShippingThreshold: 'Ngưỡng miễn phí vận chuyển',
  lowStockThreshold: 'Ngưỡng cảnh báo tồn thấp', aiDailyJobs: 'Hạn ngạch AI',
};

const MONEY_KEYS = new Set(['amount', 'transferAmount', 'oldPrice', 'newPrice']);
const STATUS_KEYS = new Set(['status', 'attemptedStatus', 'before', 'after', 'from', 'to']);
const PERSON_KEYS = new Set(['staffId', 'proposerId']);

function statusText(entityType: string, action: string, value: string): string {
  if (action === 'order.shipment.update') return shipmentStatusLabel(value);
  if (entityType === 'order') return orderStatusLabel(value);
  if (entityType === 'user') return userStatusLabel(value);
  if (entityType === 'support_ticket') return supportStatusLabel(value);
  return value;
}

/**
 * Đổi metadata của một bản ghi nhật ký thành các dòng chữ dễ đọc thay vì JSON.
 * personName đổi mã tài khoản thành tên (nếu biết).
 */
export function auditMetaLines(
  entityType: string, action: string, metadata: Record<string, unknown> | null | undefined,
  personName: (id: string) => string = (id) => id,
): AuditMetaLine[] {
  const lines: AuditMetaLine[] = [];
  for (const [key, raw] of Object.entries(metadata ?? {})) {
    const label = key === 'code' ? (CODE_LABELS[entityType] ?? KEY_LABELS[key]) : (KEY_LABELS[key] ?? key);
    lines.push({ label, value: valueText(entityType, action, key, raw, personName) });
  }
  return lines;
}

function valueText(entityType: string, action: string, key: string, raw: unknown, personName: (id: string) => string): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  if (key === 'evidenceObjectKey') return 'Đã đính kèm';
  if (typeof raw === 'boolean') return raw ? 'Có' : 'Không';
  if (typeof raw === 'number') {
    if (MONEY_KEYS.has(key)) return `${raw.toLocaleString('vi-VN')}đ`;
    if (key === 'delta') return `${raw > 0 ? '+' : ''}${raw.toLocaleString('vi-VN')} sản phẩm`;
    if (key === 'dailyJobs') return `${raw} lượt/ngày`;
    return raw.toLocaleString('vi-VN');
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === 'string' ? SETTING_LABELS[item] ?? item : JSON.stringify(item))).join(', ') || '—';
  }
  if (typeof raw === 'string') {
    if (key === 'decision') return paymentReviewDecisionLabel(raw);
    if (key === 'resolution') return paymentEventResolutionLabel(raw);
    if (key === 'role') return roleLabel(raw);
    if (PERSON_KEYS.has(key) || (action === 'support.ticket.claimed' && key === 'after')) return personName(raw);
    if (STATUS_KEYS.has(key)) return statusText(entityType, action, raw);
    return raw;
  }
  return JSON.stringify(raw);
}
