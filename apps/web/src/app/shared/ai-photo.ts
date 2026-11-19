/** Tiện ích ảnh cho Thử đồ / Phối đồ AI. */

/** Ảnh nằm ngang (rộng hơn cao). */
export function isLandscape(width: number, height: number): boolean {
  return width > 0 && height > 0 && width > height;
}

/** Đọc kích thước ảnh xem trước để gợi ý đổi sang ảnh dọc; không chạy được thì bỏ qua (không chặn). */
export function detectLandscape(url: string, done: (landscape: boolean) => void): void {
  if (typeof Image === 'undefined') return;
  const image = new Image();
  image.onload = () => done(isLandscape(image.naturalWidth, image.naturalHeight));
  image.src = url;
}
