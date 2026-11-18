import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminService } from './admin.service.js';

const lean = <T>(value: T) => ({ lean: () => ({ exec: async () => value }) });
const exec = <T>(value: T) => ({ exec: async () => value });
const ID = new Types.ObjectId();

function build(opts: { users?: Array<Record<string, unknown>>; spend?: Array<Record<string, unknown>>; counts?: Array<{ _id: string; count: number }> } = {}) {
  const find = vi.fn().mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => lean(opts.users ?? []) }) }) });
  const countDocuments = vi.fn().mockReturnValue(exec(opts.users?.length ?? 0));
  const usersAggregate = vi.fn().mockReturnValue(exec(opts.counts ?? []));
  const findById = vi.fn().mockReturnValue(lean(opts.users?.[0] ?? null));
  const orderAggregate = vi.fn().mockReturnValue(exec(opts.spend ?? []));
  const orderFind = vi.fn().mockReturnValue({ sort: () => ({ limit: () => lean([]) }) });
  const addrFindOne = vi.fn().mockReturnValue(lean(null));
  const service = new AdminService({} as never, { find, countDocuments, aggregate: usersAggregate, findById } as never,
    {} as never, {} as never, {} as never, {} as never,
    { aggregate: orderAggregate, find: orderFind } as never, { findOne: addrFindOne } as never);
  return { service, find, usersAggregate, orderAggregate, orderFind, addrFindOne };
}

describe('AdminService.listUsers', () => {
  it('searches name or email with escaped regex and applies status', async () => {
    const { service, find } = build();
    await service.listUsers(1, 20, 'CUSTOMER', { q: 'a.b(', status: 'SUSPENDED' });
    const filter = find.mock.calls[0][0] as { role: string; status: string; $or: Array<Record<string, RegExp>> };
    expect(filter).toMatchObject({ role: 'CUSTOMER', status: 'SUSPENDED' });
    expect(filter.$or.map((c) => Object.keys(c)[0])).toEqual(['fullName', 'email']);
    const re = Object.values(filter.$or[1])[0];
    expect(re.test('XA.B(@x.com')).toBe(true);
    expect(re.test('XAzB(')).toBe(false);
  });

  it('keeps the legacy ACTIVE-only default for a role and lets status=ALL lift it', async () => {
    const { service, find } = build();
    await service.listUsers(1, 20, 'STAFF');
    expect(find.mock.calls[0][0]).toEqual({ role: 'STAFF', status: 'ACTIVE' });
    await service.listUsers(1, 20, 'STAFF', { status: 'ALL' });
    expect(find.mock.calls[1][0]).toEqual({ role: 'STAFF' });
    await service.listUsers(1, 20);
    expect(find.mock.calls[2][0]).toEqual({});
  });

  it('returns zero-filled statusCounts computed without the status filter', async () => {
    const { service, usersAggregate } = build({ counts: [{ _id: 'ACTIVE', count: 5 }, { _id: 'SUSPENDED', count: 1 }] });
    const res = await service.listUsers(1, 20, 'CUSTOMER', { status: 'SUSPENDED' });
    expect(res.statusCounts).toEqual({ ACTIVE: 5, PENDING_VERIFICATION: 0, SUSPENDED: 1 });
    expect(usersAggregate.mock.calls[0][0][0]).toEqual({ $match: { role: 'CUSTOMER' } });
  });

  it('adds orderCount/totalSpent for customers from paid, non-cancelled orders; 0 when none', async () => {
    const other = new Types.ObjectId();
    const { service, orderAggregate } = build({
      users: [{ _id: ID, email: 'a@x.com', fullName: 'A', role: 'CUSTOMER', status: 'ACTIVE' },
        { _id: other, email: 'b@x.com', fullName: 'B', role: 'CUSTOMER', status: 'ACTIVE' }],
      spend: [{ _id: ID, orderCount: 2, totalSpent: 1_250_000 }],
    });
    const res = await service.listUsers(1, 20, 'CUSTOMER');
    expect(res.items[0]).toMatchObject({ orderCount: 2, totalSpent: 1_250_000 });
    expect(res.items[1]).toMatchObject({ orderCount: 0, totalSpent: 0 });
    const match = orderAggregate.mock.calls[0][0][0].$match as { state: { $in: string[] } };
    expect(match.state.$in).toEqual(['CONFIRMED', 'PREPARING', 'SHIPPING', 'DELIVERED']);
  });

  it('does not add spending fields or query orders for staff lists', async () => {
    const { service, orderAggregate } = build({ users: [{ _id: ID, email: 's@x.com', fullName: 'S', role: 'STAFF', status: 'ACTIVE' }] });
    const res = await service.listUsers(1, 20, 'STAFF');
    expect(res.items[0]).not.toHaveProperty('orderCount');
    expect(orderAggregate).not.toHaveBeenCalled();
  });
});

describe('AdminService.getUserDetail', () => {
  it('rejects invalid and unknown ids', async () => {
    await expect(build().service.getUserDetail('bad')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build().service.getUserDetail(String(ID))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns profile, default address and 3 recent orders without secrets', async () => {
    const user = { _id: ID, email: 'a@x.com', fullName: 'A', role: 'CUSTOMER', status: 'ACTIVE', phone: '0900', passwordHash: 'SECRET', tokenVersion: 3 };
    const b = build({ users: [user], spend: [{ _id: ID, orderCount: 1, totalSpent: 500_000 }] });
    b.addrFindOne.mockReturnValue(lean({ _id: new Types.ObjectId(), receiver: 'A', phone: '0900', location: { line1: '1 Lê Lợi', ward: 'P1', district: 'Q1', province: 'HCM' }, isDefault: true }));
    b.orderFind.mockReturnValue({ sort: () => ({ limit: (n: number) => { expect(n).toBe(3); return lean([
      { _id: new Types.ObjectId(), code: 'FC1', state: 'DELIVERED', money: { payableTotal: 500_000 }, items: [{}, {}] }]); } }) });
    const res = await b.service.getUserDetail(String(ID));
    expect(res).toMatchObject({ email: 'a@x.com', orderCount: 1, totalSpent: 500_000,
      defaultAddress: { line1: '1 Lê Lợi', province: 'HCM' }, recentOrders: [{ code: 'FC1', itemCount: 2 }] });
    expect(JSON.stringify(res)).not.toMatch(/SECRET|passwordHash|tokenVersion/);
  });

  it('returns zeros and no address for a customer without orders', async () => {
    const b = build({ users: [{ _id: ID, email: 'n@x.com', fullName: 'N', role: 'CUSTOMER', status: 'ACTIVE' }] });
    const res = await b.service.getUserDetail(String(ID));
    expect(res).toMatchObject({ orderCount: 0, totalSpent: 0, defaultAddress: null, recentOrders: [] });
  });

  it('skips order and address lookups for non-customers', async () => {
    const b = build({ users: [{ _id: ID, email: 's@x.com', fullName: 'S', role: 'STAFF', status: 'ACTIVE' }] });
    const res = await b.service.getUserDetail(String(ID));
    expect(res.orderCount).toBeUndefined();
    expect(b.addrFindOne).not.toHaveBeenCalled();
    expect(b.orderFind).not.toHaveBeenCalled();
  });
});
