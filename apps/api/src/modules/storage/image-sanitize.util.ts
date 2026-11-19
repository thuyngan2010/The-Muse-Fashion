import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Decode every pixel before re-encoding; output has no EXIF/text metadata.
 * failOn 'error' (không phải 'warning'): JPEG điện thoại hay có cảnh báo nhỏ nhưng vẫn giải mã được thì không bị từ chối oan;
 * file giả mạo định dạng hoặc hỏng thật vẫn bị từ chối vì phải giải mã lại toàn bộ điểm ảnh.
 */
export async function sanitizeImage(bytes: Buffer, declaredType: string): Promise<Buffer> {
  const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as const;
  const format = formats[declaredType as keyof typeof formats];
  if (!format) throw new UnprocessableEntityException('Unsupported image type');
  try {
    const image = sharp(bytes, { failOn: 'error', limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new Error('Invalid or animated image');
    }
    return await image.rotate().toFormat(format).toBuffer();
  } catch {
    throw new UnprocessableEntityException('Image data does not match its content type or exceeds pixel limits');
  }
}
