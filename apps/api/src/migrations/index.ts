import type { Connection } from 'mongoose';
import * as baseline from './202610240001_baseline.js';
import * as integrity from './202610240002_integrity.js';
import * as reviewIndexes from './202610270001_review_query_indexes.js';
import * as supportIndexes from './202611180001_support_chat_indexes.js';
import * as googleIndexes from './202611180002_google_login_indexes.js';
import { MIGRATION_IDS } from './ids.js';

export type Migration = {
  id: string;
  file: string;
  preflight?: (connection: Connection) => Promise<void>;
  up: (connection: Connection) => Promise<void>;
  verify: (connection: Connection) => Promise<void>;
};

export const migrations: Migration[] = [
  { ...baseline, file: '202610240001_baseline.ts' },
  { ...integrity, file: '202610240002_integrity.ts' },
  { ...reviewIndexes, file: '202610270001_review_query_indexes.ts' },
  { ...supportIndexes, file: '202611180001_support_chat_indexes.ts' },
  { ...googleIndexes, file: '202611180002_google_login_indexes.ts' },
];

if (migrations.map((migration) => migration.id).join() !== MIGRATION_IDS.join()) {
  throw new Error('migrations/ids.ts is out of sync with the migration registry');
}
