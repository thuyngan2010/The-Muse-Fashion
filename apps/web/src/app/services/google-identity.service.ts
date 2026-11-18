import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { runtimeConfig } from '../runtime-config';

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const LOAD_TIMEOUT_MS = 10_000;

type GoogleCredentialResponse = { credential?: string };
type GoogleButtonOptions = {
  type: 'standard';
  theme: 'outline';
  size: 'large';
  text: 'signin_with' | 'signup_with' | 'continue_with';
  shape: 'rectangular';
  logo_alignment: 'center';
  locale: 'vi';
  width: number;
};
type GoogleAccountsId = {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void; ux_mode: 'popup' }): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
};
declare global {
  interface Window { google?: { accounts?: { id?: GoogleAccountsId } } }
}

/**
 * Google Identity Services: nút "Đăng nhập với Google" chính chủ. Script chỉ được tải khi cần và đúng một lần.
 * Không có googleClientId hoặc tải script lỗi thì load() trả false để trang ẩn nút.
 */
@Injectable({ providedIn: 'root' })
export class GoogleIdentityService {
  /** Có cấu hình Client ID hay không (chưa nói script đã tải được). */
  readonly configured = !!runtimeConfig.googleClientId;
  private readonly credentialSubject = new Subject<string>();
  /** Phát ID token (credential) mỗi khi người dùng chọn tài khoản Google. */
  readonly credential$: Observable<string> = this.credentialSubject.asObservable();
  private loading: Promise<boolean> | null = null;
  private initialized = false;

  load(): Promise<boolean> {
    if (!runtimeConfig.googleClientId || typeof document === 'undefined') return Promise.resolve(false);
    this.loading ??= this.injectScript();
    return this.loading;
  }

  /** Vẽ nút Google vào phần tử. Trả false nếu Google chưa sẵn sàng. */
  async renderButton(host: HTMLElement, text: 'signin_with' | 'signup_with' = 'signin_with'): Promise<boolean> {
    if (!(await this.load())) return false;
    const id = window.google?.accounts?.id;
    const clientId = runtimeConfig.googleClientId;
    if (!id || !clientId) return false;
    if (!this.initialized) {
      id.initialize({
        client_id: clientId,
        callback: (response) => { if (response.credential) this.credentialSubject.next(response.credential); },
        ux_mode: 'popup',
      });
      this.initialized = true;
    }
    host.replaceChildren();
    // Google chỉ nhận chiều rộng từ 200 đến 400px.
    const width = Math.max(200, Math.min(400, Math.floor(host.clientWidth || 360)));
    id.renderButton(host, { type: 'standard', theme: 'outline', size: 'large', text, shape: 'rectangular',
      logo_alignment: 'center', locale: 'vi', width });
    return true;
  }

  private injectScript(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (window.google?.accounts?.id) { resolve(true); return; }
      const script = document.createElement('script');
      const timer = setTimeout(() => { script.remove(); this.loading = null; resolve(false); }, LOAD_TIMEOUT_MS);
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => { clearTimeout(timer); resolve(!!window.google?.accounts?.id); };
      script.onerror = () => { clearTimeout(timer); script.remove(); this.loading = null; resolve(false); };
      document.head.appendChild(script);
    });
  }
}
