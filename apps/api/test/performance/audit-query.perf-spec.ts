import { afterAll, beforeAll, expect, it } from 'vitest';
import { Types, type Connection } from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { migrations } from '../../src/migrations/index.js';
import { authed, connectDb, login, seedUser, startApi, uniqueDbName, type RunningApi } from '../integration/harness.js';

let db: Connection, api: RunningApi, request: ReturnType<typeof authed>, customerId: Types.ObjectId;
beforeAll(async () => {
  const uri = new URL(process.env.MONGODB_TEST_URI ?? '');
  if (uri.hostname !== '127.0.0.1' || !['27017', '27187'].includes(uri.port)) throw new Error('Performance fixtures require isolated loopback MongoDB');
  const name = uniqueDbName('fc_perf_audit2'); db = await connectDb(name);
  for (const migration of migrations) { await migration.up(db); await migration.verify(db); }
  const user = await seedUser(db, 'CUSTOMER', 'performance-owner'); customerId = new Types.ObjectId(user.id);
  const foreign = new Types.ObjectId(), products = Array.from({ length: 1000 }, () => new Types.ObjectId());
  await db.collection('products').insertMany(products.map((_id, n) => ({ _id, name: 'Perf Product ' + n, slug: 'perf-' + n, description: 'Perf benchmark', status: 'PUBLISHED', price: 100000, imageMediaIds: [], createdAt: new Date() })));
  for (let offset = 0; offset < 100000; offset += 5000) {
    const orders: any[] = [], attempts: any[] = [], variants: any[] = [];
    for (let i = offset; i < offset + 5000; i++) {
      const orderId = new Types.ObjectId(), createdAt = new Date(Date.now() - i * 1000);
      orders.push({ _id: orderId, customerId: i % 10 === 0 ? customerId : foreign, code: 'P' + i, state: 'PENDING_PAYMENT', items: [], money: { payableTotal: 100000 }, idempotencyKey: 'perf-' + i, paymentDueAt: new Date(Date.now() + 86400000), createdAt });
      attempts.push({ orderId, provider: 'GPMPAY', reconciliationCode: 'FC' + i.toString(36).toUpperCase().padStart(8, '0'), state: 'PENDING', expectedAmount: 100000, expiresAt: new Date(Date.now() + 86400000), createdAt });
      variants.push({ productId: products[Math.floor(i / 100)], sku: 'PERF-' + i, status: 'ACTIVE', color: i % 2 ? 'Red' : 'Blue', size: i % 3 ? 'L' : 'M', price: 100000 + i % 100 * 1000, stockOnHand: 5, reserved: 0 });
    }
    await Promise.all([db.collection('orders').insertMany(orders), db.collection('payment_attempts').insertMany(attempts), db.collection('product_variants').insertMany(variants)]);
  }
  api = await startApi(name); request = authed(api, (await login(api, user.email)).accessToken);
});
afterAll(async () => { await api?.stop(); await db?.dropDatabase(); await db?.close(); });

it('keeps 100k-order/variant pagination inside MongoDB and records indexed plans plus a declared smoke latency budget', async () => {
  const paths = ['/payments?page=1&limit=20', '/products?q=Perf&color=Blue&size=M&minPrice=100000&maxPrice=130000&sort=price_desc&page=1&limit=20'];
  const samples: Record<string, { p50: number; p95: number; samples: number[] }> = {};
  for (const path of paths) {
    const times: number[] = [];
    for (let n = 0; n < 10; n++) {
      const started = performance.now(); const response = await request(path); expect(response.status).toBe(200); const body = await response.json();
      expect(body.items).toHaveLength(20); expect(body.total).toBe(path.startsWith('/payments') ? 10000 : 1000); times.push(performance.now() - started);
    }
    const sorted = [...times].sort((a, b) => a - b); samples[path] = { p50: sorted[4], p95: sorted[9], samples: times };
  }
  const paymentPlan = await db.collection('orders').aggregate([
    { $match: { customerId } }, { $lookup: { from: 'payment_attempts', localField: '_id', foreignField: 'orderId', as: 'attempt' } },
    { $unwind: '$attempt' }, { $replaceRoot: { newRoot: '$attempt' } },
    { $facet: { items: [{ $sort: { createdAt: -1, _id: -1 } }, { $limit: 20 }], count: [{ $count: 'total' }] } },
  ]).explain('executionStats');
  const catalogPlan = await db.collection('products').aggregate([
    { $match: { status: 'PUBLISHED', $text: { $search: 'Perf' } } },
    { $lookup: { from: 'product_variants', let: { productId: '$_id' }, pipeline: [
      { $match: { $expr: { $eq: ['$productId', '$$productId'] }, status: 'ACTIVE', color: 'Blue', size: 'M', price: { $gte: 100000, $lte: 130000 } } },
      { $group: { _id: null, minPrice: { $min: '$price' } } },
    ], as: 'variants' } }, { $limit: 20 },
  ]).explain('executionStats');
  expect(JSON.stringify(paymentPlan)).toContain('customerId_1_createdAt_-1');
  expect(JSON.stringify(catalogPlan)).toContain('productId_1_status_1');
  const budget = Number(process.env.PERF_MAX_P95_MS ?? 5000);
  const dir = fileURLToPath(new URL('../../../../reports/audit-2-2026-10-27/', import.meta.url));
  await mkdir(dir, { recursive: true }); await writeFile(dir + 'performance.json', JSON.stringify({ rows: { orders: 100000, attempts: 100000, variants: 100000, products: 1000 }, smokeP95BudgetMs: budget, samples, paymentPlan, catalogPlan }, null, 2));
  for (const sample of Object.values(samples)) expect(sample.p95).toBeLessThan(budget);
}, 180000);
