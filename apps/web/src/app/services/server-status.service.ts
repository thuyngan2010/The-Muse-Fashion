import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, of, tap, type Observable } from 'rxjs';
import { runtimeConfig } from '../runtime-config';

@Injectable({ providedIn: 'root' })
export class ServerStatusService {
  private readonly http = inject(HttpClient);
  private readonly api = runtimeConfig.apiBaseUrl;

  /** Backend không phản hồi hoặc health/live thất bại. */
  readonly unavailable = signal(false);
  readonly checking = signal(false);

  private retryTimer: ReturnType<typeof setInterval> | null = null;

  checkLive(): Observable<boolean> {
    return this.http.get<{ status: string }>(`${this.api}/health/live`).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  markUnavailable(): void {
    if (this.unavailable()) return;
    this.unavailable.set(true);
    this.startAutoRetry();
  }

  markAvailable(): void {
    if (!this.unavailable()) return;
    this.unavailable.set(false);
    this.stopAutoRetry();
  }

  /** Gọi khi gặp 503 — chỉ bật overlay nếu health/live cũng fail. */
  confirmWithHealthCheck(): void {
    this.checkLive().subscribe((ok) => {
      if (!ok) this.markUnavailable();
    });
  }

  recheck(): void {
    if (this.checking()) return;
    this.checking.set(true);
    this.checkLive().pipe(
      tap((ok) => {
        this.checking.set(false);
        if (ok) this.markAvailable();
        else this.markUnavailable();
      }),
    ).subscribe();
  }

  bootstrapCheck(): Observable<unknown> {
    return this.checkLive().pipe(
      tap((ok) => {
        if (!ok) this.markUnavailable();
      }),
      map(() => null),
    );
  }

  private startAutoRetry(): void {
    this.stopAutoRetry();
    this.retryTimer = setInterval(() => this.recheck(), 30_000);
  }

  private stopAutoRetry(): void {
    if (this.retryTimer !== null) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
