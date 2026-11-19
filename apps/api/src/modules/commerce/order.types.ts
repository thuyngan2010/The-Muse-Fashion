import { randomBytes } from 'node:crypto';

export type OrderLineSnapshot = {
  lineId: string;
  productId: string;
  variantId: string;
  sku: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
};

export type OrderMoney = {
  subtotal: number;
  shippingFee: number;
  voucherDiscount: number;
  payableTotal: number;
  voucherCode?: string;
};

export type OrderDocLike = {
  _id: unknown;
  code: string;
  state: string;
  money: Record<string, number>;
  paymentDueAt?: Date;
  createdAt?: Date;
};

export function serializeOrder(order: OrderDocLike) {
  return {
    id: String(order._id),
    code: order.code,
    state: order.state,
    money: {
      subtotal: order.money.subtotal ?? 0,
      shippingFee: order.money.shippingFee ?? 0,
      voucherDiscount: order.money.voucherDiscount ?? 0,
      payableTotal: order.money.payableTotal ?? 0,
    },
    paymentDueAt: order.paymentDueAt?.toISOString(),
    createdAt: order.createdAt?.toISOString(),
  };
}

/**
 * Các dòng giỏ hàng được chọn để thanh toán. Không truyền variantIds thì lấy cả giỏ (hành vi cũ).
 * Trả null khi có mã biến thể không còn trong giỏ.
 */
export function selectCartLines<T extends { variantId: string; quantity: number; unitPrice: number }>(
  items: T[], variantIds?: string[] | null,
): { items: T[]; subtotal: number } | null {
  const sum = (lines: T[]) => lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
  if (!variantIds) return { items, subtotal: sum(items) };
  const wanted = new Set(variantIds.map(String));
  const picked = items.filter((item) => wanted.has(String(item.variantId)));
  if (!picked.length || picked.length !== wanted.size) return null;
  return { items: picked, subtotal: sum(picked) };
}

export function cartFingerprint(items: Array<{ variantId: string; quantity: number }>): string {
  return [...items]
    .map((item) => `${item.variantId}:${item.quantity}`)
    .sort()
    .join('|');
}

export function generateOrderCode(): string {
  const suffix = randomBytes(6).toString('hex').toUpperCase();
  return `FC${Date.now().toString(36).toUpperCase()}${suffix}`;
}
