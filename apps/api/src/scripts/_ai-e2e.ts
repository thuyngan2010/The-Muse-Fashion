/**
 * E2E AI: try-on + mix-match, poll until terminal, write ai-e2e-results.json
 * Default: real provider at AI_API_BASE_URL (waits for port). Mock only if AI_E2E_ALLOW_MOCK=1.
 *   node --env-file=.env --import=tsx src/scripts/_ai-e2e.ts
 */
import { createServer, type Server } from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const CUSTOMER_EMAIL = process.env.PAYMENT_TEST_EMAIL ?? 'fc1792858558752yqi8t@maxxspace.com';
const CUSTOMER_PASS = process.env.PAYMENT_TEST_PASSWORD ?? 'MailTmChangedPass3!';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'videoveo3pro@gmail.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? 'VideoVeo3ProPass1!';
const MOCK_PORT = Number(process.env.AI_MOCK_PORT ?? '3669');

const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
  'base64',
);

async function loadTryonInputBytes(): Promise<Buffer> {
  try {
    const r = await fetch('https://picsum.photos/seed/fashion-person-e2e/768/1024', { signal: AbortSignal.timeout(30_000) });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 10_000) {
        console.log(`[ai-e2e] try-on input photo ${buf.length} bytes (picsum)`);
        return buf;
      }
    }
  } catch (e) {
    console.warn('[ai-e2e] could not fetch sample person photo, using tiny fallback', e);
  }
  return FALLBACK_PNG;
}

const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'ai-e2e-results.json');

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

async function login(email: string, password: string) {
  const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (r.status !== 201) throw new Error(`login: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseAiBase(): { host: string; port: number; baseUrl: string } {
  const baseUrl = (process.env.AI_API_BASE_URL ?? 'http://127.0.0.1:3669/v1').replace(/\/$/, '');
  const u = new URL(baseUrl.includes('://') ? baseUrl : `http://${baseUrl}`);
  return { host: u.hostname, port: u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80), baseUrl };
}

function tcpOpen(host: string, port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}

