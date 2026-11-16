import { describe, expect, it, vi } from 'vitest';
import { InventoryReservationService } from './inventory-reservation.service.js';

const line = { variantId: 'variant-1', quantity: 1 } as never;

describe('InventoryReservationService', () => {
  it('uses a conditional atomic stock update and writes a reservation ledger entry', async () => {
    const exec = vi.fn().mockResolvedValue({ _id: 'variant-1' });
    const findOneAndUpdate = vi.fn().mockReturnValue({ exec });
    const create = vi.fn().mockResolvedValue([]);
    const service = new InventoryReservationService({} as never,
      { findOneAndUpdate } as never, { create } as never, {} as never);
    const session = {} as never;
    await service.reserveLines([line], 'order-1', 'actor-1', session);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'variant-1', $expr: { $gte: [{ $subtract: ['$stockOnHand', '$reserved'] }, 1] } },
      { $inc: { reserved: 1, version: 1 } }, { new: true, session });
    expect(create.mock.calls[0][0][0]).toMatchObject({ type: 'RESERVE', eventKey: 'inventory.reserve:order-1:variant-1' });
  });

  it('does not write a release ledger entry when reserved stock cannot be decremented', async () => {
    const updateOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }) });
    const create = vi.fn();
    const findOne = vi.fn().mockReturnValue({ session: vi.fn().mockReturnValue({ lean: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }) }) });
    const service = new InventoryReservationService({} as never,
      { updateOne } as never, { create, findOne } as never, {} as never);
    await expect(service.releaseLines('order-1', [line], 'actor-1', 'cancel', {} as never)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
