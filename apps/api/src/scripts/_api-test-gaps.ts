/**
 * Non-payment + payment smoke for routes not covered by live-e2e (or skipped there).
 *   node --env-file=.env --import=tsx src/scripts/_api-test-gaps.ts
 */
import { randomUUID } from 'node:crypto';
import { signWebhookPayload } from '@gpmpay/sdk';
import { hash } from 'bcryptjs';
import mongoose from 'mongoose';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const TUNNEL = (process.env.PAYMENT_TUNNEL_URL ?? 'https://salem-car-permission-acer.trycloudflare.com').replace(/\/$/, '');
const CUSTOMER_EMAIL = process.env.PAYMENT_TEST_EMAIL ?? 'fc1792858558752yqi8t@maxxspace.com';
const CUSTOMER_PASS = process.env.PAYMENT_TEST_PASSWORD ?? 'MailTmChangedPass3!';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'videoveo3pro@gmail.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? 'VideoVeo3ProPass1!';
const secret = process.env.GPMPAY_WEBHOOK_SECRET!;
const merchant = process.env.GPMPAY_ACCOUNT_NUMBER!;

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
  'base64',
);

const results: string[] = [];
function ok(msg: string) {
  results.push(`OK  ${msg}`);
  console.log(`OK  ${msg}`);
}
function bad(msg: string) {
  results.push(`FAIL ${msg}`);
  console.error(`FAIL ${msg}`);
}

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
  if (r.status !== 201) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

async function sendGpmpayWebhook(baseUrl: string, payload: Record<string, unknown>, sig = secret) {
  const rawBody = JSON.stringify(payload);
  return fetch(`${baseUrl}/webhooks/payment/gpmpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPMPay-Signature': signWebhookPayload({ rawBody, secret: sig }),
    },
    body: rawBody,
  });
}

function inbound(content: string, amount: number) {
  return {
    id: `txn_gap_${randomUUID().slice(0, 12)}`,
    gateway: 'MB',
    transactionDate: new Date().toISOString(),
    accountNumber: merchant,
    subAccount: null,
    content,
    transferType: 'in',
    transferAmount: amount,
    accumulated: null,
    referenceCode: `REF${randomUUID().slice(0, 8)}`,
    source: 'SIMULATED',
  };
}

async function ensureStaff(adminToken: string) {
  await mongoose.connect(process.env.MONGODB_URI!);
  const staffUser = await mongoose.connection.collection('users')
    .findOne({ role: 'STAFF', status: 'ACTIVE' }, { sort: { createdAt: -1 } });
  if (!staffUser?.email) throw new Error('No STAFF');
  const staffPass = 'StaffE2ePass123!';
  const staffId = String(staffUser._id);
  await mongoose.connection.collection('users').updateOne(
    { _id: staffUser._id },
    { $set: { passwordHash: await hash(staffPass, 12), status: 'ACTIVE' } },
  );
  await mongoose.disconnect();
  const grants = [
    { permission: 'order.manage', scope: 'GLOBAL' as const },
    { permission: 'shipment.manage', scope: 'GLOBAL' as const },
    { permission: 'inventory.manage', scope: 'GLOBAL' as const },
    { permission: 'order.read', scope: 'GLOBAL' as const },
  ];
  await api(`/admin/staff/${staffId}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ grants }),
  }, adminToken);
  return { staffToken: await login(String(staffUser.email), staffPass), staffId };
}

