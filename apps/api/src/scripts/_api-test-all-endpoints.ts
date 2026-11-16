/**
 * Full REST surface (excludes SePay). Uses env admin + PAYMENT_TEST customer.
 *   node --env-file=.env --import=tsx src/scripts/_api-test-all-endpoints.ts
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { signWebhookPayload } from '@gpmpay/sdk';
import { hash } from 'bcryptjs';
import mongoose from 'mongoose';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const WEB_ORIGIN = process.env.API_CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:4200';
const CUSTOMER_EMAIL = process.env.PAYMENT_TEST_EMAIL ?? 'fc1792858558752yqi8t@maxxspace.com';
const CUSTOMER_PASS = process.env.PAYMENT_TEST_PASSWORD ?? 'MailTmChangedPass3!';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'videoveo3pro@gmail.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? 'VideoVeo3ProPass1!';
const GPMPAY_SECRET = process.env.GPMPAY_WEBHOOK_SECRET!;
const MERCHANT = process.env.GPMPAY_ACCOUNT_NUMBER!;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
  'base64',
);

const okList: string[] = [];
const failList: string[] = [];
function ok(n: string) { okList.push(n); console.log(`OK  ${n}`); }
function fail(n: string, d: string) { failList.push(`${n}: ${d}`); console.error(`FAIL ${n}: ${d}`); }

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
  if (codes.includes(res.status)) ok(name);
  else fail(name, `${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function login(email: string, password: string) {
  const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (r.status !== 201) throw new Error(`login ${email}: ${r.status}`);
  const body = await r.json() as { accessToken: string };
  const refreshCookie = (r.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('refresh_token='))?.split(';')[0] ?? '';
  return { accessToken: body.accessToken, refreshCookie };
}

async function upload(token: string, purpose: string, role = 'customer') {
  const presign = await api('/storage/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png', sizeBytes: PNG.length, purpose }),
  }, token);
  if (presign.status !== 201) return null;
  const s = await presign.json() as { uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string> };
  const put = await fetch(s.uploadUrl, { method: 'PUT', headers: s.requiredHeaders, body: new Uint8Array(PNG) });
  if (!put.ok) return null;
  const fin = await api('/storage/finalize', { method: 'POST', body: JSON.stringify({ objectKey: s.objectKey }) }, token);
  if (fin.status !== 201) return null;
  const m = await fin.json() as { id: string };
  return { mediaId: m.id, objectKey: s.objectKey };
}

function gpmpayPayload(content: string, amount: number) {
  return {
    id: `txn_all_${randomUUID().slice(0, 12)}`,
    gateway: 'MB',
    transactionDate: new Date().toISOString(),
    accountNumber: MERCHANT,
    subAccount: null,
    content,
    transferType: 'in' as const,
    transferAmount: amount,
    accumulated: null,
    referenceCode: `REF${randomUUID().slice(0, 8)}`,
    source: 'SIMULATED',
  };
}

async function gpmpayWebhook(payload: Record<string, unknown>) {
  const raw = JSON.stringify(payload);
  return fetch(`${BASE}/webhooks/payment/gpmpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPMPay-Signature': signWebhookPayload({ rawBody: raw, secret: GPMPAY_SECRET }),
    },
    body: raw,
  });
}

// --- Health ---
await expect('GET /health/live', await fetch(`${BASE}/health/live`), [200]);
await expect('GET /health/ready', await fetch(`${BASE}/health/ready`), [200]);

// --- Auth (disposable user) ---
const authEmail = `all-endpoints-${Date.now()}@maxxspace.com`;
const authPass = 'AllEndpointsPass1!';
await expect('POST /auth/register', await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email: authEmail, fullName: 'All EP Test', password: authPass }),
}), [201]);

const verifyPlain = randomBytes(32).toString('hex');
await mongoose.connect(process.env.MONGODB_URI!);
await mongoose.connection.collection('users').updateOne(
  { email: authEmail.toLowerCase() },
  {
    $set: {
      status: 'PENDING_VERIFICATION',
      verificationTokenHash: createHash('sha256').update(verifyPlain).digest('hex'),
      verificationExpiresAt: new Date(Date.now() + 3_600_000),
    },
  },
);
await expect('POST /auth/verify-email', await api('/auth/verify-email', {
  method: 'POST', body: JSON.stringify({ token: verifyPlain }),
}), [201]);

await expect('POST /auth/resend-verification', await api('/auth/resend-verification', {
  method: 'POST', body: JSON.stringify({ email: authEmail }),
}), [201]);

const authSession = await login(authEmail, authPass);
await expect('POST /auth/refresh', await fetch(`${BASE}/auth/refresh`, {
  method: 'POST', headers: { Cookie: authSession.refreshCookie, Origin: WEB_ORIGIN },
}), [201]);
await expect('GET /auth/me', await api('/auth/me', {}, authSession.accessToken), [200]);

await expect('POST /auth/forgot-password', await api('/auth/forgot-password', {
  method: 'POST', body: JSON.stringify({ email: authEmail }),
}), [202]);

const resetPlain = randomBytes(32).toString('hex');
const authUser = await mongoose.connection.collection('users').findOne({ email: authEmail.toLowerCase() });
await mongoose.connection.collection('email_tokens').insertOne({
  userId: String(authUser!._id),
  purpose: 'RESET_PASSWORD',
  tokenHash: createHash('sha256').update(resetPlain).digest('hex'),
  expiresAt: new Date(Date.now() + 3_600_000),
  usedAt: null,
  createdAt: new Date(),
});
await expect('POST /auth/reset-password', await api('/auth/reset-password', {
  method: 'POST', body: JSON.stringify({ token: resetPlain, newPassword: 'AllEndpointsPass2!' }),
}), [201]);

const authSession2 = await login(authEmail, 'AllEndpointsPass2!');
await expect('POST /auth/change-password', await api('/auth/change-password', {
  method: 'POST',
  body: JSON.stringify({ currentPassword: 'AllEndpointsPass2!', newPassword: 'AllEndpointsPass3!' }),
}, authSession2.accessToken), [204]);

await expect('POST /auth/logout', await fetch(`${BASE}/auth/logout`, {
  method: 'POST', headers: { Cookie: authSession2.refreshCookie, Origin: WEB_ORIGIN },
}), [204]);

ok('POST /auth/login (admin)');
const adminToken = (await login(ADMIN_EMAIL, ADMIN_PASS)).accessToken;
ok('POST /auth/login (customer)');
const customerToken = (await login(CUSTOMER_EMAIL, CUSTOMER_PASS)).accessToken;

// --- Public catalog ---
const products = await (await api('/products?limit=3')).json() as { items: Array<{ slug: string; id: string }> };
await expect('GET /products', await api('/products?limit=3'), [200]);
await expect('GET /categories', await api('/categories'), [200]);
await expect('GET /lookbooks', await api('/lookbooks'), [200]);
const slug = products.items[0]?.slug;
if (slug) {
  await expect('GET /products/:slug', await api(`/products/${slug}`), [200]);
  await expect('POST /products/:slug/size-suggestion', await api(`/products/${slug}/size-suggestion`, {
    method: 'POST', body: JSON.stringify({ bust: 90, waist: 75, hip: 95 }),
  }), [201]);
}

// --- Users ---
await expect('GET /users/me', await api('/users/me', {}, customerToken), [200]);
await expect('PATCH /users/me', await api('/users/me', {
  method: 'PATCH', body: JSON.stringify({ fullName: 'Payment Test User' }),
}, customerToken), [200]);
const addr = await api('/users/me/addresses', {
  method: 'POST',
  body: JSON.stringify({
    receiver: 'EP Test', phone: '0900111222', line1: '99 Test', ward: 'W', district: 'D', province: 'HCM', isDefault: false,
  }),
}, customerToken);
await expect('POST /users/me/addresses', addr, [201]);
const addrId = ((await addr.clone().json()) as { id: string }).id;
await expect('GET /users/me/addresses', await api('/users/me/addresses', {}, customerToken), [200]);
await expect('PATCH /users/me/addresses/:id', await api(`/users/me/addresses/${addrId}`, {
  method: 'PATCH', body: JSON.stringify({ note: 'all-ep' }),
}, customerToken), [200]);

// --- Storage purposes ---
for (const purpose of ['avatar', 'community', 'tryon'] as const) {
  const up = await upload(customerToken, purpose);
  if (up) ok(`POST /storage presign+finalize (${purpose})`);
  else fail(`storage ${purpose}`, 'upload failed');
}
const lbUp = await upload(adminToken, 'lookbook');
if (lbUp) ok('POST /storage presign+finalize (lookbook)');
const prodUp = await upload(adminToken, 'product');
if (prodUp) ok('POST /storage presign+finalize (product)');

// --- Staff ---
await mongoose.connection.collection('users').updateOne(
  { email: authEmail.toLowerCase() },
  { $set: { passwordHash: await hash('AllEndpointsPass3!', 12), status: 'ACTIVE', emailVerifiedAt: new Date() } },
);
let staffId = '';
const staffRow = await mongoose.connection.collection('users')
  .findOne({ role: 'STAFF', status: 'ACTIVE' }, { sort: { createdAt: -1 } });
if (staffRow) {
  staffId = String(staffRow._id);
  await mongoose.connection.collection('users').updateOne(
    { _id: staffRow._id },
    { $set: { passwordHash: await hash('StaffE2ePass123!', 12) } },
  );
}
await mongoose.disconnect();

const STAFF_GRANTS = [
  { permission: 'catalog.manage', scope: 'GLOBAL' },
  { permission: 'inventory.manage', scope: 'GLOBAL' },
  { permission: 'order.read', scope: 'GLOBAL' },
  { permission: 'order.manage', scope: 'GLOBAL' },
  { permission: 'order.cancel', scope: 'GLOBAL' },
  { permission: 'shipment.manage', scope: 'GLOBAL' },
  { permission: 'refund.propose', scope: 'GLOBAL' },
  { permission: 'payment.read', scope: 'GLOBAL' },
  { permission: 'content.moderate', scope: 'GLOBAL' },
];
if (staffId) {
  await expect('PATCH /admin/staff/:id/permissions', await api(`/admin/staff/${staffId}/permissions`, {
    method: 'PATCH', body: JSON.stringify({ grants: STAFF_GRANTS }),
  }, adminToken), [200, 201]);
  await expect('POST /admin/staff/:id/permissions', await api(`/admin/staff/${staffId}/permissions`, {
    method: 'POST', body: JSON.stringify({ grants: STAFF_GRANTS }),
  }, adminToken), [200, 201]);
  await expect('POST /admin/staff/:id/invitation', await api(`/admin/staff/${staffId}/invitation`, { method: 'POST' }, adminToken), [200, 201]);
}
const staffToken = staffRow ? (await login(String(staffRow.email), 'StaffE2ePass123!')).accessToken : '';

// --- Admin catalog ---
const catSlug = `all-cat-${Date.now().toString(36)}`;
const catRes = await api('/categories', {
  method: 'POST', body: JSON.stringify({ name: 'All EP Cat', slug: catSlug, status: 'ACTIVE' }),
}, adminToken);
await expect('POST /categories', catRes, [201]);
const catId = ((await catRes.clone().json()) as { id: string }).id;
await expect('PATCH /categories/:id', await api(`/categories/${catId}`, {
  method: 'PATCH', body: JSON.stringify({ name: 'All EP Cat 2' }),
}, adminToken), [200]);

const pSlug = `all-prod-${Date.now().toString(36)}`;
const prodRes = await api('/products', {
  method: 'POST',
  body: JSON.stringify({ name: 'All EP', slug: pSlug, price: 120_000, status: 'PUBLISHED', categoryId: catId }),
}, adminToken);
await expect('POST /products', prodRes, [201]);
const productId = ((await prodRes.clone().json()) as { id: string }).id;
await expect('GET /admin/products', await api('/admin/products?limit=5', {}, adminToken), [200]);
await expect('PATCH /admin/products/:id', await api(`/admin/products/${productId}`, {
  method: 'PATCH', body: JSON.stringify({ name: 'All EP Updated' }),
}, adminToken), [200]);
const varRes = await api(`/admin/products/${productId}/variants`, {
  method: 'POST',
  body: JSON.stringify({ sku: `ALL-${Date.now()}`, size: 'L', color: 'Red', price: 120_000, stockOnHand: 15 }),
}, adminToken);
await expect('POST /admin/products/:id/variants', varRes, [201]);
const variantId = ((await varRes.clone().json()) as { id: string }).id;
await expect('PATCH /admin/products/:id/variants/:vid', await api(`/admin/products/${productId}/variants/${variantId}`, {
  method: 'PATCH', body: JSON.stringify({ color: 'Blue' }),
}, adminToken), [200]);

// --- Cart / order / assign ---
await expect('PUT /cart', await api('/cart', {
  method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }),
}, customerToken), [200]);
await expect('GET /cart', await api('/cart', {}, customerToken), [200]);
const quoteRes = await api('/checkout/quote', {
  method: 'POST', body: JSON.stringify({ addressId: addrId, shippingMethod: 'STANDARD' }),
}, customerToken);
await expect('POST /checkout/quote', quoteRes, [201]);
const quoteId = ((await quoteRes.clone().json()) as { id: string }).id;
const cancelQuote = await (await api('/checkout/quote', {
  method: 'POST', body: JSON.stringify({ addressId: addrId, shippingMethod: 'STANDARD' }),
}, customerToken)).json() as { id: string };
const cancelOrderRes = await api('/orders', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ quoteId: cancelQuote.id }),
}, customerToken);
if (cancelOrderRes.status === 201) {
  const cancelOrder = await cancelOrderRes.json() as { id: string };
  await expect('POST /orders/:id/cancel', await api(`/orders/${cancelOrder.id}/cancel`, {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ reason: 'All endpoints cancel test' }),
  }, customerToken), [201]);
}

await expect('PUT /cart (re-fill)', await api('/cart', {
  method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }),
}, customerToken), [200]);
const quoteRes2 = await api('/checkout/quote', {
  method: 'POST', body: JSON.stringify({ addressId: addrId, shippingMethod: 'STANDARD' }),
}, customerToken);
await expect('POST /checkout/quote (2)', quoteRes2, [201]);
const quoteId2 = ((await quoteRes2.clone().json()) as { id: string }).id;
const orderPendingRes = await api('/orders', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ quoteId: quoteId2 }),
}, customerToken);
await expect('POST /orders', orderPendingRes, [201]);
const pendingOrder = await orderPendingRes.clone().json() as { id: string };
if (staffId) {
  await expect('PATCH /admin/orders/:id/assign', await api(`/admin/orders/${pendingOrder.id}/assign`, {
    method: 'PATCH', body: JSON.stringify({ staffId }),
  }, adminToken), [200]);
}

const payRes = await api('/payments/attempts', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ orderId: pendingOrder.id }),
}, customerToken);
await expect('POST /payments/attempts', payRes, [201]);
const pay = await payRes.json() as { id: string; amount: number; reconciliationCode: string };
await expect('GET /payments/:id', await api(`/payments/${pay.id}`, {}, customerToken), [200]);
await expect('GET /payments', await api('/payments?limit=5', {}, customerToken), [200]);
await expect('POST /webhooks/payment/gpmpay', await gpmpayWebhook(gpmpayPayload(pay.reconciliationCode, pay.amount)), [204]);

await expect('GET /orders', await api('/orders?limit=5', {}, customerToken), [200]);
await expect('GET /orders/:id', await api(`/orders/${pendingOrder.id}`, {}, customerToken), [200]);
if (staffToken) {
  await expect('GET /admin/orders', await api('/admin/orders?limit=10', {}, staffToken), [200]);
  await expect('PATCH /admin/orders/:id/status', await api(`/admin/orders/${pendingOrder.id}/status`, {
    method: 'PATCH', body: JSON.stringify({ state: 'PREPARING', reason: 'All endpoints preparing' }),
  }, staffToken), [200]);
  await expect('PATCH /admin/orders/:id/shipment', await api(`/admin/orders/${pendingOrder.id}/shipment`, {
    method: 'PATCH',
    body: JSON.stringify({ carrier: 'VNPost', trackingCode: 'ALL001', status: 'IN_TRANSIT' }),
  }, staffToken), [200]);
}

// --- Refund + payment events ---
const evidence = await upload(adminToken, 'refund_evidence');
if (staffToken && evidence) {
  const prop = await api('/admin/refunds', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      paymentAttemptId: pay.id, amount: pay.amount, reason: 'All endpoints refund complete test',
    }),
  }, staffToken);
  await expect('POST /admin/refunds', prop, [201]);
  const refund = await prop.json() as { id: string };
  await expect('PATCH /admin/refunds/:id/beneficiary', await api(`/admin/refunds/${refund.id}/beneficiary`, {
    method: 'PATCH',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ bankBin: '970422', accountNumber: '1234567890', accountName: 'ALL EP' }),
  }, staffToken), [200]);
  await expect('GET /admin/refunds', await api('/admin/refunds?limit=5', {}, adminToken), [200]);
  await expect('GET /admin/refunds/:id', await api(`/admin/refunds/${refund.id}`, {}, staffToken), [200]);
  await expect('PATCH /admin/refunds/:id/approve', await api(`/admin/refunds/${refund.id}/approve`, {
    method: 'PATCH', headers: { 'Idempotency-Key': randomUUID() },
  }, adminToken), [200]);
  await expect('PATCH /admin/refunds/:id/complete', await api(`/admin/refunds/${refund.id}/complete`, {
    method: 'PATCH',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ bankReference: 'ALL-EP-MANUAL', evidenceObjectKey: evidence.objectKey }),
  }, adminToken), [200]);

  await api('/cart', { method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }) }, customerToken);
  const q2 = await (await api('/checkout/quote', {
    method: 'POST', body: JSON.stringify({ addressId: addrId, shippingMethod: 'STANDARD' }),
  }, customerToken)).json() as { id: string };
  const o2 = await (await api('/orders', {
    method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ quoteId: q2.id }),
  }, customerToken)).json() as { id: string };
  const p2 = await (await api('/payments/attempts', {
    method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ orderId: o2.id }),
  }, customerToken)).json() as { id: string; amount: number; reconciliationCode: string };
  await gpmpayWebhook(gpmpayPayload(p2.reconciliationCode, p2.amount));
  const propFail = await api('/admin/refunds', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      paymentAttemptId: p2.id, amount: p2.amount, reason: 'All endpoints refund fail test',
      beneficiary: { bankBin: '970422', accountNumber: '9998887776', accountName: 'FAIL EP' },
    }),
  }, staffToken);
  if (propFail.status === 201) {
    const rf2 = await propFail.json() as { id: string };
    await api(`/admin/refunds/${rf2.id}/approve`, {
      method: 'PATCH', headers: { 'Idempotency-Key': randomUUID() },
    }, adminToken);
    await expect('PATCH /admin/refunds/:id/fail', await api(`/admin/refunds/${rf2.id}/fail`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ reason: 'Bank rejected transfer E2E all endpoints', evidenceObjectKey: evidence.objectKey }),
    }, adminToken), [200]);
  } else fail('POST /admin/refunds (fail path)', String(propFail.status));
}

await expect('GET /admin/payment-events', await api('/admin/payment-events?limit=5', {}, adminToken), [200]);
const wrongWh = await gpmpayWebhook(gpmpayPayload(pay.reconciliationCode, pay.amount - 1));
if (wrongWh.status === 204) ok('POST /webhooks/payment/gpmpay (wrong amount → review event)');
await mongoose.connect(process.env.MONGODB_URI!);
const ev = await mongoose.connection.collection('payment_events').findOne({ resolution: 'REQUIRES_REVIEW' }, { sort: { createdAt: -1 } });
if (ev && evidence) {
  const rev = await api(`/admin/payment-events/${String(ev._id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      decision: 'CLOSED_NO_ACTION',
      note: 'All endpoints review close case',
      evidenceObjectKey: evidence.objectKey,
    }),
  }, adminToken);
  await expect('PATCH /admin/payment-events/:id/review', rev, [200]);
}
await mongoose.disconnect();

// --- Inventory / vouchers ---
await expect('GET /admin/inventory', await api('/admin/inventory', {}, adminToken), [200]);
await expect('GET /admin/inventory/ledger', await api('/admin/inventory/ledger?limit=5', {}, adminToken), [200]);
const inv = await (await api('/admin/inventory', {}, adminToken)).json() as { items: Array<{ variantId: string; version: number }> };
const invRow = inv.items?.find((i) => i.variantId === variantId) ?? inv.items?.[0];
if (invRow && staffToken) {
  await expect('PATCH /admin/inventory', await api('/admin/inventory', {
    method: 'PATCH',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ variantId: invRow.variantId, delta: 1, reason: 'All EP', expectedVersion: invRow.version }),
  }, staffToken), [200]);
}
const vCode = `ALL${Date.now().toString(36).toUpperCase()}`;
const vRes = await api('/admin/vouchers', {
  method: 'POST',
  body: JSON.stringify({
    code: vCode, type: 'FIXED', value: 1000, minimumSubtotal: 0,
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 86400000).toISOString(),
    usageLimit: 10, status: 'ACTIVE',
  }),
}, adminToken);
await expect('POST /admin/vouchers', vRes, [201]);
const vId = ((await vRes.clone().json()) as { id: string }).id;
await expect('GET /admin/vouchers', await api('/admin/vouchers', {}, adminToken), [200]);
await expect('PATCH /admin/vouchers/:id', await api(`/admin/vouchers/${vId}`, {
  method: 'PATCH', body: JSON.stringify({ minimumSubtotal: 2 }),
}, adminToken), [200]);

// --- Lookbooks admin ---
if (lbUp) {
  const lb = await api('/admin/lookbooks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'All EP LB', status: 'DRAFT', mainMediaId: lbUp.mediaId,
      items: [{ productId, x: 0.5, y: 0.5 }],
    }),
  }, adminToken);
  await expect('POST /admin/lookbooks', lb, [201]);
  const lbId = ((await lb.clone().json()) as { id: string }).id;
  await expect('GET /admin/lookbooks', await api('/admin/lookbooks', {}, adminToken), [200]);
  await expect('PATCH /admin/lookbooks/:id', await api(`/admin/lookbooks/${lbId}`, {
    method: 'PATCH',
    body: JSON.stringify({ title: 'All EP LB 2', status: 'DRAFT', mainMediaId: lbUp.mediaId, items: [] }),
  }, adminToken), [200]);
}

// --- Community ---
const comUp = await upload(customerToken, 'community');
let postId = '';
if (comUp) {
  const post = await api('/community/posts', {
    method: 'POST', body: JSON.stringify({ caption: 'All EP', mediaIds: [comUp.mediaId] }),
  }, customerToken);
  await expect('POST /community/posts', post, [201]);
  postId = ((await post.clone().json()) as { id: string }).id;
  await expect('GET /community/posts', await api('/community/posts?limit=5'), [200]);
  await expect('GET /community/posts/:id', await api(`/community/posts/${postId}`), [200]);
  await expect('PATCH /community/posts/:id', await api(`/community/posts/${postId}`, {
    method: 'PATCH', body: JSON.stringify({ caption: 'All EP 2', mediaIds: [comUp.mediaId] }),
  }, customerToken), [200]);
  const c = await api(`/community/posts/${postId}/comments`, {
    method: 'POST', body: JSON.stringify({ body: 'comment' }),
  }, customerToken);
  await expect('POST /community/posts/:id/comments', c, [201]);
  const cId = ((await c.clone().json()) as { id: string }).id;
  await expect('GET /community/posts/:id/comments', await api(`/community/posts/${postId}/comments`), [200]);
  await expect('PATCH /community/posts/:id/comments/:cid', await api(`/community/posts/${postId}/comments/${cId}`, {
    method: 'PATCH', body: JSON.stringify({ body: 'c2' }),
  }, customerToken), [200]);
  await expect('DELETE /community/posts/:id/comments/:cid', await api(`/community/posts/${postId}/comments/${cId}`, { method: 'DELETE' }, customerToken), [204]);
}
await expect('GET /admin/moderation', await api('/admin/moderation?limit=5', {}, adminToken), [200]);
if (postId && staffToken) {
  await expect('PATCH /admin/moderation/:id', await api(`/admin/moderation/${postId}`, {
    method: 'PATCH', body: JSON.stringify({ targetType: 'POST', action: 'HIDE', reason: 'All EP mod hide' }),
  }, staffToken), [200]);
  await expect('PATCH /admin/moderation/:id restore', await api(`/admin/moderation/${postId}`, {
    method: 'PATCH', body: JSON.stringify({ targetType: 'POST', action: 'RESTORE', reason: 'All EP mod restore' }),
  }, staffToken), [200]);
  await expect('DELETE /community/posts/:id', await api(`/community/posts/${postId}`, { method: 'DELETE' }, customerToken), [204]);
}

// --- Reviews (deliver another order quickly) ---
if (staffToken) {
  await api(`/admin/orders/${pendingOrder.id}/shipment`, {
    method: 'PATCH',
    body: JSON.stringify({ carrier: 'VNPost', trackingCode: 'ALL002', status: 'DELIVERED', note: 'delivered' }),
  }, staffToken);
}
const ord = await (await api(`/orders/${pendingOrder.id}`, {}, customerToken)).json() as {
  items: Array<{ lineId: string }>; state: string;
};
if (ord.state === 'DELIVERED' && ord.items[0]?.lineId) {
  await expect('GET /reviews', await api(`/reviews?productId=${productId}&limit=5`), [200]);
  const rv = await api('/reviews', {
    method: 'POST',
    body: JSON.stringify({ orderItemId: ord.items[0].lineId, stars: 5, content: 'All endpoints review' }),
  }, customerToken);
  await expect('POST /reviews', rv, [201]);
  const rId = ((await rv.clone().json()) as { id: string }).id;
  await expect('PATCH /reviews/:id', await api(`/reviews/${rId}`, {
    method: 'PATCH',
    body: JSON.stringify({ orderItemId: ord.items[0].lineId, stars: 4, content: 'updated' }),
  }, customerToken), [200]);
  await expect('DELETE /reviews/:id', await api(`/reviews/${rId}`, { method: 'DELETE' }, customerToken), [204]);
}

// --- Notifications / AI ---
await expect('GET /notifications', await api('/notifications?limit=5', {}, customerToken), [200]);
await expect('PATCH /notifications/read-all', await api('/notifications/read-all', { method: 'PATCH' }, customerToken), [200]);
const tryUp = await upload(customerToken, 'tryon');
if (tryUp) {
  const t = await api('/ai/try-on', {
    method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ inputMediaId: tryUp.mediaId, productIds: [productId], consentPolicyVersion: 'all-ep-1' }),
  }, customerToken);
  if ([202, 503].includes(t.status)) ok(`POST /ai/try-on (${t.status})`);
  else fail('POST /ai/try-on', String(t.status));
  const secondProductId = products.items[1]?.id ?? productId;
  const mm = await api('/ai/mix-match', {
    method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      inputMediaId: tryUp.mediaId,
      productIds: productId === secondProductId ? [productId, products.items[0]!.id] : [productId, secondProductId],
      consentPolicyVersion: 'all-ep-1',
    }),
  }, customerToken);
  if ([202, 503].includes(mm.status)) ok(`POST /ai/mix-match (${mm.status})`);
  else fail('POST /ai/mix-match', String(mm.status));
  if (t.status === 202) {
    const job = await t.json() as { id: string };
    await expect('GET /ai/jobs/:id', await api(`/ai/jobs/${job.id}`, {}, customerToken), [200]);
  }
}
await expect('GET /ai/jobs', await api('/ai/jobs?limit=5', {}, customerToken), [200]);

// --- Admin ops ---
await expect('GET /admin/users', await api('/admin/users?limit=5', {}, adminToken), [200]);
await expect('GET /admin/settings', await api('/admin/settings', {}, adminToken), [200]);
await expect('PATCH /admin/settings', await api('/admin/settings', {
  method: 'PATCH', body: JSON.stringify({ lowStockThreshold: 3 }),
}, adminToken), [200]);
await expect('GET /admin/ai-quotas', await api('/admin/ai-quotas', {}, adminToken), [200]);
await expect('PATCH /admin/ai-quotas', await api('/admin/ai-quotas', {
  method: 'PATCH', body: JSON.stringify({ dailyJobs: 20 }),
}, adminToken), [200]);
await expect('GET /admin/audit-logs', await api('/admin/audit-logs?limit=5', {}, adminToken), [200]);
await expect('GET /admin/reports/sales', await api('/admin/reports/sales', {}, adminToken), [200]);

const me = await (await api('/auth/me', {}, customerToken)).json() as { sub: string };
await expect('PATCH /admin/users/:id', await api(`/admin/users/${me.sub}`, {
  method: 'PATCH', body: JSON.stringify({ status: 'ACTIVE' }),
}, adminToken), [200]);

const newStaffEmail = `staff-all-${Date.now()}@maxxspace.com`;
const st = await api('/admin/staff', {
  method: 'POST', body: JSON.stringify({ email: newStaffEmail, fullName: 'All EP Staff' }),
}, adminToken);
if ([201, 409].includes(st.status)) ok(`POST /admin/staff (${st.status})`);
else fail('POST /admin/staff', String(st.status));

await expect('DELETE /admin/vouchers/:id', await api(`/admin/vouchers/${vId}`, { method: 'DELETE' }, adminToken), [204]);
await expect('DELETE /cart', await api('/cart', { method: 'DELETE' }, customerToken), [204]);
await expect('DELETE /users/me/addresses/:id', await api(`/users/me/addresses/${addrId}`, { method: 'DELETE' }, customerToken), [204]);

console.log('\n=== ALL ENDPOINTS (no SePay) ===');
console.log(`Passed: ${okList.length}, Failed: ${failList.length}`);
if (failList.length) {
  for (const f of failList) console.error(' •', f);
  process.exit(1);
}
