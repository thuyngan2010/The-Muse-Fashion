import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AuthSession, AuthSessionSchema, EmailToken, EmailTokenSchema } from '../users/identity.schemas.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [
    UsersModule,
    MailModule,
    MongooseModule.forFeature([
      { name: AuthSession.name, schema: AuthSessionSchema },
      { name: EmailToken.name, schema: EmailTokenSchema },
    ]),
  ],
  providers: [AuthService, SessionService],
  exports: [SessionService],
  controllers: [AuthController],
})
export class AuthModule {}
