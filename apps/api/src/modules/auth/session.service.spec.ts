import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { SessionService } from './session.service.js';

describe('SessionService rotation', () => {
  it('revokes the token family when a rotated refresh token is replayed', async () => {
    const familyId = 'family-1';
    const connection = { startSession: async () => ({ withTransaction: async (fn: () => Promise<void>) => fn(), endSession: async () => undefined }) };
    const oldHash = new SessionService(connection as never, {} as never).hashToken('old-token');
    const sessions = {
      findOneAndUpdate: vi.fn().mockReturnValue({ exec: async () => null }),
      findOne: vi.fn()
        .mockReturnValueOnce({ exec: async () => ({ familyId, refreshHash: oldHash }) }),
      updateMany: vi.fn().mockReturnValue({ exec: async () => ({}) }),
    };
    const service = new SessionService(connection as never, sessions as never);

    await expect(service.rotate('old-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessions.updateMany).toHaveBeenCalledWith({ familyId, revokedAt: null }, { $set: { revokedAt: expect.any(Date) } });
  });
});