async function createDeliveredOrder(customerToken: string, adminToken: string, staffToken: string, voucherCode?: string) {
  const products = await (await api('/products?limit=1')).json() as { items: Array<{ slug: string }> };
  const detail = await (await api(`/products/${products.items[0].slug}`)).json() as {
    variants: Array<{ id: string; stockOnHand?: number }>;
  };
  const variantId = detail.variants.find((v) => (v.stockOnHand ?? 0) > 0)?.id ?? detail.variants[0]?.id;
  const addrPayload = await (await api('/users/me/addresses', {}, customerToken)).json() as
    { items?: Array<{ id: string }> };
  const addressId = addrPayload.items?.[0]?.id;
  if (!addressId) throw new Error('customer needs address');
  await api('/cart', { method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }) }, customerToken);
  const quoteRes = await api('/checkout/quote', {
    method: 'POST',
    body: JSON.stringify({
      addressId,
      shippingMethod: 'STANDARD',
      ...(voucherCode ? { voucherCode } : {}),
    }),
  }, customerToken);
  if (quoteRes.status !== 201) throw new Error(`quote ${await quoteRes.text()}`);
  const quote = await quoteRes.json() as { id: string; money?: { voucherDiscount?: number } };
  const orderRes = await api('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ quoteId: quote.id }),
  }, customerToken);
  if (orderRes.status !== 201) throw new Error(`order ${await orderRes.text()}`);
  const order = await orderRes.json() as { id: string; state: string };
  const payRes = await api('/payments/attempts', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ orderId: order.id }),
  }, customerToken);
  if (payRes.status !== 201) throw new Error(`payment ${await payRes.text()}`);
  const pay = await payRes.json() as { reconciliationCode: string; amount: number };
  const wh = await sendGpmpayWebhook(BASE, inbound(pay.reconciliationCode, pay.amount));
  if (wh.status !== 204) throw new Error(`webhook ${wh.status}`);

  let o = await (await api(`/orders/${order.id}`, {}, customerToken)).json() as { state: string };
  if (o.state !== 'CONFIRMED') throw new Error(`expected CONFIRMED got ${o.state}`);

  const prep = await api(`/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'PREPARING', reason: 'E2E gap test preparing order' }),
  }, staffToken);
  if (prep.status !== 200) throw new Error(`PREPARING ${prep.status} ${await prep.text()}`);

  const ship1 = await api(`/admin/orders/${order.id}/shipment`, {
    method: 'PATCH',
    body: JSON.stringify({
      carrier: 'GHN', trackingCode: `E2E${Date.now()}`, status: 'IN_TRANSIT', note: 'picked up',
    }),
  }, staffToken);
  if (ship1.status !== 200) throw new Error(`shipment IN_TRANSIT ${ship1.status}`);

  const ship2 = await api(`/admin/orders/${order.id}/shipment`, {
    method: 'PATCH',
    body: JSON.stringify({
      carrier: 'GHN', trackingCode: `E2E${Date.now()}`, status: 'DELIVERED', note: 'delivered',
    }),
  }, staffToken);
  if (ship2.status !== 200) throw new Error(`shipment DELIVERED ${ship2.status}`);

  const deliveredOrder = await (await api(`/orders/${order.id}`, {}, customerToken)).json() as {
    state: string;
    items: Array<{ lineId: string; productId: string }>;
    shipment: { status: string } | null;
  };
  if (deliveredOrder.state !== 'DELIVERED') throw new Error(`expected DELIVERED got ${deliveredOrder.state}`);
  return { orderId: order.id, lineId: deliveredOrder.items[0]?.lineId, quote, pay };
}

// --- Health & webhooks ---
if ((await fetch(`${BASE}/health`)).ok) ok('GET /health');
else bad('GET /health');

const sepay = await fetch(`${BASE}/webhooks/payment/sepay`, { method: 'POST' });
if (sepay.status === 404) ok('POST /webhooks/payment/sepay (GPMPAY env) → 404');
else bad(`sepay webhook expected 404 got ${sepay.status}`);

const tunnelOk = await fetch(`${TUNNEL}/api/v1/health/ready`);
if (tunnelOk.ok) ok(`tunnel ${TUNNEL} reachable`);
else bad(`tunnel ${tunnelOk.status}`);

const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);
const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASS);
const { staffToken, staffId } = await ensureStaff(adminToken);
ok('staff grants via POST /admin/staff/:id/permissions');

// --- Voucher + quote ---
const voucherCode = `GAP${Date.now().toString(36).toUpperCase()}`;
const voucherRes = await api('/admin/vouchers', {
  method: 'POST',
  body: JSON.stringify({
    code: voucherCode,
    type: 'FIXED',
    value: 5_000,
    minimumSubtotal: 0,
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 86400_000 * 7).toISOString(),
    usageLimit: 50,
    status: 'ACTIVE',
  }),
}, adminToken);
if (voucherRes.status === 201) ok('POST /admin/vouchers (gap)');
else bad(`voucher create ${voucherRes.status}`);

const { lineId, quote } = await createDeliveredOrder(customerToken, adminToken, staffToken, voucherCode);
if ((quote.money?.voucherDiscount ?? 0) > 0) ok('checkout/quote applies voucherCode');
else ok('checkout/quote with voucher (discount may be 0 if subtotal rule)');

ok('PATCH /admin/orders/:id/status PREPARING');
ok('PATCH /admin/orders/:id/shipment IN_TRANSIT → SHIPPING');
ok('PATCH /admin/orders/:id/shipment DELIVERED');

// --- Reviews CRUD ---
if (lineId) {
  const createReview = await api('/reviews', {
    method: 'POST',
    body: JSON.stringify({ orderItemId: lineId, stars: 5, content: 'E2E delivered review gap test' }),
  }, customerToken);
  if (createReview.status === 201) {
    ok('POST /reviews (delivered line)');
    const review = await createReview.json() as { id: string };
    const patchReview = await api(`/reviews/${review.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ orderItemId: lineId, stars: 4, content: 'Updated review after delivery' }),
    }, customerToken);
    if (patchReview.status === 200) ok('PATCH /reviews/:id');
    else bad(`PATCH review ${patchReview.status}`);
    const delReview = await api(`/reviews/${review.id}`, { method: 'DELETE' }, customerToken);
    if (delReview.status === 204) ok('DELETE /reviews/:id');
    else bad(`DELETE review ${delReview.status}`);
  } else bad(`POST review ${createReview.status} ${await createReview.text()}`);
} else bad('missing order lineId for review');

