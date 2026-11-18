import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

// Environment variables supplied by the host take precedence over the local file.
try {
  loadEnvFile(resolve(import.meta.dirname, '..', 'apps', 'web', '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const requireValue = process.argv.includes('--require');
const rawValue = process.env.PUBLIC_API_BASE_URL?.trim();
if (requireValue && !rawValue) {
  throw new Error('PUBLIC_API_BASE_URL is required for this deployment target');
}

const apiBaseUrl = (rawValue || '/api/v1').replace(/\/+$/, '');
const allowed = /^\/(?!\/)[A-Za-z0-9/_.~%-]+$/.test(apiBaseUrl)
  || /^https?:\/\/[A-Za-z0-9[\]:.-]+(?:\/[A-Za-z0-9/_.~%-]*)?$/i.test(apiBaseUrl);
if (!allowed) {
  throw new Error('PUBLIC_API_BASE_URL must be an absolute HTTP(S) URL or a root-relative path, without credentials, query, or fragment');
}

// Google OAuth Client ID (tùy chọn). Để trống thì không ghi vào cấu hình và web ẩn nút Google.
const googleClientId = process.env.PUBLIC_GOOGLE_CLIENT_ID?.trim();
if (googleClientId && !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
  throw new Error('PUBLIC_GOOGLE_CLIENT_ID must end with .apps.googleusercontent.com');
}

const output = resolve(import.meta.dirname, '..', 'apps', 'web', 'public', 'runtime-config.js');
writeFileSync(output, `window.__FASHION_CONFIG__ = Object.freeze(${JSON.stringify({ apiBaseUrl, ...(googleClientId ? { googleClientId } : {}) })});\n`, 'utf8');
console.log(`Wrote web runtime config for ${apiBaseUrl}`);
