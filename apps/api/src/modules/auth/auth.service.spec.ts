import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, HttpException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from '../../common/rate-limit.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.util.js';

const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock('google-auth-library', () => ({ OAuth2Client: class { verifyIdToken = verifyIdToken; } }));

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const req = (ip = '9.9.9.9') => ({ ip }) as unknown as Request;
const connection = { startSession: async () => ({
  withTransaction: async (callback: () => Promise<void>) => callback(), endSession: async () => undefined,
}) };

function build(options: { findOne?: unknown; findByEmail?: unknown; create?: unknown } = {}) {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(options.findByEmail ?? null),
    model: {
      create: options.create ?? vi.fn(async ([doc]: Array<Record<string, unknown>>) => [{ ...doc, _id: 'u1' }]),
      findOne: vi.fn().mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => options.findOne ?? null }) }) }),
    },
  };
  const dispatch = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const rateLimit = new RateLimitService({} as never);
  const service = new AuthService(users as never, {} as never, dispatch as never, {} as never, rateLimit,
    connection as never, {} as never);
  return { service, users, dispatch };
}

describe('AuthService registration status', () => {
  it('register returns a 64-hex registrationToken and stores only its hash with a 24h expiry', async () => {
    const create = vi.fn(async ([doc]: Array<Record<string, unknown>>) => [{ ...doc, _id: 'u1' }]);
    const { service, dispatch } = build({ create });
    const result = await service.register({ fullName: 'Nguyen Van A', email: 'A@Example.com', password: 'ExampleSecure123' });
    expect(result).toMatchObject({ id: 'u1', message: 'Verification email queued' });
    expect(result.registrationToken).toMatch(/^[0-9a-f]{64}$/);
    const doc = create.mock.calls[0][0][0] as Record<string, unknown>;
    expect(doc.registrationStatusTokenHash).toBe(sha(result.registrationToken));
    expect(JSON.stringify(doc)).not.toContain(result.registrationToken);
    const ttl = (doc.registrationStatusExpiresAt as Date).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(23.9 * 3600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3600_000);
    expect(dispatch.enqueue).toHaveBeenCalledOnce();
  });

  it('reports PENDING, VERIFIED and EXPIRED without exposing the email', async () => {
    const pending = build({ findOne: { status: 'PENDING_VERIFICATION', email: 'secret@example.com' } });
    expect(await pending.service.registrationStatus('t'.repeat(64), req())).toEqual({ status: 'PENDING' });
    const verified = build({ findOne: { status: 'ACTIVE', emailVerifiedAt: new Date(), email: 'secret@example.com' } });
    const answer = await verified.service.registrationStatus('t'.repeat(64), req());
    expect(answer).toEqual({ status: 'VERIFIED' });
    expect(JSON.stringify(answer)).not.toContain('secret@example.com');
    const missing = build({ findOne: null });
    expect(await missing.service.registrationStatus('bia-dat', req())).toEqual({ status: 'EXPIRED' });
    expect(await missing.service.registrationStatus('', req())).toEqual({ status: 'EXPIRED' });
  });

  it('looks the token up by hash and only while it has not expired', async () => {
    const { service, users } = build({ findOne: null });
    await service.registrationStatus('abc', req());
    const filter = users.model.findOne.mock.calls[0][0] as { registrationStatusTokenHash: string; registrationStatusExpiresAt: { $gt: Date } };
    expect(filter.registrationStatusTokenHash).toBe(sha('abc'));
    expect(filter.registrationStatusExpiresAt.$gt).toBeInstanceOf(Date);
  });

  it('rate limits by IP after 60 requests per minute', async () => {
    const { service } = build({ findOne: null });
    for (let i = 0; i < 60; i += 1) await service.registrationStatus('abc', req('7.7.7.7'));
    await expect(service.registrationStatus('abc', req('7.7.7.7'))).rejects.toBeInstanceOf(HttpException);
    await expect(service.registrationStatus('abc', req('8.8.8.8'))).resolves.toEqual({ status: 'EXPIRED' });
  });
});

