export interface RuntimeConfig {
  apiBaseUrl: string;
  /** OAuth Client ID của Google; không có thì web không hiện nút Google. */
  googleClientId?: string;
}

declare global {
  interface Window {
    __FASHION_CONFIG__?: Partial<RuntimeConfig>;
  }
}

function normalizeApiBaseUrl(value: string | undefined): string {
  const normalized = value?.trim().replace(/\/+$/, '') || '/api/v1';
  if (/^\/(?!\/)[A-Za-z0-9/_.~%-]+$/.test(normalized)
    || /^https?:\/\/[A-Za-z0-9[\]:.-]+(?:\/[A-Za-z0-9/_.~%-]*)?$/i.test(normalized)) {
    return normalized;
  }
  throw new Error('runtime-config apiBaseUrl must be an absolute HTTP(S) URL or a root-relative path, without credentials, query, or fragment');
}

function normalizeGoogleClientId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(trimmed) ? trimmed : undefined;
}

export const runtimeConfig: Readonly<RuntimeConfig> = Object.freeze({
  apiBaseUrl: normalizeApiBaseUrl(window.__FASHION_CONFIG__?.apiBaseUrl),
  googleClientId: normalizeGoogleClientId(window.__FASHION_CONFIG__?.googleClientId),
});
