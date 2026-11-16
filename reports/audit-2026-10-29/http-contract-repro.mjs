import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Types } from 'mongoose';
import { authed, connectDb, login, seedUser, seedOrder, seedPaymentAttempt, startApi, uniqueDbName } from '../../tests/helpers/api-harness.mjs';

const dbName = uniqueDbName('audit_http_contracts');
const db = await connectDb(dbName);
const results = {};
let api;
async function jsonResponse(response, expected) {
  const body = await response.json().catch(() => null);
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
try {
  api = await startApi(dbName);
  const customer = await seedUser(db, 'CUSTOMER', 'audit-customer');
  const proposer = await seedUser(db, 'ADMIN', 'audit-proposer');
  const approver = await seedUser(db, 'ADMIN', 'audit-approver');
  const first = authed(api, (await login(api, proposer.email)).accessToken);
  const second = authed(api, (await login(api, approver.email)).accessToken);
  const paidOrder = await seedOrder(db, customer.id, { state: 'CONFIRMED' });
  const payment = await seedPaymentAttempt(db, paidOrder.id, { state: 'SUCCEEDED' });
  await db.collection('payment_attempts').updateOne({ _id: new Types.ObjectId(payment.id) }, { $set: { paidAt: new Date('2026-10-27T10:00:00+07:00') } });
  const uiDates = await jsonResponse(await first('/admin/reports/sales?from=2026-10-26&to=2026-10-27'), 200);
  const fullVnDay = await jsonResponse(await first('/admin/reports/sales?from=2026-10-27T00:00:00%2B07:00&to=2026-10-28T00:00:00%2B07:00'), 200);
  const sameDay = await first('/admin/reports/sales?from=2026-10-27&to=2026-10-27');
  assert.equal(uiDates.paidRevenue, 0);
  assert.equal(fullVnDay.paidRevenue, 100000);
  assert.equal(sameDay.status, 400);
  results.salesDates = { uiDatesRevenue: uiDates.paidRevenue, fullVietnamDayRevenue: fullVnDay.paidRevenue, sameDayStatus: sameDay.status, uiEnd: uiDates.to };

  const voucher = await jsonResponse(await first('/admin/vouchers', { method: 'POST', body: JSON.stringify({ code: 'AUDITCAP', type: 'PERCENT', value: 10, maxDiscount: 50000, minimumSubtotal: 0, usageLimit: 100, status: 'ACTIVE', validFrom: '2026-10-01T00:00:00.000Z', validTo: '2026-12-01T00:00:00.000Z' }) }), 201);
  const omittedCap = await jsonResponse(await first(`/admin/vouchers/${voucher.id}`, { method: 'PATCH', body: JSON.stringify({ value: 10, maxDiscount: undefined }) }), 200);
  const clearedCap = await jsonResponse(await first(`/admin/vouchers/${voucher.id}`, { method: 'PATCH', body: JSON.stringify({ maxDiscount: null }) }), 200);
  assert.equal(omittedCap.maxDiscount, 50000);
  assert.equal(clearedCap.maxDiscount, null);
  await db.collection('vouchers').updateOne({ _id: new Types.ObjectId(voucher.id) }, { $set: { usedCount: 8 } });
  const voucherList = await jsonResponse(await first('/admin/vouchers'), 200);
  const voucherRow = voucherList.items.find(row => row.id === voucher.id);
  assert.equal(voucherRow.usedCount, 8);
  assert.equal(voucherRow.usageCount, undefined);
  results.vouchers = { capAfterOmittedField: omittedCap.maxDiscount, capAfterExplicitNull: clearedCap.maxDiscount, usedCount: voucherRow.usedCount, hasUsageCount: Object.hasOwn(voucherRow, 'usageCount') };

  const reviewId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  const orderItemId = new Types.ObjectId();
  await db.collection('reviews').insertOne({ _id: reviewId, orderId: new Types.ObjectId(paidOrder.id), orderItemId, customerId: new Types.ObjectId(customer.id), productId, stars: 5, content: 'Audit public review', status: 'PUBLIC', mediaIds: [] });
  const publicReviews = await jsonResponse(await fetch(`${api.baseUrl}/reviews?productId=${productId}`), 200);
  const adminEdit = await first(`/reviews/${reviewId}`, { method: 'PATCH', body: JSON.stringify({ orderItemId: String(orderItemId), stars: 4, content: 'Edited review' }) });
  const adminDelete = await first(`/reviews/${reviewId}`, { method: 'DELETE' });
  assert.equal(Object.hasOwn(publicReviews.items[0], 'customerId'), false);
  assert.equal(Object.hasOwn(publicReviews.items[0], 'orderItemId'), false);
  assert.equal(adminEdit.status, 403);
  assert.equal(adminDelete.status, 403);
  results.reviewControls = { publicFields: Object.keys(publicReviews.items[0]), adminEditStatus: adminEdit.status, adminDeleteStatus: adminDelete.status };

  const evidenceKey = `refund_evidence/${approver.id}/${randomUUID()}.png`;
  await db.collection('media_objects').insertOne({ key: evidenceKey, ownerId: new Types.ObjectId(approver.id), purpose: 'refund_evidence', visibility: 'PRIVATE', status: 'READY' });
  results.refundApiLifecycle = [];
  for (let index = 0; index < 3; index++) {
    const order = await seedOrder(db, customer.id, { state: 'CONFIRMED', payableTotal: 100000 });
    const paid = await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED', amount: 100000 });
    const ids = [];
    for (let part = 0; part < 2; part++) {
      const refund = await jsonResponse(await first('/admin/refunds', { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ paymentAttemptId: paid.id, amount: 50000, reason: 'Two partial refunds', beneficiary: { bankBin: '970422', accountNumber: '9999999999', accountName: 'AUDIT CUSTOMER' } }) }), 201);
      await jsonResponse(await second(`/admin/refunds/${refund.id}/approve`, { method: 'PATCH', headers: { 'Idempotency-Key': randomUUID() } }), 200);
      ids.push(refund.id);
    }
    await jsonResponse(await first(`/orders/${order.id}/cancel`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ reason: 'Cancel after partial refund proposals' }) }), 201);
    const completionInputs = ids.map(() => ({ key: randomUUID(), body: { bankReference: randomUUID(), evidenceObjectKey: evidenceKey } }));
    const completions = await Promise.all(ids.map((id, part) => second(`/admin/refunds/${id}/complete`, { method: 'PATCH', headers: { 'Idempotency-Key': completionInputs[part].key }, body: JSON.stringify(completionInputs[part].body) })));
    const states = await Promise.all(completions.map(response => jsonResponse(response, 200)));
    const row = await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) });
    await jsonResponse(await second(`/admin/refunds/${ids[0]}/complete`, { method: 'PATCH', headers: { 'Idempotency-Key': completionInputs[0].key }, body: JSON.stringify(completionInputs[0].body) }), 200);
    const replayed = await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) });
    results.refundApiLifecycle.push({ index, refundStates: states.map(state => state.state), refundedTotal: states.reduce((sum, state) => sum + state.amount, 0), orderState: row.state, orderStateAfterReplay: replayed.state });
  }
  assert.ok(results.refundApiLifecycle.some(row => row.orderState === 'CANCEL_PENDING_REFUND'), 'Race did not reproduce this run; existing 10-pair fixture remains separate evidence');
} finally {
  await api?.stop();
  await db.dropDatabase();
  await db.close();
  await writeFile(new URL('./http-contract-results.json', import.meta.url), JSON.stringify({ isolatedDatabase: dbName, results }, null, 2));
}
console.log(JSON.stringify(results, null, 2));
