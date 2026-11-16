import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { UsersService } from './users.service.js';

const userId = new Types.ObjectId().toString();
const addressId = new Types.ObjectId().toString();

function serviceWith(models: { users?: Record<string, unknown>; addresses?: Record<string, unknown>; media?: Record<string, unknown> }) {
  const connection = { startSession: async () => ({
    withTransaction: async (callback: () => Promise<void>) => callback(), endSession: async () => undefined,
  }) };
  return new UsersService(models.users as never, {} as never, models.addresses as never,
    models.media as never, {} as never, connection as never);
}

describe('UsersService ownership', () => {
  it('only queries an address with both its id and the authenticated customer id', async () => {
    const findOne = vi.fn().mockReturnValue({ exec: async () => null });
    const users = serviceWith({
      users: { findById: () => ({ exec: async () => ({ role: 'CUSTOMER' }) }) },
      addresses: { findOne },
    });

    await expect(users.updateAddress(userId, addressId, { receiver: 'New name' })).rejects.toBeInstanceOf(NotFoundException);
    expect(findOne).toHaveBeenCalledWith({ _id: addressId, customerId: userId });
  });

  it('rejects a staff account before querying customer addresses', async () => {
    const find = vi.fn();
    const users = serviceWith({
      users: { findById: () => ({ exec: async () => ({ role: 'STAFF' }) }) },
      addresses: { find },
    });

    await expect(users.listAddresses(userId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(find).not.toHaveBeenCalled();
  });

  it('updates the current user by principal id and returns only safe profile fields', async () => {
    const findByIdAndUpdate = vi.fn().mockReturnValue({ exec: async () => ({
      _id: userId, email: 'a@example.com', fullName: 'New name', role: 'CUSTOMER', status: 'ACTIVE',
      passwordHash: 'secret', get: () => new Date('2026-01-01'),
    }) });
    const users = serviceWith({ users: {
      findById: () => ({ session: () => ({ exec: async () => ({ avatarMediaId: null }) }) }),
      findByIdAndUpdate,
    } });

    const result = await users.updateProfile(userId, { fullName: 'New name' });
    expect(findByIdAndUpdate).toHaveBeenCalledWith(userId, { $set: { fullName: 'New name' } },
      expect.objectContaining({ new: true, runValidators: true, session: expect.anything() }));
    expect(result).not.toHaveProperty('passwordHash');
    expect(result.id).toBe(userId);
  });

  it('expires the old avatar after seven days in the same transaction as the profile update', async () => {
    const oldAvatar = new Types.ObjectId().toString();
    const newAvatar = new Types.ObjectId().toString();
    const updateOne = vi.fn().mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) });
    const findOne = vi.fn().mockReturnValue({ session: () => ({ exec: async () => ({ status: 'READY' }) }) });
    const updated = { _id: userId, email: 'a@example.com', fullName: 'A', role: 'CUSTOMER',
      status: 'ACTIVE', avatarMediaId: newAvatar, get: () => new Date('2026-01-01') };
    const users = serviceWith({
      users: {
        findById: () => ({ session: () => ({ exec: async () => ({ avatarMediaId: oldAvatar }) }) }),
        findByIdAndUpdate: () => ({ exec: async () => updated }),
      },
      media: { findOne, updateOne },
    });

    await users.updateProfile(userId, { avatarMediaId: newAvatar });
    expect(updateOne).toHaveBeenCalledTimes(2);
    const oldUpdate = updateOne.mock.calls[0];
    expect(oldUpdate[0]).toMatchObject({ _id: oldAvatar, ownerId: userId, status: 'READY' });
    expect(oldUpdate[1].$set.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    expect(oldUpdate[2]).toHaveProperty('session');
    expect(updateOne.mock.calls[1][1]).toEqual({ $unset: { expiresAt: 1 } });
  });
});
