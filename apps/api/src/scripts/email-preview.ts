import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildEmailMessage, createMailContext, escapeHtml, KNOWN_TEMPLATES, type OrderEmailData,
} from '../modules/mail/templates/index.js';

/**
 * Xem trước email: ghi HTML và TXT của mọi mẫu vào apps/api/.email-preview/.
 * Dùng dữ liệu giả, không gửi email, không cần MongoDB.
 * Muốn thấy ảnh logo, đặt PUBLIC_WEB_URL=https://... (localhost chỉ hiện chữ MUSE).
 */
const outDir = fileURLToPath(new URL('../../.email-preview/', import.meta.url));
const baseUrl = process.env.PUBLIC_WEB_URL?.trim() || 'http://localhost:4200';
const demoContact: Record<string, string> = {
  MAIL_SUPPORT_EMAIL: 'support@muse.example',
  MAIL_SUPPORT_PHONE: '1900 0000',
  MAIL_ADDRESS: '12 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
};
const ctx = createMailContext(baseUrl, (name) => process.env[name]?.trim() || demoContact[name]);

const demoOrder: OrderEmailData = {
  orderId: '65f0c0ffee0000000000a001',
  code: 'FCMU1001A2B3',
  state: 'PENDING_PAYMENT',
  createdAt: new Date(),
  paymentDueAt: new Date(Date.now() + 30 * 60_000),
  items: [
    { name: 'Áo sơ mi lụa Aurora', variant: 'Trắng / M', quantity: 1, unitPrice: 650000, lineTotal: 650000,
      imageUrl: 'https://placehold.co/64x64/png' },
    { name: 'Quần âu Basic', variant: 'Đen / 29', quantity: 2, unitPrice: 450000, lineTotal: 900000 },
    { name: '<script>alert(1)</script> Váy "Muse" & Co', variant: 'Hồng phấn / S', quantity: 1, unitPrice: 300000, lineTotal: 300000 },
  ],
  money: { subtotal: 1850000, shippingFee: 30000, voucherDiscount: 100000, payableTotal: 1780000 },
  voucherCode: 'MUSE100',
  shipping: {
    receiver: 'Nguyễn Thị Ánh Tuyết', phone: '0901 234 567',
    address: '12/3 <b>Lê Lợi</b>, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh', note: 'Gọi trước khi giao & để hàng ở bảo vệ',
  },
};
const freeShipOrder: OrderEmailData = {
  ...demoOrder,
  items: [{ name: 'Áo thun Essential', variant: 'Đen / L', quantity: 5, unitPrice: 250000, lineTotal: 1250000 }],
  money: { subtotal: 1250000, shippingFee: 0, voucherDiscount: 0, payableTotal: 1250000 },
  voucherCode: undefined,
};
const statusOrder = (state: string, extra: Partial<OrderEmailData> = {}): OrderEmailData => ({ ...demoOrder, state, ...extra });
const statusPayload = (to: string) => ({ orderId: demoOrder.orderId, code: demoOrder.code, from: 'PENDING_PAYMENT', to });

