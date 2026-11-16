import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { AppConfig } from './common/app-config.js';
import { AuthGuard } from './common/auth.guard.js';
import { HealthController } from './modules/health/health.controller.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { ScaffoldModule } from './common/scaffold.module.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { LookbooksModule } from './modules/lookbooks/lookbooks.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { CommerceModule } from './modules/commerce/commerce.module.js';
import { CommunityModule } from './modules/community/community.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OperationsModule } from './modules/operations/operations.module.js';
import { RateLimitModule } from './common/rate-limit.module.js';
import { RateLimitMiddleware } from './common/rate-limit.middleware.js';

@Module({
  imports: [
    RateLimitModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    MongooseModule.forRoot(process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/fashion_commerce', { autoIndex: process.env.NODE_ENV !== 'production' }),
    JwtModule.register({ global: true, secret: AppConfig.require('JWT_SECRET'), signOptions: { expiresIn: '1h' } }),
    ScaffoldModule, UsersModule, MailModule, AuthModule, CatalogModule, StorageModule,
    LookbooksModule, AiModule, CommerceModule, CommunityModule, PaymentsModule,
    AdminModule, NotificationsModule, OperationsModule,
  ],
  controllers: [HealthController],
  providers: [
    RequestIdMiddleware,
    RateLimitMiddleware,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware, RateLimitMiddleware)
      .forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
