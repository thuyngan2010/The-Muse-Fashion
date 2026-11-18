import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs';

/** Đưa mọi chuỗi trong phản hồi JSON về dạng NFC để dấu tiếng Việt luôn hiển thị liền với chữ. */
export function toNfc<T>(value: T): T {
  if (typeof value === 'string') return value.normalize('NFC') as T;
  if (Array.isArray(value)) return value.map(toNfc) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = toNfc(item);
    return out as T;
  }
  return value;
}

export const unicodeNfcInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(map((event) => (event instanceof HttpResponse && event.body !== null && typeof event.body === 'object'
    ? event.clone({ body: toNfc(event.body) }) : event)));
