import type { Connection } from 'mongoose';
import { ensureModels } from './schema-registry.js';
import { preflight, verify } from './202610240002_integrity.js';

export const id = '202611180001_support_chat_indexes';
export { preflight, verify };
export async function up(connection: Connection): Promise<void> {
  // Tạo các index đã khai báo cho support_tickets / support_messages (idempotent; không đổi dữ liệu cũ).
  for (const model of ensureModels(connection)) await model.createIndexes();
}
