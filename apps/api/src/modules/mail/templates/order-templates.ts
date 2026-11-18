import { COLORS, FONT_SANS, FONT_SERIF, infoRows, notice, paragraph } from './components.js';
import { clip, escapeHtml, formatVnd, formatVnDateTime, orderStatusLabel } from './escape.js';
import { composeText, renderEmail, type MailContext } from './layout.js';
import type { EmailMessage } from './account-templates.js';

export interface OrderEmailItem {
  name: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Chỉ dùng khi là URL https công khai. */
  imageUrl?: string;
}

/** Dữ liệu đơn dùng để dựng email; mọi trường đều có thể thiếu. */
export interface OrderEmailData {
  orderId?: string;
  code?: string;
  state?: string;
  createdAt?: Date;
  paymentDueAt?: Date;
  items: OrderEmailItem[];
  money?: { subtotal: number; shippingFee: number; voucherDiscount: number; payableTotal: number };
  voucherCode?: string;
  shipping?: { receiver?: string; phone?: string; address?: string; note?: string };
  carrier?: string;
  trackingCode?: string;
  /** Lý do hủy (nếu có). */
  reason?: string;
}

export interface OrderEmailInput {
  payload: Record<string, unknown>;
  order?: OrderEmailData;
  ctx: MailContext;
}

const num = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};
const str = (value: unknown, max = 300): string => (value === null || value === undefined ? '' : clip(String(value), max));
const asDate = (value: unknown): Date | undefined => {
  const date = value instanceof Date ? value : new Date(typeof value === 'string' || typeof value === 'number' ? value : NaN);
  return Number.isNaN(date.getTime()) ? undefined : date;
};
const isPublicHttps = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/.test(value);

/** Chuyển bản ghi đơn (đọc từ Mongo, dạng lean) thành dữ liệu email. Không ném lỗi với dữ liệu thiếu. */
export function mapOrderDocument(
  raw: Record<string, unknown>,
  extras: {
    variants?: Map<string, { color?: string; size?: string }>;
    shipment?: { carrier?: string; trackingCode?: string } | null;
    reason?: string;
  } = {},
): OrderEmailData {
  const rawItems = Array.isArray(raw.items) ? raw.items as Array<Record<string, unknown>> : [];
  const items = rawItems.map((item): OrderEmailItem => {
    const variant = extras.variants?.get(String(item.variantId ?? ''));
    const quantity = Math.max(1, Math.round(num(item.quantity)) || 1);
    const unitPrice = num(item.unitPrice);
    return {
      name: str(item.productName, 160) || 'Sản phẩm',
      variant: [variant?.color, variant?.size].map((part) => str(part, 40)).filter(Boolean).join(' / ') || undefined,
      quantity,
      unitPrice,
      lineTotal: item.lineTotal === undefined ? unitPrice * quantity : num(item.lineTotal),
      imageUrl: isPublicHttps(item.imageUrl) ? item.imageUrl : undefined,
    };
  });
  const rawMoney = (raw.money ?? undefined) as Record<string, unknown> | undefined;
  const snapshot = (raw.shippingSnapshot ?? undefined) as Record<string, unknown> | undefined;
  const location = (snapshot?.location ?? undefined) as Record<string, unknown> | undefined;
  const address = [location?.line1, location?.ward, location?.district, location?.province].map((part) => str(part, 120)).filter(Boolean).join(', ');
  return {
    orderId: raw._id ? String(raw._id) : undefined,
    code: str(raw.code, 60) || undefined,
    state: str(raw.state, 40) || undefined,
    createdAt: asDate(raw.createdAt),
    paymentDueAt: asDate(raw.paymentDueAt),
    items,
    money: rawMoney ? {
      subtotal: num(rawMoney.subtotal), shippingFee: num(rawMoney.shippingFee),
      voucherDiscount: num(rawMoney.voucherDiscount), payableTotal: num(rawMoney.payableTotal),
    } : undefined,
    voucherCode: str(raw.voucherCode ?? rawMoney?.voucherCode, 60) || undefined,
    shipping: snapshot ? {
      receiver: str(snapshot.receiver, 120) || undefined, phone: str(snapshot.phone, 40) || undefined,
      address: address || undefined, note: str(snapshot.note, 300) || undefined,
    } : undefined,
    carrier: str(extras.shipment?.carrier, 80) || undefined,
    trackingCode: str(extras.shipment?.trackingCode, 80) || undefined,
    reason: reasonLabel(extras.reason),
  };
}

