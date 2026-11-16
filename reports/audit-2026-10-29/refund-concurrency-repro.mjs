import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { authed, connectDb, login, seedUser, seedOrder, seedPaymentAttempt, startApi, uniqueDbName } from '../../tests/helpers/api-harness.mjs';

const dbName = uniqueDbName('fc_audit_refund_race');
const db = await connectDb(dbName);
let api;
const results = [];
try {
  api = await startApi(dbName);
  const customer = await seedUser(db, 'CUSTOMER', 'audit-refund-customer');
  const admin = await seedUser(db, 'ADMIN', 'audit-refund-admin');
  const request = authed(api, (await login(api, admin.email)).accessToken);
  const evidenceKey = `refund_evidence/${admin.id}/${randomUUID()}.png`;
  await db.collection('media_objects').insertOne({ key: evidenceKey, ownerId: new Types.ObjectId(admin.id),
    purpose: 'refund_evidence', visibility: 'PRIVATE', status: 'READY' });
  for (let i = 0; i < 10; i++) {
    const order = await seedOrder(db, customer.id, { state: 'CANCEL_PENDING_REFUND', payableTotal: 100_000 });
    const payment = await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED', amount: 100_000 });
    const ids = [new Types.ObjectId(), new Types.ObjectId()];
    await db.collection('refunds').insertMany(ids.map(id => ({ _id: id, orderId: new Types.ObjectId(order.id),
      paymentAttemptId: new Types.ObjectId(payment.id), amount: 50_000, state: 'APPROVED', idempotencyKey: randomUUID(),
      proposedBy: new Types.ObjectId(), approvedBy: new Types.ObjectId(admin.id), reason: 'Two approved partial refunds',
      approvedAt: new Date(), beneficiary: { bankBin: '970422', accountNumber: '9999999999', accountName: 'AUDIT CUSTOMER' } })));
    const responses = await Promise.all(ids.map(id => request(`/admin/refunds/${id}/complete`, {
      method: 'PATCH', headers: { 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ bankReference: randomUUID(), evidenceObjectKey: evidenceKey }),
    })));
    const responseData = await Promise.all(responses.map(async response => ({ status: response.status, body: await response.json() })));
    const rows = await db.collection('refunds').find({ orderId: new Types.ObjectId(order.id) }).toArray();
    results.push({ iteration: i, responses: responseData, orderState: (await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state,
      refundedTotal: rows.filter(r => r.state === 'SUCCEEDED').reduce((sum, r) => sum + r.amount, 0),
      refundStates: rows.map(r => r.state) });
  }
} finally {
  await api?.stop();
  await db.dropDatabase();
  await db.close();
  await writeFile(new URL('./refund-concurrency-results.json', import.meta.url), JSON.stringify({ isolatedTestDatabase: dbName, results }, null, 2));
}
console.log(JSON.stringify(results.map(({ iteration, orderState, refundedTotal, refundStates, responses }) => ({ iteration, orderState, refundedTotal, refundStates,
  statuses: responses.map(r => r.status) })), null, 2));
