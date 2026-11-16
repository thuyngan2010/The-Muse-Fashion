import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { RateLimitService } from './rate-limit.service.js';

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  constructor(private readonly rateLimit: RateLimitService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    if (req.path.endsWith('/webhooks/payment/gpmpay') || req.path.endsWith('/webhooks/payment/sepay')) {
      next();
      return;
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    void this.rateLimit.consume(`public:${ip}`, 120, 60_000).then(() => next(), next);
  }
}