function reasonLabel(reason: unknown): string | undefined {
  const text = str(reason, 300);
  if (!text) return undefined;
  if (text === 'PAYMENT_EXPIRED') return 'Quá hạn thanh toán';
  if (text === 'Order created' || text === 'Payment succeeded') return undefined;
  return text;
}

interface View {
  orderId?: string;
  code?: string;
  /** "#MÃ" hoặc undefined khi không biết đơn nào. */
  ref?: string;
  order?: OrderEmailData;
}

function view(payload: Record<string, unknown>, order: OrderEmailData | undefined): View {
  const orderId = str(order?.orderId ?? payload.orderId, 80) || undefined;
  const code = str(order?.code ?? payload.code, 60) || undefined;
  const ref = code ?? (orderId ? orderId.slice(-8).toUpperCase() : undefined);
  return { orderId, code, ref: ref ? `#${ref}` : undefined, order };
}

const orderUrl = (ctx: MailContext, v: View, query = ''): string =>
  v.orderId ? `${ctx.baseUrl}/orders/${encodeURIComponent(v.orderId)}${query}` : `${ctx.baseUrl}/orders`;
const paymentUrl = (ctx: MailContext, v: View): string =>
  v.orderId ? `${ctx.baseUrl}/payment/${encodeURIComponent(v.orderId)}` : `${ctx.baseUrl}/orders`;
const tag = (v: View): string => (v.ref ? `đơn ${v.ref}` : 'đơn hàng của bạn');

// ---------- Khối HTML riêng cho email đơn ----------

