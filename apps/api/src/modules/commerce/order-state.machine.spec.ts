import { describe, expect, it } from 'vitest';
import {
  assertAdminTransition,
  customerMayCancel,
  shipmentAllowed,
  staffMayCancel,
} from './order-state.machine.js';

describe('order state machine', () => {
  it('allows the documented fulfillment path when payment succeeded', () => {
    expect(() => assertAdminTransition('PENDING_PAYMENT', 'CONFIRMED', true)).not.toThrow();
    expect(() => assertAdminTransition('CONFIRMED', 'PREPARING', true)).not.toThrow();
    expect(() => assertAdminTransition('PREPARING', 'SHIPPING', true)).not.toThrow();
    expect(() => assertAdminTransition('SHIPPING', 'DELIVERED', true)).not.toThrow();
  });

  it('blocks confirmation without payment and invalid jumps', () => {
    expect(() => assertAdminTransition('PENDING_PAYMENT', 'CONFIRMED', false)).toThrow();
    expect(() => assertAdminTransition('PENDING_PAYMENT', 'SHIPPING', true)).toThrow();
    expect(() => assertAdminTransition('DELIVERED', 'SHIPPING', true)).toThrow();
  });

  it('enforces cancel permissions by role', () => {
    expect(customerMayCancel('PENDING_PAYMENT')).toBe(true);
    expect(customerMayCancel('CONFIRMED')).toBe(false);
    expect(staffMayCancel('PREPARING')).toBe(true);
    expect(staffMayCancel('SHIPPING')).toBe(false);
  });

  it('requires the dedicated cancellation and refund workflows even when paid', () => {
    for (const paid of [false, true]) {
      expect(() => assertAdminTransition('PENDING_PAYMENT', 'CANCELLED', paid)).toThrow();
      expect(() => assertAdminTransition('CONFIRMED', 'CANCEL_PENDING_REFUND', paid)).toThrow();
      expect(() => assertAdminTransition('PREPARING', 'CANCEL_PENDING_REFUND', paid)).toThrow();
      expect(() => assertAdminTransition('CANCEL_PENDING_REFUND', 'CANCELLED', paid)).toThrow();
    }
  });

  it('blocks shipment updates on terminal orders', () => {
    expect(shipmentAllowed('CANCELLED')).toBe(false);
    expect(shipmentAllowed('PENDING_PAYMENT')).toBe(false);
    expect(shipmentAllowed('PREPARING')).toBe(true);
  });
});
