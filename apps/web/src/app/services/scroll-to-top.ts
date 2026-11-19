/** Đường dẫn không gồm query (?…) và fragment (#…). */
export function urlPath(url: string): string {
  return url.split(/[?#]/, 1)[0] || '/';
}

/**
 * Chuyển sang trang khác (đường dẫn đổi) thì cuộn lên đầu trang.
 * Giữ nguyên vị trí khi chỉ đổi query (bộ lọc, phân trang, tab), khi có fragment (#…)
 * hoặc khi người dùng bấm Quay lại / Tiến tới của trình duyệt.
 */
export function shouldScrollToTop(previousUrl: string | null, nextUrl: string, trigger: 'imperative' | 'popstate' | 'hashchange'): boolean {
  if (previousUrl === null || trigger !== 'imperative') return false;
  if (nextUrl.includes('#')) return false;
  return urlPath(previousUrl) !== urlPath(nextUrl);
}
