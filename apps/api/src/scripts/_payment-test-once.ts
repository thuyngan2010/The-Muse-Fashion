import { randomUUID } from 'node:crypto';
import { signWebhookPayload } from '@gpmpay/sdk';

const BASE = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1').replace(/\/$/, '');
const EMAIL = process.env.PAYMENT_TEST_EMAIL ?? 'fc1792858558752yqi8t@maxxspace.com';
const PASS = process.env.PAYMENT_TEST_PASSWORD ?? 'MailTmChangedPass3!';
const SIMULATE_WEBHOOK = process.env.PAYMENT_SIMULATE_WEBHOOK !== 'NO';
const WAIT_GPM = process.env.PAYMENT_WAIT_GPM === 'YES';

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

const loginRes = await api('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: EMAIL, password: PASS }),
});
if (loginRes.status !== 201) {
  console.error('login failed', loginRes.status, await loginRes.text());
  process.exit(1);
}
const token = ((await loginRes.json()) as { accessToken: string }).accessToken;

const products = await (await api('/products?limit=1')).json() as { items: Array<{ slug: string }> };
const slug = products.items?.[0]?.slug;
if (!slug) throw new Error('no products');
const detail = await (await api(`/products/${slug}`)).json() as {
  variants: Array<{ id: string; stockOnHand?: number }>;
};
const variantId = detail.variants?.find((v) => (v.stockOnHand ?? 0) > 0)?.id ?? detail.variants?.[0]?.id;
if (!variantId) throw new Error('no variant');

const addressPayload = await (await api('/users/me/addresses', {}, token)).json() as
  { items?: Array<{ id: string }> } | Array<{ id: string }>;
const addressList = Array.isArray(addressPayload) ? addressPayload : (addressPayload.items ?? []);
let addressId = addressList[0]?.id;
if (!addressId) {
  const createAddrRes = await api('/users/me/addresses', {
    method: 'POST',
    body: JSON.stringify({
      receiver: 'E2E Payer', phone: '0900000000', line1: '1 Test Street',
      ward: 'Phuong 1', district: 'Quan 1', province: 'Ho Chi Minh', isDefault: true,
    }),
  }, token);
  if (createAddrRes.status !== 201) {
    console.error('address create failed', createAddrRes.status, await createAddrRes.text());
    process.exit(1);
  }
  const created = await createAddrRes.json() as { id: string };
  addressId = created.id;
}

await api('/cart', { method: 'PUT', body: JSON.stringify({ items: [{ variantId, quantity: 1 }] }) }, token);
const quoteRes = await api('/checkout/quote', {
  method: 'POST',
  body: JSON.stringify({ addressId, shippingMethod: 'STANDARD' }),
}, token);
if (quoteRes.status !== 201) {
  console.error('quote failed', quoteRes.status, await quoteRes.text());
  process.exit(1);
}
const quote = await quoteRes.json() as { id: string; payableTotal?: number };
if (!quote.id || !/^[0-9a-f-]{36}$/i.test(quote.id)) {
  console.error('quote missing uuid id', quote);
  process.exit(1);
}

const orderRes = await api('/orders', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ quoteId: quote.id }),
}, token);
if (orderRes.status !== 201) {
  console.error('order failed', orderRes.status, await orderRes.text());
  process.exit(1);
}
const order = await orderRes.json() as { id: string; code: string; state: string; money?: { payableTotal: number } };
const amount = order.money?.payableTotal ?? quote.payableTotal ?? 0;
console.log('\n=== ORDER ===');
console.log('code:', order.code);
console.log('id:', order.id);
console.log('state:', order.state);
console.log('payableTotal VND:', amount);

const payRes = await api('/payments/attempts', {
  method: 'POST',
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ orderId: order.id }),
}, token);
if (payRes.status !== 201) {
  console.error('payment attempt failed', payRes.status, await payRes.text());
  process.exit(1);
}
const pay = await payRes.json() as {
  id: string; amount: number; reconciliationCode: string; expiresAt: string;
  bank?: { bin: string; accountNumberMasked: string; accountName: string };
  qrImageUrl?: string;
};

console.log('\n=== THANH TOÁN (chuyển khoản / VietQR) ===');
console.log('Số tiền:', pay.amount, 'VND');
console.log('Nội dung CK (bắt buộc đúng):', pay.reconciliationCode);
if (pay.bank) {
  console.log('Ngân hàng BIN:', pay.bank.bin);
  console.log('STK (masked):', pay.bank.accountNumberMasked);
  console.log('Tên TK:', pay.bank.accountName);
  console.log('STK đầy đủ (env):', process.env.GPMPAY_ACCOUNT_NUMBER);
}
console.log('Hết hạn:', pay.expiresAt);
console.log('QR image URL:', pay.qrImageUrl ?? '(none)');

if (SIMULATE_WEBHOOK) {
  const secret = process.env.GPMPAY_WEBHOOK_SECRET!;
  const accountNumber = process.env.GPMPAY_ACCOUNT_NUMBER!;
  const payload = {
    id: `txn_e2e_${Date.now()}`,
    gateway: 'MB',
    transactionDate: new Date().toISOString(),
    accountNumber,
    subAccount: null,
    content: `Thanh toan ${pay.reconciliationCode}`,
    transferType: 'in',
    transferAmount: pay.amount,
    accumulated: null,
    referenceCode: `REF${randomUUID().slice(0, 8)}`,
    source: 'BANK',
  };
  const rawBody = JSON.stringify(payload);
  const wh = await fetch(`${BASE}/webhooks/payment/gpmpay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-GPMPay-Signature': signWebhookPayload({ rawBody, secret }),
    },
    body: rawBody,
  });
  console.log('\n=== WEBHOOK (simulated BANK) ===', wh.status, await wh.text());
  const orderAfter = await (await api(`/orders/${order.id}`, {}, token)).json() as { state: string };
  const payAfter = await (await api(`/payments/${pay.id}`, {}, token)).json() as { state: string };
  console.log('Order state after:', orderAfter.state);
  console.log('Payment state after:', payAfter.state);
} else if (WAIT_GPM) {
  console.log('\n=== CHỜ GPM (staging: SIMULATED OK) ===');
  console.log('Trên GPM: giao dịch TIỀN VÀO (in) → STK nhận', process.env.GPMPAY_ACCOUNT_NUMBER);
  console.log('Số tiền:', pay.amount, '| Nội dung chứa mã:', pay.reconciliationCode);
  console.log('paymentAttemptId:', pay.id);
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const payAfter = await (await api(`/payments/${pay.id}`, {}, token)).json() as { state: string };
    const orderAfter = await (await api(`/orders/${order.id}`, {}, token)).json() as { state: string };
    console.log(`[poll] payment=${payAfter.state} order=${orderAfter.state}`);
    if (payAfter.state === 'SUCCEEDED' && orderAfter.state === 'CONFIRMED') {
      console.log('\n=== PASS — thanh toán GPM OK ===');
      process.exit(0);
    }
    await sleep(4_000);
  }
  console.error('\n=== TIMEOUT — chưa SUCCEEDED/CONFIRMED sau 10 phút ===');
  process.exit(1);
} else {
  console.log('\n(Dùng PAYMENT_WAIT_GPM=YES để poll sau khi bạn gửi giao dịch giả trên GPM)');
}
