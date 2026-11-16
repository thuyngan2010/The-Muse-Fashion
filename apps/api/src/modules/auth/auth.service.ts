import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, type Connection } from 'mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, needsPasswordUpgrade } from './password.util.js';
import type { Request } from 'express';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { UsersService } from '../users/users.service.js';
import { EmailDispatchService } from '../mail/email-dispatch.service.js';
import { EmailToken } from '../users/identity.schemas.js';
import type { UserDocument } from '../users/user.schema.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './auth.dto.js';
import { SessionService } from './session.service.js';

const GENERIC_RESET_MESSAGE = 'If an account exists for that email, password reset instructions were sent.';
const GENERIC_RESEND_MESSAGE = 'If an account requires verification, a new email has been queued.';
const dummyPasswordHash = hashPassword('nonexistent-account-password');

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly dispatch: EmailDispatchService,
    private readonly sessions: SessionService,
    private readonly rateLimit: RateLimitService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(EmailToken.name) private readonly emailTokens: Model<EmailToken>,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    if (await this.users.findByEmail(email)) throw new ConflictException('Email is already registered');
    const token = randomBytes(32).toString('hex');
    const passwordHash = await hashPassword(dto.password);
    try {
      return await withCommerceTransaction(this.connection, async (session) => {
        const [created] = await this.users.model.create([{
          email,
          fullName: dto.fullName,
          passwordHash,
          role: 'CUSTOMER',
          status: 'PENDING_VERIFICATION',
          verificationTokenHash: createHash('sha256').update(token).digest('hex'),
          verificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }], { session });
        await this.dispatch.enqueue('user.verify_email', email, `user.verify_email:${String(created._id)}:1`, { token }, session);
        return { id: String(created._id), message: 'Verification email queued' };
      });
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000
        && 'keyPattern' in error && typeof error.keyPattern === 'object' && error.keyPattern
        && 'email' in error.keyPattern) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async resendVerification(emailRaw: string, req: Request) {
    const email = emailRaw.toLowerCase().trim();
    const ip = req.ip || 'unknown';
    await this.rateLimit.consume(`resend:${ip}:${email}`, 3, 60 * 60 * 1000);
    const user = await this.users.findByEmail(email);
    if (user?.status === 'PENDING_VERIFICATION') {
      const token = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await withCommerceTransaction(this.connection, async (session) => {
        const updated = await this.users.model.findOneAndUpdate(
          { _id: user._id, status: 'PENDING_VERIFICATION' },
          { $set: { verificationTokenHash: tokenHash, verificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000) } },
          { session, new: true },
        ).exec();
        if (updated) await this.dispatch.enqueue('user.verify_email', email,
          `user.verify_email:${String(updated._id)}:${tokenHash}`, { token }, session);
      });
    }
    return { message: GENERIC_RESEND_MESSAGE };
  }

  async verifyEmail(token: string) {
    const hashValue = createHash('sha256').update(token).digest('hex');
    const result = await this.users.model.findOneAndUpdate(
      { verificationTokenHash: hashValue, verificationExpiresAt: { $gt: new Date() }, status: 'PENDING_VERIFICATION' },
      { $set: { status: 'ACTIVE', emailVerifiedAt: new Date() }, $unset: { verificationTokenHash: 1, verificationExpiresAt: 1 } },
      { new: true },
    );
    if (!result) throw new BadRequestException('Verification token invalid or expired');
    return { verified: true };
  }

  async login(dto: LoginDto, req: Request) {
    const email = dto.email.toLowerCase().trim();
    const ip = req.ip || 'unknown';
    const limitKey = `login:${ip}:${email}`;
    await this.rateLimit.assertAllowed(limitKey, 5);
    const user = await this.users.findByEmail(email);
    const passwordMatches = await verifyPassword(dto.password, user?.passwordHash ?? await dummyPasswordHash);
    if (!user || !passwordMatches) {
      await this.rateLimit.consume(limitKey, 5, 15 * 60 * 1000);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }
    if (user.status !== 'ACTIVE' || !user.emailVerifiedAt) throw new UnauthorizedException('Account must be active and verified');
    await this.rateLimit.assertAllowed(limitKey, 5);
    await this.rateLimit.reset(limitKey);
    if (needsPasswordUpgrade(user.passwordHash)) {
      await this.users.model.updateOne({ _id: user._id, passwordHash: user.passwordHash },
        { $set: { passwordHash: await hashPassword(dto.password) } }).exec();
    }
    return this.issueSession(user, dto.remember ?? true);
  }

  async refresh(refreshToken: string) {
    const rotated = await this.sessions.rotate(refreshToken);
    const user = await this.users.findById(rotated.userId);
    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) throw new UnauthorizedException('Account unavailable');
    const expiresIn = 3600;
    const accessToken = await this.signAccessToken(user, rotated.sessionId, expiresIn);
    return { accessToken, tokenType: 'Bearer' as const, expiresIn, user: await this.userSummary(user), refreshToken: rotated.refreshToken, persistent: rotated.persistent };
  }

  async logout(refreshToken?: string) {
    if (refreshToken) await this.sessions.revokeByToken(refreshToken);
  }

  async forgotPassword(dto: ForgotPasswordDto, req: Request) {
    const email = dto.email.toLowerCase().trim();
    const ip = req.ip || 'unknown';
    await this.rateLimit.consume(`forgot:${ip}:${email}`, 3, 60 * 60 * 1000);
    const user = await this.users.findByEmail(email);
    if (user && user.status === 'ACTIVE' && user.emailVerifiedAt) {
      const token = randomBytes(32).toString('hex');
      await withCommerceTransaction(this.connection, async (session) => {
        await this.emailTokens.updateMany(
          { userId: String(user._id), purpose: 'RESET_PASSWORD', usedAt: null },
          { $set: { usedAt: new Date() } },
          { session },
        ).exec();
        const [created] = await this.emailTokens.create([{
          userId: String(user._id),
          purpose: 'RESET_PASSWORD',
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }], { session });
        await this.dispatch.enqueue(
          'user.reset_password',
          email,
          `user.reset_password:${String(created._id)}`,
          { token },
          session,
        );
      });
    }
    return { message: GENERIC_RESET_MESSAGE };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const hashValue = createHash('sha256').update(dto.token).digest('hex');
    const newPasswordHash = await hashPassword(dto.newPassword);
    await withCommerceTransaction(this.connection, async (session) => {
      const tokenDoc = await this.emailTokens.findOneAndUpdate({
        tokenHash: hashValue, purpose: 'RESET_PASSWORD', usedAt: null, expiresAt: { $gt: new Date() },
      }, { $set: { usedAt: new Date() } }, { session, new: false }).exec();
      if (!tokenDoc) throw new BadRequestException('Reset token invalid or expired');
      const user = await this.users.model.findOneAndUpdate(
        { _id: tokenDoc.userId, status: 'ACTIVE' },
        { $set: { passwordHash: newPasswordHash }, $inc: { tokenVersion: 1 } },
        { session, new: true },
      ).exec();
      if (!user) throw new BadRequestException('Reset token invalid or expired');
      await this.sessions.revokeAllForUser(String(user._id), session);
      await this.dispatch.enqueue(
        'user.password_changed', user.email,
        `user.password_changed:${String(user._id)}:${String(tokenDoc._id)}`, {}, session,
      );
    });
    return { message: 'Password reset successful' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const current = await this.users.model.findById(userId).select('+passwordHash').exec();
    if (!current || !(await verifyPassword(dto.currentPassword, current.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await verifyPassword(dto.newPassword, current.passwordHash)) {
      throw new BadRequestException('New password must differ from current password');
    }
    const newPasswordHash = await hashPassword(dto.newPassword);
    await withCommerceTransaction(this.connection, async (session) => {
      const updated = await this.users.model.findOneAndUpdate(
        { _id: userId, passwordHash: current.passwordHash },
        { $set: { passwordHash: newPasswordHash }, $inc: { tokenVersion: 1 } },
        { session, new: true },
      ).exec();
      if (!updated) throw new ConflictException('Password changed concurrently; retry');
      await this.sessions.revokeAllForUser(userId, session);
      await this.dispatch.enqueue(
        'user.password_changed', updated.email,
        `user.password_changed:${userId}:${updated.tokenVersion}`, {}, session,
      );
    });
  }

  private async issueSession(user: UserDocument, persistent = true) {
    const expiresIn = 3600;
    const session = await this.sessions.createSession(String(user._id), persistent);
    const accessToken = await this.signAccessToken(user, session.sessionId, expiresIn);
    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn,
      user: await this.userSummary(user),
      refreshToken: session.refreshToken,
      persistent: session.persistent,
    };
  }

  private signAccessToken(user: UserDocument, sessionId: string, expiresIn: number) {
    return this.jwt.signAsync(
      { sub: String(user._id), email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0, sid: sessionId },
      { expiresIn },
    );
  }

  private async userSummary(user: UserDocument | { _id: unknown; email: string; fullName: string; role: string; status: string }) {
    return {
      permissions: user.role === 'STAFF' ? await this.users.permissionSnapshot(String(user._id)) : [],
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    };
  }
}
