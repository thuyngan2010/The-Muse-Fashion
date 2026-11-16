import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import {
  authed, connectDb, login, seedUser, seedOrder, seedPaymentAttempt, startApi, uniqueDbName,
} from '../../tests/helpers/api-harness.mjs';

const dbName = uniqueDbName('fc_audit_commerce');
const db = await connectDb(dbName);
let api;
const results = [];
async function capture(label, response) {
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  results.push({ label, status: response.status, body });
  return body;
}
try {
  api = await startApi(dbName, { PAYMENT_PROVIDER: 'SEPAY' });
  const customer = await seedUser(db, 'CUSTOMER', 'audit-zero-customer');
  const admin = await seedUser(db, 'ADMIN', 'audit-commerce-admin');
  const customerRequest = authed(api, (await login(api, customer.email)).accessToken);
  const adminRequest = authed(api, (await login(api, admin.email)).accessToken);
  const customerId = new Types.ObjectId(customer.id);
  const addressId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  const variantId = new Types.ObjectId();
  await db.collection('addresses').insertOne({ _id: addressId, customerId, receiver: 'Audit Customer',
    phone: '0901234567', location: { line1: '1 Test', ward: '1', district: '1', province: 'HCM' } });
  await db.collection('products').insertOne({ _id: productId, slug: randomUUID(), name: 'Audit product',
    price: 1_000_000, currency: 'VND', status: 'PUBLISHED' });
  await db.collection('product_variants').insertOne({ _id: variantId, productId, sku: randomUUID(),
    price: 1_000_000, stockOnHand: 10, reserved: 0, version: 1, status: 'ACTIVE' });
  await db.collection('carts').insertOne({ customerId, items: [{ variantId, quantity: 1 }] });
  await capture('create_valid_100_percent_voucher', await adminRequest('/admin/vouchers', {
    method: 'POST', body: JSON.stringify({ code: 'AUDITFREE100', type: 'PERCENT', value: 100,
      minimumSubtotal: 0, status: 'ACTIVE', usageLimit: 10,
      validFrom: new Date(Date.now() - 60_000).toISOString(), validTo: new Date(Date.now() + 600_000).toISOString() }),
  }));
  const quote = await capture('zero_total_quote', await customerRequest('/checkout/quote', {
    method: 'POST', body: JSON.stringify({ addressId: String(addressId), voucherCode: 'AUDITFREE100' }),
  }));
  const order = await capture('zero_total_order', await customerRequest('/orders', {
    method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ quoteId: quote.id }),
  }));
  const attempt = await capture('zero_total_payment_attempt', await customerRequest('/payments/attempts', {
    method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ orderId: order.id }),
  }));
  await capture('zero_transfer_webhook', await fetch(`${api.baseUrl}/webhooks/payment/sepay`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Apikey integration-sepay-webhook-key' },
    body: JSON.stringify({ id: 991122, gateway: 'MB', transactionDate: new Date().toISOString(), accountNumber: '0123456789',
      content: `Payment ${attempt.reconciliationCode}`, transferType: 'in', transferAmount: 0, referenceCode: 'AUDITZERO' }),
  }));
  await capture('zero_total_admin_confirm', await adminRequest(`/admin/orders/${order.id}/status`, {
    method: 'PATCH', body: JSON.stringify({ state: 'CONFIRMED', reason: 'Zero total needs no payment', expectedVersion: 1 }),
  }));
  results.push({ label: 'zero_order_db_state', order: await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }),
    reservedStock: (await db.collection('product_variants').findOne({ _id: variantId }))?.reserved });

  const shipping = await seedOrder(db, customer.id, { state: 'SHIPPING' });
  await seedPaymentAttempt(db, shipping.id, { state: 'SUCCEEDED', provider: 'SEPAY' });
  await db.collection('shipments').insertOne({ orderId: new Types.ObjectId(shipping.id), carrier: 'Test Carrier',
    trackingCode: 'TRACKAUDIT', status: 'IN_TRANSIT', events: [] });
  await capture('shipment_failed', await adminRequest(`/admin/orders/${shipping.id}/shipment`, {
    method: 'PATCH', body: JSON.stringify({ carrier: 'Test Carrier', trackingCode: 'TRACKAUDIT', status: 'FAILED', note: 'Recipient temporarily unavailable' }),
  }));
  await capture('shipment_retry_after_failed', await adminRequest(`/admin/orders/${shipping.id}/shipment`, {
    method: 'PATCH', body: JSON.stringify({ carrier: 'Test Carrier', trackingCode: 'TRACKAUDIT', status: 'IN_TRANSIT', note: 'Retry next day' }),
  }));
  await capture('shipment_cancel_after_failed', await adminRequest(`/orders/${shipping.id}/cancel`, {
    method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ reason: 'Delivery failed permanently' }),
  }));
  results.push({ label: 'failed_shipment_db_state', orderState: (await db.collection('orders').findOne({ _id: new Types.ObjectId(shipping.id) }))?.state,
    shipmentStatus: (await db.collection('shipments').findOne({ orderId: new Types.ObjectId(shipping.id) }))?.status });
} finally {
  await api?.stop();
  await db.dropDatabase();
  await db.close();
  await writeFile(new URL('./commerce-results.json', import.meta.url), JSON.stringify({ isolatedTestDatabase: dbName, results }, null, 2));
}
console.log(JSON.stringify(results.map(r => ({ label: r.label, status: r.status, state: r.body?.state, amount: r.body?.amount,
  payableTotal: r.body?.payableTotal, message: r.body?.message, orderState: r.orderState, shipmentStatus: r.shipmentStatus })), null, 2));
