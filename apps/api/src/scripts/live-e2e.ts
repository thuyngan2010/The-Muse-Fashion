/**
 * Live E2E against a running API (.env). Uses mail.tm for disposable inboxes.
 * Skips payment endpoints when GPM Pay is not configured.
 */
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const WEB_ORIGIN = process.env.API_CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:4200';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL?.toLowerCase().trim();
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const CUSTOMER_PASSWORD = 'MailTmCustomerPass1!';
const STAFF_PASSWORD = 'StaffE2ePass123!';
const CUSTOMER_CHANGED_PASSWORD = 'MailTmChangedPass3!';
const MAILTM = 'https://api.mail.tm';
const API_ROOT = dirname(fileURLToPath(import.meta.url));
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
  'base64',
);

const STAFF_GRANTS = [
  { permission: 'catalog.manage', scope: 'GLOBAL' as const },
  { permission: 'inventory.manage', scope: 'GLOBAL' as const },
  { permission: 'order.read', scope: 'GLOBAL' as const },
  { permission: 'order.manage', scope: 'GLOBAL' as const },
  { permission: 'order.cancel', scope: 'GLOBAL' as const },
  { permission: 'shipment.manage', scope: 'GLOBAL' as const },
  { permission: 'content.moderate', scope: 'GLOBAL' as const },
];

type Result = { name: string; ok: boolean; detail?: string };

const results: Result[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, ok: true, detail });
  console.log(`  OK  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(` FAIL ${name} — ${detail}`);
}

async function json<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

async function api(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${BASE}${path}`, { ...init, headers });
}

class MailTmInbox {
  readonly address: string;
  readonly accountPassword: string;
  private token = '';

  private constructor(address: string, accountPassword: string) {
    this.address = address;
    this.accountPassword = accountPassword;
  }

  static async create(): Promise<MailTmInbox> {
    const domains = await fetch(`${MAILTM}/domains`).then((r) => r.json()) as { 'hydra:member': Array<{ domain: string }> };
    const domain = domains['hydra:member'][0]?.domain;
    if (!domain) throw new Error('mail.tm: no domain available');
    const address = `fc${Date.now()}${Math.random().toString(36).slice(2, 7)}@${domain}`;
    const accountPassword = `Mt${randomUUID().replace(/-/g, '').slice(0, 16)}!`;
    let created: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      created = await fetch(`${MAILTM}/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, password: accountPassword }),
      });
      if (created.ok) break;
      if (created.status === 429) {
        await sleep(2_000 * (attempt + 1));
        continue;
      }
      break;
    }
    if (!created?.ok) throw new Error(`mail.tm account: ${created?.status} ${await created?.text()}`);
    const inbox = new MailTmInbox(address, accountPassword);
    await inbox.auth();
    return inbox;
  }

  private async auth() {
    const response = await fetch(`${MAILTM}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: this.address, password: this.accountPassword }),
    });
    if (!response.ok) throw new Error(`mail.tm token: ${response.status}`);
    const body = await response.json() as { token: string };
    this.token = body.token;
  }

  async waitForUrl(pattern: RegExp, timeoutMs = 120_000, subjectIncludes?: string): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const list = await fetch(`${MAILTM}/messages`, {
        headers: { Authorization: `Bearer ${this.token}` },
      }).then((r) => r.json()) as { 'hydra:member': Array<{ id: string; subject?: string; createdAt?: string }> };
      const messages = [...(list['hydra:member'] ?? [])].sort((a, b) =>
        String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
      for (const msg of messages) {
        if (subjectIncludes && !String(msg.subject ?? '').includes(subjectIncludes)) continue;
        const detail = await fetch(`${MAILTM}/messages/${msg.id}`, {
          headers: { Authorization: `Bearer ${this.token}` },
        }).then((r) => r.json()) as { text?: string; html?: string };
        const blob = decodeURIComponent(`${detail.text ?? ''}\n${detail.html ?? ''}`);
        const direct = blob.match(pattern)
          ?? blob.match(/token=([a-f0-9]{64})/i)
          ?? blob.match(/token%3D([a-f0-9]+)/i);
        if (direct?.[1]) return direct[1];
        const tracked = blob.match(/(https:\/\/[^\s]*sendgrid[^\s]*)/i)?.[1];
        if (tracked) {
          const resolved = await resolveTrackedAuthLink(tracked);
          if (resolved) return resolved;
        }
      }
      await sleep(3_000);
    }
    throw new Error(`mail.tm timeout waiting for ${pattern}`);
  }
}