async function probeProvider(): Promise<{ ok: boolean; detail: string }> {
  const { host, port, baseUrl } = parseAiBase();
  if (!(await tcpOpen(host, port))) return { ok: false, detail: `TCP ${host}:${port} refused` };
  const key = process.env.AI_API_KEY ?? '';
  for (const path of ['/models', '/images/edits']) {
    try {
      const r = await fetch(`${baseUrl}${path}`, {
        method: path === '/models' ? 'GET' : 'OPTIONS',
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (r.status < 500) return { ok: true, detail: `${baseUrl}${path} → HTTP ${r.status}` };
    } catch {
      // try next
    }
  }
  return { ok: true, detail: `TCP open on ${host}:${port}` };
}

async function waitForProvider(maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const p = await probeProvider();
    if (p.ok) {
      console.log(`[ai-e2e] Provider ready: ${p.detail}`);
      return;
    }
    console.log(`[ai-e2e] Waiting for AI provider… (${p.detail})`);
    await sleep(3000);
  }
  throw new Error(`AI provider not reachable within ${maxMs}ms (${parseAiBase().baseUrl})`);
}

function startMockProvider(): Server {
  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (req.method === 'POST' && url.includes('images/edits')) {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        console.log(`[ai-mock] POST ${url} (${Buffer.concat(chunks).length} bytes)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ created: Date.now(), data: [{ b64_json: FALLBACK_PNG.toString('base64') }] }));
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mock: 'fashion-ai-e2e' }));
  });
  server.listen(MOCK_PORT, '127.0.0.1');
  console.log(`[ai-e2e] Mock AI provider → http://127.0.0.1:${MOCK_PORT}/v1`);
  return server;
}

async function uploadTryon(token: string, inputBytes: Buffer) {
  const contentType = inputBytes.length > 10_000 ? 'image/jpeg' : 'image/png';
  const presign = await api('/storage/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType, sizeBytes: inputBytes.length, purpose: 'tryon' }),
  }, token);
  if (presign.status !== 201) throw new Error(`presign ${presign.status}`);
  const s = await presign.json() as { uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string> };
  const put = await fetch(s.uploadUrl, { method: 'PUT', headers: s.requiredHeaders, body: new Uint8Array(inputBytes) });
  if (!put.ok) throw new Error(`R2 put ${put.status}`);
  const fin = await api('/storage/finalize', { method: 'POST', body: JSON.stringify({ objectKey: s.objectKey }) }, token);
  if (fin.status !== 201) throw new Error(`finalize ${fin.status}`);
  return (await fin.json() as { id: string }).id;
}

async function ensureProductsWithImages(adminToken: string): Promise<string[]> {
  const list = await (await api('/products?limit=5')).json() as { items: Array<{ id: string; slug: string }> };
  const ids: string[] = [];
  let i = 0;
  for (const p of list.items ?? []) {
    i += 1;
    const img = `https://picsum.photos/seed/fashion-ai-${i}/512.jpg`;
    const patch = await api(`/admin/products/${p.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ images: [img] }),
    }, adminToken);
    if (patch.status === 200) ids.push(String(p.id));
    if (ids.length >= 2) break;
  }
  if (ids.length < 2 && list.items[0]) ids.push(String(list.items[0].id));
  return [...new Set(ids)];
}

async function pollJob(token: string, jobId: string, label: string, maxMs?: number) {
  if (maxMs == null) {
    const t = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? '120000');
    maxMs = Math.min(600_000, t + 180_000);
  }
  const deadline = Date.now() + maxMs;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const r = await api(`/ai/jobs/${jobId}`, {}, token);
    if (r.status !== 200) throw new Error(`${label} GET job ${r.status}`);
    last = await r.json() as Record<string, unknown>;
    const state = String(last.state);
    console.log(`[ai-e2e] ${label} state=${state}`);
    if (state === 'COMPLETED' || state === 'FAILED') return last;
    await sleep(5000);
  }
  throw new Error(`${label} timeout after ${maxMs}ms, last=${JSON.stringify(last)}`);
}

const allowMock = process.env.AI_E2E_ALLOW_MOCK === '1';
const waitMs = Number(process.env.AI_E2E_WAIT_MS ?? '120000');
let mockServer: Server | undefined;
let providerMode: 'real' | 'mock' = 'real';

const initialProbe = await probeProvider();
if (initialProbe.ok) {
  console.log(`[ai-e2e] Using REAL provider — ${initialProbe.detail}`);
} else if (allowMock) {
  mockServer = startMockProvider();
  providerMode = 'mock';
  await sleep(500);
} else {
  await waitForProvider(waitMs);
}

const report: Record<string, unknown> = {
  ranAt: new Date().toISOString(),
  apiBase: BASE,
  aiEnabled: process.env.AI_ENABLED,
  aiBaseUrl: process.env.AI_API_BASE_URL,
  providerMode,
  providerProbe: initialProbe.ok ? initialProbe : await probeProvider(),
  jobs: [] as unknown[],
};

try {
  const ready = await fetch(`${BASE}/health/ready`);
  if (!ready.ok) throw new Error('API not ready');

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);
  await api('/admin/ai-quotas', {
    method: 'PATCH',
    body: JSON.stringify({ dailyJobs: 100 }),
  }, adminToken);

  const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASS);
  const tryonBytes = await loadTryonInputBytes();
  const inputMediaId = await uploadTryon(customerToken, tryonBytes);
  const productIds = await ensureProductsWithImages(adminToken);
  console.log('[ai-e2e] productIds', productIds);

  const tryOnRes = await api('/ai/try-on', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      inputMediaId,
      productIds: [productIds[0]],
      consentPolicyVersion: 'ai-e2e-v1',
    }),
  }, customerToken);
  if (tryOnRes.status === 503) throw new Error('AI disabled (503) — check AI_ENABLED and restart API');
  if (tryOnRes.status !== 202) throw new Error(`try-on ${tryOnRes.status} ${await tryOnRes.text()}`);
  const tryJob = await tryOnRes.json() as { id: string };
  const tryResult = await pollJob(customerToken, tryJob.id, 'TRY_ON');

  const mixRes = await api('/ai/mix-match', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      inputMediaId,
      productIds: productIds.slice(0, 2),
      consentPolicyVersion: 'ai-e2e-v1',
    }),
  }, customerToken);
  if (mixRes.status !== 202) throw new Error(`mix-match ${mixRes.status} ${await mixRes.text()}`);
  const mixJob = await mixRes.json() as { id: string };
  const mixResult = await pollJob(customerToken, mixJob.id, 'MIX_MATCH');

  const listRes = await api('/ai/jobs?limit=5', {}, customerToken);
  const jobList = listRes.status === 200 ? await listRes.json() : null;

  report.jobs = [
    { type: 'TRY_ON', create: tryJob, final: tryResult },
    { type: 'MIX_MATCH', create: mixJob, final: mixResult },
  ];
  report.jobList = jobList;
  report.success = tryResult.state === 'COMPLETED' && mixResult.state === 'COMPLETED';

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n========== AI E2E RESULTS ==========');
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nSaved: ${OUT_PATH}`);

  if (report.success !== true) process.exit(1);
} finally {
  mockServer?.close();
}
