/**
 * E2E all AI HTTP endpoints (+ admin ai-quotas). Real provider on AI_API_BASE_URL.
 *   node --env-file=.env --import=tsx src/scripts/_ai-e2e-all-endpoints.ts
 */
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import mongoose from 'mongoose';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const CUSTOMER_EMAIL = process.env.PAYMENT_TEST_EMAIL ?? 'fc1792858558752yqi8t@maxxspace.com';
const CUSTOMER_PASS = process.env.PAYMENT_TEST_PASSWORD ?? 'MailTmChangedPass3!';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'videoveo3pro@gmail.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? 'VideoVeo3ProPass1!';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ai-e2e-all-results.json');

const ok: string[] = [];
const fail: string[] = [];
function pass(n: string) { ok.push(n); console.log(`OK  ${n}`); }
function bad(n: string, d: string) { fail.push(`${n}: ${d}`); console.error(`FAIL ${n}: ${d}`); }

async function api(path: string, init: RequestInit = {}, token?: string) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

async function expect(name: string, res: Response, codes: number[]) {
  if (codes.includes(res.status)) pass(name);
  else bad(name, `${res.status} ${(await res.text()).slice(0, 180)}`);
}

async function login(email: string, password: string) {
  const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function probeProvider(): Promise<boolean> {
  const baseUrl = (process.env.AI_API_BASE_URL ?? 'http://127.0.0.1:3669/v1').replace(/\/$/, '');
  const u = new URL(baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`);
  const port = u.port ? Number(u.port) : 80;
  const open = await new Promise<boolean>((resolve) => {
    const s = net.connect({ host: u.hostname, port, timeout: 2000 });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
  if (!open) return false;
  try {
    const r = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${process.env.AI_API_KEY ?? ''}` },
      signal: AbortSignal.timeout(8000),
    });
    return r.status === 200;
  } catch { return open; }
}

async function waitProvider(ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await probeProvider()) { pass('AI provider reachable'); return; }
    await sleep(3000);
  }
  throw new Error('AI provider not ready');
}

async function loadPersonPhoto(): Promise<Buffer> {
  const r = await fetch('https://picsum.photos/seed/fashion-person-e2e/768/1024', { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error('picsum person');
  return Buffer.from(await r.arrayBuffer());
}

async function uploadTryon(token: string, bytes: Buffer) {
  const ct = bytes.length > 10_000 ? 'image/jpeg' : 'image/png';
  const presign = await api('/storage/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType: ct, sizeBytes: bytes.length, purpose: 'tryon' }),
  }, token);
  if (presign.status !== 201) throw new Error('presign');
  const s = await presign.json() as { uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string> };
  const put = await fetch(s.uploadUrl, { method: 'PUT', headers: s.requiredHeaders, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`R2 put ${put.status}`);
  const fin = await api('/storage/finalize', { method: 'POST', body: JSON.stringify({ objectKey: s.objectKey }) }, token);
  if (fin.status !== 201) throw new Error(`finalize ${fin.status}`);
  return (await fin.json() as { id: string }).id;
}

async function productIds(adminToken: string) {
  const list = await (await api('/products?limit=3')).json() as { items: Array<{ id: string }> };
  const ids: string[] = [];
  let i = 0;
  for (const p of list.items ?? []) {
    i += 1;
    await api(`/admin/products/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ images: [`https://picsum.photos/seed/ai-ep-${i}/512.jpg`] }),
    }, adminToken);
    ids.push(String(p.id));
    if (ids.length >= 2) break;
  }
  return ids;
}

function jobBody(inputMediaId: string, productIds: string[]) {
  return {
    inputMediaId,
    productIds,
    consentPolicyVersion: 'ai-e2e-all-v1',
  };
}

async function pollUntilDone(token: string, jobId: string, label: string) {
  const max = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? '120000') + 180_000;
  const deadline = Date.now() + max;
  while (Date.now() < deadline) {
    const r = await api(`/ai/jobs/${jobId}`, {}, token);
    const j = await r.json() as { state: string; resultUrls?: string[]; errorMessage?: string | null };
    if (j.state === 'COMPLETED' || j.state === 'FAILED') return j;
    await sleep(5000);
  }
  bad(label, 'poll timeout');
  return null;
}

async function staffToken(adminToken: string) {
  await mongoose.connect(process.env.MONGODB_URI!);
  const staff = await mongoose.connection.collection('users').findOne({ role: 'STAFF', status: 'ACTIVE' });
  if (!staff?.email) throw new Error('no staff');
  await mongoose.connection.collection('users').updateOne(
    { _id: staff._id },
    { $set: { passwordHash: await hash('StaffE2ePass123!', 12) } },
  );
  await mongoose.disconnect();
  return login(String(staff.email), 'StaffE2ePass123!');
}

// --- Start ---
await waitProvider(Number(process.env.AI_E2E_WAIT_MS ?? '60000'));

const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);
const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASS);
let staffTok = '';
try { staffTok = await staffToken(adminToken); } catch (e) { bad('staff setup', String(e)); }

await expect('GET /admin/ai-quotas (admin)', await api('/admin/ai-quotas', {}, adminToken), [200]);
await expect('PATCH /admin/ai-quotas (admin)', await api('/admin/ai-quotas', {
  method: 'PATCH', body: JSON.stringify({ dailyJobs: 100 }),
}, adminToken), [200]);
await expect('GET /admin/ai-quotas (customer 403)', await api('/admin/ai-quotas', {}, customerToken), [403]);

await expect('GET /ai/jobs (401 no auth)', await api('/ai/jobs'), [401]);
await expect('GET /ai/jobs?limit=Infinity (400)', await api('/ai/jobs?limit=Infinity', {}, customerToken), [400]);

