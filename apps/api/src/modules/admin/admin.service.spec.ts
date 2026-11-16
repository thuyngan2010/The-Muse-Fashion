import { describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminService } from './admin.service.js';

function chain<T>(value: T) {
  return { session: () => ({ exec: async () => value }), exec: async () => value };
}

function fakeConnection() {
  const locks = { updateOne: vi.fn(async () => ({})) };
  const connection = {
    startSession: async () => ({ withTransaction: async (fn: () => Promise<void>) => fn(), endSession: async () => undefined }),
    collection: vi.fn(() => locks),
  };
  return { connection, locks };
}

describe('AdminService invariants', () => {
  it('blocks suspending the last active admin', async () => {
    const userId = new Types.ObjectId().toString();
    const save = vi.fn();
    const users = {
      findById: vi.fn().mockReturnValue(chain({ _id: userId, role: 'ADMIN', status: 'ACTIVE', save })),
      countDocuments: vi.fn().mockReturnValue(chain(0)),
    };
    const audit = { record: vi.fn() };
    const { connection, locks } = fakeConnection();
    const service = new AdminService(connection as never, users as never, {} as never, audit as never, {} as never, {} as never);

    await expect(service.updateUserStatus('actor', userId, 'SUSPENDED')).rejects.toBeInstanceOf(ConflictException);
    expect(save).not.toHaveBeenCalled();
    expect(locks.updateOne).toHaveBeenCalledWith(
      { _id: 'active-admins' }, { $inc: { version: 1 } }, expect.objectContaining({ session: expect.anything() }),
    );
    expect(audit.record).toHaveBeenCalledWith('admin.lock_last_admin_blocked', 'user', userId, 'actor', expect.any(Object), expect.anything());
  });

  it('suspends an admin inside the locked transaction when another admin stays active', async () => {
    const userId = new Types.ObjectId().toString();
    const user = { _id: userId, email: 'a@example.com', fullName: 'A', role: 'ADMIN', status: 'ACTIVE', save: vi.fn() };
    const users = {
      findById: vi.fn().mockReturnValue(chain(user)),
      countDocuments: vi.fn().mockReturnValue(chain(1)),
    };
    const audit = { record: vi.fn() };
    const { connection } = fakeConnection();
    const service = new AdminService(connection as never, users as never, {} as never, audit as never, {} as never, {} as never);

    await expect(service.updateUserStatus('actor', userId, 'SUSPENDED')).resolves.toMatchObject({ status: 'SUSPENDED' });
    expect(user.save).toHaveBeenCalledWith({ session: expect.anything() });
  });
});
