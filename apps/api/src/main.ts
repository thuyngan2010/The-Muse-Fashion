import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AppConfig } from './common/app-config.js';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { MIGRATION_IDS } from './migrations/ids.js';
import { assertPaymentProviderConfigured } from './modules/payments/payment-provider.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  if (process.env.NODE_ENV === 'production') {
    assertPaymentProviderConfigured();
    for (const name of ['REFUND_ENCRYPTION_KEY', 'EMAIL_TOKEN_ENCRYPTION_KEY']) {
      if (!/^[0-9a-fA-F]{64}$/.test(AppConfig.require(name))) throw new Error(`${name} must contain 64 hexadecimal characters`);
    }
    const connection = app.get<Connection>(getConnectionToken());
    const hello = await connection.db!.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Commerce requires MongoDB transaction support');
    const completed = await connection.db!.collection<{ _id: string; status: string }>('schema_migrations')
      .find({ _id: { $in: MIGRATION_IDS }, status: 'COMPLETED' }).project({ _id: 1 }).toArray();
    const missing = MIGRATION_IDS.filter((id) => !completed.some((row) => row._id === id));
    if (missing.length) throw new Error(`Required database migrations have not completed: ${missing.join(', ')}`);
  }
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(cookieParser());
  const corsOrigins = AppConfig.csv('API_CORS_ORIGIN', ['http://localhost:4200']);
  const corsCredentials = AppConfig.boolean('API_CORS_CREDENTIALS', false);
  if (corsCredentials && corsOrigins.includes('*')) throw new Error('API_CORS_ORIGIN cannot contain * when credentials are enabled');
  app.enableCors({ origin: corsOrigins.includes('*') ? true : corsOrigins, credentials: corsCredentials });
  if (AppConfig.boolean('TRUST_PROXY', false)) app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.setGlobalPrefix('api/v1');
  const fieldErrors = (errors: ValidationError[], prefix = ''): Array<{ field: string; code: string; message: string }> =>
    errors.flatMap((error) => {
      const field = prefix ? `${prefix}.${error.property}` : error.property;
      return [
        ...Object.entries(error.constraints ?? {}).map(([code, message]) => ({ field, code, message })),
        ...fieldErrors(error.children ?? [], field),
      ];
    });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => new BadRequestException({ code: 'VALIDATION_FAILED',
      message: 'Request validation failed', fieldErrors: fieldErrors(errors) }),
  }));
  if (AppConfig.boolean('SWAGGER_ENABLED', process.env.NODE_ENV !== 'production')) {
    const config = new DocumentBuilder().setTitle('Fashion Commerce API').setDescription('REST API: endpoints currently implemented; roadmap at docs/05-API.md').setVersion('1.0.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  const port = Number(AppConfig.optional('PORT') ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  await app.listen(port, AppConfig.optional('HOST') ?? '0.0.0.0');
}
void bootstrap();
