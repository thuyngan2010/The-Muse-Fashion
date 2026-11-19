/** Tiện ích ảnh cho Thử đồ / Phối đồ AI: kiểm tra, nén trên trình duyệt và thông báo lỗi tiếng Việt. */
import { Observable, catchError, throwError } from 'rxjs';

/** Ảnh gốc khách được chọn tối đa 15 MB; sau khi nén phải dưới giới hạn server (UPLOAD_MAX_BYTES). */
export const PHOTO_SOURCE_MAX_BYTES = 15 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 1536;
export const PHOTO_JPEG_QUALITY = 0.85;
export const PHOTO_LOW_RES_EDGE = 400;
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
export const PHOTO_LIMITS_TEXT = 'JPG, PNG, WEBP hoặc HEIC · tối đa 15MB · ảnh sẽ được tự động nén trước khi tải lên';

export const PHOTO_MESSAGES = {
  tooBig: 'Ảnh lớn hơn 15MB. Vui lòng chọn ảnh khác hoặc chụp màn hình ảnh rồi tải lên.',
  format: 'Chỉ hỗ trợ ảnh JPG, PNG, WEBP hoặc HEIC.',
  unreadable: 'Không đọc được ảnh này. Hãy thử ảnh JPG/PNG khác, hoặc chụp màn hình ảnh rồi tải lại.',
  stillTooLarge: 'Ảnh vẫn quá lớn sau khi nén. Vui lòng chọn ảnh khác hoặc chụp màn hình ảnh rồi tải lên.',
  lowRes: 'Ảnh có độ phân giải thấp, kết quả có thể bị mờ.',
  network: 'Mất kết nối khi tải ảnh. Vui lòng bấm THỬ TẢI LẠI.',
  expired: 'Phiên tải ảnh đã hết hạn, vui lòng chọn lại ảnh.',
  generic: 'Tải ảnh không thành công. Vui lòng thử lại sau ít phút.',
} as const;

