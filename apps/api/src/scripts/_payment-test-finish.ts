import { randomUUID } from 'node:crypto';
import { signWebhookPayload } from '@gpmpay/sdk';
import mongoose from 'mongoose';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const secret = process.env.GPMPAY_WEBHOOK_SECRET!;
const merchant = process.env.GPMPAY_ACCOUNT_NUMBER!;

async function sendWebhook(payload: Record<string, unknown>) {
  const rawBody = JSON.stringify(payload);
  const res = await fetch(`${BASE}/webhooks/payment/gpmpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPMPay-Signature': signWebhookPayload({ rawBody, secret }),
    },
    body: rawBody,
  });
  return { status: res.status, body: await res.text() };
}

function inbound(code: string, amount: number, id?: string) {
  return {
    id: id ?? `txn_in_${randomUUID().slice(0, 12)}`,
    gateway: 'MB',
    transactionDate: new Date().toISOString(),
    accountNumber: merchant,
    subAccount: null,
    content: code,
    transferType: 'in',
    transferAmount: amount,
    accumulated: null,
    referenceCode: `REF${randomUUID().slice(0, 8)}`,
    source: 'SIMULATED',
  };
}

function outbound(code: string, amount: number, counterAccount: string, counterBankBin: string) {
  return {
    id: `txn_out_${randomUUID().slice(0, 12)}`,
    gateway: 'MB',
    transactionDate: new Date().toISOString(),
    accountNumber: merchant,
    subAccount: null,
    content: code,
    transferType: 'out',
    transferAmount: amount,
    accumulated: null,
    referenceCode: `REF${randomUUID().slice(0, 8)}`,
    source: 'SIMULATED',
    counterAccount,
    counterBankBin,
  };
}

const results: string[] = [];
function ok(msg: string) { results.push(`OK  ${msg}`); console.log(`OK  ${msg}`); }
function bad(msg: string) { results.push(`FAIL ${msg}`); console.error(`FAIL ${msg}`); }

// 1) Refund out — full counter fields (auto MATCHED)
const refundWh = await sendWebhook(outbound('RFG7DLBNG5', 130_000, '0123456789', '970422'));
if (refundWh.status === 204) ok('refund webhook out (full BIN/STK)');
else bad(`refund webhook ${refundWh.status} ${refundWh.body}`);

await mongoose.connect(process.env.MONGODB_URI!);
const refund = await mongoose.connection.collection('refunds').findOne({ reconciliationCode: 'RFG7DLBNG5' });
if (refund?.state === 'SUCCEEDED') ok('refund state SUCCEEDED');
else bad(`refund state ${refund?.state}`);

// 2) Pending payment FC57SDX5Z5 — correct amount after wrong-amount review
const payWh = await sendWebhook(inbound('FC57SDX5Z5', 130_000));
if (payWh.status === 204) ok('payment FC57SDX5Z5 correct amount');
const attempt = await mongoose.connection.collection('payment_attempts').findOne({ reconciliationCode: 'FC57SDX5Z5' });
const order = attempt ? await mongoose.connection.collection('orders').findOne({ _id: attempt.orderId }) : null;
if (attempt?.state === 'SUCCEEDED' && order?.state === 'CONFIRMED') ok('order FC57SDX5Z5 CONFIRMED');
else bad(`attempt=${attempt?.state} order=${order?.state}`);

// 3) Webhook retry idempotency — duplicate event id on already-paid attempt
const matched = await mongoose.connection.collection('payment_events').findOne({ resolution: 'MATCHED', content: 'FCLBW2HCVR' });
if (matched?.eventId) {
  const dup = await sendWebhook(inbound('FCLBW2HCVR', 130_000, matched.eventId as string));
  if (dup.status === 204) ok('duplicate webhook eventId (idempotent 204)');
  else bad(`duplicate ${dup.status}`);
  const matchCount = await mongoose.connection.collection('payment_events').countDocuments({ eventId: matched.eventId });
  if (matchCount === 1) ok('single payment_event row for duplicate id');
  else bad(`event rows=${matchCount}`);
} else ok('skip duplicate test (no matched event in db)');

await mongoose.disconnect();

console.log('\n=== PAYMENT SUITE FINISH ===');
for (const r of results) console.log(r);
const fails = results.filter((r) => r.startsWith('FAIL'));
process.exit(fails.length ? 1 : 0);
