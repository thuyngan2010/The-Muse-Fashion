import { describe, expect, it } from 'vitest';
import { buildEmailMessage, createMailContext, mapOrderDocument, type OrderEmailData } from './index.js';

const ctx = createMailContext('https://shop.example.test', () => undefined, new Date('2026-11-18T05:00:00Z'));
const ID = '65f0c0ffee0000000000a001';

const order: OrderEmailData = {
  orderId: ID, code: 'FC1001', state: 'PENDING_PAYMENT', createdAt: new Date('2026-11-18T05:00:00Z'),
  paymentDueAt: new Date('2026-11-18T05:30:00Z'),
  items: [
    { name: '<img src=x onerror=alert(1)> Áo "A" & B', variant: 'Đen / M', quantity: 2, unitPrice: 450000, lineTotal: 900000, imageUrl: 'https://cdn.example.test/a.jpg' },
    { name: 'Quần âu', quantity: 1, unitPrice: 350000, lineTotal: 350000, imageUrl: 'http://insecure.example.test/b.jpg' },
  ],
  money: { subtotal: 1250000, shippingFee: 0, voucherDiscount: 100000, payableTotal: 1150000 },
  voucherCode: 'MUSE100',
  shipping: { receiver: 'Trần <b>Văn</b> A', phone: '0901234567', address: '1 <script>x</script>, Q1', note: 'Gọi & để bảo vệ' },
};
const payload = { orderId: ID, code: 'FC1001', payableTotal: 1150000 };
const ENGLISH_STATES = /PENDING_PAYMENT|CONFIRMED|PREPARING|SHIPPING|DELIVERED|CANCELLED|CANCEL_PENDING_REFUND/;

describe('order.created', () => {
  it('renders items, money, address and payment buttons for a pending order', () => {
    const m = buildEmailMessage('order.created', payload, ctx, 'a@b.test', order);
    expect(m.subject).toBe('MUSE đã nhận đơn hàng #FC1001');
    expect(m.html).toContain(`href="https://shop.example.test/payment/${ID}"`);
    expect(m.html).toContain(`href="https://shop.example.test/orders/${ID}"`);
    expect(m.html).toContain('THANH TOÁN NGAY');
    expect(m.html).toContain('Đơn hàng sẽ được xử lý sau khi thanh toán qua VietQR.');
    expect(m.html).toContain('Miễn phí');
    expect(m.html).toContain('Voucher (MUSE100)');
    expect(m.html).toContain('-100.000đ');
    expect(m.html).toContain('1.150.000đ');
    expect(m.html).toContain('TỔNG THANH TOÁN');
    expect(m.html).toContain('width="64"');
    expect(m.html).not.toContain('insecure.example.test');
    expect(m.text).toContain('TỔNG THANH TOÁN: 1.150.000đ');
    expect(m.text).toContain(`https://shop.example.test/payment/${ID}`);
    expect(m.text).toContain('Trạng thái: Chờ thanh toán');
    expect(m.text).not.toMatch(ENGLISH_STATES);
    expect(m.html + m.text).not.toContain('/account/orders');
  });

  it('escapes product names, receiver, address and notes', () => {
    const m = buildEmailMessage('order.created', payload, ctx, 'a@b.test', order);
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<b>Văn</b>');
    expect(m.html).toContain('&lt;img src=x onerror=alert(1)&gt; Áo &quot;A&quot; &amp; B');
    expect(m.html).toContain('1 &lt;script&gt;x&lt;/script&gt;, Q1');
    expect(m.html).toContain('Gọi &amp; để bảo vệ');
  });

  it('shows only the view button for an order that is no longer pending payment', () => {
    const m = buildEmailMessage('order.created', payload, ctx, undefined, { ...order, state: 'CONFIRMED' });
    expect(m.html).not.toContain('THANH TOÁN NGAY');
    expect(m.html).toContain('XEM ĐƠN HÀNG');
  });

  it('still sends when the order is missing', () => {
    const m = buildEmailMessage('order.created', payload, ctx, 'a@b.test');
    expect(m.subject).toBe('MUSE đã nhận đơn hàng #FC1001');
    expect(m.html).toContain('1.150.000đ');
    expect(m.text).toContain('1.150.000đ');
    expect(m.html).toContain(`/payment/${ID}`);
    const bare = buildEmailMessage('order.created', {}, ctx);
    expect(bare.subject).toBe('MUSE đã nhận đơn hàng của bạn');
    expect(bare.html).toContain('XEM ĐƠN HÀNG');
  });
});

