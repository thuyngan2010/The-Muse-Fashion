// Shared isolated API fixtures for Vitest and Playwright. Never uses application .env files.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { hash } from 'bcryptjs';
import { signWebhookPayload } from '@gpmpay/sdk';
const MAIN = fileURLToPath(new URL('../../apps/api/dist/main.js', import.meta.url));
export const PASSWORD = 'Integration-Passw0rd!';
export const WEB_ORIGIN = 'http://localhost:4200';
export const WEBHOOK_SECRET = 'integration-webhook-secret';
export const MERCHANT_ACCOUNT = '0123456789';
export function mongoUri() {
    const uri = process.env.MONGODB_TEST_URI;
    if (!uri)
        throw new Error('MONGODB_TEST_URI must point to a MongoDB replica set (e.g. mongodb://127.0.0.1:27017/?replicaSet=rs0)');
    return uri;
}
export function uniqueDbName(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
}
export function dbUri(dbName) {
    const url = new URL(mongoUri());
    url.pathname = `/${dbName}`;
    return url.toString();
}
export async function connectDb(dbName) {
    return mongoose.createConnection(dbUri(dbName)).asPromise();
}
async function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('No port'))));
        });
    });
}
export async function startApi(dbName, envOverrides = {}) {
    if (!existsSync(MAIN))
        throw new Error(`Missing ${MAIN}; run "npm run build:api" before integration tests`);
    const port = await freePort();
    let output = '';
    const child = spawn(process.execPath, [MAIN], {
        cwd: tmpdir(),
        env: {
            PATH: process.env.PATH,
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: String(port),
            MONGODB_URI: dbUri(dbName),
            JWT_SECRET: randomBytes(32).toString('hex'),
            REFUND_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
            EMAIL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
            API_CORS_ORIGIN: WEB_ORIGIN,
            PUBLIC_WEB_URL: WEB_ORIGIN,
            SWAGGER_ENABLED: 'false',
            GPMPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
            GPMPAY_BANK_BIN: '970422',
            GPMPAY_ACCOUNT_NUMBER: MERCHANT_ACCOUNT,
            GPMPAY_ACCOUNT_NAME: 'FASHION COMMERCE',
            SEPAY_WEBHOOK_API_KEY: 'integration-sepay-webhook-key',
            SEPAY_BANK_BIN: '970422',
            SEPAY_ACCOUNT_NUMBER: MERCHANT_ACCOUNT,
            SEPAY_ACCOUNT_NAME: 'FASHION COMMERCE',
            AI_ENABLED: 'false',
            ...envOverrides,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { output += chunk.toString(); });
    const baseUrl = `http://127.0.0.1:${port}/api/v1`;
    const deadline = Date.now() + 60_000;
    for (;;) {
        if (child.exitCode !== null)
            throw new Error(`API exited early (${child.exitCode}):\n${output}`);
        try {
            const response = await fetch(`${baseUrl}/health/ready`);
            if (response.ok)
                break;
        }
        catch {
            // not listening yet
        }
        if (Date.now() > deadline) {
            child.kill();
            throw new Error(`API did not become ready:\n${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return {
        baseUrl,
        logs: () => output,
        stop: () => new Promise((resolve) => {
            if (child.exitCode !== null)
                return resolve();
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
        }),
    };
}
export async function seedUser(db, role, label) {
    const id = new Types.ObjectId();
    const email = `${label}.${randomBytes(3).toString('hex')}@example.test`;
    await db.collection('users').insertOne({
        _id: id, email, fullName: label, role, status: 'ACTIVE', emailVerifiedAt: new Date(),
        passwordHash: await hash(PASSWORD, 4), tokenVersion: 0, createdAt: new Date(), updatedAt: new Date(),
    });
    return { id: String(id), email };
}
export async function grant(db, staffId, permission, scope) {
    await db.collection('staff_permissions').insertOne({
        staffId: new Types.ObjectId(staffId), permission, scope, grantedBy: new Types.ObjectId(),
    });
}
export async function seedOrder(db, customerId, options = {}) {
    const id = new Types.ObjectId();
    const code = `FC${randomBytes(4).toString('hex').toUpperCase()}`;
    await db.collection('orders').insertOne({
        _id: id, code, customerId: new Types.ObjectId(customerId), items: [],
        money: { subtotal: options.payableTotal ?? 100_000, shippingFee: 0, voucherDiscount: 0, payableTotal: options.payableTotal ?? 100_000 },
        shippingSnapshot: {}, state: options.state ?? 'PENDING_PAYMENT',
        paymentDueAt: options.paymentDueAt ?? new Date(Date.now() + 30 * 60_000),
        idempotencyKey: randomUUID(), version: 1,
        ...(options.assignedStaffId ? { assignedStaffId: new Types.ObjectId(options.assignedStaffId) } : {}),
        createdAt: new Date(), updatedAt: new Date(),
    });
    return { id: String(id), code };
}
export async function seedPaymentAttempt(db, orderId, options = {}) {
    const id = new Types.ObjectId();
    const reconciliationCode = `FC${randomBytes(4).toString('hex').toUpperCase()}`;
    await db.collection('payment_attempts').insertOne({
        _id: id, orderId: new Types.ObjectId(orderId), provider: options.provider ?? 'GPMPAY', reconciliationCode,
        expectedAmount: options.amount ?? 100_000, currency: 'VND', state: options.state ?? 'PENDING',
        expiresAt: options.expiresAt ?? new Date(Date.now() + 30 * 60_000), idempotencyKey: randomUUID(),
        createdAt: new Date(), updatedAt: new Date(),
    });
    return { id: String(id), reconciliationCode };
}
export async function login(api, email) {
    const response = await fetch(`${api.baseUrl}/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (response.status !== 201)
        throw new Error(`Login failed for ${email}: ${response.status} ${await response.text()}`);
    const body = await response.json();
    const refreshCookie = (response.headers.getSetCookie?.() ?? []).find((cookie) => cookie.startsWith('refresh_token='));
    return { accessToken: body.accessToken, refreshCookie: refreshCookie?.split(';')[0] ?? '' };
}
export function authed(api, token) {
    return (path, init = {}) => fetch(`${api.baseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
}
export async function sendWebhook(api, payload, secret = WEBHOOK_SECRET) {
    const rawBody = JSON.stringify(payload);
    return fetch(`${api.baseUrl}/webhooks/payment/gpmpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-GPMPay-Signature': signWebhookPayload({ rawBody, secret }) },
        body: rawBody,
    });
}
export function inboundTransfer(reconciliationCode, amount) {
    return {
        id: `txn_${randomBytes(6).toString('hex')}`,
        gateway: 'MB',
        transactionDate: new Date().toISOString(),
        accountNumber: MERCHANT_ACCOUNT,
        subAccount: null,
        content: `Thanh toan ${reconciliationCode}`,
        transferType: 'in',
        transferAmount: amount,
        accumulated: null,
        referenceCode: `REF${randomBytes(4).toString('hex')}`,
        source: 'BANK',
    };
}