const samples: Array<{
  id: string; template: string; label: string; payload: Record<string, unknown>; to: string; order?: OrderEmailData;
}> = [
  { id: 'verify', template: 'user.verify_email', label: 'Xác thực email',
    payload: { token: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', fullName: 'Nguyễn Thị Ánh Tuyết' }, to: 'khach@example.com' },
  { id: 'verify-long-name', template: 'user.verify_email', label: 'Xác thực email (tên rất dài, ký tự đặc biệt)',
    payload: { token: 'tok&en<>"x', fullName: `<b>Trần "Văn" & Lê</b> ${'Nguyễn '.repeat(40)}` }, to: 'khach@example.com' },
  { id: 'reset', template: 'user.reset_password', label: 'Đặt lại mật khẩu',
    payload: { token: 'f0e1d2c3b4a5968778695a4b3c2d1e0f' }, to: 'khach@example.com' },
  { id: 'invite', template: 'staff.invite', label: 'Lời mời nhân viên',
    payload: { token: '00112233445566778899aabbccddeeff' }, to: 'nhanvien.moi@muse.example' },
  { id: 'password-changed', template: 'user.password_changed', label: 'Đổi mật khẩu',
    payload: { changedAt: new Date().toISOString() }, to: 'khach@example.com' },
  { id: 'default', template: 'system.notice', label: 'Mẫu mặc định', payload: {}, to: 'khach@example.com' },
  { id: 'order-created', template: 'order.created', label: 'Đơn hàng mới: 3 sản phẩm, có voucher, chờ thanh toán',
    payload: { orderId: demoOrder.orderId, code: demoOrder.code, payableTotal: 1780000 }, to: 'khach@example.com', order: demoOrder },
  { id: 'order-created-free-ship', template: 'order.created', label: 'Đơn hàng mới: miễn phí ship, 1.250.000đ',
    payload: { orderId: demoOrder.orderId, code: demoOrder.code, payableTotal: 1250000 }, to: 'khach@example.com', order: freeShipOrder },
  { id: 'order-created-no-data', template: 'order.created', label: 'Đơn hàng mới: không đọc được đơn (chỉ có payload)',
    payload: { orderId: demoOrder.orderId, code: demoOrder.code, payableTotal: 1250000 }, to: 'khach@example.com' },
  { id: 'status-confirmed', template: 'order.status_changed', label: 'Đơn: Đã xác nhận',
    payload: statusPayload('CONFIRMED'), to: 'khach@example.com', order: statusOrder('CONFIRMED') },
  { id: 'status-preparing', template: 'order.status_changed', label: 'Đơn: Đang chuẩn bị',
    payload: statusPayload('PREPARING'), to: 'khach@example.com', order: statusOrder('PREPARING') },
  { id: 'status-shipping', template: 'order.status_changed', label: 'Đơn: Đang giao (có mã vận đơn)',
    payload: statusPayload('SHIPPING'), to: 'khach@example.com',
    order: statusOrder('SHIPPING', { carrier: 'Giao Hàng Nhanh', trackingCode: 'GHN123456789VN' }) },
  { id: 'status-delivered', template: 'order.status_changed', label: 'Đơn: Đã giao (mời đánh giá)',
    payload: statusPayload('DELIVERED'), to: 'khach@example.com', order: statusOrder('DELIVERED') },
  { id: 'status-cancelled', template: 'order.status_changed', label: 'Đơn: Đã hủy (có lý do)',
    payload: statusPayload('CANCELLED'), to: 'khach@example.com', order: statusOrder('CANCELLED', { reason: 'Quá hạn thanh toán' }) },
  { id: 'status-cancel-pending-refund', template: 'order.status_changed', label: 'Đơn: Chờ hoàn tiền',
    payload: statusPayload('CANCEL_PENDING_REFUND'), to: 'khach@example.com',
    order: statusOrder('CANCEL_PENDING_REFUND', { reason: 'Khách đổi ý <không cần nữa>' }) },
  { id: 'payment', template: 'payment.succeeded', label: 'Thanh toán thành công',
    payload: { orderId: demoOrder.orderId, amount: 1250000 }, to: 'khach@example.com', order: freeShipOrder },
  { id: 'refund', template: 'refund.succeeded', label: 'Hoàn tiền',
    payload: { orderId: demoOrder.orderId, amount: 1250000, bankReference: 'FT26111800123' }, to: 'khach@example.com', order: freeShipOrder },
];

const covered = new Set(samples.map((sample) => sample.template));
const missing = KNOWN_TEMPLATES.filter((template) => !covered.has(template));
if (missing.length) throw new Error(`Thiếu dữ liệu mẫu cho: ${missing.join(', ')}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const cards: string[] = [];
for (const sample of samples) {
  const message = buildEmailMessage(sample.template, sample.payload, ctx, sample.to, sample.order);
  writeFileSync(`${outDir}${sample.id}.html`, message.html, 'utf8');
  writeFileSync(`${outDir}${sample.id}.txt`, `Subject: ${message.subject}\n\n${message.text}`, 'utf8');
  cards.push(`<section><h2>${escapeHtml(sample.label)}</h2>`
    + `<p><code>${escapeHtml(sample.template)}</code> · Tiêu đề thư: <b>${escapeHtml(message.subject)}</b> · `
    + `<a href="${sample.id}.html">HTML</a> · <a href="${sample.id}.txt">TXT</a></p>`
    + `<div class="row"><iframe title="Desktop ${escapeHtml(sample.id)}" src="${sample.id}.html" width="680" height="900"></iframe>`
    + `<iframe title="Mobile ${escapeHtml(sample.id)}" src="${sample.id}.html" width="390" height="900"></iframe></div></section>`);
}

writeFileSync(`${outDir}index.html`, `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Xem trước email MUSE</title>
<style>body{font-family:Arial,sans-serif;background:#ddd;margin:24px}section{margin:0 0 48px}.row{display:flex;gap:24px;align-items:flex-start}iframe{border:1px solid #999;background:#fff}code{background:#eee;padding:2px 4px}</style></head>
<body><h1>Xem trước email MUSE</h1><p>Cột trái: desktop (680px). Cột phải: mobile (390px). Dữ liệu giả, không gửi email.</p>${cards.join('')}</body></html>`, 'utf8');

console.log(`Đã ghi ${samples.length} mẫu vào ${outDir} (mở index.html để xem).`);
