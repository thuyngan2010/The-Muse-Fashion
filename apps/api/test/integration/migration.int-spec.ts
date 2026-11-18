import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { Types, type Connection } from 'mongoose';
import { migrations } from '../../src/migrations/index.js';
import * as integrity from '../../src/migrations/202610240002_integrity.js';
import { connectDb, uniqueDbName } from './harness.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const opened: Connection[] = [];

async function freshDb(): Promise<Connection> {
  const db = await connectDb(uniqueDbName('fc_migration'));
  opened.push(db);
  return db;
}

async function migrateAll(db: Connection) {
  for (const migration of migrations) await migration.preflight?.(db);
  for (const migration of migrations) {
    await migration.up(db);
    await migration.verify(db);
  }
}

afterEach(async () => {
  for (const db of opened.splice(0)) {
    await db.dropDatabase();
    await db.close();
  }
});

describe('database migrations', () => {
  it('upgrades existing completed migrations before running their current-schema verification', async () => {
    const db = await freshDb();
    const uri = new URL(process.env.MONGODB_TEST_URI!); uri.pathname = '/' + db.name;
    const run = () => promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../dist/scripts/migrate.js', import.meta.url))], {
      cwd: tmpdir(), env: { PATH: process.env.PATH, MONGODB_URI: uri.toString(), NODE_ENV: 'test' }, timeout: 60000,
    });
    await run();
    await db.collection('payment_events').dropIndex('payment_settlement_reference_unique');
    await db.collection('schema_migrations').deleteOne({ _id: '202610270001_review_query_indexes' as never });
    const upgraded = await run(); expect(upgraded.stdout).toContain('202610270001_review_query_indexes completed');
    await migrations.at(-1)!.verify(db);
    expect(await db.collection('schema_migrations').countDocuments({ status: 'COMPLETED' })).toBe(migrations.length);
  });
  it('apply on an empty database, verify every declared index and re-run idempotently', async () => {
    const db = await freshDb();
    await migrateAll(db);
    await migrateAll(db);
    expect(await db.collection('system_locks').findOne({ _id: 'active-admins' as never })).not.toBeNull();
  });

  it('backfills legacy sessions, users and permanently failed emails', async () => {
    const db = await freshDb();
    const sessionId = new Types.ObjectId();
    await db.collection('auth_sessions').insertOne({ _id: sessionId, userId: new Types.ObjectId(), refreshHash: 'legacy',
      expiresAt: new Date(Date.now() + 60_000) });
    await db.collection('users').insertOne({ email: 'legacy@example.test', fullName: 'Legacy', role: 'CUSTOMER',
      status: 'ACTIVE', passwordHash: 'x' });
    await db.collection('email_events').insertOne({ dedupKey: 'legacy-email', to: 'a@example.test', template: 't',
      state: 'FAILED', attempts: 1, payload: {} });

    await migrateAll(db);

    expect((await db.collection('auth_sessions').findOne({ _id: sessionId }))?.familyId).toBe(String(sessionId));
    expect((await db.collection('users').findOne({ email: 'legacy@example.test' }))?.tokenVersion).toBe(0);
    expect((await db.collection('email_events').findOne({ dedupKey: 'legacy-email' }))?.state).toBe('PERMANENT_FAILURE');
  });

  it('preflight reports duplicates, case-insensitive emails and invalid enums before touching indexes', async () => {
    const db = await freshDb();
    const orderId = new Types.ObjectId();
    await db.collection('payment_attempts').insertMany([
      { orderId, provider: 'GPMPAY', reconciliationCode: 'FCAAAA1111', state: 'SUCCEEDED', expectedAmount: 1, expiresAt: new Date() },
      { orderId, provider: 'GPMPAY', reconciliationCode: 'FCBBBB2222', state: 'SUCCEEDED', expectedAmount: 1, expiresAt: new Date() },
    ]);
    await db.collection('users').insertMany([
      { email: 'Dup@Example.test', fullName: 'A', role: 'CUSTOMER', status: 'ACTIVE', passwordHash: 'x' },
      { email: 'dup@example.test', fullName: 'B', role: 'ROOT', status: 'ACTIVE', passwordHash: 'x' },
    ]);

    const failure = integrity.preflight(db);
    await expect(failure).rejects.toThrow(/order_succeeded_unique|partial \{"state":"SUCCEEDED"\}/);
    await expect(integrity.preflight(db)).rejects.toThrow(/case-insensitive duplicates/);
    await expect(integrity.preflight(db)).rejects.toThrow(/User\.role has 1 document/);
    const indexes = await db.collection('payment_attempts').listIndexes().toArray();
    expect(indexes.map((index) => index.name)).toEqual(['_id_']);
  });

  it('preflight reports an existing index whose options conflict with the schema', async () => {
    const db = await freshDb();
    await db.collection('users').createIndex({ email: 1 }, { name: 'email_1' });

    await expect(integrity.preflight(db)).rejects.toThrow(/users\{"email":1\}.*conflicting options: unique=false/);
  });
});
