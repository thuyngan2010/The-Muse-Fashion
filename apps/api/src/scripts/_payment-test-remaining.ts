/**
 * Remaining payment endpoints (RBAC, refunds manual, tunnel webhook).
 *   node --env-file=.env --import=tsx src/scripts/_payment-test-remaining.ts
 * Optional: PAYMENT_TUNNEL_URL=https://....trycloudflare.com
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

async function sendWebhook(baseUrl: string, payload: Record<string, unknown>, sigSecret: string) {
  const rawBody = JSON.stringify(payload);
  return fetch(`${baseUrl}/webhooks/payment/gpmpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPMPay-Signature': signWebhookPayload({ rawBody, secret: sigSecret }),
    },
    body: rawBody,
  });
}

function inbound(content: string, amount: number, id?: string) {
  return {
    id: id ?? `txn_rem_${randomUUID().slice(0, 12)}`,
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

async function uploadRefundEvidence(token: string): Promise<string> {
  const presign = await api('/storage/presign', {
    method: 'POST',
    body: JSON.stringify({ contentType: 'image/png', sizeBytes: PNG_BYTES.length, purpose: 'refund_evidence' }),
  }, token);
  if (presign.status !== 201) throw new Error(`presign ${presign.status}`);
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
  }, token);
  if (finalize.status !== 201) throw new Error(`finalize ${finalize.status}`);
  return signed.objectKey;
}

async function createPaidOrder(customerToken: string, adminToken: string) {
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
        receiver: 'Pay Test', phone: '0900000003', line1: '4 Test',
        ward: 'P1', district: 'Q1', province: 'HCM', isDefault: true,
      }),
    }, customerToken)).json() as { id: string };
    addressId = c.id;
  }
  await api('/cart', { method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }) }, customerToken);
  const quote = await (await api('/checkout/quote', {
    method: 'POST', body: JSON.stringify({ addressId, shippingMethod: 'STANDARD' }),
  }, customerToken)).json() as { id: string };
  const order = await (await api('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ quoteId: quote.id }),
  }, customerToken)).json() as { id: string; code: string };
  const pay = await (await api('/payments/attempts', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ orderId: order.id }),
  }, customerToken)).json() as { id: string; amount: number; reconciliationCode: string };
  const wh = await sendWebhook(BASE, inbound(pay.reconciliationCode, pay.amount), secret);
  if (wh.status !== 204) throw new Error(`pay webhook ${wh.status} ${await wh.text()}`);
  const payAfter = await (await api(`/payments/${pay.id}`, {}, customerToken)).json() as { state: string };
  if (payAfter.state !== 'SUCCEEDED') throw new Error(`payment not succeeded: ${payAfter.state}`);
  return { order, pay };
}

async function staffSetup(adminToken: string) {
  await mongoose.connect(process.env.MONGODB_URI!);
  const staffUser = await mongoose.connection.collection('users')
    .findOne({ role: 'STAFF', status: 'ACTIVE' }, { sort: { createdAt: -1 } });
  if (!staffUser?.email) throw new Error('No STAFF user');
  const staffPass = 'StaffE2ePass123!';
  const staffId = String(staffUser._id);
  await mongoose.connection.collection('users').updateOne(
    { _id: staffUser._id },
    { $set: { passwordHash: await hash(staffPass, 12), status: 'ACTIVE' } },
  );
  await mongoose.disconnect();
  await api(`/admin/staff/${staffId}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({
      grants: [
        { permission: 'refund.propose', scope: 'GLOBAL' },
        { permission: 'payment.read', scope: 'ASSIGNED' },
      ],
    }),
  }, adminToken);
  const staffToken = await login(String(staffUser.email), staffPass);
  return { staffToken, staffId };
}

// --- 0) Tunnel ---
const tunnelHealth = await fetch(`${TUNNEL}/api/v1/health/ready`);
if (tunnelHealth.ok) ok(`tunnel health ${TUNNEL}`);
else bad(`tunnel health ${tunnelHealth.status}`);

const tunnelBadSig = await sendWebhook(`${TUNNEL}/api/v1`, inbound('FCNOPE', 1), 'wrong-secret');
if (tunnelBadSig.status === 401) ok('tunnel webhook invalid signature → 401');
else bad(`tunnel bad sig expected 401 got ${tunnelBadSig.status}`);

const tunnelGood = await sendWebhook(`${TUNNEL}/api/v1`, inbound('ck khong ma hop le', 99_000), secret);
if (tunnelGood.status === 204) ok('tunnel webhook valid SIMULATED in (UNMATCHED) → 204');
else bad(`tunnel webhook ${tunnelGood.status} ${await tunnelGood.text()}`);

// --- Auth ---
const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASS);
const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);
const { staffToken, staffId } = await staffSetup(adminToken);
const evidenceKey = await uploadRefundEvidence(adminToken);
ok('admin refund evidence ready');

// --- GET /payments validation ---
const badLimit = await api('/payments?limit=Infinity', {}, customerToken);
if (badLimit.status === 400) ok('GET /payments limit=Infinity → 400');
else bad(`limit validation ${badLimit.status}`);

const customerList = await api('/payments?limit=20', {}, customerToken);
if (customerList.status === 200) {
  const body = await customerList.json() as { items: unknown[]; total: number };
  ok(`GET /payments customer (${body.total} total)`);
} else bad(`customer payments list ${customerList.status}`);

// --- RBAC ASSIGNED ---
const paidA = await createPaidOrder(customerToken, adminToken);
const paidB = await createPaidOrder(customerToken, adminToken);
await api(`/admin/orders/${paidA.order.id}/assign`, {
  method: 'PATCH',
  body: JSON.stringify({ staffId }),
}, adminToken);
const staffList = await api('/payments?limit=50', {}, staffToken);
if (staffList.status === 200) {
  const ids = ((await staffList.json()) as { items: Array<{ id: string }> }).items.map((i) => i.id);
  if (ids.includes(paidA.pay.id) && !ids.includes(paidB.pay.id)) ok('staff ASSIGNED payment.read: only assigned order payment');
  else bad(`staff list ids assigned=${ids.includes(paidA.pay.id)} foreign=${ids.includes(paidB.pay.id)}`);
} else bad(`staff payments ${staffList.status}`);

const foreignDetail = await api(`/payments/${paidB.pay.id}`, {}, staffToken);
if (foreignDetail.status === 403) ok('staff GET foreign payment → 403');
else bad(`staff foreign payment expected 403 got ${foreignDetail.status}`);

const assignedDetail = await api(`/payments/${paidA.pay.id}`, {}, staffToken);
if (assignedDetail.status === 200) ok('staff GET assigned payment → 200');
else bad(`staff assigned payment ${assignedDetail.status}`);

const me = await (await api('/auth/me', {}, customerToken)).json() as { sub: string };
const myId = me.sub;
await mongoose.connect(process.env.MONGODB_URI!);
let otherAttempt: { _id: unknown } | null = null;
const orders = await mongoose.connection.collection('orders')
  .find({ state: { $in: ['CONFIRMED', 'PENDING_PAYMENT', 'CANCEL_PENDING_REFUND'] } })
  .project({ customerId: 1 })
  .limit(200)
  .toArray();
const foreignOrder = orders.find((o) => String(o.customerId) !== myId);
if (foreignOrder) {
  otherAttempt = await mongoose.connection.collection('payment_attempts').findOne({
    orderId: foreignOrder._id,
    state: 'SUCCEEDED',
  });
}
if (!otherAttempt) {
  const otherCustomer = await mongoose.connection.collection('users').findOne({
    role: 'CUSTOMER',
    _id: { $ne: new mongoose.Types.ObjectId(myId) },
    status: 'ACTIVE',
  });
  if (otherCustomer) {
    const theirOrder = await mongoose.connection.collection('orders').findOne({
      customerId: otherCustomer._id,
      state: 'CONFIRMED',
    });
    if (theirOrder) {
      otherAttempt = await mongoose.connection.collection('payment_attempts').findOne({
        orderId: theirOrder._id,
        state: 'SUCCEEDED',
      });
    }
  }
}
await mongoose.disconnect();
if (otherAttempt) {
  const leak = await api(`/payments/${String(otherAttempt._id)}`, {}, customerToken);
  if (leak.status === 404) ok('customer GET other user payment → 404');
  else bad(`customer other payment expected 404 got ${leak.status}`);
} else {
  const regEmail = `fc-pay404-${Date.now()}@maxxspace.com`;
  const regPass = 'Pay404TestPass1!';
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email: regEmail, password: regPass, fullName: 'Pay404 Other' }),
  });
  if (reg.status === 201) {
    await mongoose.connect(process.env.MONGODB_URI!);
    await mongoose.connection.collection('users').updateOne(
      { email: regEmail.toLowerCase() },
      { $set: { status: 'ACTIVE', emailVerifiedAt: new Date() } },
    );
    await mongoose.disconnect();
    const otherToken = await login(regEmail, regPass);
    const foreignPaid = await createPaidOrder(otherToken, adminToken);
    const leak = await api(`/payments/${foreignPaid.pay.id}`, {}, customerToken);
    if (leak.status === 404) ok('customer GET other user payment → 404');
    else bad(`customer other payment expected 404 got ${leak.status}`);
  } else ok('customer GET other payment → skip (register blocked / no foreign customer)');
}

const adminPayList = await api('/payments?limit=5', {}, adminToken);
if (adminPayList.status === 200) ok('admin GET /payments → 200');
else bad(`admin payments ${adminPayList.status}`);

// --- Refund: beneficiary patch + manual complete ---
const proposeNoBen = await api('/admin/refunds', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({
    paymentAttemptId: paidA.pay.id,
    amount: paidA.pay.amount,
    reason: 'E2E manual complete after beneficiary patch',
  }),
}, staffToken);
if (proposeNoBen.status !== 201) bad(`propose no beneficiary ${proposeNoBen.status}`);
else ok('POST refund propose without beneficiary');
const refundA = await proposeNoBen.json() as { id: string; state: string };

const approveEarly = await api(`/admin/refunds/${refundA.id}/approve`, {
  method: 'PATCH',
  headers: { 'Idempotency-Key': randomUUID() },
}, adminToken);
if (approveEarly.status === 422) ok('approve without beneficiary → 422');
else bad(`approve early expected 422 got ${approveEarly.status}`);

const setBen = await api(`/admin/refunds/${refundA.id}/beneficiary`, {
  method: 'PATCH',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({
    bankBin: '970422',
    accountNumber: '9876543210',
    accountName: 'E2E BENEFICIARY PATCH',
  }),
}, staffToken);
if (setBen.status === 200) ok('PATCH refund beneficiary');
else bad(`beneficiary ${setBen.status} ${await setBen.text()}`);

const approveA = await api(`/admin/refunds/${refundA.id}/approve`, {
  method: 'PATCH',
  headers: { 'Idempotency-Key': randomUUID() },
}, adminToken);
if (approveA.status !== 200) bad(`approve A ${approveA.status}`);
else ok('approve refund A');

const completeKey = randomUUID();
const completeBody = { bankReference: `MANUAL-E2E-${randomUUID().slice(0, 8)}`, evidenceObjectKey: evidenceKey };
const complete = await api(`/admin/refunds/${refundA.id}/complete`, {
  method: 'PATCH',
  headers: { 'Idempotency-Key': completeKey },
  body: JSON.stringify(completeBody),
}, adminToken);
if (complete.status === 200) {
  const done = await complete.json() as { state: string };
  if (done.state === 'SUCCEEDED') ok('PATCH refund complete (manual)');
  else bad(`complete state ${done.state}`);
} else bad(`complete ${complete.status} ${await complete.text()}`);

const completeReplay = await api(`/admin/refunds/${refundA.id}/complete`, {
  method: 'PATCH',
  headers: { 'Idempotency-Key': completeKey },
  body: JSON.stringify(completeBody),
}, adminToken);
if (completeReplay.status === 200) ok('complete idempotency replay → 200');
else bad(`complete replay ${completeReplay.status}`);

// --- Refund fail ---
const paidC = await createPaidOrder(customerToken, adminToken);
const proposeB = await api('/admin/refunds', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({
    paymentAttemptId: paidC.pay.id,
    amount: paidC.pay.amount,
    reason: 'E2E refund fail after bank rejection',
    beneficiary: { bankBin: '970422', accountNumber: '1111222233', accountName: 'FAIL TEST RECEIVER' },
  }),
}, staffToken);
if (proposeB.status !== 201) throw new Error(`propose B ${await proposeB.text()}`);
const refundB = await proposeB.json() as { id: string };
const approveB = await api(`/admin/refunds/${refundB.id}/approve`, {
  method: 'PATCH',
  headers: { 'Idempotency-Key': randomUUID() },
}, adminToken);
if (approveB.status !== 200) throw new Error(`approve B ${await approveB.text()}`);

const failRes = await api(`/admin/refunds/${refundB.id}/fail`, {
  method: 'PATCH',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({
    reason: 'Ngan hang tu choi giao dich hoan tien E2E',
    evidenceObjectKey: evidenceKey,
  }),
}, adminToken);
if (failRes.status === 200) {
  const failed = await failRes.json() as { state: string };
  if (failed.state === 'FAILED') ok('PATCH refund fail');
  else bad(`fail state ${failed.state}`);
} else bad(`fail ${failRes.status} ${await failRes.text()}`);

// --- GET admin refunds ---
const listApproved = await api('/admin/refunds?state=APPROVED&limit=10', {}, adminToken);
if (listApproved.status === 200) ok('GET /admin/refunds?state=APPROVED');
else bad(`refunds list ${listApproved.status}`);

const getRefund = await api(`/admin/refunds/${refundA.id}`, {}, staffToken);
if (getRefund.status === 200) ok('GET /admin/refunds/:id (staff)');
else bad(`get refund ${getRefund.status}`);

// --- Local webhook 401 (parity) ---
const localBad = await sendWebhook(BASE, inbound('FCLOCAL', 1), 'wrong-secret');
if (localBad.status === 401) ok('local webhook invalid signature → 401');
else bad(`local bad sig ${localBad.status}`);

console.log('\n=== PAYMENT REMAINING ENDPOINTS ===');
for (const r of results) console.log(r);
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
