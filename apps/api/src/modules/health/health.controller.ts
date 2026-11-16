import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Public } from '../../common/public.decorator.js';
import { MIGRATION_IDS } from '../../migrations/ids.js';
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Public() @Get('live') live() { return { status: 'ok', service: 'fashion-api', timestamp: new Date().toISOString() }; }

  @Public() @Get(['', 'ready']) async ready() {
    if (this.connection.readyState !== 1) throw new ServiceUnavailableException('Database is not ready');
    if (process.env.NODE_ENV === 'production') {
      const completed = await this.connection.db!.collection('schema_migrations')
        .countDocuments({ _id: { $in: [...MIGRATION_IDS] as never[] }, status: 'COMPLETED' });
      if (completed !== MIGRATION_IDS.length) throw new ServiceUnavailableException('Database migration is not ready');
      const staleBefore = new Date(Date.now() - 60_000);
      const checks = [
        ['outbox_events', 'PROCESSING'], ['email_events', 'SENDING'], ['ai_jobs', 'PROCESSING'],
      ] as const;
      for (const [collection, state] of checks) {
        const field = collection === 'outbox_events' ? 'status' : 'state';
        const stalled = await this.connection.db!.collection(collection).countDocuments({ [field]: state,
          leaseUntil: { $lte: staleBefore } }, { limit: 1 });
        if (stalled) throw new ServiceUnavailableException(`${collection} worker lease is stale`);
      }
    }
    return { status: 'ok', service: 'fashion-api', database: 'ready', timestamp: new Date().toISOString() };
  }
}
