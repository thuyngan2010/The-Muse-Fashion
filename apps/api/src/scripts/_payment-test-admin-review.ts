/**
 * Admin payment-event queue: list + PATCH review (evidence upload).
 *   node --env-file=.env --import=tsx src/scripts/_payment-test-admin-review.ts
 */
import { randomUUID } from 'node:crypto';
import { signWebhookPayload } from '@gpmpay/sdk';
import { hash } from 'bcryptjs';
import mongoose from 'mongoose';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
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

async function sendWebhook(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  return fetch(`${BASE}/webhooks/payment/gpmpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPMPay-Signature': signWebhookPayload({ rawBody, secret }),
    },
    body: rawBody,
  });
}

function inbound(content: string, amount: number) {
  return {
    id: `txn_review_${randomUUID().slice(0, 12)}`,
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

async function createPendingPayment(customerToken: string) {
  const products = await (await api('/products?limit=1')).json() as { items: Array<{ slug: string }> };
  const detail = await (await api(`/products/${products.items[0].slug}`)).json() as {
    variants: Array<{ id: string; stockOnHand?: number }>;
  };
  const variantId = detail.variants.find((v) => (v.stockOnHand ?? 0) > 0)?.id ?? detail.variants[0]?.id;
  const addrPayload = await (await api('/users/me/addresses', {}, customerToken)).json() as
    { items?: Array<{ id: string }> };
  let addressId = addrPayload.items?.[0]?.id;
  if (!addressId) {
    const c = await (await api('/users/me/addresses', {
      method: 'POST',
      body: JSON.stringify({
        receiver: 'Review Test', phone: '0900000002', line1: '3 Test',
        ward: 'P1', district: 'Q1', province: 'HCM', isDefault: true,
      }),
    }, customerToken)).json() as { id: string };
    addressId = c.id;
  }
  await api('/cart', { method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }) }, customerToken);
  const quoteRes = await api('/checkout/quote', {
    method: 'POST', body: JSON.stringify({ addressId, shippingMethod: 'STANDARD' }),
  }, customerToken);
  if (quoteRes.status !== 201) throw new Error(`quote ${await quoteRes.text()}`);
  const quote = await quoteRes.json() as { id: string };
  const orderRes = await api('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ quoteId: quote.id }),
  }, customerToken);
  if (orderRes.status !== 201) throw new Error(`order ${await orderRes.text()}`);
  const order = await orderRes.json() as { id: string; code: string };
  const payRes = await api('/payments/attempts', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ orderId: order.id }),
  }, customerToken);
  if (payRes.status !== 201) throw new Error(`payment ${await payRes.text()}`);
  const pay = await payRes.json() as { id: string; amount: number; reconciliationCode: string };
  return { order, pay };
}

async function uploadRefundEvidence(adminToken: string): Promise<string> {
  const presign = await api('/storage/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png', sizeBytes: PNG_BYTES.length, purpose: 'refund_evidence' }),
  }, adminToken);
  if (presign.status !== 201) throw new Error(`presign ${presign.status} ${await presign.text()}`);
  const signed = await presign.json() as {
    uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string>;
  };
  const uploaded = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: signed.requiredHeaders,
    body: new Uint8Array(PNG_BYTES),
  });
  if (!uploaded.ok) throw new Error(`R2 PUT ${uploaded.status}`);
  const finalize = await api('/storage/finalize', {
    method: 'POST',
    body: JSON.stringify({ objectKey: signed.objectKey }),
  }, adminToken);
  if (finalize.status !== 201) throw new Error(`finalize ${finalize.status} ${await finalize.text()}`);
  const media = await finalize.json() as { status: string };
  if (media.status !== 'READY' && media.status !== 'ACTIVE') throw new Error(`media status ${media.status}`);
  ok('admin refund_evidence upload READY');
  return signed.objectKey;
}

async function ensureStaffWithPaymentRead(adminToken: string): Promise<string> {
  await mongoose.connect(process.env.MONGODB_URI!);
  const staffUser = await mongoose.connection.collection('users')
    .findOne({ role: 'STAFF', status: 'ACTIVE' }, { sort: { createdAt: -1 } });
  if (!staffUser?.email) throw new Error('No STAFF user');
  const staffPass = 'StaffE2ePass123!';
  await mongoose.connection.collection('users').updateOne(
    { _id: staffUser._id },
    { $set: { passwordHash: await hash(staffPass, 12), status: 'ACTIVE' } },
  );
  await mongoose.disconnect();
  await api(`/admin/staff/${String(staffUser._id)}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ grants: [{ permission: 'payment.read', scope: 'GLOBAL' }] }),
  }, adminToken);
  return login(String(staffUser.email), staffPass);
}

const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASS);
const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);

const { order, pay } = await createPendingPayment(customerToken);
ok(`pending payment ${pay.reconciliationCode} order ${order.code} amount ${pay.amount}`);

const wrongWh = await sendWebhook(inbound(pay.reconciliationCode, pay.amount - 500));
if (wrongWh.status === 204) ok('webhook wrong amount → REQUIRES_REVIEW');
else bad(`wrong amount webhook ${wrongWh.status} ${await wrongWh.text()}`);

