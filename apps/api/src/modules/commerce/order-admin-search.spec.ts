import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { OrderService } from './order.service.js';

const OID = '64b7f0c2a1b2c3d4e5f60718';

function build(scope: 'GLOBAL' | 'ASSIGNED' | null = 'GLOBAL') {
  const find = vi.fn().mockReturnValue({
    sort: () => ({ skip: () => ({ limit: () => ({ lean: () => ({ exec: async () => [] }) }) }) }),
  });
  const countDocuments = vi.fn().mockReturnValue({ exec: async () => 0 });
  const users = { permissionScope: vi.fn().mockResolvedValue(scope) };
  const args = new Array(16).fill({} as never);
  args[1] = { find, countDocuments };
  args[15] = users;
  const service = new (OrderService as unknown as new (...a: unknown[]) => OrderService)(...args);
  return { service, find, countDocuments, users };
}

describe('OrderService.listAdminOrders search', () => {
  it('searches code, receiver and phone case-insensitively with escaped input', async () => {
    const { service, find } = build();
    await service.listAdminOrders({ sub: 'a1', role: 'ADMIN' }, undefined, 1, 20, { q: 'a.b(' });
    const filter = find.mock.calls[0][0] as { $or: Array<Record<string, RegExp>> };
    expect(filter.$or.map((c) => Object.keys(c)[0])).toEqual(['code', 'shippingSnapshot.receiver', 'shippingSnapshot.phone']);
    const re = Object.values(filter.$or[0])[0];
    expect(re.flags).toContain('i');
    expect(re.test('xA.B(y')).toBe(true);
    expect(re.test('xAzB(y')).toBe(false);
  });

  it('filters by customerId and returns nothing for an invalid id', async () => {
    const { service, find } = build();
    await service.listAdminOrders({ sub: 'a1', role: 'ADMIN' }, 'PAID', 1, 20, { customerId: OID });
    expect(find.mock.calls[0][0]).toMatchObject({ state: 'PAID', customerId: OID });
    find.mockClear();
    const res = await service.listAdminOrders({ sub: 'a1', role: 'ADMIN' }, undefined, 1, 20, { customerId: 'bad' });
    expect(res.total).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });

  it('keeps the ASSIGNED scope when searching', async () => {
    const { service, find } = build('ASSIGNED');
    await service.listAdminOrders({ sub: 'staff1', role: 'STAFF' }, undefined, 1, 20, { q: 'abc', customerId: OID });
    expect(find.mock.calls[0][0]).toMatchObject({ assignedStaffId: 'staff1', customerId: OID });
  });

  it('still rejects staff without order.read', async () => {
    const { service } = build(null);
    await expect(service.listAdminOrders({ sub: 's', role: 'STAFF' }, undefined, 1, 20, { q: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('works without search params (old callers)', async () => {
    const { service, find } = build();
    await service.listAdminOrders({ sub: 'a1', role: 'ADMIN' }, undefined, 1, 20);
    expect(find.mock.calls[0][0]).toEqual({});
  });
});
