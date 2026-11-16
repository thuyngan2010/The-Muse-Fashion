import type { CookieOptions, Response } from 'express';
import { AppConfig } from '../../common/app-config.js';

export const REFRESH_COOKIE = 'refresh_token';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function refreshCookieOptions(): CookieOptions {
  const secure = AppConfig.boolean('REFRESH_COOKIE_SECURE', process.env.NODE_ENV === 'production');
  const sameSite = AppConfig.optional('REFRESH_COOKIE_SAME_SITE') ?? 'lax';
  if (sameSite !== 'lax' && sameSite !== 'strict' && sameSite !== 'none') {
    throw new Error('REFRESH_COOKIE_SAME_SITE must be lax, strict, or none');
  }
  if (sameSite === 'none' && !secure) {
    throw new Error('REFRESH_COOKIE_SAME_SITE=none requires REFRESH_COOKIE_SECURE=true');
  }
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/api/v1/auth',
  };
}

export function setRefreshCookie(res: Response, refreshToken: string, persistent = true): void {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookieOptions(), ...(persistent ? { maxAge: REFRESH_TTL_MS } : {}) });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}
