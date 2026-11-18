import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { InventoryService } from './inventory.service.js';

describe('InventoryService.listLedger', () => {
  it('adds actorName from the user directory and null when unknown', async () => {
    const known = new Types.ObjectId(), unknown = new Types.ObjectId();
    const rows = [
      { _id: new Types.ObjectId(), variantId: new Types.ObjectId(), type: 'ADJUST', quantity: 3, eventKey: 'a', actorId: known, reason: 'Nhập kho' },
      { _id: new Types.ObjectId(), variantId: null, type: 'RESERVE', quantity: -1, eventKey: 'b', actorId: unknown, reason: '' },
    ];
    const ledger = { find: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: () => ({ exec: async () => rows }) }) }) }) }), countDocuments: () => ({ exec: async () => 2 }) };
    const users = { displayNames: async () => new Map([[String(known), 'Trần Bình']]) };
    const service = new InventoryService({} as never, {} as never, {} as never, ledger as never, {} as never, {} as never, users as never);
    const res = await service.listLedger();
    expect(res.items.map((i) => i.actorName)).toEqual(['Trần Bình', null]);
    expect(JSON.stringify(res)).not.toMatch(/passwordHash|email/);
  });
});