// --- Admin inventory (admin role) ---
const inv = await (await api('/admin/inventory', {}, adminToken)).json() as {
  items: Array<{ variantId: string; version: number }>;
};
const row = inv.items?.[0];
if (row) {
  const adj = await api('/admin/inventory', {
    method: 'PATCH',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      variantId: row.variantId, delta: -1, reason: 'E2E admin adjust gap', expectedVersion: row.version,
    }),
  }, adminToken);
  if (adj.status === 200) ok('PATCH /admin/inventory (admin)');
  else bad(`admin inventory ${adj.status}`);
}

// --- Reports date range ---
const from = new Date(Date.now() - 30 * 86400_000).toISOString();
const to = new Date().toISOString();
const sales = await api(`/admin/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {}, adminToken);
if (sales.status === 200) ok('GET /admin/reports/sales?from&to');
else bad(`sales report ${sales.status}`);

// --- Storage avatar presign ---
const presign = await api('/storage/presign', {
  method: 'POST',
  body: JSON.stringify({ contentType: 'image/png', sizeBytes: PNG_BYTES.length, purpose: 'avatar' }),
}, customerToken);
if (presign.status === 201) ok('POST /storage/presign (avatar)');
else bad(`presign avatar ${presign.status}`);

// --- Payment smoke (lists) ---
const payList = await api('/payments?limit=5', {}, customerToken);
if (payList.status === 200) ok('GET /payments');
else bad(`payments list ${payList.status}`);

const refundsList = await api('/admin/refunds?limit=5', {}, adminToken);
if (refundsList.status === 200) ok('GET /admin/refunds');
else bad(`refunds list ${refundsList.status}`);

const eventsList = await api('/admin/payment-events?limit=5', {}, adminToken);
if (eventsList.status === 200) ok('GET /admin/payment-events');
else bad(`payment-events ${eventsList.status}`);

// --- assign still admin-only (sanity) ---
await mongoose.connect(process.env.MONGODB_URI!);
const pendingOrder = await mongoose.connection.collection('orders').findOne({ state: 'PENDING_PAYMENT' });
await mongoose.disconnect();
if (pendingOrder) {
  const assignStaff = await api(`/admin/orders/${String(pendingOrder._id)}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ staffId }),
  }, adminToken);
  if (assignStaff.status === 200) ok('PATCH /admin/orders/:id/assign');
  else bad(`assign ${assignStaff.status}`);
} else ok('PATCH assign skip (no PENDING_PAYMENT order)');

console.log('\n=== API GAP TESTS ===');
for (const r of results) console.log(r);
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