const unmatchedWh = await sendWebhook(inbound('chuyen tien khong ma FC', pay.amount));
if (unmatchedWh.status === 204) ok('webhook no valid code → UNMATCHED/REQUIRES_REVIEW');
else bad(`unmatched webhook ${unmatchedWh.status}`);

await mongoose.connect(process.env.MONGODB_URI!);
const reviewEvent = await mongoose.connection.collection('payment_events').findOne({
  matchedAttemptId: new mongoose.Types.ObjectId(pay.id),
  resolution: 'REQUIRES_REVIEW',
});
const unmatchedEvent = await mongoose.connection.collection('payment_events').findOne({
  eventId: { $regex: /^txn_review_/ },
  content: 'chuyen tien khong ma FC',
});
await mongoose.disconnect();

if (!reviewEvent?._id) bad('no REQUIRES_REVIEW event for wrong amount');
else ok(`found review event ${String(reviewEvent._id)}`);

const customerList = await api('/admin/payment-events?limit=5', {}, customerToken);
if (customerList.status === 403) ok('customer forbidden GET /admin/payment-events');
else bad(`customer list expected 403 got ${customerList.status}`);

const staffToken = await ensureStaffWithPaymentRead(adminToken);
const staffList = await api('/admin/payment-events?limit=50', {}, staffToken);
if (staffList.status === 200) ok('staff payment.read can list payment-events');
else bad(`staff list ${staffList.status} ${await staffList.text()}`);

const staffPatch = await api(`/admin/payment-events/${String(reviewEvent?._id)}/review`, {
  method: 'PATCH',
  body: JSON.stringify({
    decision: 'CLOSED_NO_ACTION',
    note: 'Staff cannot review — expect 403',
    evidenceObjectKey: 'refund_evidence/x/x.png',
  }),
}, staffToken);
if (staffPatch.status === 403) ok('staff forbidden PATCH review');
else bad(`staff patch expected 403 got ${staffPatch.status}`);

let evidenceKey: string;
try {
  evidenceKey = await uploadRefundEvidence(adminToken);
} catch (e) {
  bad(`evidence upload: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

const adminList = await api('/admin/payment-events?limit=50', {}, adminToken);
if (adminList.status !== 200) bad(`admin list ${adminList.status}`);
else {
  const body = await adminList.json() as { total: number; items: Array<{ id: string; resolution: string }> };
  const ids = new Set(body.items.map((i) => i.id));
  if (reviewEvent && ids.has(String(reviewEvent._id))) ok(`admin list includes wrong-amount event (total queue ${body.total})`);
  else bad('admin list missing wrong-amount event');
}

if (reviewEvent?._id) {
  const closeRes = await api(`/admin/payment-events/${String(reviewEvent._id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      decision: 'CLOSED_NO_ACTION',
      note: 'E2E: sai 500 VND, đóng case không auto confirm đơn.',
      evidenceObjectKey: evidenceKey,
    }),
  }, adminToken);
  if (closeRes.status === 200) {
    const closed = await closeRes.json() as { resolution: string; reviewDecision: string };
    if (closed.resolution === 'CLOSED_NO_ACTION') ok('PATCH review CLOSED_NO_ACTION');
    else bad(`resolution ${closed.resolution}`);
  } else bad(`close review ${closeRes.status} ${await closeRes.text()}`);

  const dup = await api(`/admin/payment-events/${String(reviewEvent._id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      decision: 'ESCALATED',
      note: 'Duplicate review should conflict',
      evidenceObjectKey: evidenceKey,
    }),
  }, adminToken);
  if (dup.status === 409) ok('duplicate review → 409 Conflict');
  else bad(`duplicate review expected 409 got ${dup.status}`);
}

if (unmatchedEvent?._id) {
  const escRes = await api(`/admin/payment-events/${String(unmatchedEvent._id)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({
      decision: 'ESCALATED',
      note: 'E2E: giao dịch không khớp mã, chuyển cấp trên xử lý.',
      evidenceObjectKey: evidenceKey,
    }),
  }, adminToken);
  if (escRes.status === 200) {
    const esc = await escRes.json() as { resolution: string };
    if (esc.resolution === 'ESCALATED') ok('PATCH review ESCALATED (vẫn trong queue)');
    else bad(`escalate resolution ${esc.resolution}`);
  } else bad(`escalate ${escRes.status} ${await escRes.text()}`);
}

await mongoose.connect(process.env.MONGODB_URI!);
const orderAfter = await mongoose.connection.collection('orders').findOne({ _id: new mongoose.Types.ObjectId(order.id) });
const attemptAfter = await mongoose.connection.collection('payment_attempts').findOne({ _id: new mongoose.Types.ObjectId(pay.id) });
const auditCount = await mongoose.connection.collection('audit_logs').countDocuments({
  entityType: 'payment_event',
  entityId: String(reviewEvent?._id),
  action: 'payment.event.review',
});
await mongoose.disconnect();

if (orderAfter?.state === 'PENDING_PAYMENT' && attemptAfter?.state === 'PENDING') {
  ok('order still PENDING after admin close (no auto-confirm)');
} else bad(`order=${orderAfter?.state} attempt=${attemptAfter?.state}`);

if (auditCount >= 1) ok('audit payment.event.review recorded');
else bad('missing audit log');

console.log('\n=== ADMIN PAYMENT REVIEW ===');
for (const r of results) console.log(r);
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
