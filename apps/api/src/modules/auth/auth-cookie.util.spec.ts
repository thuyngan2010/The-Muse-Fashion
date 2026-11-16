import type { Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRefreshCookie, setRefreshCookie } from './auth-cookie.util.js';

describe('Refresh cookie deployment options', () => {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('REFRESH_COOKIE_SECURE', '');
    vi.stubEnv('REFRESH_COOKIE_SAME_SITE', '');
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it('keeps local and same-site behavior by default', () => {
    setRefreshCookie(res, 'token');
    expect(res.cookie).toHaveBeenCalledWith('refresh_token', 'token', expect.objectContaining({
      httpOnly: true, sameSite: 'lax', secure: false, path: '/api/v1/auth',
    }));
  });

  it('sets and clears the same secure cross-site cookie', () => {
    vi.stubEnv('REFRESH_COOKIE_SAME_SITE', 'none');
    vi.stubEnv('REFRESH_COOKIE_SECURE', 'true');
    setRefreshCookie(res, 'token');
    clearRefreshCookie(res);
    const options = vi.mocked(res.cookie).mock.calls[0][2]!;
    const { maxAge, ...clearOptions } = options;
    expect(maxAge).toBeGreaterThan(0);
    expect(clearOptions).toMatchObject({ httpOnly: true, sameSite: 'none', secure: true });
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token', clearOptions);
  });

  it('rejects cross-site cookies without HTTPS', () => {
    vi.stubEnv('REFRESH_COOKIE_SAME_SITE', 'none');
    vi.stubEnv('REFRESH_COOKIE_SECURE', 'false');
    expect(() => setRefreshCookie(res, 'token')).toThrow('requires REFRESH_COOKIE_SECURE=true');
  });

  it('rejects invalid same-site policies', () => {
    vi.stubEnv('REFRESH_COOKIE_SAME_SITE', 'invalid');
    expect(() => setRefreshCookie(res, 'token')).toThrow('must be lax, strict, or none');
  });
});
