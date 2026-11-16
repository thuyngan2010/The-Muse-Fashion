import type { Connection } from 'mongoose';
import { declaredIndexes, ensureModels, modelSchemas, type DeclaredIndex } from './schema-registry.js';

export const id = '202610240002_integrity';

const EMAIL_MAX_ATTEMPTS = 5;

type ExistingIndex = {
  name: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
  expireAfterSeconds?: number;
  weights?: Record<string, number>;
};

const stable = (value: unknown): string => JSON.stringify(value ?? null, (_key, item: unknown) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
    : item
));

function textFields(index: DeclaredIndex): string[] {
  return Object.entries(index.keys).filter(([, direction]) => direction === 'text').map(([field]) => field).sort();
}

function sameKey(declared: DeclaredIndex, existing: ExistingIndex): boolean {
  const text = textFields(declared);
  if (text.length) return existing.key._fts === 'text' && stable(Object.keys(existing.weights ?? {}).sort()) === stable(text);
  return JSON.stringify(existing.key) === JSON.stringify(declared.keys)
    && stable(existing.partialFilterExpression) === stable(declared.options.partialFilterExpression);
}

function optionMismatches(declared: DeclaredIndex, existing: ExistingIndex): string[] {
  const problems: string[] = [];
  if (Boolean(existing.unique) !== Boolean(declared.options.unique)) problems.push(`unique=${Boolean(existing.unique)}`);
  if (Boolean(existing.sparse) !== Boolean(declared.options.sparse)) problems.push(`sparse=${Boolean(existing.sparse)}`);
  if (declared.options.expireAfterSeconds !== undefined && existing.expireAfterSeconds !== declared.options.expireAfterSeconds) {
    problems.push(`expireAfterSeconds=${String(existing.expireAfterSeconds)}`);
  }
  if (declared.options.name && existing.name !== declared.options.name) problems.push(`name=${existing.name}`);
  return problems;
}

function describe(index: DeclaredIndex): string {
  return `${index.collection}${JSON.stringify(index.keys)}${index.options.partialFilterExpression
    ? ` partial ${JSON.stringify(index.options.partialFilterExpression)}` : ''}`;
}

async function existingIndexes(connection: Connection, collection: string): Promise<ExistingIndex[]> {
  const exists = await connection.db!.listCollections({ name: collection }, { nameOnly: true }).hasNext();
  if (!exists) return [];
  return connection.db!.collection(collection).listIndexes().toArray() as Promise<ExistingIndex[]>;
}

async function duplicateSample(connection: Connection, index: DeclaredIndex): Promise<Record<string, unknown> | null> {
  const fields = Object.keys(index.keys);
  const filters: Record<string, unknown>[] = [];
  if (index.options.partialFilterExpression) filters.push(index.options.partialFilterExpression as Record<string, unknown>);
  if (index.options.sparse) filters.push(...fields.map((field) => ({ [field]: { $exists: true } })));
  const groupId = Object.fromEntries(fields.map((field, position) => [`k${position}`, { $ifNull: [`$${field}`, null] }]));
  const [sample] = await connection.db!.collection(index.collection).aggregate([
    ...(filters.length ? [{ $match: { $and: filters } }] : []),
    { $group: { _id: groupId, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 1 },
  ], { allowDiskUse: true }).toArray();
  return sample ?? null;
}

/** Read-only checks that must pass before any index build or backfill touches the database. */
export async function preflight(connection: Connection): Promise<void> {
  const problems: string[] = [];
  const indexes = declaredIndexes();

  for (const index of indexes) {
    const existing = await existingIndexes(connection, index.collection);
    const match = existing.find((row) => sameKey(index, row));
    if (match) {
      const mismatches = optionMismatches(index, match);
      if (mismatches.length) problems.push(`Index ${describe(index)} exists as ${match.name} with conflicting options: ${mismatches.join(', ')}`);
    }
    if (index.options.name) {
      const sameName = existing.find((row) => row.name === index.options.name);
      if (sameName && !sameKey(index, sameName)) problems.push(`Index name ${index.collection}.${index.options.name} is used by a different key`);
    }
    if (index.options.unique && !textFields(index).length && existing.length) {
      const sample = await duplicateSample(connection, index);
      if (sample) problems.push(`Duplicate values for unique index ${describe(index)}: ${JSON.stringify(sample._id)} x${String(sample.count)}`);
    }
  }

  for (const [model, schema] of modelSchemas) {
    const collection = schema.get('collection') as string;
    if (!(await existingIndexes(connection, collection)).length) continue;
    for (const [path, type] of Object.entries(schema.paths)) {
      const allowed = (type as { enumValues?: unknown[] }).enumValues;
      if (!allowed?.length || path.includes('.')) continue;
      const invalid = await connection.db!.collection(collection)
        .countDocuments({ [path]: { $exists: true, $ne: null, $nin: allowed } });
      if (invalid) problems.push(`${model}.${path} has ${invalid} document(s) outside enum [${allowed.join(', ')}]`);
    }
  }

  if ((await existingIndexes(connection, 'users')).length) {
    const [caseDuplicate] = await connection.db!.collection('users').aggregate([
      { $group: { _id: { $toLower: { $trim: { input: '$email' } } }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ], { allowDiskUse: true }).toArray();
    if (caseDuplicate) problems.push(`users.email has case-insensitive duplicates for ${String(caseDuplicate._id)}`);
  }

  if (problems.length) {
    throw new Error(`Migration ${id} preflight failed; reconcile legacy data first:\n- ${problems.join('\n- ')}`);
  }
}

export async function up(connection: Connection): Promise<void> {
  const db = connection.db!;
  await db.collection('auth_sessions').updateMany(
    { $or: [{ familyId: { $exists: false } }, { familyId: null }] },
    [{ $set: { familyId: { $toString: '$_id' } } }],
  );
  await db.collection('users').updateMany({ tokenVersion: { $exists: false } }, { $set: { tokenVersion: 0 } });
  await db.collection('email_events').updateMany(
    { state: 'FAILED', attempts: { $lt: EMAIL_MAX_ATTEMPTS } },
    { $set: { state: 'PERMANENT_FAILURE' }, $unset: { nextAttemptAt: '' } },
  );
  await db.collection('system_locks').updateOne(
    { _id: 'active-admins' as never }, { $setOnInsert: { version: 0 } }, { upsert: true },
  );
  for (const model of ensureModels(connection)) await model.createIndexes();
}

export async function verify(connection: Connection): Promise<void> {
  const problems: string[] = [];
  for (const index of declaredIndexes()) {
    const existing = await existingIndexes(connection, index.collection);
    const match = existing.find((row) => sameKey(index, row) && !optionMismatches(index, row).length);
    if (!match) problems.push(`Missing or mismatched index ${describe(index)} ${JSON.stringify(index.options)}`);
  }
  const db = connection.db!;
  const legacySessions = await db.collection('auth_sessions').countDocuments({ $or: [{ familyId: { $exists: false } }, { familyId: null }] });
  if (legacySessions) problems.push(`${legacySessions} auth session(s) still lack familyId`);
  const legacyUsers = await db.collection('users').countDocuments({ tokenVersion: { $exists: false } });
  if (legacyUsers) problems.push(`${legacyUsers} user(s) still lack tokenVersion`);
  if (!await db.collection('system_locks').findOne({ _id: 'active-admins' as never })) problems.push('Missing system_locks.active-admins');
  if (problems.length) throw new Error(`Migration ${id} verify failed:\n- ${problems.join('\n- ')}`);
}