function itemsList(items: OrderEmailItem[]): string {
  if (!items.length) return '';
  const rows = items.map((item, index) => {
    const border = index === items.length - 1 ? '' : `border-bottom:1px solid ${COLORS.lineSoft};`;
    const image = isPublicHttps(item.imageUrl)
      ? `<td width="76" valign="top" style="padding:14px 12px 14px 0;${border}"><img src="${escapeHtml(item.imageUrl)}" width="64" height="64" alt="${escapeHtml(item.name)}" style="display:block;border:0;width:64px;height:64px;"></td>`
      : '';
    const variant = item.variant
      ? `<div style="font-family:${FONT_SANS};font-size:12px;line-height:18px;color:${COLORS.subtle};">${escapeHtml(item.variant)}</div>` : '';
    return `<tr>${image}<td valign="top" style="padding:14px 8px 14px 0;${border}">`
      + `<div style="font-family:${FONT_SANS};font-size:14px;line-height:20px;font-weight:600;color:${COLORS.ink};word-break:break-word;">${escapeHtml(item.name)}</div>${variant}`
      + `<div style="font-family:${FONT_SANS};font-size:12px;line-height:18px;color:${COLORS.subtle};">SL ${item.quantity} × ${escapeHtml(formatVnd(item.unitPrice))}</div></td>`
      + `<td valign="top" align="right" width="110" style="padding:14px 0;${border}font-family:${FONT_SANS};font-size:14px;line-height:20px;font-weight:600;color:${COLORS.ink};">${escapeHtml(formatVnd(item.lineTotal))}</td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;border-top:1px solid ${COLORS.lineSoft};">${rows}</table>`;
}

function sectionLabel(text: string): string {
  return `<div style="margin:0 0 8px 0;font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.accent};">${escapeHtml(text)}</div>`;
}

function moneyBlock(money: NonNullable<OrderEmailData['money']>, voucherCode?: string): string {
  const line = (label: string, value: string, color: string = COLORS.inkSoft) =>
    `<tr><td style="padding:4px 0;font-family:${FONT_SANS};font-size:13px;line-height:20px;color:${COLORS.inkSoft};">${escapeHtml(label)}</td>`
    + `<td align="right" style="padding:4px 0;font-family:${FONT_SANS};font-size:13px;line-height:20px;color:${color};">${escapeHtml(value)}</td></tr>`;
  const rows = [
    line('Tạm tính', formatVnd(money.subtotal)),
    line('Phí vận chuyển', money.shippingFee === 0 ? 'Miễn phí' : formatVnd(money.shippingFee)),
    money.voucherDiscount > 0
      ? line(voucherCode ? `Voucher (${voucherCode})` : 'Voucher', `-${formatVnd(money.voucherDiscount)}`, COLORS.price) : '',
  ].join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">${rows}`
    + `<tr><td colspan="2" style="padding:12px 0 0 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="padding:14px 0 0 0;border-top:1px solid ${COLORS.ink};font-family:${FONT_SANS};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.ink};">TỔNG THANH TOÁN</td>`
    + `<td align="right" style="padding:14px 0 0 0;border-top:1px solid ${COLORS.ink};font-family:${FONT_SERIF};font-size:24px;line-height:30px;color:${COLORS.price};">${escapeHtml(formatVnd(money.payableTotal))}</td>`
    + `</tr></table></td></tr></table>`;
}

const STEP_LABELS = ['Đặt hàng', 'Xác nhận', 'Chuẩn bị', 'Đang giao', 'Đã giao'];
const STEP_INDEX: Record<string, number> = { PENDING_PAYMENT: 0, CONFIRMED: 1, PREPARING: 2, SHIPPING: 3, DELIVERED: 4 };

function progressBar(current: number): string {
  const cells = STEP_LABELS.map((label, index) => {
    const [bg, fg] = index < current ? [COLORS.ink, COLORS.white] : index === current ? [COLORS.pink, COLORS.ink] : [COLORS.outer, COLORS.subtle];
    return `<td width="20%" align="center" bgcolor="${bg}" style="background-color:${bg};border-right:2px solid ${COLORS.white};padding:12px 2px;`
      + `font-family:${FONT_SANS};font-size:10px;line-height:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:${fg};">${escapeHtml(label)}</td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr>${cells}</tr></table>`;
}

function progressText(current: number): string {
  return `Tiến trình: ${STEP_LABELS.map((label, index) => (index < current ? `✓ ${label}` : index === current ? `● ${label}` : label)).join(' → ')}`;
}

function checkBadge(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px 0;"><tr>`
    + `<td width="56" height="56" align="center" valign="middle" bgcolor="${COLORS.success}" style="width:56px;height:56px;background-color:${COLORS.success};border-radius:28px;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:56px;color:${COLORS.white};">&#10003;</td></tr></table>`;
}

function itemsText(items: OrderEmailItem[]): string {
  return items.map((item) => `- ${item.name}${item.variant ? ` (${item.variant})` : ''} × ${item.quantity}: ${formatVnd(item.lineTotal)}`).join('\n');
}

function moneyText(money: NonNullable<OrderEmailData['money']>, voucherCode?: string): string {
  return [
    `Tạm tính: ${formatVnd(money.subtotal)}`,
    `Phí vận chuyển: ${money.shippingFee === 0 ? 'Miễn phí' : formatVnd(money.shippingFee)}`,
    money.voucherDiscount > 0 ? `Voucher${voucherCode ? ` (${voucherCode})` : ''}: -${formatVnd(money.voucherDiscount)}` : '',
    `TỔNG THANH TOÁN: ${formatVnd(money.payableTotal)}`,
  ].filter(Boolean).join('\n');
}

// ---------- Các mẫu ----------

export function buildOrderCreatedEmail({ payload, order, ctx }: OrderEmailInput): EmailMessage {
  const v = view(payload, order);
  const created = formatVnDateTime(order?.createdAt);
  // Đơn vừa tạo luôn ở trạng thái chờ thanh toán; thiếu dữ liệu đơn thì coi là chờ thanh toán.
  const state = order?.state ?? 'PENDING_PAYMENT';
  const pending = state === 'PENDING_PAYMENT';
  const money = order?.money ?? (payload.payableTotal === undefined ? undefined
    : { subtotal: num(payload.payableTotal), shippingFee: 0, voucherDiscount: 0, payableTotal: num(payload.payableTotal) });
  const showBreakdown = Boolean(order?.money);
  const shipping = order?.shipping;
  const dueAt = order?.paymentDueAt ?? asDate(payload.paymentDueAt);
  const noticeLines = ['Đơn hàng sẽ được xử lý sau khi thanh toán qua VietQR.'];
  if (dueAt) noticeLines.push(`Vui lòng thanh toán trước ${formatVnDateTime(dueAt)}.`);
  const intro = 'MUSE đã nhận đơn hàng của bạn và sẽ thông báo khi đơn có cập nhật.';

  const body = infoRows([
    { label: 'Mã đơn', value: v.ref },
    { label: 'Ngày đặt', value: created },
    { label: 'Trạng thái', value: orderStatusLabel(state) },
  ])
    + (order?.items.length ? sectionLabel('Sản phẩm') + itemsList(order.items) : '')
    + (money ? (showBreakdown ? moneyBlock(money, order?.voucherCode) : moneyBlock(money)) : '')
    + (shipping && (shipping.receiver || shipping.address)
      ? sectionLabel('Giao hàng đến') + infoRows([
        { label: 'Người nhận', value: shipping.receiver }, { label: 'Điện thoại', value: shipping.phone },
        { label: 'Địa chỉ', value: shipping.address }, { label: 'Ghi chú', value: shipping.note },
      ]) : '')
    + (pending ? notice(noticeLines, 'pink', 'Chờ thanh toán') : '');

  const viewLink = { label: 'XEM ĐƠN HÀNG', href: orderUrl(ctx, v) };
  const payLink = { label: 'THANH TOÁN NGAY', href: paymentUrl(ctx, v) };
  const textBlocks: Array<string | false | undefined> = [
    'CẢM ƠN BẠN ĐÃ ĐẶT HÀNG', intro,
    [v.ref && `Mã đơn: ${v.ref}`, `Ngày đặt: ${created}`, `Trạng thái: ${orderStatusLabel(state)}`].filter(Boolean).join('\n'),
    order?.items.length ? `Sản phẩm:\n${itemsText(order.items)}` : undefined,
    money && (showBreakdown ? moneyText(money, order?.voucherCode) : moneyText(money)),
    shipping && (shipping.receiver || shipping.address)
      ? `Giao hàng đến:\n${[shipping.receiver && `Người nhận: ${shipping.receiver}`, shipping.phone && `Điện thoại: ${shipping.phone}`,
        shipping.address && `Địa chỉ: ${shipping.address}`, shipping.note && `Ghi chú: ${shipping.note}`].filter(Boolean).join('\n')}`
      : undefined,
    pending && noticeLines.join('\n'),
    pending && `Thanh toán ngay: ${payLink.href}`,
    `Xem đơn hàng: ${viewLink.href}`,
  ];
  return {
    subject: v.ref ? `MUSE đã nhận đơn hàng ${v.ref}` : 'MUSE đã nhận đơn hàng của bạn',
    html: renderEmail({
      preheader: v.ref ? `Đơn ${v.ref} đã được ghi nhận.` : 'Đơn hàng của bạn đã được ghi nhận.',
      eyebrow: 'XÁC NHẬN ĐƠN HÀNG',
      title: 'Cảm ơn bạn đã đặt hàng',
      intro,
      bodyHtml: body,
      cta: pending ? payLink : viewLink,
      secondaryCta: pending ? viewLink : undefined,
    }, ctx),
    text: composeText(textBlocks, ctx),
  };
}

interface StatusCopy { subject: (t: string) => string; title: string; intro: string }

const STATUS_COPY: Record<string, StatusCopy> = {
  CONFIRMED: { subject: (t) => `${cap(t)} đã được xác nhận`, title: 'Đơn hàng đã được xác nhận', intro: 'MUSE đã xác nhận đơn hàng của bạn và sẽ sớm chuẩn bị hàng.' },
  PREPARING: { subject: (t) => `MUSE đang chuẩn bị ${t}`, title: 'MUSE đang chuẩn bị đơn hàng', intro: 'Đơn hàng của bạn đang được đóng gói cẩn thận.' },
  SHIPPING: { subject: (t) => `${cap(t)} đang trên đường giao đến bạn`, title: 'Đơn hàng đang trên đường giao', intro: 'Đơn hàng của bạn đã được bàn giao cho đơn vị vận chuyển.' },
  DELIVERED: { subject: (t) => `${cap(t)} đã giao thành công`, title: 'Đơn hàng đã giao thành công', intro: 'Cảm ơn bạn đã mua sắm tại MUSE. Hy vọng bạn yêu thích sản phẩm.' },
  CANCELLED: { subject: (t) => `${cap(t)} đã được hủy`, title: 'Đơn hàng đã được hủy', intro: 'Đơn hàng của bạn đã được hủy.' },
  CANCEL_PENDING_REFUND: { subject: (t) => `${cap(t)} đang chờ hoàn tiền`, title: 'Đơn hàng đang chờ hoàn tiền', intro: 'Đơn hàng đã được hủy sau khi thanh toán. MUSE đang xử lý hoàn tiền cho bạn.' },
};

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function buildOrderStatusEmail({ payload, order, ctx }: OrderEmailInput): EmailMessage {
  const v = view(payload, order);
  const to = str(payload.to, 40).toUpperCase() || order?.state || '';
  const copy = STATUS_COPY[to];
  const statusLabel = orderStatusLabel(to);
  const subject = copy ? copy.subject(tag(v)) : `Cập nhật ${tag(v)}`;
  const title = copy?.title ?? 'Đơn hàng có cập nhật mới';
  const intro = copy?.intro ?? `Trạng thái đơn hàng của bạn: ${statusLabel}.`;
  const stepIndex = STEP_INDEX[to];
  const cancelled = to === 'CANCELLED' || to === 'CANCEL_PENDING_REFUND';
  const reason = order?.reason;
  const shipping = to === 'SHIPPING';
  const delivered = to === 'DELIVERED';

  const rows = infoRows([
    { label: 'Mã đơn', value: v.ref },
    { label: 'Trạng thái', value: statusLabel },
    { label: 'Đơn vị vận chuyển', value: shipping ? order?.carrier : undefined },
    { label: 'Mã vận đơn', value: shipping ? order?.trackingCode : undefined },
  ]);
  const cancelNotice = cancelled
    ? notice([
      reason ? `Lý do: ${reason}` : 'Đơn hàng không còn được xử lý.',
      to === 'CANCEL_PENDING_REFUND' ? 'Khoản hoàn tiền sẽ được thông báo qua email khi hoàn tất.' : '',
    ].filter(Boolean), 'pink', to === 'CANCELLED' ? 'Đơn đã hủy' : 'Chờ hoàn tiền') : '';
  const review = delivered ? paragraph(escapeHtml('Chia sẻ cảm nhận của bạn để giúp MUSE và những khách hàng khác chọn được trang phục phù hợp.')) : '';
  const body = (stepIndex !== undefined && !cancelled ? progressBar(stepIndex) : '') + cancelNotice + rows + review;
  const cta = delivered
    ? { label: 'ĐÁNH GIÁ SẢN PHẨM', href: orderUrl(ctx, v, '?action=review') }
    : { label: 'XEM ĐƠN HÀNG', href: orderUrl(ctx, v) };
  const secondary = delivered ? { label: 'XEM ĐƠN HÀNG', href: orderUrl(ctx, v) } : undefined;

  return {
    subject,
    html: renderEmail({
      preheader: `${cap(tag(v))}: ${statusLabel}.`,
      eyebrow: 'CẬP NHẬT ĐƠN HÀNG',
      title,
      intro,
      bodyHtml: body,
      cta,
      secondaryCta: secondary,
    }, ctx),
    text: composeText([
      title.toUpperCase(), intro,
      stepIndex !== undefined && !cancelled && progressText(stepIndex),
      cancelled && (reason ? `Lý do: ${reason}` : 'Đơn hàng không còn được xử lý.'),
      [v.ref && `Mã đơn: ${v.ref}`, `Trạng thái: ${statusLabel}`,
        shipping && order?.carrier && `Đơn vị vận chuyển: ${order.carrier}`,
        shipping && order?.trackingCode && `Mã vận đơn: ${order.trackingCode}`].filter(Boolean).join('\n'),
      delivered && 'Chia sẻ cảm nhận của bạn để giúp MUSE và những khách hàng khác chọn được trang phục phù hợp.',
      `${cta.label === 'XEM ĐƠN HÀNG' ? 'Xem đơn hàng' : 'Đánh giá sản phẩm'}: ${cta.href}`,
      secondary && `Xem đơn hàng: ${secondary.href}`,
    ], ctx),
  };
}

export function buildPaymentSucceededEmail({ payload, order, ctx }: OrderEmailInput): EmailMessage {
  const v = view(payload, order);
  const amount = formatVnd(payload.amount ?? order?.money?.payableTotal);
  const when = formatVnDateTime(payload.paidAt);
  const intro = 'MUSE sẽ chuẩn bị đơn hàng và thông báo khi giao cho đơn vị vận chuyển.';
  const cta = { label: 'XEM ĐƠN HÀNG', href: orderUrl(ctx, v) };
  return {
    subject: v.ref ? `Thanh toán thành công cho đơn ${v.ref}` : 'Thanh toán thành công cho đơn hàng của bạn',
    html: renderEmail({
      preheader: `Đã nhận ${amount} cho ${tag(v)}.`,
      heroHtml: checkBadge(),
      eyebrow: 'THANH TOÁN',
      title: 'Thanh toán đã được xác nhận',
      intro,
      bodyHtml: infoRows([
        { label: 'Số tiền', value: amount }, { label: 'Phương thức', value: 'Chuyển khoản VietQR' },
        { label: 'Thời gian', value: when }, { label: 'Mã đơn', value: v.ref },
      ]),
      cta,
    }, ctx),
    text: composeText([
      'THANH TOÁN ĐÃ ĐƯỢC XÁC NHẬN', intro,
      [`Số tiền: ${amount}`, 'Phương thức: Chuyển khoản VietQR', `Thời gian: ${when}`, v.ref && `Mã đơn: ${v.ref}`].filter(Boolean).join('\n'),
      `Xem đơn hàng: ${cta.href}`,
    ], ctx),
  };
}

export function buildRefundSucceededEmail({ payload, order, ctx }: OrderEmailInput): EmailMessage {
  const v = view(payload, order);
  const amount = formatVnd(payload.amount);
  const reference = str(payload.bankReference, 80) || undefined;
  const when = formatVnDateTime(payload.refundedAt);
  const intro = 'MUSE đã hoàn tiền cho đơn hàng của bạn.';
  const note = 'Tiền có thể mất 1–3 ngày làm việc để hiện trong tài khoản, tùy ngân hàng.';
  const cta = v.orderId ? { label: 'XEM ĐƠN HÀNG', href: orderUrl(ctx, v) } : undefined;
  return {
    subject: v.ref ? `MUSE đã hoàn tiền cho đơn ${v.ref}` : 'MUSE đã hoàn tiền cho đơn hàng của bạn',
    html: renderEmail({
      preheader: `Đã hoàn ${amount} cho ${tag(v)}.`,
      eyebrow: 'HOÀN TIỀN',
      title: 'Hoàn tiền thành công',
      intro,
      bodyHtml: infoRows([
        { label: 'Số tiền hoàn', value: amount }, { label: 'Mã tham chiếu ngân hàng', value: reference },
        { label: 'Thời gian', value: when }, { label: 'Mã đơn', value: v.ref },
      ]) + notice([note], 'gray'),
      cta,
    }, ctx),
    text: composeText([
      'HOÀN TIỀN THÀNH CÔNG', intro,
      [`Số tiền hoàn: ${amount}`, reference && `Mã tham chiếu ngân hàng: ${reference}`, `Thời gian: ${when}`, v.ref && `Mã đơn: ${v.ref}`].filter(Boolean).join('\n'),
      note,
      cta && `Xem đơn hàng: ${cta.href}`,
    ], ctx),
  };
}

export const ORDER_TEMPLATES: Record<string, (input: OrderEmailInput) => EmailMessage> = {
  'order.created': buildOrderCreatedEmail,
  'order.status_changed': buildOrderStatusEmail,
  'payment.succeeded': buildPaymentSucceededEmail,
  'refund.succeeded': buildRefundSucceededEmail,
};
