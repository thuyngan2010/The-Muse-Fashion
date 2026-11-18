import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/public.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  GoogleLoginDto,
  LoginDto,
  RegisterDto,
  RegistrationStatusQueryDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from './auth-cookie.util.js';
import { AppConfig } from '../../common/app-config.js';

function assertCookieOrigin(req: Request): void {
  const origin = req.get('origin') ?? (() => {
    try { return new URL(req.get('referer') ?? '').origin; } catch { return undefined; }
  })();
  const allowed = AppConfig.csv('API_CORS_ORIGIN', ['http://localhost:4200']);
  const sameOrigin = `${req.protocol}://${req.get('host')}`;
  if (!origin || (origin !== sameOrigin && !allowed.includes(origin))) {
    throw new ForbiddenException('Untrusted cookie request origin');
  }
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('register') register(@Body() dto: RegisterDto) { return this.auth.register(dto); }
  @Public() @Get('registration-status') registrationStatus(@Query() query: RegistrationStatusQueryDto, @Req() req: Request) {
    return this.auth.registrationStatus(query.token, req);
  }
  @Public() @Post('verify-email') verifyEmail(@Body() dto: VerifyEmailDto) { return this.auth.verifyEmail(dto.token); }
  @Public() @Post('resend-verification') resendVerification(@Body() dto: ResendVerificationDto, @Req() req: Request) {
    return this.auth.resendVerification(dto.email, req);
  }

  @Public() @Post('login') @HttpCode(201)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(dto, req);
    setRefreshCookie(res, session.refreshToken, session.persistent);
    const { refreshToken: _ignored, persistent: _persistent, ...body } = session;
    return body;
  }

  @Public() @Post('google') @HttpCode(201)
  async google(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.loginWithGoogle(dto, req);
    setRefreshCookie(res, session.refreshToken, session.persistent);
    const { refreshToken: _ignored, persistent: _persistent, ...body } = session;
    return body;
  }

  @Public() @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCookieOrigin(req);
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Refresh token is required');
    const session = await this.auth.refresh(token);
    setRefreshCookie(res, session.refreshToken, session.persistent);
    const { refreshToken: _ignored, persistent: _persistent, ...body } = session;
    return body;
  }

  @Public() @Post('logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    assertCookieOrigin(req);
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    await this.auth.logout(token);
    clearRefreshCookie(res);
  }

  @Public() @Post('forgot-password') @HttpCode(202)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.auth.forgotPassword(dto, req);
  }

  @Public() @Post('reset-password') resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @ApiBearerAuth() @Post('change-password') @HttpCode(204)
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.sub, dto);
  }

  @ApiBearerAuth() @Get('me') getMe(@Req() req: AuthenticatedRequest) { return req.user; }
}
