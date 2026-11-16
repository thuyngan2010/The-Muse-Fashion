import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RequestWithId } from './request-id.middleware.js';

type ErrorBody = { code?: unknown; message?: unknown; fieldErrors?: unknown; retryAfter?: unknown };

const statusCodes: Partial<Record<number, string>> = {
  400: 'VALIDATION_FAILED', 401: 'AUTH_REQUIRED', 403: 'PERMISSION_DENIED',
  404: 'RESOURCE_NOT_FOUND', 409: 'STATE_CONFLICT', 422: 'BUSINESS_RULE_FAILED',
  429: 'RATE_LIMITED', 501: 'FEATURE_NOT_IMPLEMENTED', 503: 'PROVIDER_UNAVAILABLE',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const duplicate = typeof exception === 'object' && exception !== null
      && 'code' in exception && exception.code === 11000;
    const status = exception instanceof HttpException ? exception.getStatus()
      : duplicate ? HttpStatus.CONFLICT : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body: ErrorBody = typeof raw === 'object' && raw !== null ? raw : { message: raw };
    const rawMessage = body.message;
    const message = duplicate ? 'Resource already exists' : status >= 500 && status !== HttpStatus.NOT_IMPLEMENTED
      ? 'Internal server error'
      : Array.isArray(rawMessage) ? 'Request validation failed'
        : typeof rawMessage === 'string' ? rawMessage : exception instanceof Error ? exception.message : 'Request failed';

    if (typeof body.retryAfter === 'number') response.setHeader('Retry-After', String(body.retryAfter));

    response.status(status).json({
      statusCode: status,
      code: duplicate ? 'DUPLICATE_RESOURCE' : typeof body.code === 'string' ? body.code : statusCodes[status] ?? 'INTERNAL_ERROR',
      message,
      requestId: request.requestId,
      ...(body.fieldErrors ? { fieldErrors: body.fieldErrors } : Array.isArray(rawMessage)
        ? { fieldErrors: rawMessage.map((entry) => ({ field: '', code: 'INVALID', message: String(entry) })) } : {}),
    });
  }
}
