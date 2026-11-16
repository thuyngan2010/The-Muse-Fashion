import mongoose from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { migrations } from '../migrations/index.js';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  await mongoose.connect(uri, { autoIndex: false });
  const db = mongoose.connection.db!;
  const hello = await db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('MongoDB replica set or sharded cluster is required');

  const lock = db.collection<{ _id: string; owner?: string; leaseUntil?: Date }>('migration_lock');
  const owner = randomUUID();
  const now = new Date();
  try {
    const claimed = await lock.findOneAndUpdate(
      { _id: 'global', $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] },
      { $set: { owner, leaseUntil: new Date(now.getTime() + 10 * 60_000) } },
      { upsert: true, returnDocument: 'after' },
    );
    if (claimed?.owner !== owner) throw new Error('Migration lock is held by another process');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new Error('Migration lock is held by another process');
    }
    throw error;
  }

  const renewal = setInterval(() => {
    void lock.updateOne({ _id: 'global', owner }, { $set: { leaseUntil: new Date(Date.now() + 10 * 60_000) } }).catch(() => undefined);
  }, 60_000);
  try {
    const history = db.collection<{ _id: string; checksum?: string; status?: string; startedAt?: Date;
      completedAt?: Date; appVersion?: string; error?: string }>('schema_migrations');
    const plan = [];
    for (const migration of migrations) {
      const source = await readFile(new URL(`../../src/migrations/${migration.file}`, import.meta.url));
      const checksum = createHash('sha256').update(source).digest('hex');
      const previous = await history.findOne({ _id: migration.id });
      if (previous?.checksum && previous.checksum !== checksum) throw new Error(`Migration ${migration.id} checksum changed`);
      plan.push({ migration, checksum, completed: previous?.status === 'COMPLETED' });
    }

    const pending = plan.filter((step) => !step.completed);
    for (const { migration } of pending) await migration.preflight?.(mongoose.connection);

    for (const { migration, checksum, completed } of plan) {
      if (completed) continue;
      await history.updateOne({ _id: migration.id }, { $set: { checksum, status: 'STARTED', startedAt: new Date(),
        appVersion: process.env.npm_package_version ?? 'unknown' } }, { upsert: true });
      try {
        await migration.up(mongoose.connection);
        await migration.verify(mongoose.connection);
        await history.updateOne({ _id: migration.id }, { $set: { status: 'COMPLETED', completedAt: new Date() }, $unset: { error: 1 } });
        console.log(`Migration ${migration.id} completed`);
      } catch (error) {
        await history.updateOne({ _id: migration.id }, { $set: { status: 'FAILED', error: error instanceof Error ? error.message : String(error) } });
        throw error;
      }
    }
    // Historical verifiers consult the current schema registry. Apply pending
    // index migrations before asking those verifiers to check the current schema.
    for (const { migration } of plan) await migration.verify(mongoose.connection);
  } finally {
    clearInterval(renewal);
    await lock.deleteOne({ _id: 'global', owner });
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
