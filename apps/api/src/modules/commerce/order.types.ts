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
