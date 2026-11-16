import { Injectable } from '@nestjs/common';
import { EmailDispatchService } from './email-dispatch.service.js';

@Injectable()
export class MailService {
  constructor(private readonly dispatch: EmailDispatchService) {}

  async sendVerification(to: string, token: string, dedupKey: string): Promise<void> {
    await this.dispatch.enqueue('user.verify_email', to, dedupKey, { token });
  }
}
