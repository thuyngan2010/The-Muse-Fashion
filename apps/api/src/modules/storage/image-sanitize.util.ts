import { UnprocessableEntityException } from '@nestjs/common';
import sharp from 'sharp';

/** Decode every pixel before re-encoding; output has no EXIF/text metadata. */
export async function sanitizeImage(bytes: Buffer, declaredType: string): Promise<Buffer> {
  const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' } as const;
  const format = formats[declaredType as keyof typeof formats];
  if (!format) throw new UnprocessableEntityException('Unsupported image type');
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 16_000_000 });
    const metadata = await image.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1) {
      throw new Error('Invalid or animated image');
    }
    return await image.rotate().toFormat(format).toBuffer();
  } catch {
    throw new UnprocessableEntityException('Image data does not match its content type or exceeds pixel limits');
  }
}
