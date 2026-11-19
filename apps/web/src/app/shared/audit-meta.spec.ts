import { describe, expect, it } from 'vitest';
import { auditMetaLines } from './audit-meta';

describe('Audit log details as readable text', () => {
  it('shows the order code with a Vietnamese label instead of JSON', () => {
    expect(auditMetaLines('order', 'order.create', { code: 'FCMWMCIJRIB3C82D2CD5C0' }))
      .toEqual([{ label: 'Mã đơn hàng', value: 'FCMWMCIJRIB3C82D2CD5C0' }]);
  });

  it('translates states, money, people and settings', () => {
    expect(auditMetaLines('order', 'order.status.update', { from: 'CONFIRMED', to: 'SHIPPING' }))
      .toEqual([{ label: 'Từ trạng thái', value: 'Đã xác nhận' }, { label: 'Sang trạng thái', value: 'Đang giao' }]);
    expect(auditMetaLines('product', 'catalog.product.price_changed', { oldPrice: 500000, newPrice: 450000 })[1])
      .toEqual({ label: 'Giá mới', value: `${(450000).toLocaleString('vi-VN')}đ` });
    expect(auditMetaLines('order', 'order.assign_staff', { staffId: 's1' }, () => 'Nguyễn Văn A'))
      .toEqual([{ label: 'Nhân viên phụ trách', value: 'Nguyễn Văn A' }]);
    expect(auditMetaLines('system_setting', 'admin.settings_updated', { keys: ['standardShippingFee', 'lowStockThreshold'] }))
      .toEqual([{ label: 'Cấu hình đã đổi', value: 'Phí giao hàng chuẩn, Ngưỡng cảnh báo tồn thấp' }]);
    expect(auditMetaLines('user', 'admin.user_status_updated', { before: 'ACTIVE', after: 'SUSPENDED' })[1].value).toBe('Đã khóa');
  });

  it('never prints JSON braces for the common entries', () => {
    const text = JSON.stringify(auditMetaLines('payment_event', 'payment.event.review',
      { decision: 'ESCALATED', resolution: 'REQUIRES_REVIEW', evidenceObjectKey: 'refund_evidence/a.png' }));
    expect(text).not.toContain('refund_evidence/a.png');
    expect(text).toContain('Đã đính kèm');
  });
});
