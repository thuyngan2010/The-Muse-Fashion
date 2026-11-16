import { inject } from '@angular/core';
import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, tap, throwError } from 'rxjs';
import type { AuthTokens } from '@fashion/contracts';
import { AuthService } from './auth.service';
import { ServerStatusService } from './server-status.service';
import { runtimeConfig } from '../runtime-config';

function isGlobalOutage(error: HttpErrorResponse): boolean {
  if (error.status === 0 || error.status === 502 || error.status === 504) return true;
  if (error.status === 503 && /\/health(\/|$)/.test(error.url ?? '')) return true;
  return false;
}

let refreshing: Observable<AuthTokens> | null = null;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const base = runtimeConfig.apiBaseUrl;
  if (!req.url.startsWith(`${base}/`) && req.url !== base) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);
  const serverStatus = inject(ServerStatusService);
  const token = auth.token();

  let authReq = req.clone({ withCredentials: true });
  if (token) {
    authReq = authReq.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(authReq).pipe(
    tap((event) => {
      if (event instanceof HttpResponse && event.status >= 200 && event.status < 300) {
        serverStatus.markAvailable();
      }
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        if (isGlobalOutage(error)) {
          if (/\/health(\/|$)/.test(req.url)) serverStatus.markUnavailable();
          else serverStatus.confirmWithHealthCheck();
        } else if (error.status === 503) {
          serverStatus.confirmWithHealthCheck();
        }
      }
      const publicAuth = ['login', 'refresh', 'logout', 'register', 'forgot-password', 'reset-password', 'verify-email', 'resend-verification']
        .some(path => req.url.split('?')[0] === `${base}/auth/${path}`);
      if (error instanceof HttpErrorResponse && error.status === 401 && token && !publicAuth) {
        refreshing ??= auth.refresh().pipe(finalize(() => { refreshing = null; }),
          shareReplay({ bufferSize: 1, refCount: false }));
        return refreshing.pipe(
          catchError((refreshError) => {
            if (refreshError instanceof HttpErrorResponse && [401, 403].includes(refreshError.status)) {
              auth.setToken(null);
              if (!router.url.startsWith('/auth')) {
                void router.navigate(['/auth'], { queryParams: { returnUrl: router.url } });
              }
            }
            return throwError(() => refreshError);
          }),
          switchMap((session) => next(authReq.clone({ setHeaders: { Authorization: `Bearer ${session.accessToken}` } }))),
        );
      }
      return throwError(() => error);
    }),
  );
};