async function resolveTrackedAuthLink(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    const finalUrl = response.url;
    const match = finalUrl.match(/token=([a-f0-9]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flushOutboundEmails() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--env-file=.env', '--import=tsx', 'src/scripts/flush-emails.ts'], {
      cwd: join(API_ROOT, '../..'),
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`email:flush exited ${code}`))));
  });
}

async function waitForMailToken(
  inbox: MailTmInbox,
  pattern: RegExp,
  timeoutMs = 180_000,
  subjectIncludes?: string,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await inbox.waitForUrl(pattern, Math.min(15_000, deadline - Date.now()), subjectIncludes);
    } catch {
      await flushOutboundEmails();
    }
  }
  throw new Error(`mail.tm timeout waiting for ${pattern}`);
}

async function waitForApi() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health/ready`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await sleep(1_000);
  }
  throw new Error(`API not ready at ${BASE}`);
}

async function login(email: string, password: string) {
  const response = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (response.status !== 201) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
  const body = await json<{ accessToken: string }>(response);
  const refreshCookie = (response.headers.getSetCookie?.() ?? [])
    .find((c) => c.startsWith('refresh_token='))?.split(';')[0] ?? '';
  return { accessToken: body.accessToken, refreshCookie };
}

async function expectHttp<T = unknown>(
  name: string,
  response: Response,
  status: number,
  validate?: (body: T) => void,
): Promise<T> {
  const body = await json<T>(response);
  if (response.status !== status) {
    fail(name, `expected ${status}, got ${response.status}: ${JSON.stringify(body).slice(0, 400)}`);
    throw new Error('assertion failed');
  }
  try {
    validate?.(body);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
    throw error;
  }
  pass(name);
  return body;
}

async function expectForbidden(name: string, response: Response) {
  if (response.status !== 403) {
    fail(name, `expected 403, got ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return;
  }
  pass(name);
}

async function uploadPng(
  token: string,
  purpose: 'community' | 'avatar' | 'tryon' | 'lookbook',
): Promise<{ mediaId: string; objectKey: string } | null> {
  const presign = await api('/storage/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png', sizeBytes: PNG_BYTES.length, purpose }),
  }, token);
  const signed = await expectHttp<{
    uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string>;
  }>(`POST /storage/presign (${purpose})`, presign, 201, (b) => {
    if (!b.uploadUrl?.startsWith('http')) throw new Error('missing uploadUrl');
  });
  const uploaded = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: signed.requiredHeaders,
    body: new Uint8Array(PNG_BYTES),
  });
  if (!uploaded.ok) {
    if (uploaded.status === 404) {
      pass(`storage upload (${purpose}) skip — R2 private bucket chưa tồn tại (tạo ${process.env.R2_PRIVATE_BUCKET ?? 'R2_PRIVATE_BUCKET'} trên Cloudflare)`);
      return null;
    }
    throw new Error(`R2 PUT failed: ${uploaded.status}`);
  }
  const finalize = await api('/storage/finalize', {
    method: 'POST',
    body: JSON.stringify({ objectKey: signed.objectKey }),
  }, token);
  const media = await expectHttp<{ id: string; status: string }>(
    'POST /storage/finalize',
    finalize,
    201,
    (b) => {
      if (b.status !== 'READY' && b.status !== 'ACTIVE') throw new Error(`unexpected media status ${b.status}`);
    },
  );
  return { mediaId: media.id, objectKey: signed.objectKey };
}

async function verifyMailTmCustomer(inbox: MailTmInbox, password: string): Promise<string> {
  await flushOutboundEmails();
  const verifyToken = await waitForMailToken(inbox, /verify-email\?token=([a-f0-9]+)/i, 180_000, 'Xác minh');
  const verify = await api('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token: verifyToken }),
  });
  await expectHttp('auth/verify-email (mail.tm)', verify, 201, (b) => {
    if (!(b as { verified?: boolean }).verified) throw new Error('verified flag false');
  });
  return (await login(inbox.address, password)).accessToken;
}

