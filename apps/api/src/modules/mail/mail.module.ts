import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailService } from './mail.service.js';
import { EmailEvent, EmailEventSchema } from './email-event.schema.js';
import { EmailDispatchService } from './email-dispatch.service.js';
import { EmailWorkerService } from './email-worker.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: EmailEvent.name, schema: EmailEventSchema }])],
  providers: [MailService, EmailDispatchService, EmailWorkerService],
  exports: [MailService, EmailDispatchService],
})
export class MailModule {}