/** Lỗi đã có sẵn câu tiếng Việt cho khách. */
export class PhotoError extends Error {
  constructor(message: string) { super(message); this.name = 'PhotoError'; }
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** Ảnh nằm ngang (rộng hơn cao). */
export function isLandscape(width: number, height: number): boolean {
  return width > 0 && height > 0 && width > height;
}

/** Cạnh ngắn dưới 400px: chỉ cảnh báo, không chặn. */
export function isLowResolution(width: number, height: number): boolean {
  return width > 0 && height > 0 && Math.min(width, height) < PHOTO_LOW_RES_EDGE;
}

/** Kiểm tra ngay khi chọn file, trước khi nén: trả câu lỗi tiếng Việt hoặc null nếu hợp lệ. */
export function validatePhotoFile(file: Pick<File, 'name' | 'size' | 'type'>): string | null {
  const type = (file.type || '').toLowerCase();
  const heicByName = !type && /\.(heic|heif)$/i.test(file.name || '');
  if (!PHOTO_TYPES.includes(type) && !heicByName) return PHOTO_MESSAGES.format;
  if (!(file.size > 0)) return PHOTO_MESSAGES.unreadable;
  if (file.size > PHOTO_SOURCE_MAX_BYTES) return PHOTO_MESSAGES.tooBig;
  return null;
}

/** Kích thước sau khi thu nhỏ để cạnh dài không vượt maxEdge (không phóng to ảnh nhỏ). */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export type DecodedPhoto = { source: CanvasImageSource; width: number; height: number; close?: () => void };
export type PhotoCodec = {
  decode(file: Blob): Promise<DecodedPhoto>;
  /** Vẽ lại trên nền trắng (cho PNG trong suốt) với kích thước mới và xuất JPEG. */
  encodeJpeg(photo: DecodedPhoto, width: number, height: number, quality: number): Promise<Blob>;
};
export type PreparedPhoto = { file: File; width: number; height: number };

/** Các lần thử khi ảnh nén vẫn lớn hơn giới hạn server: giảm chất lượng, rồi giảm kích thước. */
const ATTEMPTS = [
  { edge: PHOTO_MAX_EDGE, quality: PHOTO_JPEG_QUALITY },
  { edge: PHOTO_MAX_EDGE, quality: 0.7 },
  { edge: 1280, quality: 0.65 },
] as const;

/** Nén ảnh trên trình duyệt: cạnh dài ≤ 1536px, JPEG chất lượng ~0.85, xoay đúng chiều theo EXIF. */
export async function compressPhoto(file: File, maxBytes: number, codec: PhotoCodec = browserPhotoCodec): Promise<PreparedPhoto> {
  let decoded: DecodedPhoto;
  try {
    decoded = await codec.decode(file);
    if (!(decoded.width > 0 && decoded.height > 0)) throw new Error('empty');
  } catch {
    throw new PhotoError(PHOTO_MESSAGES.unreadable);
  }
  try {
    for (const attempt of ATTEMPTS) {
      const size = fitWithin(decoded.width, decoded.height, attempt.edge);
      let blob: Blob;
      try { blob = await codec.encodeJpeg(decoded, size.width, size.height, attempt.quality); }
      catch { throw new PhotoError(PHOTO_MESSAGES.unreadable); }
      if (blob.size > 0 && blob.size <= maxBytes) {
        const name = (file.name || 'photo').replace(/\.[^.]*$/, '') + '.jpg';
        return { file: new File([blob], name, { type: 'image/jpeg' }), width: decoded.width, height: decoded.height };
      }
    }
    throw new PhotoError(PHOTO_MESSAGES.stillTooLarge);
  } finally {
    decoded.close?.();
  }
}

/** Đọc ảnh bằng createImageBitmap (xoay theo EXIF); không được thì dùng thẻ <img>. HEIC chỉ đọc được nếu trình duyệt hỗ trợ. */
export const browserPhotoCodec: PhotoCodec = {
  async decode(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
      } catch { /* thử lại bằng <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('decode')); image.src = url; });
      return { source: image, width: image.naturalWidth, height: image.naturalHeight };
    } finally {
      URL.revokeObjectURL(url);
    }
  },
  async encodeJpeg(photo, width, height, quality) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(photo.source, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('encode')), 'image/jpeg', quality));
  },
};

function serverMessage(error: unknown): string {
  const err = error as { error?: { message?: unknown }; message?: unknown } | null;
  const message = err?.error && typeof err.error === 'object' ? err.error.message : undefined;
  return String(message ?? err?.message ?? '');
}

/** Phiên tải (presign) đã hết hạn: tự xin phiên mới và tải lại một lần. */
export function isUploadExpired(error: unknown): boolean {
  return /upload has expired|no longer available|expired while finalizing/i.test(serverMessage(error));
}

/** Đổi lỗi trình duyệt/server sang câu hướng dẫn tiếng Việt; không bao giờ trả câu tiếng Anh kỹ thuật. */
export function photoUploadErrorMessage(error: unknown): string {
  if (error instanceof PhotoError) return error.message;
  const err = error as { status?: unknown; name?: unknown } | null;
  const message = serverMessage(error);
  if (isUploadExpired(error)) return PHOTO_MESSAGES.expired;
  if (err?.status === 0 || err?.name === 'TimeoutError' || err?.name === 'AbortError' || error instanceof TypeError
    || /failed to fetch|network|timed? ?out|Không thể tải ảnh lên \(/i.test(message)) return PHOTO_MESSAGES.network;
  if (/maximum allowed size|exceeds (declared )?size|size is invalid|size limit/i.test(message)) return PHOTO_MESSAGES.stillTooLarge;
  if (/unsupported (image|content) type|does not match its content type|pixel limits|invalid image/i.test(message)) return PHOTO_MESSAGES.unreadable;
  return PHOTO_MESSAGES.generic;
}

/** Tải ảnh thử đồ; nếu phiên tải hết hạn thì xin presign mới và thử lại đúng một lần. */
export function uploadTryOnPhoto<T>(upload: (file: File) => Observable<T>, file: File): Observable<T> {
  return upload(file).pipe(catchError((error) => isUploadExpired(error) ? upload(file) : throwError(() => error)));
}