if (staffTok) {
  await expect('POST /ai/try-on (staff 403)', await api('/ai/try-on', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ inputMediaId: new mongoose.Types.ObjectId().toString(), productIds: [new mongoose.Types.ObjectId().toString()], consentPolicyVersion: 'x' }),
  }, staffTok), [403]);
}
await expect('POST /ai/try-on (admin 403)', await api('/ai/try-on', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ inputMediaId: new mongoose.Types.ObjectId().toString(), productIds: [new mongoose.Types.ObjectId().toString()], consentPolicyVersion: 'x' }),
}, adminToken), [403]);

const person = await loadPersonPhoto();
pass('load person input photo');
const inputMediaId = await uploadTryon(customerToken, person);
pass('storage tryon upload for AI');
const pids = await productIds(adminToken);
if (pids.length < 2) throw new Error('need 2 products');

const base = jobBody(inputMediaId, [pids[0]]);

async function createTryOnHappy(): Promise<{ id: string; final: Awaited<ReturnType<typeof pollUntilDone>> }> {
  const key = randomUUID();
  const res = await api('/ai/try-on', {
    method: 'POST',
    headers: { 'Idempotency-Key': key },
    body: JSON.stringify(base),
  }, customerToken);
  if (res.status !== 202) throw new Error(`happy try-on ${res.status}`);
  const job = await res.json() as { id: string };
  return { id: job.id, final: await pollUntilDone(customerToken, job.id, 'TRY_ON poll') };
}

const happyTry = await api('/ai/try-on', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify(base),
}, customerToken);
await expect('POST /ai/try-on happy (202)', happyTry, [202]);
let tryHappyJob = await happyTry.json() as { id: string };
let tryFinal = await pollUntilDone(customerToken, tryHappyJob.id, 'TRY_ON happy path');
const maxTryOnAttempts = process.env.AI_E2E_TRYON_RETRY === '0' ? 1 : 3;
for (let attempt = 2; attempt <= maxTryOnAttempts && tryFinal?.state === 'FAILED'; attempt += 1) {
  console.log(`[ai-e2e-all] TRY_ON retry ${attempt}/${maxTryOnAttempts}…`);
  await sleep(5000);
  const retry = await createTryOnHappy();
  tryHappyJob = { id: retry.id };
  tryFinal = retry.final;
}
if (tryFinal?.state === 'COMPLETED') pass('TRY_ON job COMPLETED (real provider)');
else if (tryFinal?.state === 'FAILED') bad('TRY_ON job COMPLETED', String(tryFinal.errorMessage ?? tryFinal.state));
if (tryFinal?.resultUrls?.length) pass('GET job resultUrls after TRY_ON COMPLETED');

await sleep(3000);
const mixRes = await api('/ai/mix-match', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify(jobBody(inputMediaId, pids.slice(0, 2))),
}, customerToken);
await expect('POST /ai/mix-match happy (202)', mixRes, [202]);
const mixJob = await mixRes.json() as { id: string };
const mixFinal = await pollUntilDone(customerToken, mixJob.id, 'MIX_MATCH happy path');
if (mixFinal?.state === 'COMPLETED') pass('MIX_MATCH job COMPLETED (real provider)');
else if (mixFinal?.state === 'FAILED') bad('MIX_MATCH job COMPLETED', String(mixFinal.state));

await expect('POST /ai/try-on (400 no Idempotency-Key)', await api('/ai/try-on', {
  method: 'POST', body: JSON.stringify(base),
}, customerToken), [400]);

await expect('POST /ai/mix-match (400 one product)', await api('/ai/mix-match', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify(base),
}, customerToken), [400]);

await expect('POST /ai/try-on (400 bad inputMediaId)', await api('/ai/try-on', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ ...base, inputMediaId: new mongoose.Types.ObjectId().toString() }),
}, customerToken), [400]);

const idemKey = randomUUID();
const try1 = await api('/ai/try-on', {
  method: 'POST',
  headers: { 'Idempotency-Key': idemKey },
  body: JSON.stringify(base),
}, customerToken);
await expect('POST /ai/try-on (202)', try1, [202]);
const idemJob = await try1.json() as { id: string };

await expect('POST /ai/try-on idempotency replay (202)', await api('/ai/try-on', {
  method: 'POST',
  headers: { 'Idempotency-Key': idemKey },
  body: JSON.stringify(base),
}, customerToken), [202]);

await expect('POST /ai/try-on idempotency conflict (409)', await api('/ai/try-on', {
  method: 'POST',
  headers: { 'Idempotency-Key': idemKey },
  body: JSON.stringify({ ...base, productIds: [pids[1]] }),
}, customerToken), [409]);

await expect('GET /ai/jobs/:id', await api(`/ai/jobs/${tryHappyJob.id}`, {}, customerToken), [200]);
await expect('GET /ai/jobs/:id foreign (404)', await api(`/ai/jobs/${new mongoose.Types.ObjectId()}`, {}, customerToken), [404]);
await expect('GET /ai/jobs', await api('/ai/jobs?limit=10', {}, customerToken), [200]);

const report = {
  ranAt: new Date().toISOString(),
  passed: ok.length,
  failed: fail.length,
  checks: { ok, fail },
  jobs: {
    tryOnHappy: { id: tryHappyJob.id, final: tryFinal },
    tryOnIdempotency: { id: idemJob.id },
    mixMatch: { id: mixJob.id, final: mixFinal },
  },
};
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(`\n=== AI ALL ENDPOINTS: ${ok.length} OK, ${fail.length} FAIL ===`);
console.log(`Saved ${OUT}`);
if (fail.length) process.exit(1);
