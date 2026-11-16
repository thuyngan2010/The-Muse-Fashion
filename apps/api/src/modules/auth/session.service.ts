import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, type Connection, type ClientSession } from 'mongoose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { AuthSession } from '../users/identity.schemas.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(AuthSession.name) private readonly sessions: Model<AuthSession>,
  ) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(userId: string, persistent = true): Promise<{ refreshToken: string; sessionId: string; persistent: boolean }> {
    const refreshToken = randomBytes(32).toString('hex');
    const familyId = randomUUID();
    await this.sessions.create({
      userId,
      refreshHash: this.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      familyId,
      persistent,
    });
    return { refreshToken, sessionId: familyId, persistent };
  }

  async rotate(refreshToken: string): Promise<{ refreshToken: string; userId: string; sessionId: string; persistent: boolean }> {
    const hash = this.hashToken(refreshToken);
    const rotated = await withCommerceTransaction(this.connection, async (session) => {
      const active = await this.sessions.findOneAndUpdate(
        { refreshHash: hash, revokedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { revokedAt: new Date() } },
        { session, new: false },
      ).exec();
      if (!active) return null;
      const next = randomBytes(32).toString('hex');
      const familyId = active.familyId ?? randomUUID();
      await this.sessions.create([{
        userId: active.userId,
        refreshHash: this.hashToken(next),
        expiresAt: active.expiresAt,
        familyId,
        persistent: active.persistent !== false,
      }], { session });
      return { refreshToken: next, userId: String(active.userId), sessionId: familyId, persistent: active.persistent !== false };
    });
    if (rotated) return rotated;
    const replay = await this.sessions.findOne({ refreshHash: hash }).exec();
    if (replay?.familyId) await this.revokeFamily(replay.familyId);
    throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session revoked or expired' });
  }

  /** Revokes only the session (token family) the refresh token belongs to; other devices stay signed in. */
  async revokeByToken(refreshToken: string): Promise<string | null> {
    const hash = this.hashToken(refreshToken);
    const row = await this.sessions.findOne({ refreshHash: hash }).lean().exec();
    if (!row) return null;
    if (row.familyId) await this.revokeFamily(row.familyId);
    else await this.sessions.updateOne({ _id: row._id, revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
    return String(row.userId);
  }

  async isActive(userId: string, sessionId: string): Promise<boolean> {
    const found = await this.sessions.exists({
      userId, familyId: sessionId, revokedAt: null, expiresAt: { $gt: new Date() },
    }).exec();
    return Boolean(found);
  }

  async revokeAllForUser(userId: string, session?: ClientSession): Promise<void> {
    await this.sessions.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, session ? { session } : {}).exec();
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.sessions.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } }).exec();
  }
}
