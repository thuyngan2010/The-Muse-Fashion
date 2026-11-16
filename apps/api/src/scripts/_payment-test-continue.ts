/**
 * Interactive GPM payment tests (staging). Usage:
 *   node --env-file=.env --import=tsx src/scripts/_payment-test-continue.ts wrong-amount
 *   node --env-file=.env --import=tsx src/scripts/_payment-test-continue.ts refund-out
 */
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { hash } from 'bcryptjs';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const CUSTOMER_EMAIL = process.env.PAYMENT_TEST_EMAIL ?? 'fc1792858558752yqi8t@maxxspace.com';
const CUSTOMER_PASS = process.env.PAYMENT_TEST_PASSWORD ?? 'MailTmChangedPass3!';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'videoveo3pro@gmail.com';
const ADMIN_PASS = process.env.E2E_ADMIN_PASSWORD ?? 'VideoVeo3ProPass1!';

const mode = process.argv[2] ?? 'wrong-amount';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
        receiver: 'Refund Test', phone: '0900000001', line1: '2 Test',
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

async function pollPayment(
  token: string,
  payId: string,
  orderId: string,
  expectSuccess: boolean,
  minutes = 8,
) {
  const deadline = Date.now() + minutes * 60_000;
  while (Date.now() < deadline) {
    const pay = await (await api(`/payments/${payId}`, {}, token)).json() as { state: string };
    const order = await (await api(`/orders/${orderId}`, {}, token)).json() as { state: string };
    console.log(`[poll] payment=${pay.state} order=${order.state}`);
    if (expectSuccess && pay.state === 'SUCCEEDED' && order.state === 'CONFIRMED') return true;
    if (!expectSuccess && pay.state === 'PENDING' && order.state === 'PENDING_PAYMENT') {
      await mongoose.connect(process.env.MONGODB_URI!);
      const ev = await mongoose.connection.collection('payment_events')
        .find({ matchedAttemptId: new mongoose.Types.ObjectId(payId) }).sort({ createdAt: -1 }).limit(1).toArray();
      await mongoose.disconnect();
      if (ev[0]?.resolution === 'REQUIRES_REVIEW') return true;
    }
    await sleep(4000);
  }
  return false;
}

async function wrongAmountTest(customerToken: string) {
  const { order, pay } = await createPendingPayment(customerToken);
  const wrong = pay.amount - 1000;
  console.log('\n=== TEST A: SAI SỐ TIỀN (expect REQUIRES_REVIEW, order vẫn PENDING) ===');
  console.log('Order:', order.code);
  console.log('Mã CK (đúng):', pay.reconciliationCode);
  console.log('Số tiền ĐÚNG trên hệ thống:', pay.amount, 'VND');
  console.log('\n>>> Trên GPM: TIỀN VÀO, STK', process.env.GPMPAY_ACCOUNT_NUMBER);
  console.log('>>> Nội dung có mã:', pay.reconciliationCode);
  console.log('>>> Số tiền GPM nhập:', wrong, '(SAI — thiếu 1.000 VND)\n');
  const ok = await pollPayment(customerToken, pay.id, order.id, false);
  await mongoose.connect(process.env.MONGODB_URI!);
  const events = await mongoose.connection.collection('payment_events')
    .find({}).sort({ createdAt: -1 }).limit(3).project({ resolution: 1, transferAmount: 1, content: 1 }).toArray();
  await mongoose.disconnect();
  console.log('Recent payment_events:', events);
  console.log(ok ? '\n=== PASS A ===' : '\n=== FAIL A (timeout or wrong resolution) ===');
  return ok;
}

async function refundOutTest(adminToken: string, customerToken: string) {
  await mongoose.connect(process.env.MONGODB_URI!);
  const attempt = await mongoose.connection.collection('payment_attempts')
    .findOne({ state: 'SUCCEEDED' }, { sort: { paidAt: -1 } });
  await mongoose.disconnect();
  if (!attempt) throw new Error('No SUCCEEDED payment attempt for refund test');

  await mongoose.connect(process.env.MONGODB_URI!);
  const staffUser = await mongoose.connection.collection('users')
    .findOne({ role: 'STAFF', status: 'ACTIVE' }, { sort: { createdAt: -1 } });
  await mongoose.disconnect();
  if (!staffUser?.email) throw new Error('No active STAFF user — run staff E2E first');
  const staffPass = 'StaffE2ePass123!';
  await mongoose.connect(process.env.MONGODB_URI!);
  await mongoose.connection.collection('users').updateOne(
    { _id: staffUser._id },
    { $set: { passwordHash: await hash(staffPass, 12), status: 'ACTIVE' } },
  );
  await mongoose.disconnect();
  const staffToken = await login(String(staffUser.email), staffPass);
  await api(`/admin/staff/${String(staffUser._id)}/permissions`, {
    method: 'PATCH',
    body: JSON.stringify({ grants: [{ permission: 'refund.propose', scope: 'GLOBAL' }] }),
  }, adminToken);

  const beneficiary = {
    bankBin: '970422',
    accountNumber: '0123456789',
    accountName: 'TEST CUSTOMER RECEIVER',
  };

  const propose = await api('/admin/refunds', {
    method: 'POST',
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      paymentAttemptId: String(attempt._id),
      amount: attempt.expectedAmount,
      reason: 'E2E GPM refund out test',
      beneficiary,
    }),
  }, staffToken);
  if (propose.status !== 201) throw new Error(`propose ${await propose.text()}`);
  const refund = await propose.json() as { id: string; state: string };

  const approve = await api(`/admin/refunds/${refund.id}/approve`, {
    method: 'PATCH',
    headers: { 'Idempotency-Key': randomUUID() },
  }, adminToken);
  if (approve.status !== 200) throw new Error(`approve ${await approve.text()}`);
  const approved = await approve.json() as { reconciliationCode: string; amount: number; state: string };

  console.log('\n=== TEST B: REFUND TIỀN RA (GPM out) ===');
  console.log('refundId:', refund.id);
  console.log('Mã RF:', approved.reconciliationCode);
  console.log('Số tiền:', approved.amount);
  console.log('\n>>> Trên GPM: TIỀN RA (out) từ STK merchant', process.env.GPMPAY_ACCOUNT_NUMBER);
  console.log('>>> Nội dung có mã:', approved.reconciliationCode);
  console.log('>>> Số tiền:', approved.amount);
  console.log('>>> Người nhận STK:', beneficiary.accountNumber, 'BIN:', beneficiary.bankBin);
  console.log('>>> Tên nhận:', beneficiary.accountName, '\n');

  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    const r = await (await api(`/admin/refunds/${refund.id}`, {}, adminToken)).json() as { state: string };
    console.log('[poll] refund state=', r.state);
    if (r.state === 'SUCCEEDED') {
      console.log('\n=== PASS B ===');
      return true;
    }
    await sleep(4000);
  }
  console.log('\n=== FAIL B (timeout) ===');
  return false;
}

const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASS);
let pass = false;
if (mode === 'wrong-amount') {
  pass = await wrongAmountTest(customerToken);
} else if (mode === 'refund-out') {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASS);
  pass = await refundOutTest(adminToken, customerToken);
} else {
  console.error('Unknown mode. Use: wrong-amount | refund-out');
  process.exit(1);
}
process.exit(pass ? 0 : 1);
