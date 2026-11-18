import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, of, tap, switchMap, defer, firstValueFrom, finalize, shareReplay, Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import type { AuthTokens, StaffPermissionName, UserRole, UserSummary } from '@fashion/contracts';
import { ApiService } from './api.service';
import { ToastService } from './toast.service';

const TOKEN_KEY = 'fashion_access_token';
const USER_KEY = 'fashion_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly token = signal<string | null>(null);
  readonly currentUser = signal<UserSummary | null>(null);
  readonly initialized = signal<boolean>(false);

  readonly isAuthenticated = computed(() => !!this.token() && !!this.currentUser());
  readonly userRole = computed<UserRole | null>(() => this.currentUser()?.role ?? null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly isStaff = computed(() => this.currentUser()?.role === 'STAFF' || this.currentUser()?.role === 'ADMIN');
  readonly isCustomer = computed(() => this.currentUser()?.role === 'CUSTOMER');

  private remember = true;
  private refreshRequest?: Observable<AuthTokens>;

  constructor() { this.removeLegacyStorage(); }
  private removeLegacyStorage(): void {
    try {
      for (const storage of [localStorage, sessionStorage]) {
        storage.removeItem(TOKEN_KEY); storage.removeItem(USER_KEY);
      }
    } catch { /* Browser storage can be unavailable; credentials remain in memory. */ }
  }
  setCurrentUser(user: UserSummary | null, _remember = true): void { this.currentUser.set(user); }
  setToken(token: string | null, remember = true): void {
    this.remember = remember;
    this.token.set(token);
    if (!token) this.currentUser.set(null);
    this.removeLegacyStorage();
  }
  can(permission: StaffPermissionName, assignedStaffId?: string | null): boolean {
    if (this.isAdmin()) return true;
    if (!this.isStaff()) return false;
    return (this.currentUser()?.permissions ?? []).some(grant => grant.permission === permission &&
      (grant.scope === 'GLOBAL' || assignedStaffId === undefined || assignedStaffId === this.currentUser()?.id));
  }
  canGlobal(permission: StaffPermissionName): boolean {
    return this.isAdmin() || (this.isStaff() && (this.currentUser()?.permissions ?? []).some(grant => grant.permission === permission && grant.scope === 'GLOBAL'));
  }

  initAuth() {
    const token = this.token();
    const profile = token ? this.api.getProfile() : this.refresh().pipe(switchMap(() => this.api.getProfile()));
    return profile.pipe(
      tap((user) => {
        this.setCurrentUser(user, this.remember);
        this.initialized.set(true);
      }),
      catchError((error) => {
        if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) this.setToken(null);
        this.initialized.set(true);
        return of(null);
      }),
    );
  }

  refresh(): Observable<AuthTokens> {
    // Serialize refresh-cookie rotation between tabs; replay detection on the API stays strict.
    this.refreshRequest ??= defer(() => {
      const perform = () => firstValueFrom(this.api.refresh());
      return this.withSessionLock(perform);
    }).pipe(
      tap(res => {
        this.setToken(res.accessToken, this.remember);
        if (res.user) this.setCurrentUser(res.user, this.remember);
      }),
      finalize(() => { this.refreshRequest = undefined; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshRequest;
  }

  private withSessionLock<T>(perform: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    return locks ? locks.request('fashion-refresh:' + this.api.api, perform) : perform();
  }

  login(email: string, password: string, remember = true) {
    return this.api.login(email, password, remember).pipe(
      tap((res) => {
        this.setToken(res.accessToken, remember);
        if (res.user) {
          this.setCurrentUser(res.user, remember);
        } else {
          this.initAuth().subscribe();
        }
        this.toast.success('Đăng nhập thành công', 'Xin chào');
      }),
    );
  }

  loginWithGoogle(credential: string, remember = true) {
    return this.api.loginWithGoogle(credential, remember).pipe(
      tap((res) => {
        this.setToken(res.accessToken, remember);
        if (res.user) {
          this.setCurrentUser(res.user, remember);
        } else {
          this.initAuth().subscribe();
        }
        this.toast.success('Đăng nhập thành công', 'Xin chào');
      }),
    );
  }

  register(
    fullNameOrDto: string | { fullName: string; email: string; password: string; phone?: string },
    email?: string,
    password?: string
  ) {
    if (typeof fullNameOrDto === 'object') {
      return this.api.register(fullNameOrDto.fullName, fullNameOrDto.email, fullNameOrDto.password);
    }
    return this.api.register(fullNameOrDto, email!, password!);
  }

  logout(): void {
    defer(() => this.withSessionLock(() => firstValueFrom(this.api.logout()))).pipe(
      tap(() => {
        this.setToken(null);
        this.currentUser.set(null);
        this.toast.info('Bạn đã đăng xuất.');
        this.router.navigate(['/']);
      }),
    ).subscribe({ error: () => this.toast.error('Chưa thể thu hồi phiên đăng nhập. Vui lòng thử đăng xuất lại khi có kết nối.') });
  }

  refreshProfile(): void {
    if (!this.token()) return;
    this.api.getProfile().pipe(
      tap((profile) => this.currentUser.set(profile)),
      catchError(() => of(null)),
    ).subscribe();
  }

  getMe() {
    return this.api.getMe();
  }

  resendVerification(email: string) {
    return this.api.resendVerification(email);
  }
}
