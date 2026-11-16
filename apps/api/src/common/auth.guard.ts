import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { UserRole } from '@fashion/contracts';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';
import { PERMISSIONS_KEY, type StaffPermissionName } from './permissions.decorator.js';
import { UsersService } from '../modules/users/users.service.js';
import { RateLimitService } from './rate-limit.service.js';
import { SessionService } from '../modules/auth/session.service.js';

export type UserPrincipal = { sub: string; role: UserRole; email: string; tokenVersion?: number; sid: string };
export type AuthenticatedRequest = Request & { user: UserPrincipal };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly rateLimit: RateLimitService,
    private readonly sessions: SessionService,
  ) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(),ctx.getClass()])) return true;
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Access token is required');
    let token: UserPrincipal;
    try { token = await this.jwt.verifyAsync<UserPrincipal>(header.slice(7)); }
    catch { throw new UnauthorizedException('Invalid or expired token'); }
    const user = await this.users.findById(token.sub);
    if (!user || user.status !== 'ACTIVE' || !user.emailVerifiedAt) throw new UnauthorizedException('Account unavailable');
    if ((token.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)
      || typeof token.sid !== 'string' || !token.sid
      || !await this.sessions.isActive(String(user._id), token.sid)) {
      throw new UnauthorizedException({ code: 'SESSION_REVOKED', message: 'Session revoked' });
    }
    const principal = { sub: String(user._id), role: user.role, email: user.email, sid: token.sid };
    const allowed = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (allowed?.length && !allowed.includes(user.role)) throw new ForbiddenException('Insufficient permissions');
    const permissions = this.reflector.getAllAndOverride<StaffPermissionName[]>(PERMISSIONS_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (permissions?.length && user.role !== 'ADMIN' && !(user.role === 'STAFF'
      && await this.users.hasPermissions(String(user._id), permissions,
        typeof request.params?.orderId === 'string' ? request.params.orderId : undefined))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    await this.rateLimit.consume(`auth:${principal.sub}`, 300, 60_000);
    request.user = principal;
    return true;
  }
}
