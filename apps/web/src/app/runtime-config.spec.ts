import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Frontend backend URL configuration', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  async function config(apiBaseUrl?: string) {
    vi.resetModules();
    vi.stubGlobal('window', { __FASHION_CONFIG__: { apiBaseUrl } });
    return (await import('./runtime-config')).runtimeConfig;
  }

  it('defaults to the existing same-origin API', async () => {
    expect((await config()).apiBaseUrl).toBe('/api/v1');
  });

  it.each([
    [' https://api.example.com/api/v1/// ', 'https://api.example.com/api/v1'],
    ['http://192.0.2.10:3000/api/v1/', 'http://192.0.2.10:3000/api/v1'],
    ['http://localhost:3000/api/v1', 'http://localhost:3000/api/v1'],
    ['/api/v1/', '/api/v1'],
  ])('uses the configured API %s', async (input, expected) => {
    expect((await config(input)).apiBaseUrl).toBe(expected);
  });

  it.each(['//other.example/api/v1', 'javascript:alert(1)', 'https://user:password@api.example.com/api/v1',
    'https://api.example.com/api/v1?key=value', '/\\other.example/api', 'https://api.example.com/api/v1#fragment'])
  ('rejects unsafe or ambiguous base URL %s', async (input) => {
    await expect(config(input)).rejects.toThrow('apiBaseUrl');
  });
});
