import type { Connection } from 'mongoose';
import { ensureModels } from './schema-registry.js';
import { preflight, verify } from './202610240002_integrity.js';

export const id = '202611180002_google_login_indexes';
export { preflight, verify };
export async function up(connection: Connection): Promise<void> {
  // Tạo index unique + sparse cho users.googleSub (idempotent; không đổi dữ liệu cũ).
  for (const model of ensureModels(connection)) await model.createIndexes();
}