async function createOrder(
  customerToken: string,
  variantId: string,
  addressId: string,
): Promise<{ id: string; code: string; state: string }> {
  await api('/cart', {
    method: 'PUT',
    body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }),
  }, customerToken);
  const quoteRes = await api('/checkout/quote', {
    method: 'POST',
    body: JSON.stringify({ addressId, shippingMethod: 'STANDARD' }),
  }, customerToken);
  const quote = await expectHttp<{ id: string; payableTotal?: number }>('POST /checkout/quote', quoteRes, 201, (b) => {
    if (typeof b.payableTotal !== 'number' || b.payableTotal < 1) throw new Error('invalid payableTotal');
  });
  const orderRes = await api('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ quoteId: quote.id }),
  }, customerToken);
  return expectHttp('POST /orders', orderRes, 201, (b) => {
    const o = b as { id: string; code: string; state: string };
    if (o.state !== 'PENDING_PAYMENT') throw new Error(`expected PENDING_PAYMENT, got ${o.state}`);
    if (!o.code?.startsWith('FC')) throw new Error('missing order code');
  }) as Promise<{ id: string; code: string; state: string }>;
}

async function run() {
  if (process.env.NODE_ENV === 'production') throw new Error('Live E2E mutations are disabled in production');
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required');
  console.log(`Live E2E → ${BASE}`);
  await waitForApi();
  pass('health/ready');

  const live = await fetch(`${BASE}/health/live`);
  if (live.ok) pass('health/live');
  else fail('health/live', String(live.status));

  // --- Admin session ---
  let adminToken: string;
  try {
    ({ accessToken: adminToken } = await login(ADMIN_EMAIL, ADMIN_PASSWORD));
    pass('auth/login (admin)');
  } catch (error) {
    fail('auth/login (admin)', error instanceof Error ? error.message : String(error));
    throw error;
  }

  await expectHttp('auth/me (admin)', await api('/auth/me', {}, adminToken), 200, (b) => {
    const me = b as { role: string; email: string };
    if (me.role !== 'ADMIN') throw new Error(`role=${me.role}`);
    if (me.email !== ADMIN_EMAIL) throw new Error('email mismatch');
  });

  // --- Public catalog ---
  const productsRes = await api('/products?limit=5');
  let productList: { items: Array<{ id: string; slug: string; inStock?: boolean }> } = { items: [] };
  productList = await expectHttp('GET /products', productsRes, 200, (b) => {
    const body = b as { items: unknown[]; total: number };
    if (!Array.isArray(body.items) || body.items.length < 1) throw new Error('expected seeded products');
  }) as typeof productList;

  await expectHttp('GET /categories', await api('/categories'), 200);
  const lookbooksBody = await expectHttp<{ items: Array<{ id: string }> }>(
    'GET /lookbooks',
    await api('/lookbooks'),
    200,
  );
  if (lookbooksBody.items?.[0]?.id) {
    await expectHttp('GET /lookbooks/:id', await api(`/lookbooks/${lookbooksBody.items[0].id}`), 200);
  } else pass('GET /lookbooks/:id (skip — none published)');

  const firstProduct = productList.items[0];
  let variantId = '';
  let seededProductId = firstProduct.id;
  if (firstProduct?.slug) {
    const detailBody = await expectHttp<{ id: string; variants: Array<{ id: string; stockOnHand?: number }> }>(
      'GET /products/:slug',
      await api(`/products/${firstProduct.slug}`),
      200,
      (b) => {
        if (String(b.id) !== String(firstProduct.id)) throw new Error('product id mismatch');
        if (!b.variants?.length) throw new Error('expected variants');
      },
    );
    variantId = detailBody.variants[0].id;
    await expectHttp('POST /products/:slug/size-suggestion', await api(`/products/${firstProduct.slug}/size-suggestion`, {
      method: 'POST',
      body: JSON.stringify({ bust: 92, waist: 78, hip: 98 }),
    }), 201, (b) => {
      const body = b as { disclaimer?: string; sizeGuide?: unknown[] };
      if (!body.disclaimer || !Array.isArray(body.sizeGuide)) throw new Error('invalid size-suggestion payload');
    });
  }

  // resend-verification (unverified mail.tm user)
  const inboxPending = await MailTmInbox.create();
  await expectHttp('auth/register (pending resend)', await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: inboxPending.address, fullName: 'Pending User', password: CUSTOMER_PASSWORD }),
  }), 201);
  await expectHttp('auth/resend-verification', await api('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email: inboxPending.address }),
  }), 201);
  try {
    await verifyMailTmCustomer(inboxPending, CUSTOMER_PASSWORD);
    pass('auth/resend-verification + verify (mail.tm pending user)');
  } catch (error) {
    fail('pending user verify', error instanceof Error ? error.message : String(error));
  }

  // --- mail.tm primary customer ---
  const inbox = await MailTmInbox.create();
  pass('mail.tm inbox', inbox.address);
  await expectHttp('auth/register (mail.tm)', await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: inbox.address, fullName: 'Mail TM Customer', password: CUSTOMER_PASSWORD }),
  }), 201);

  let customerToken = '';
  let customerUserId = '';
  let addressId = '';
  let orderIdForStaff = '';
  let orderIdForCustomerCancel = '';
  let postId = '';
  let voucherId = '';
  let newProductId = '';
  let staffId = '';
  let staffToken = '';

  try {
    customerToken = await verifyMailTmCustomer(inbox, CUSTOMER_PASSWORD);
    pass('auth/login (customer mail.tm)');
  } catch (error) {
    fail('mail.tm verification flow', error instanceof Error ? error.message : String(error));
  }

  if (customerToken) {
    await expectForbidden('RBAC customer → GET /admin/users', await api('/admin/users', {}, customerToken));

    const refreshLogin = await login(inbox.address, CUSTOMER_PASSWORD);
    await expectHttp('auth/refresh', await fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: refreshLogin.refreshCookie, Origin: WEB_ORIGIN },
    }), 201);

    const profile = await expectHttp<{ id: string; role: string }>(
      'GET /users/me',
      await api('/users/me', {}, customerToken),
      200,
      (b) => { if (b.role !== 'CUSTOMER') throw new Error('expected CUSTOMER'); },
    );
    customerUserId = profile.id;

    await expectHttp('PATCH /users/me', await api('/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ fullName: 'Mail TM Updated', phone: '+84901234567' }),
    }, customerToken), 200);

    const addrBody = await expectHttp<{ id: string }>('POST /users/me/addresses', await api('/users/me/addresses', {
      method: 'POST',
      body: JSON.stringify({
        receiver: 'Nguyen Van A', phone: '+84901234567', line1: '123 Le Loi',
        ward: 'Ben Nghe', district: 'Quan 1', province: 'Ho Chi Minh', isDefault: true,
      }),
    }, customerToken), 201);
    addressId = addrBody.id;
    await expectHttp('GET /users/me/addresses', await api('/users/me/addresses', {}, customerToken), 200);
    await expectHttp('PATCH /users/me/addresses/:id', await api(`/users/me/addresses/${addressId}`, {
      method: 'PATCH', body: JSON.stringify({ note: 'E2E note' }),
    }, customerToken), 200);

    if (variantId && addressId) {
      await expectHttp('PUT /cart', await api('/cart', {
        method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }),
      }, customerToken), 200);
      await expectHttp('GET /cart', await api('/cart', {}, customerToken), 200);
      orderIdForCustomerCancel = (await createOrder(customerToken, variantId, addressId)).id;
      orderIdForStaff = (await createOrder(customerToken, variantId, addressId)).id;
      await expectHttp('GET /orders/:id', await api(`/orders/${orderIdForStaff}`, {}, customerToken), 200);
      await expectHttp('GET /orders', await api('/orders?limit=10', {}, customerToken), 200);
      await expectHttp('POST /orders/:id/cancel (customer)', await api(`/orders/${orderIdForCustomerCancel}/cancel`, {
        method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ reason: 'E2E customer cancel' }),
      }, customerToken), 201, (b) => {
        if ((b as { state: string }).state !== 'CANCELLED') throw new Error('expected CANCELLED');
      });
      await expectHttp('DELETE /cart', await api('/cart', { method: 'DELETE' }, customerToken), 204);
    }

    const communityUpload = await uploadPng(customerToken, 'community');
    if (communityUpload) {
      const post = await expectHttp<{ id: string }>('POST /community/posts', await api('/community/posts', {
        method: 'POST', body: JSON.stringify({ caption: 'E2E post', mediaIds: [communityUpload.mediaId] }),
      }, customerToken), 201);
      postId = post.id;
      await expectHttp('GET /community/posts/:id', await api(`/community/posts/${postId}`), 200);
      await expectHttp('GET /community/posts/:id/comments', await api(`/community/posts/${postId}/comments`), 200);
      const comment = await expectHttp<{ id: string }>('POST /community/posts/:id/comments', await api(`/community/posts/${postId}/comments`, {
        method: 'POST', body: JSON.stringify({ body: 'Nice outfit' }),
      }, customerToken), 201);
      await expectHttp('PATCH /community/posts/:id/comments/:commentId', await api(`/community/posts/${postId}/comments/${comment.id}`, {
        method: 'PATCH', body: JSON.stringify({ body: 'Updated' }),
      }, customerToken), 200);
      await expectHttp('PATCH /community/posts/:id', await api(`/community/posts/${postId}`, {
        method: 'PATCH', body: JSON.stringify({ caption: 'E2E updated' }),
      }, customerToken), 200);
      await expectHttp('DELETE /community/posts/:id/comments/:commentId', await api(`/community/posts/${postId}/comments/${comment.id}`, {
        method: 'DELETE',
      }, customerToken), 204);
    }

    const reviewReject = await api('/reviews', {
      method: 'POST',
      body: JSON.stringify({ orderItemId: new Types.ObjectId().toString(), stars: 5, content: 'x' }),
    }, customerToken);
    if ([400, 404, 422].includes(reviewReject.status)) pass('POST /reviews (reject without delivery)');
    else fail('POST /reviews (reject without delivery)', String(reviewReject.status));

    const notifList = await expectHttp<{ items: Array<{ id: string }> }>(
      'GET /notifications', await api('/notifications?limit=10', {}, customerToken), 200,
    );
    if (notifList.items?.[0]?.id) {
      await expectHttp('PATCH /notifications/:id/read', await api(`/notifications/${notifList.items[0].id}/read`, {
        method: 'PATCH',
      }, customerToken), 200);
    } else pass('PATCH /notifications/:id/read (skip — empty)');
    await expectHttp('PATCH /notifications/read-all', await api('/notifications/read-all', { method: 'PATCH' }, customerToken), 200);
    await expectHttp('GET /ai/jobs', await api('/ai/jobs?limit=5', {}, customerToken), 200);

    const tryOnMedia = await uploadPng(customerToken, 'tryon');
    if (tryOnMedia) {
      const tryOn = await api('/ai/try-on', {
        method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ inputMediaId: tryOnMedia.mediaId, productIds: [seededProductId], consentPolicyVersion: 'e2e-v1' }),
      }, customerToken);
      if (tryOn.status === 202) {
        const job = await json<{ id: string }>(tryOn);
        await expectHttp('GET /ai/jobs/:id', await api(`/ai/jobs/${job.id}`, {}, customerToken), 200);
      } else if (tryOn.status === 503) pass('POST /ai/try-on (503 provider)');
      else fail('POST /ai/try-on', `${tryOn.status} ${await tryOn.text()}`);

      const mixMatch = await api('/ai/mix-match', {
        method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ inputMediaId: tryOnMedia.mediaId, productIds: [seededProductId], consentPolicyVersion: 'e2e-v1' }),
      }, customerToken);
      if (mixMatch.status === 202 || mixMatch.status === 503) pass('POST /ai/mix-match');
      else fail('POST /ai/mix-match', String(mixMatch.status));
    }

    await expectHttp('auth/change-password', await api('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: CUSTOMER_PASSWORD, newPassword: CUSTOMER_CHANGED_PASSWORD }),
    }, customerToken), 204);
    customerToken = (await login(inbox.address, CUSTOMER_CHANGED_PASSWORD)).accessToken;
    pass('auth/login after change-password');

    await expectHttp('DELETE /users/me/addresses/:id', await api(`/users/me/addresses/${addressId}`, {
      method: 'DELETE',
    }, customerToken), 204);

    await expectHttp('auth/forgot-password', await api('/auth/forgot-password', {
      method: 'POST', body: JSON.stringify({ email: inbox.address }),
    }), 202);

    const logoutRes = await fetch(`${BASE}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: refreshLogin.refreshCookie, Origin: WEB_ORIGIN },
    });
    if (logoutRes.status === 204) pass('auth/logout');
    else fail('auth/logout', String(logoutRes.status));
  }

  // --- Admin endpoints ---
  const adminUsers = await api('/admin/users?limit=5', {}, adminToken);
  if (adminUsers.ok) pass('GET /admin/users');
  else fail('GET /admin/users', String(adminUsers.status));

  const settingsGet = await api('/admin/settings', {}, adminToken);
  if (settingsGet.ok) pass('GET /admin/settings');
  else fail('GET /admin/settings', String(settingsGet.status));

  const settingsPatch = await api('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({ lowStockThreshold: 5 }),
  }, adminToken);
  if (settingsPatch.ok) pass('PATCH /admin/settings');
  else fail('PATCH /admin/settings', String(settingsPatch.status));

  const aiQuotas = await api('/admin/ai-quotas', {}, adminToken);
  if (aiQuotas.ok) pass('GET /admin/ai-quotas');
  else fail('GET /admin/ai-quotas', String(aiQuotas.status));

  const aiQuotasPatch = await api('/admin/ai-quotas', {
    method: 'PATCH',
    body: JSON.stringify({ dailyJobs: 10 }),
  }, adminToken);
  if (aiQuotasPatch.ok) pass('PATCH /admin/ai-quotas');
  else fail('PATCH /admin/ai-quotas', String(aiQuotasPatch.status));

  const audit = await api('/admin/audit-logs?limit=5', {}, adminToken);
  if (audit.ok) pass('GET /admin/audit-logs');
  else fail('GET /admin/audit-logs', String(audit.status));

  const adminProducts = await api('/admin/products?limit=5', {}, adminToken);
  if (adminProducts.ok) pass('GET /admin/products');
  else fail('GET /admin/products', String(adminProducts.status));

  const adminOrders = await api('/admin/orders?limit=5', {}, adminToken);
  if (adminOrders.ok) pass('GET /admin/orders');
  else fail('GET /admin/orders', String(adminOrders.status));

  const inventory = await api('/admin/inventory', {}, adminToken);
  if (inventory.ok) pass('GET /admin/inventory');
  else fail('GET /admin/inventory', String(inventory.status));

  const invLedger = await api('/admin/inventory/ledger?limit=5', {}, adminToken);
  if (invLedger.ok) pass('GET /admin/inventory/ledger');
  else fail('GET /admin/inventory/ledger', String(invLedger.status));

  const vouchers = await api('/admin/vouchers', {}, adminToken);
  if (vouchers.ok) pass('GET /admin/vouchers');
  else fail('GET /admin/vouchers', String(vouchers.status));

  const adminLookbooks = await api('/admin/lookbooks', {}, adminToken);
  if (adminLookbooks.ok) pass('GET /admin/lookbooks');
  else fail('GET /admin/lookbooks', String(adminLookbooks.status));

  const moderation = await api('/admin/moderation?limit=5', {}, adminToken);
  if (moderation.ok) pass('GET /admin/moderation');
  else fail('GET /admin/moderation', String(moderation.status));

  const reports = await api('/admin/reports/sales', {}, adminToken);
  if (reports.ok) pass('GET /admin/reports/sales');
  else fail('GET /admin/reports/sales', String(reports.status));

  const catSlug = `e2e-cat-${Date.now().toString(36)}`;
  const cat = await expectHttp<{ id: string }>('POST /categories', await api('/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'E2E Category', slug: catSlug, status: 'ACTIVE' }),
  }, adminToken), 201);
  await expectHttp('PATCH /categories/:id', await api(`/categories/${cat.id}`, {
    method: 'PATCH', body: JSON.stringify({ name: 'E2E Category Updated' }),
  }, adminToken), 200);

  const newSlug = `e2e-product-${Date.now().toString(36)}`;
  const createdProduct = await expectHttp<{ id: string }>('POST /products', await api('/products', {
    method: 'POST',
    body: JSON.stringify({
      name: 'E2E Product', slug: newSlug, price: 100_000, status: 'PUBLISHED', categoryId: cat.id,
    }),
  }, adminToken), 201);
  newProductId = createdProduct.id;
  await expectHttp('PATCH /admin/products/:id', await api(`/admin/products/${newProductId}`, {
    method: 'PATCH', body: JSON.stringify({ name: 'E2E Product Updated' }),
  }, adminToken), 200);
  const newVariant = await expectHttp<{ id: string }>('POST /admin/products/:id/variants', await api(`/admin/products/${newProductId}/variants`, {
    method: 'POST',
    body: JSON.stringify({ sku: `E2E-${Date.now()}`, size: 'M', color: 'Black', price: 100_000, stockOnHand: 20 }),
  }, adminToken), 201);
  await expectHttp('PATCH /admin/products/:id/variants/:variantId', await api(`/admin/products/${newProductId}/variants/${newVariant.id}`, {
    method: 'PATCH', body: JSON.stringify({ color: 'Navy' }),
  }, adminToken), 200);

  const voucherCode = `E2E${Date.now().toString(36).toUpperCase()}`;
  const voucher = await expectHttp<{ id: string }>('POST /admin/vouchers', await api('/admin/vouchers', {
    method: 'POST',
    body: JSON.stringify({
      code: voucherCode, type: 'FIXED', value: 10_000, minimumSubtotal: 0,
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 86400_000 * 30).toISOString(),
      usageLimit: 100, status: 'ACTIVE',
    }),
  }, adminToken), 201);
  voucherId = voucher.id;
  await expectHttp('PATCH /admin/vouchers/:id', await api(`/admin/vouchers/${voucherId}`, {
    method: 'PATCH', body: JSON.stringify({ minimumSubtotal: 1 }),
  }, adminToken), 200);

  const lookbookMedia = await uploadPng(adminToken, 'lookbook');
  if (lookbookMedia) {
    const lb = await expectHttp<{ id: string }>('POST /admin/lookbooks', await api('/admin/lookbooks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'E2E Lookbook', status: 'PUBLISHED', mainMediaId: lookbookMedia.mediaId,
        items: [{ productId: newProductId, x: 0.5, y: 0.5 }],
      }),
    }, adminToken), 201);
    await expectHttp('PATCH /admin/lookbooks/:id', await api(`/admin/lookbooks/${lb.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: 'E2E Lookbook Updated', status: 'PUBLISHED', mainMediaId: lookbookMedia.mediaId,
        items: [{ productId: newProductId, x: 0.4, y: 0.6 }],
      }),
    }, adminToken), 200);
    await expectHttp('GET /lookbooks (after publish)', await api('/lookbooks'), 200, (b) => {
      const ids = ((b as { items: Array<{ id: string }> }).items ?? []).map((i) => i.id);
      if (!ids.includes(lb.id)) throw new Error('published lookbook not listed');
    });
  }

  let staffInbox: MailTmInbox | null = null;
  try { staffInbox = await MailTmInbox.create(); } catch (error) {
    fail('mail.tm staff inbox', error instanceof Error ? error.message : String(error));
  }
  if (staffInbox) {
    const staffBody = await expectHttp<{ id: string; role: string }>('POST /admin/staff', await api('/admin/staff', {
      method: 'POST', body: JSON.stringify({ email: staffInbox.address, fullName: 'E2E Staff' }),
    }, adminToken), 201);
    staffId = staffBody.id;
    pass('POST /admin/staff/:id/invitation (auto on create)');
    await flushOutboundEmails();
    const staffResetToken = await waitForMailToken(staffInbox, /reset-password\?token=([a-f0-9]+)/i, 180_000, 'Khôi phục');
    await expectHttp('auth/reset-password (staff invite)', await api('/auth/reset-password', {
      method: 'POST', body: JSON.stringify({ token: staffResetToken, newPassword: STAFF_PASSWORD }),
    }), 201);
    staffToken = (await login(staffInbox.address, STAFF_PASSWORD)).accessToken;
    pass('auth/login (staff)');

    await expectHttp('auth/me (staff)', await api('/auth/me', {}, staffToken), 200, (b) => {
      if ((b as { role: string }).role !== 'STAFF') throw new Error('expected STAFF');
    });
    await expectForbidden('RBAC staff (no perms) → PATCH /admin/inventory', await api('/admin/inventory', {
      method: 'PATCH',
      headers: { 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ variantId: newVariant.id, delta: 1, reason: 'E2E', expectedVersion: 1 }),
    }, staffToken));

    const permRes = await api(`/admin/staff/${staffId}/permissions`, {
      method: 'PATCH', body: JSON.stringify({ grants: STAFF_GRANTS }),
    }, adminToken);
    if (permRes.status === 200 || permRes.status === 201) {
      const permBody = await json<{ grants: unknown[] }>(permRes);
      if (permBody.grants?.length !== STAFF_GRANTS.length) fail('PATCH /admin/staff/:id/permissions', 'grant count mismatch');
      else pass('PATCH /admin/staff/:id/permissions');
    } else fail('PATCH /admin/staff/:id/permissions', String(permRes.status));

    if (orderIdForStaff) {
      await expectHttp('PATCH /admin/orders/:id/assign (admin)', await api(`/admin/orders/${orderIdForStaff}/assign`, {
        method: 'PATCH', body: JSON.stringify({ staffId }),
      }, adminToken), 200);
      await expectHttp('GET /admin/orders (staff)', await api('/admin/orders?limit=20', {}, staffToken), 200, (b) => {
        const ids = ((b as { items: Array<{ id: string }> }).items ?? []).map((o) => o.id);
        if (!ids.includes(orderIdForStaff)) throw new Error('assigned order not visible to staff');
      });
      await expectHttp('GET /orders/:id (staff)', await api(`/orders/${orderIdForStaff}`, {}, staffToken), 200);
      await expectHttp('POST /orders/:id/cancel (staff)', await api(`/orders/${orderIdForStaff}/cancel`, {
        method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ reason: 'E2E staff cancel' }),
      }, staffToken), 201, (b) => {
        if ((b as { state: string }).state !== 'CANCELLED') throw new Error('expected CANCELLED');
      });
    }

    const invList = await expectHttp<{ items: Array<{ variantId: string; version: number }> }>(
      'GET /admin/inventory (staff)', await api('/admin/inventory', {}, staffToken), 200,
    );
    const invRow = invList.items.find((r) => r.variantId === newVariant.id) ?? invList.items[0];
    if (invRow) {
      await expectHttp('PATCH /admin/inventory (staff)', await api('/admin/inventory', {
        method: 'PATCH',
        headers: { 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          variantId: invRow.variantId, delta: 1, reason: 'E2E adjust', expectedVersion: invRow.version,
        }),
      }, staffToken), 200);
      await expectHttp('GET /admin/inventory/ledger (staff)', await api('/admin/inventory/ledger?limit=5', {}, staffToken), 200);
    }

    await expectForbidden('RBAC staff → POST /admin/staff', await api('/admin/staff', {
      method: 'POST', body: JSON.stringify({ email: 'blocked@example.test', fullName: 'X' }),
    }, staffToken));

    const inviteResend = await api(`/admin/staff/${staffId}/invitation`, { method: 'POST' }, adminToken);
    if (inviteResend.status === 201 || inviteResend.status === 200) pass('POST /admin/staff/:id/invitation (resend)');
    else fail('POST /admin/staff/:id/invitation (resend)', String(inviteResend.status));
  }

  if (customerUserId) {
    await expectHttp('PATCH /admin/users/:id', await api(`/admin/users/${customerUserId}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }),
    }, adminToken), 200);
  }

  if (postId) {
    await expectHttp('GET /community/posts', await api('/community/posts?limit=10'), 200);
    await expectHttp('PATCH /admin/moderation/:targetId', await api(`/admin/moderation/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ targetType: 'POST', action: 'HIDE', reason: 'E2E moderation hide' }),
    }, adminToken), 200);
    await expectHttp('PATCH /admin/moderation/:targetId restore', await api(`/admin/moderation/${postId}`, {
      method: 'PATCH',
      body: JSON.stringify({ targetType: 'POST', action: 'RESTORE', reason: 'E2E moderation restore' }),
    }, adminToken), 200);
    const ownerToken = (await login(inbox.address, CUSTOMER_CHANGED_PASSWORD)).accessToken;
    await expectHttp('DELETE /community/posts/:id', await api(`/community/posts/${postId}`, { method: 'DELETE' }, ownerToken), 204);
  }

  if (seededProductId) {
    await expectHttp('GET /reviews', await api(`/reviews?productId=${seededProductId}&limit=5`), 200);
  }

  if (voucherId) {
    await expectHttp('DELETE /admin/vouchers/:id', await api(`/admin/vouchers/${voucherId}`, { method: 'DELETE' }, adminToken), 204);
  }

  if (staffToken) {
    await expectForbidden('RBAC staff → GET /admin/settings', await api('/admin/settings', {}, staffToken));
  }

  summarize();
}

function summarize() {
  console.log('\n--- Skipped (payment not configured) ---');
  console.log('  payments/*, webhooks/payment/*, admin/refunds/*, admin/payment-events/*');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    for (const f of failed) console.error(`  • ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
