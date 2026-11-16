// Isolated HTTP/DB audit. Never point this at an application database.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { authed, connectDb, grant, login, seedOrder, seedUser, startApi, uniqueDbName } from '../../apps/api/test/integration/harness.ts';

const uri = new URL(process.env.MONGODB_TEST_URI ?? '');
assert.equal(uri.hostname, '127.0.0.1', 'Only the isolated audit MongoDB is allowed');
assert.equal(uri.port, '27187', 'Only the isolated audit MongoDB port is allowed');
const dbName = uniqueDbName('audit_http');
const db = await connectDb(dbName);
let api: Awaited<ReturnType<typeof startApi>> | undefined;
const findings: Array<Record<string, unknown>> = [];
try {
  api = await startApi(dbName, { API_CORS_CREDENTIALS: 'true' });
  const admin = await seedUser(db, 'ADMIN', 'audit-admin');
  const staff = await seedUser(db, 'STAFF', 'audit-staff');
  const customer = await seedUser(db, 'CUSTOMER', 'audit-customer');
  const adminRequest = authed(api, (await login(api, admin.email)).accessToken);
  const customerRequest = authed(api, (await login(api, customer.email)).accessToken);

  // A01: rename voucher, then observe cancellation rollback and retained stock reservation.
  const voucherId = new Types.ObjectId();
  const variantId = new Types.ObjectId();
  await db.collection('vouchers').insertOne({ _id: voucherId, code: 'AUDIT_OLD', type: 'FIXED', value: 10000,
    minimumSubtotal: 0, validFrom: new Date(Date.now() - 86400000), validTo: new Date(Date.now() + 86400000),
    usageLimit: 100, usedCount: 1, status: 'ACTIVE' });
  await db.collection('product_variants').insertOne({ _id: variantId, productId: new Types.ObjectId(),
    sku: `AUDIT-${randomUUID()}`, stockOnHand: 5, reserved: 1, price: 100000, status: 'ACTIVE', version: 1 });
  const order = await seedOrder(db, customer.id);
  await db.collection('orders').updateOne({ _id: new Types.ObjectId(order.id) }, { $set: {
    voucherCode: 'AUDIT_OLD', items: [{ variantId: String(variantId), quantity: 1, lineId: String(new Types.ObjectId()) }],
  } });
  const rename = await adminRequest(`/admin/vouchers/${voucherId}`, { method: 'PATCH', body: JSON.stringify({ code: 'AUDIT_NEW' }) });
  assert.equal(rename.status, 200, await rename.text());
  const cancellation = await customerRequest(`/orders/${order.id}/cancel`, { method: 'POST',
    headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ reason: 'Audit cancellation' }) });
  const cancellationBody = await cancellation.json();
  assert.equal(cancellation.status, 409);
  assert.match(cancellationBody.message, /Voucher usage cannot be released/);
  const retainedOrder = await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) });
  const retainedStock = await db.collection('product_variants').findOne({ _id: variantId });
  assert.equal(retainedOrder?.state, 'PENDING_PAYMENT');
  assert.equal(retainedStock?.reserved, 1);
  findings.push({ id: 'A01', renameStatus: rename.status, cancellationStatus: cancellation.status,
    message: cancellationBody.message, retainedOrderState: retainedOrder?.state, retainedReservedStock: retainedStock?.reserved });

  // A02: the UI's Grant POST really removes an existing independent permission in MongoDB.
  await grant(db, staff.id, 'inventory.manage', 'GLOBAL');
  const grantsResponse = await adminRequest(`/admin/staff/${staff.id}/permissions`, { method: 'POST',
    body: JSON.stringify({ grants: [{ permission: 'order.read', scope: 'GLOBAL' }] }) });
  assert.equal(grantsResponse.status, 201, await grantsResponse.text());
  const remaining = await db.collection('staff_permissions').find({ staffId: new Types.ObjectId(staff.id) }).toArray();
  assert.deepEqual(remaining.map(row => row.permission), ['order.read']);
  findings.push({ id: 'A02', httpStatus: grantsResponse.status, previousPermissionRemoved: true, remainingPermissions: remaining.map(row => row.permission) });

  // A06 and A08: enforce actual HTTP query validation and response paging.
  for (let i = 0; i < 3; i++) await seedOrder(db, customer.id);
  const ordersResponse = await adminRequest('/admin/orders?page=1&limit=1');
  const orderPage = await ordersResponse.json();
  assert.equal(ordersResponse.status, 200);
  assert.equal(orderPage.limit, 1);
  assert.equal(orderPage.items.length, 4);
  findings.push({ id: 'A06', endpoint: '/admin/orders?page=1&limit=1', requestedLimit: 1, returnedItems: orderPage.items.length });
  const usersResponse = await adminRequest('/admin/users?page=1&limit=100');
  assert.equal(usersResponse.status, 400);
  findings.push({ id: 'A08', endpoint: '/admin/users?page=1&limit=100', httpStatus: usersResponse.status });

  // A04: the exact FE payload is rejected by the real HTTP validation pipeline.
  const failResponse = await adminRequest(`/admin/refunds/${new Types.ObjectId()}/fail`, { method: 'PATCH',
    headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ reason: 'Audit failed transfer' }) });
  const failBody = await failResponse.json();
  assert.equal(failResponse.status, 400);
  assert.ok(failBody.fieldErrors.some((row: { field: string }) => row.field === 'evidenceObjectKey'));
  findings.push({ id: 'A04', httpStatus: failResponse.status, missingField: 'evidenceObjectKey' });

  writeFileSync(new URL('./http-repro-results.json', import.meta.url), JSON.stringify({ passed: findings.length, findings }, null, 2) + '\n');
  console.log(`HTTP/replica-set reproductions confirmed: ${findings.length}`);
} finally {
  if (api) await api.stop();
  assert.ok(dbName.startsWith('audit_http_'));
  await db.dropDatabase();
  await db.close();
}