describe('order.status_changed', () => {
  const cases: Array<[string, string]> = [
    ['CONFIRMED', 'Đơn #FC1001 đã được xác nhận'],
    ['PREPARING', 'MUSE đang chuẩn bị đơn #FC1001'],
    ['SHIPPING', 'Đơn #FC1001 đang trên đường giao đến bạn'],
    ['DELIVERED', 'Đơn #FC1001 đã giao thành công'],
    ['CANCELLED', 'Đơn #FC1001 đã được hủy'],
    ['CANCEL_PENDING_REFUND', 'Đơn #FC1001 đang chờ hoàn tiền'],
  ];
  it.each(cases)('uses a Vietnamese subject and no English state code for %s', (to, subject) => {
    const m = buildEmailMessage('order.status_changed', { orderId: ID, code: 'FC1001', from: 'PENDING_PAYMENT', to }, ctx, undefined, { ...order, state: to });
    expect(m.subject).toBe(subject);
    expect(m.text).not.toMatch(ENGLISH_STATES);
    expect(m.html).not.toMatch(ENGLISH_STATES);
    expect(m.html).toContain(`href="https://shop.example.test/orders/${ID}`);
  });

  it('shows a progress bar for active states and a notice with reason for cancelled orders', () => {
    const preparing = buildEmailMessage('order.status_changed', { orderId: ID, code: 'FC1001', to: 'PREPARING' }, ctx, undefined, order);
    expect(preparing.html).toContain('Chuẩn bị');
    expect(preparing.html).toContain('background-color:#f4b8c1');
    expect(preparing.text).toContain('● Chuẩn bị');
    const cancelled = buildEmailMessage('order.status_changed', { orderId: ID, code: 'FC1001', to: 'CANCELLED' }, ctx, undefined, { ...order, reason: 'Quá hạn <thanh toán>' });
    expect(cancelled.html).not.toContain('Đặt hàng');
    expect(cancelled.html).toContain('Lý do: Quá hạn &lt;thanh toán&gt;');
    expect(cancelled.text).toContain('Lý do: Quá hạn <thanh toán>');
  });

  it('adds carrier and tracking code when shipping, review link when delivered', () => {
    const shipping = buildEmailMessage('order.status_changed', { orderId: ID, to: 'SHIPPING' }, ctx, undefined,
      { ...order, carrier: 'GHN <fast>', trackingCode: 'TRK 1' });
    expect(shipping.html).toContain('GHN &lt;fast&gt;');
    expect(shipping.text).toContain('Mã vận đơn: TRK 1');
    const delivered = buildEmailMessage('order.status_changed', { orderId: ID, to: 'DELIVERED' }, ctx, undefined, order);
    expect(delivered.html).toContain('ĐÁNH GIÁ SẢN PHẨM');
    expect(delivered.html).toContain(`href="https://shop.example.test/orders/${ID}?action=review"`);
    expect(delivered.text).toContain(`/orders/${ID}?action=review`);
  });

  it('renders without order data and with an unknown state', () => {
    const m = buildEmailMessage('order.status_changed', { to: 'MYSTERY' }, ctx);
    expect(m.subject).toBe('Cập nhật đơn hàng của bạn');
    expect(m.text).toContain('Đang cập nhật');
    expect(m.html).toContain('href="https://shop.example.test/orders"');
  });
});

describe('payment.succeeded and refund.succeeded', () => {
  it('payment: amount, VietQR, order link, short code when the order is unknown', () => {
    const m = buildEmailMessage('payment.succeeded', { orderId: ID, amount: 1250000, paidAt: '2026-11-18T05:30:00Z' }, ctx, undefined, order);
    expect(m.subject).toBe('Thanh toán thành công cho đơn #FC1001');
    expect(m.html).toContain('1.250.000đ');
    expect(m.html).toContain('Chuyển khoản VietQR');
    expect(m.html).toContain('18/11/2026 12:30');
    expect(m.html).toContain('&#10003;');
    expect(m.html).toContain(`href="https://shop.example.test/orders/${ID}"`);
    const noOrder = buildEmailMessage('payment.succeeded', { orderId: ID, amount: 1250000 }, ctx);
    expect(noOrder.subject).toBe(`Thanh toán thành công cho đơn #${ID.slice(-8).toUpperCase()}`);
  });

  it('refund: amount, bank reference, note, link only with orderId', () => {
    const m = buildEmailMessage('refund.succeeded', { orderId: ID, amount: 1250000, bankReference: 'FT<1>' }, ctx, undefined, order);
    expect(m.subject).toBe('MUSE đã hoàn tiền cho đơn #FC1001');
    expect(m.html).toContain('1.250.000đ');
    expect(m.html).toContain('FT&lt;1&gt;');
    expect(m.html).toContain('1–3 ngày làm việc');
    expect(m.text).toContain('1–3 ngày làm việc');
    const noOrder = buildEmailMessage('refund.succeeded', { amount: 5000 }, ctx);
    expect(noOrder.subject).toBe('MUSE đã hoàn tiền cho đơn hàng của bạn');
    expect(noOrder.html).not.toContain('XEM ĐƠN HÀNG');
    expect(noOrder.html).toContain('5.000đ');
  });
});

describe('mapOrderDocument', () => {
  it('maps a stored order and tolerates missing fields', () => {
    const mapped = mapOrderDocument({
      _id: ID, code: 'FC1', state: 'CONFIRMED',
      items: [{ productName: 'Áo', variantId: 'v1', quantity: 2, unitPrice: 100, lineTotal: 200 }],
      money: { subtotal: 200, shippingFee: 30000, voucherDiscount: 0, payableTotal: 30200 },
      shippingSnapshot: { receiver: 'A', phone: '1', location: { line1: '1 X', ward: 'P1', district: 'Q1', province: 'HCM' }, note: null },
    }, { variants: new Map([['v1', { color: 'Đen', size: 'M' }]]), shipment: { carrier: 'GHN' }, reason: 'PAYMENT_EXPIRED' });
    expect(mapped.items[0]).toMatchObject({ name: 'Áo', variant: 'Đen / M', quantity: 2, lineTotal: 200 });
    expect(mapped.shipping?.address).toBe('1 X, P1, Q1, HCM');
    expect(mapped.shipping?.note).toBeUndefined();
    expect(mapped.carrier).toBe('GHN');
    expect(mapped.reason).toBe('Quá hạn thanh toán');
    expect(() => mapOrderDocument({})).not.toThrow();
    expect(mapOrderDocument({}).items).toEqual([]);
  });
});
