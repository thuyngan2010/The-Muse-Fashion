import { Injector, runInInjectionContext } from '@angular/core';
import { HttpClient, HttpRequest, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ServerStatusService } from './server-status.service';
import { authInterceptor } from './auth.interceptor';

vi.mock('../runtime-config', () => ({ runtimeConfig: { apiBaseUrl: 'https://api.example.com/api/v1' } }));

describe('Separate backend server', () => {
  it('sends catalog and health requests to the public backend', async () => {
    const get = vi.fn(() => of({ status: 'ok', items: [] }));
    const injector = Injector.create({ providers: [{ provide: HttpClient, useValue: { get } }] });
    const api = runInInjectionContext(injector, () => new ApiService());
    const status = runInInjectionContext(injector, () => new ServerStatusService());
    await firstValueFrom(api.products());
    expect(await firstValueFrom(status.checkLive())).toBe(true);
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      'https://api.example.com/api/v1/products', 'https://api.example.com/api/v1/health/live',
    ]);
  });

  function send(url: string) {
    const next = vi.fn(() => of(new HttpResponse({ status: 200 })));
    const injector = Injector.create({ providers: [
      { provide: AuthService, useValue: { token: () => 'access-token' } },
      { provide: Router, useValue: { url: '/' } },
      { provide: ServerStatusService, useValue: { markAvailable: vi.fn() } },
    ] });
    const request = new HttpRequest('GET', url);
    runInInjectionContext(injector, () => authInterceptor(request, next)).subscribe();
    return next.mock.calls[0][0] as unknown as HttpRequest<unknown>;
  }

  it('includes the token and cookie credentials when calling the remote API', () => {
    const request = send('https://api.example.com/api/v1/products');
    expect(request.headers.get('Authorization')).toBe('Bearer access-token');
    expect(request.withCredentials).toBe(true);
  });

  it.each(['https://r2.example.com/signed', 'https://api.example.com/api/v10/products'])
  ('keeps credentials out of unrelated requests: %s', (url) => {
    const request = send(url);
    expect(request.headers.has('Authorization')).toBe(false);
    expect(request.withCredentials).toBe(false);
  });
});
