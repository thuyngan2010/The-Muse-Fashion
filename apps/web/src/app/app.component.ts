import { Component, computed, inject } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationStart } from '@angular/router';
import { filter, map } from 'rxjs';
import { HeaderComponent } from './components/header.component';
import { FooterComponent } from './components/footer.component';
import { ToastComponent } from './components/toast.component';
import { MaintenanceOverlayComponent } from './components/maintenance-overlay.component';
import { ServerStatusService } from './services/server-status.service';
import { shouldScrollToTop } from './services/scroll-to-top';

@Component({
  selector: 'fc-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastComponent, MaintenanceOverlayComponent],
  template: `
    @if (serverStatus.unavailable()) {
      <fc-maintenance-overlay />
    }

    @if (!isAdminRoute()) {
      <fc-header />
    }

    <fc-toast />

    <main class="site-main" [class.admin-mode]="isAdminRoute()">
      <router-outlet />
    </main>

    @if (!isAdminRoute()) {
      <fc-footer />
    }
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      color: var(--color-text);
      background: var(--color-surface);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .site-main {
      flex: 1;
    }
    .site-main.admin-mode {
      background: #f4f3f0;
    }
  `],
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly serverStatus = inject(ServerStatusService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects || e.url)
    ),
    { initialValue: this.router.url }
  );

  readonly isAdminRoute = computed(() => {
    const url = this.currentUrl();
    return url ? url.startsWith('/admin') : false;
  });

  constructor() {
    // Sang trang mới thì hiển thị từ đầu trang thay vì giữ vị trí cuộn của trang trước.
    const viewport = inject(ViewportScroller);
    let previousUrl: string | null = null;
    let trigger: 'imperative' | 'popstate' | 'hashchange' = 'imperative';
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) trigger = event.navigationTrigger ?? 'imperative';
      if (!(event instanceof NavigationEnd)) return;
      const nextUrl = event.urlAfterRedirects || event.url;
      if (shouldScrollToTop(previousUrl, nextUrl, trigger)) viewport.scrollToPosition([0, 0]);
      previousUrl = nextUrl;
    });
  }
}
