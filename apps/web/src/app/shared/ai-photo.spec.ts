import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  PHOTO_MESSAGES, PhotoError, compressPhoto, fitWithin, isLowResolution, photoUploadErrorMessage, uploadTryOnPhoto,
  validatePhotoFile, type PhotoCodec,
} from './ai-photo';

function fakeCodec(width: number, height: number, sizes: number[] = [400_000]) {
  const encodes: Array<{ width: number; height: number; quality: number }> = [];
  const codec: PhotoCodec = {
    decode: vi.fn(async () => ({ source: {} as CanvasImageSource, width, height })),
    encodeJpeg: vi.fn(async (_photo, w, h, quality) => {
      encodes.push({ width: w, height: h, quality });
      return new Blob([new Uint8Array(sizes[Math.min(encodes.length - 1, sizes.length - 1)])], { type: 'image/jpeg' });
    }),
  };
  return { codec, encodes };
}

describe('Browser photo compression for AI try-on', () => {
  it('shrinks a large phone photo to at most 1536px and returns a JPEG', async () => {
    const { codec, encodes } = fakeCodec(6000, 8000);
    const result = await compressPhoto(new File(['x'], 'IMG_0001.HEIC', { type: 'image/heic' }), 5 * 1024 * 1024, codec);
    expect(encodes[0]).toEqual({ width: 1152, height: 1536, quality: 0.85 });
    expect(result.file.type).toBe('image/jpeg');
    expect(result.file.name).toBe('IMG_0001.jpg');
    expect(Math.max(...Object.values(fitWithin(6000, 8000, 1536)))).toBeLessThanOrEqual(1536);
    expect({ width: result.width, height: result.height }).toEqual({ width: 6000, height: 8000 });
  });

  it('never enlarges a small photo', () => {
    expect(fitWithin(600, 800, 1536)).toEqual({ width: 600, height: 800 });
  });

  it('lowers quality, then size, when the result is still over the server limit', async () => {
    const { codec, encodes } = fakeCodec(4000, 3000, [6_000_000, 6_000_000, 900_000]);
    const result = await compressPhoto(new File(['x'], 'a.png', { type: 'image/png' }), 5 * 1024 * 1024, codec);
    expect(encodes.map(e => e.quality)).toEqual([0.85, 0.7, 0.65]);
    expect(Math.max(encodes[2].width, encodes[2].height)).toBe(1280);
    expect(result.file.size).toBe(900_000);
  });

  it('gives a clear Vietnamese error when the photo cannot be decoded or stays too large', async () => {
    const broken: PhotoCodec = { decode: async () => { throw new Error('heic not supported'); }, encodeJpeg: async () => new Blob() };
    await expect(compressPhoto(new File(['x'], 'a.heic', { type: 'image/heic' }), 1000, broken)).rejects.toThrow(PHOTO_MESSAGES.unreadable);
    const { codec } = fakeCodec(4000, 3000, [9_000_000]);
    await expect(compressPhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 1000, codec)).rejects.toThrow(PHOTO_MESSAGES.stillTooLarge);
  });
});

describe('Photo checks when the file is chosen', () => {
  const file = (name: string, type: string, size: number) => ({ name, type, size });
  it('blocks files over 15MB and unsupported formats before compressing', () => {
    expect(validatePhotoFile(file('a.jpg', 'image/jpeg', 15 * 1024 * 1024 + 1))).toBe(PHOTO_MESSAGES.tooBig);
    expect(validatePhotoFile(file('a.gif', 'image/gif', 1000))).toBe(PHOTO_MESSAGES.format);
    expect(validatePhotoFile(file('a.jpg', 'image/jpeg', 12 * 1024 * 1024))).toBeNull();
    expect(validatePhotoFile(file('IMG_1.HEIC', 'image/heic', 3_000_000))).toBeNull();
    expect(validatePhotoFile(file('IMG_1.heic', '', 3_000_000))).toBeNull();
  });
  it('warns (without blocking) when the short edge is under 400px', () => {
    expect(isLowResolution(390, 800)).toBe(true);
    expect(isLowResolution(1080, 1920)).toBe(false);
  });
});

describe('Vietnamese upload error messages', () => {
  it.each([
    [new PhotoError(PHOTO_MESSAGES.unreadable), PHOTO_MESSAGES.unreadable],
    [new HttpErrorResponse({ status: 0 }), PHOTO_MESSAGES.network],
    [new TypeError('Failed to fetch'), PHOTO_MESSAGES.network],
    [new Error('Không thể tải ảnh lên (503).'), PHOTO_MESSAGES.network],
    [{ status: 422, error: { message: 'Upload has expired' } }, PHOTO_MESSAGES.expired],
    [{ status: 422, error: { message: 'Upload is no longer available' } }, PHOTO_MESSAGES.expired],
    [{ status: 400, error: { message: 'Maximum allowed size is 5242880' } }, PHOTO_MESSAGES.stillTooLarge],
    [{ status: 422, error: { message: 'Image data does not match its content type or exceeds pixel limits' } }, PHOTO_MESSAGES.unreadable],
    [{ status: 500, error: { message: 'Internal server error' } }, PHOTO_MESSAGES.generic],
  ])('maps %o to a customer-friendly message', (error, expected) => {
    expect(photoUploadErrorMessage(error)).toBe(expected);
  });

  it('asks for a fresh upload session exactly once when it expired', () => {
    const upload = vi.fn().mockReturnValueOnce(throwError(() => ({ error: { message: 'Upload has expired' } })))
      .mockReturnValueOnce(throwError(() => ({ error: { message: 'Upload has expired' } })));
    let message = '';
    uploadTryOnPhoto(upload, new File(['x'], 'a.jpg', { type: 'image/jpeg' })).subscribe({ error: (e) => { message = photoUploadErrorMessage(e); } });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(message).toBe(PHOTO_MESSAGES.expired);
    const ok = vi.fn(() => of({ id: 'm1' }));
    uploadTryOnPhoto(ok, new File(['x'], 'a.jpg', { type: 'image/jpeg' })).subscribe();
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
