export const ORDER_STATES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'SHIPPING',
  'DELIVERED',
  'CANCEL_PENDING_REFUND',
  'CANCELLED',
] as const;

export type OrderState = (typeof ORDER_STATES)[number];

const ADMIN_TRANSITIONS: Record<OrderState, OrderState[]> = {
  // Cancellation and refund completion use their own transactional workflows.
  PENDING_PAYMENT: ['CONFIRMED'],
  CONFIRMED: ['PREPARING'],
  PREPARING: ['SHIPPING'],
  SHIPPING: ['DELIVERED'],
  DELIVERED: [],
  CANCEL_PENDING_REFUND: [],
  CANCELLED: [],
};

export function assertAdminTransition(from: OrderState, to: OrderState, paymentSucceeded: boolean): void {
  if (!ADMIN_TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid order transition from ${from} to ${to}`);
  }
  if (to === 'CONFIRMED' && !paymentSucceeded) {
    throw new Error('Order cannot be confirmed without a succeeded payment');
  }
}

export function customerMayCancel(state: OrderState): boolean {
  return state === 'PENDING_PAYMENT';
}

export function staffMayCancel(state: OrderState): boolean {
  return state === 'PENDING_PAYMENT' || state === 'CONFIRMED' || state === 'PREPARING';
}

export function shipmentAllowed(state: OrderState): boolean {
  return state === 'CONFIRMED' || state === 'PREPARING' || state === 'SHIPPING';
}
