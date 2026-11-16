import type { Connection } from 'mongoose';
import { ensureModels } from './schema-registry.js';
import { preflight, verify } from './202610240002_integrity.js';

export const id = '202610270001_review_query_indexes';
export { preflight, verify };
export async function up(connection: Connection): Promise<void> {
  // Creating declared indexes is idempotent; preflight rejects duplicate financial references.
  for (const model of ensureModels(connection)) await model.createIndexes();
}
