import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import { PASSWORD, authed, connectDb, login, seedUser, startApi, uniqueDbName, type RunningApi } from './harness.js';

let api: RunningApi;
let db: Connection;

beforeAll(async () => {
  const dbName = uniqueDbName('fc_auth_mail');
  db = await connectDb(dbName);
  api = await startApi(dbName);
});

afterAll(async () => {
  await api?.stop();
  await db?.dropDatabase();
  await db?.close();
});

describe('Auth email outbox transaction', () => {
  it('rolls back registration if the email event cannot be written', async () => {
    const email = `atomic.${randomUUID()}@example.test`;
    const payload = { email, fullName: 'Atomic User', password: 'Integration-Passw0rd!' };
    await db.collection('email_events').insertOne({
      dedupKey: 'integration-template-blocker', to: 'blocker@example.test',
      template: 'user.verify_email', state: 'PENDING', attempts: 0,
    });
    await db.collection('email_events').createIndex({ template: 1 }, { unique: true, name: 'integration_template_unique' });

    const rejected = await fetch(`${api.baseUrl}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    expect(rejected.status).toBe(409);
    expect(await db.collection('users').findOne({ email })).toBeNull();

    await db.collection('email_events').dropIndex('integration_template_unique');
    const accepted = await fetch(`${api.baseUrl}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    expect(accepted.status).toBe(201);
    const user = await db.collection('users').findOne({ email });
    expect(user).not.toBeNull();
    expect(await db.collection('email_events').findOne({ dedupKey: `user.verify_email:${String(user?._id)}:1` })).not.toBeNull();
  });

  it('keeps the current verification token when resend cannot queue an email', async () => {
    const email = `resend.${randomUUID()}@example.test`;
    const body = JSON.stringify({ email, fullName: 'Resend User', password: PASSWORD });
    expect((await fetch(`${api.baseUrl}/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
    })).status).toBe(201);
    const before = await db.collection('users').findOne({ email });
    await db.collection('email_events').createIndex({ to: 1, template: 1 }, { unique: true,
      partialFilterExpression: { to: email, template: 'user.verify_email' }, name: 'integration_resend_unique' });

    const resend = () => fetch(`${api.baseUrl}/auth/resend-verification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }),
    });
    expect((await resend()).status).toBe(409);
    const unchanged = await db.collection('users').findOne({ email });
    expect(unchanged?.verificationTokenHash).toBe(before?.verificationTokenHash);

    await db.collection('email_events').dropIndex('integration_resend_unique');
    expect((await resend()).status).toBe(201);
    const updated = await db.collection('users').findOne({ email });
    expect(updated?.verificationTokenHash).not.toBe(before?.verificationTokenHash);
  });

  it('keeps an existing reset token when queuing its replacement fails', async () => {
    const user = await seedUser(db, 'CUSTOMER', 'forgot-atomic');
    const userId = new Types.ObjectId(user.id);
    const tokenId = new Types.ObjectId();
    await db.collection('email_tokens').insertOne({ _id: tokenId, userId, purpose: 'RESET_PASSWORD',
      tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 60 * 60_000), usedAt: null });
    await db.collection('email_events').insertOne({ dedupKey: 'integration-reset-blocker',
      to: 'blocker@example.test', template: 'user.reset_password', state: 'PENDING', attempts: 0 });
    await db.collection('email_events').createIndex({ template: 1 }, { unique: true,
      partialFilterExpression: { template: 'user.reset_password' }, name: 'integration_reset_template_unique' });

    const rejected = await fetch(`${api.baseUrl}/auth/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }),
    });
    expect(rejected.status).toBe(409);
    expect((await db.collection('email_tokens').findOne({ _id: tokenId }))?.usedAt).toBeNull();
    expect(await db.collection('email_tokens').countDocuments({ userId, purpose: 'RESET_PASSWORD' })).toBe(1);

    await db.collection('email_events').dropIndex('integration_reset_template_unique');
    const accepted = await fetch(`${api.baseUrl}/auth/forgot-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }),
    });
    expect(accepted.status).toBe(202);
    expect((await db.collection('email_tokens').findOne({ _id: tokenId }))?.usedAt).not.toBeNull();
    expect(await db.collection('email_events').findOne({ to: user.email, template: 'user.reset_password' })).not.toBeNull();
  });

  it('keeps the old password and session when the change alert cannot be queued', async () => {
    const user = await seedUser(db, 'CUSTOMER', 'change-atomic');
    const { accessToken } = await login(api, user.email);
    const userId = new Types.ObjectId(user.id);
    const before = await db.collection('users').findOne({ _id: userId });
    await db.collection('email_events').insertOne({ dedupKey: 'integration-change-blocker',
      to: 'blocker@example.test', template: 'user.password_changed', state: 'PENDING', attempts: 0 });
    await db.collection('email_events').createIndex({ template: 1 }, { unique: true,
      partialFilterExpression: { template: 'user.password_changed' }, name: 'integration_change_template_unique' });
    const body = JSON.stringify({ currentPassword: PASSWORD, newPassword: 'Integration-NewPassw0rd!' });

    const rejected = await authed(api, accessToken)('/auth/change-password', { method: 'POST', body });
    expect(rejected.status).toBe(409);
    const unchanged = await db.collection('users').findOne({ _id: userId });
    expect(unchanged?.passwordHash).toBe(before?.passwordHash);
    expect(unchanged?.tokenVersion).toBe(before?.tokenVersion);
    expect((await authed(api, accessToken)('/auth/me')).status).toBe(200);

    await db.collection('email_events').dropIndex('integration_change_template_unique');
    expect((await authed(api, accessToken)('/auth/change-password', { method: 'POST', body })).status).toBe(204);
    expect((await authed(api, accessToken)('/auth/me')).status).toBe(401);
  });

  it('keeps the reset token, password and session when its alert cannot be queued', async () => {
    const user = await seedUser(db, 'CUSTOMER', 'reset-atomic');
    const { accessToken } = await login(api, user.email);
    const userId = new Types.ObjectId(user.id);
    const before = await db.collection('users').findOne({ _id: userId });
    const token = `${randomUUID()}${randomUUID()}`;
    const tokenId = new Types.ObjectId();
    await db.collection('email_tokens').insertOne({ _id: tokenId, userId, purpose: 'RESET_PASSWORD',
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 60 * 60_000), usedAt: null });
    await db.collection('email_events').insertOne({ dedupKey: 'integration-reset-alert-blocker',
      to: user.email, template: 'user.password_changed', state: 'PENDING', attempts: 0 });
    await db.collection('email_events').createIndex({ to: 1, template: 1 }, { unique: true,
      partialFilterExpression: { to: user.email, template: 'user.password_changed' },
      name: 'integration_reset_alert_unique' });
    const reset = () => fetch(`${api.baseUrl}/auth/reset-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: 'Integration-ResetPassw0rd!' }),
    });

    expect((await reset()).status).toBe(409);
    expect((await db.collection('email_tokens').findOne({ _id: tokenId }))?.usedAt).toBeNull();
    const unchanged = await db.collection('users').findOne({ _id: userId });
    expect(unchanged?.passwordHash).toBe(before?.passwordHash);
    expect(unchanged?.tokenVersion).toBe(before?.tokenVersion);
    expect((await authed(api, accessToken)('/auth/me')).status).toBe(200);

    await db.collection('email_events').dropIndex('integration_reset_alert_unique');
    expect((await reset()).status).toBe(201);
    expect((await db.collection('email_tokens').findOne({ _id: tokenId }))?.usedAt).not.toBeNull();
    expect((await authed(api, accessToken)('/auth/me')).status).toBe(401);
  });
});