describe('AuthService login for an unverified account', () => {
  const login = (status: string, password = 'ExampleSecure123') => {
    return hashPassword('ExampleSecure123').then((passwordHash) => {
      const { service } = build({ findByEmail: { _id: 'u1', passwordHash, status, emailVerifiedAt: null } });
      return service.login({ email: 'a@example.com', password }, req(`1.1.1.${Math.random()}`));
    });
  };

  it('answers 401 with EMAIL_NOT_VERIFIED and a Vietnamese message when the password is right', async () => {
    const error = await login('PENDING_VERIFICATION').catch((e: unknown) => e) as UnauthorizedException;
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getStatus()).toBe(401);
    expect(error.getResponse()).toEqual({ code: 'EMAIL_NOT_VERIFIED',
      message: 'Tài khoản chưa xác thực email. Vui lòng kiểm tra hộp thư hoặc gửi lại email xác thực.' });
  });

  it('keeps INVALID_CREDENTIALS for a wrong password so unverified accounts are not revealed', async () => {
    const error = await login('PENDING_VERIFICATION', 'WrongPassword999').catch((e: unknown) => e) as UnauthorizedException;
    expect(error.getResponse()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('does not call a suspended account unverified', async () => {
    const error = await login('SUSPENDED').catch((e: unknown) => e) as UnauthorizedException;
    expect(error.getStatus()).toBe(401);
    expect(JSON.stringify(error.getResponse())).not.toContain('EMAIL_NOT_VERIFIED');
  });
});


describe('AuthService Google sign-in', () => {
  const CLIENT_ID = '123-abc.apps.googleusercontent.com';
  const credential = 'g'.repeat(40);
  const payload = (extra: Record<string, unknown> = {}) => ({ sub: 'google-sub-1', email: 'Khach@Example.com', email_verified: true, name: 'Khách Hàng', ...extra });

  beforeEach(() => { vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID); verifyIdToken.mockReset(); });
  afterEach(() => { vi.unstubAllEnvs(); });

  function googleService(options: { bySub?: unknown; byEmail?: unknown; linked?: unknown; created?: unknown } = {}) {
    const exec = (value: unknown) => ({ exec: async () => value });
    const model = {
      findOne: vi.fn().mockReturnValue(exec(options.bySub ?? null)),
      findOneAndUpdate: vi.fn().mockReturnValue(exec(options.linked ?? null)),
      create: vi.fn(async (doc: Record<string, unknown>) => ({ ...doc, _id: 'new-user' })),
    };
    const users = { findByEmail: vi.fn().mockResolvedValue(options.byEmail ?? null), model, permissionSnapshot: vi.fn().mockResolvedValue([]),
      avatarUrl: vi.fn().mockResolvedValue(null) };
    const sessions = { createSession: vi.fn().mockResolvedValue({ sessionId: 's1', refreshToken: 'r1', persistent: true }) };
    const jwt = { signAsync: vi.fn().mockResolvedValue('access-token') };
    const service = new AuthService(users as never, jwt as never, {} as never, sessions as never,
      new RateLimitService({} as never), connection as never, {} as never);
    return { service, users, model, sessions };
  }
  const call = (service: AuthService, ip = '5.5.5.5') => service.loginWithGoogle({ credential, remember: false }, req(ip));

  it('answers 503 in Vietnamese when GOOGLE_CLIENT_ID is not configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    const { service } = googleService();
    const error = await call(service).catch((e: unknown) => e) as ServiceUnavailableException;
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(error.message).toBe('Đăng nhập Google chưa được cấu hình');
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('verifies the token against the configured audience', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const { service } = googleService();
    await call(service);
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: credential, audience: CLIENT_ID });
  });

  it('rejects a token issued for another audience', async () => {
    verifyIdToken.mockRejectedValue(new Error('Wrong recipient, payload audience != requiredAudience'));
    const { service } = googleService();
    const error = await call(service).catch((e: unknown) => e) as UnauthorizedException;
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('rejects an email Google has not verified', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload({ email_verified: false }) });
    const { service, model } = googleService();
    const error = await call(service).catch((e: unknown) => e) as UnauthorizedException;
    expect(error.getResponse()).toMatchObject({ code: 'GOOGLE_EMAIL_NOT_VERIFIED' });
    expect(model.create).not.toHaveBeenCalled();
  });

  it('creates a verified CUSTOMER with no usable password for a new email and signs in like /auth/login', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const { service, model, sessions } = googleService();
    const session = await call(service);
    const doc = model.create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc).toMatchObject({ email: 'khach@example.com', fullName: 'Khách Hàng', googleSub: 'google-sub-1',
      role: 'CUSTOMER', status: 'ACTIVE', hasPassword: false });
    expect(doc.emailVerifiedAt).toBeInstanceOf(Date);
    expect(String(doc.passwordHash).length).toBeGreaterThan(20);
    expect(sessions.createSession).toHaveBeenCalledWith('new-user', false);
    expect(session).toMatchObject({ accessToken: 'access-token', tokenType: 'Bearer', expiresIn: 3600, refreshToken: 'r1', persistent: true });
    expect(session.user).toMatchObject({ email: 'khach@example.com', role: 'CUSTOMER', hasPassword: false });
  });

  it('returns the saved avatar and phone with the session user so the UI keeps them after signing in again', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const existing = { _id: 'u-avatar', email: 'khach@example.com', fullName: 'Khách Hàng', role: 'CUSTOMER', status: 'ACTIVE',
      googleSub: 'google-sub-1', phone: '0901234567', avatarMediaId: 'm-avatar', hasPassword: true };
    const { service, users } = googleService({ bySub: existing });
    users.avatarUrl.mockResolvedValue('https://cdn.example.com/avatar.jpg');
    const session = await call(service);
    expect(users.avatarUrl).toHaveBeenCalledWith(existing);
    expect(session.user).toMatchObject({ id: 'u-avatar', phone: '0901234567', avatarMediaId: 'm-avatar',
      avatarUrl: 'https://cdn.example.com/avatar.jpg' });
  });

  it('uses the part before @ when Google sends no name', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload({ name: undefined }) });
    const { service, model } = googleService();
    await call(service);
    expect((model.create.mock.calls[0][0] as { fullName: string }).fullName).toBe('khach');
  });

  it('signs in the account that already has this googleSub', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const existing = { _id: 'u7', email: 'khach@example.com', fullName: 'A', role: 'CUSTOMER', status: 'ACTIVE', hasPassword: true };
    const { service, model, sessions } = googleService({ bySub: existing });
    await call(service);
    expect(model.create).not.toHaveBeenCalled();
    expect(sessions.createSession).toHaveBeenCalledWith('u7', false);
  });

  it('links googleSub to an existing password CUSTOMER found by email', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const byEmail = { _id: 'u8', email: 'khach@example.com', role: 'CUSTOMER', status: 'ACTIVE', emailVerifiedAt: new Date() };
    const linked = { ...byEmail, fullName: 'A', googleSub: 'google-sub-1', hasPassword: true };
    const { service, model, sessions } = googleService({ byEmail, linked });
    await call(service);
    const [, update] = model.findOneAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).toEqual({ googleSub: 'google-sub-1' });
    expect(sessions.createSession).toHaveBeenCalledWith('u8', false);
  });

  it('activates a PENDING_VERIFICATION account and replaces the password chosen at registration', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const byEmail = { _id: 'u9', email: 'khach@example.com', role: 'CUSTOMER', status: 'PENDING_VERIFICATION', emailVerifiedAt: null };
    const { service, model } = googleService({ byEmail, linked: { ...byEmail, status: 'ACTIVE', fullName: 'A' } });
    await call(service);
    const [, update] = model.findOneAndUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown>; $unset: Record<string, number>; $inc: Record<string, number> }];
    expect(update.$set).toMatchObject({ googleSub: 'google-sub-1', status: 'ACTIVE', hasPassword: false });
    expect(update.$set.emailVerifiedAt).toBeInstanceOf(Date);
    expect(update.$set.passwordHash).toEqual(expect.any(String));
    expect(update.$unset).toEqual({ verificationTokenHash: 1, verificationExpiresAt: 1 });
    expect(update.$inc).toEqual({ tokenVersion: 1 });
  });

  it.each(['ADMIN', 'STAFF'])('refuses %s accounts with 403', async (role) => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const { service, model, sessions } = googleService({ byEmail: { _id: 'a1', email: 'khach@example.com', role, status: 'ACTIVE' } });
    const error = await call(service).catch((e: unknown) => e) as ForbiddenException;
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.message).toBe('Tài khoản quản trị chỉ đăng nhập bằng mật khẩu');
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('refuses a SUSPENDED account like the password login does', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const { service, sessions } = googleService({ bySub: { _id: 's1', role: 'CUSTOMER', status: 'SUSPENDED' } });
    const error = await call(service).catch((e: unknown) => e) as UnauthorizedException;
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getStatus()).toBe(401);
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it('rate limits by IP', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload() });
    const { service } = googleService({ bySub: { _id: 'u7', email: 'k@example.com', fullName: 'A', role: 'CUSTOMER', status: 'ACTIVE' } });
    for (let i = 0; i < 30; i += 1) await call(service, '6.6.6.6');
    await expect(call(service, '6.6.6.6')).rejects.toBeInstanceOf(HttpException);
  });
});

describe('AuthService change password for a Google-only account', () => {
  it('answers 400 with the Vietnamese guidance instead of asking for the current password', async () => {
    const users = { model: { findById: () => ({ select: () => ({ exec: async () => ({ hasPassword: false, passwordHash: 'x' }) }) }) } };
    const service = new AuthService(users as never, {} as never, {} as never, {} as never,
      new RateLimitService({} as never), connection as never, {} as never);
    const error = await service.changePassword('u1', { currentPassword: 'a', newPassword: 'ExampleSecure123' }).catch((e: unknown) => e) as BadRequestException;
    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('Tài khoản chưa có mật khẩu, vui lòng dùng Quên mật khẩu để đặt mật khẩu.');
  });
});
