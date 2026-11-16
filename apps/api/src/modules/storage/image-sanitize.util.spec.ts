import { describe, expect, it } from 'vitest';
import { sanitizeImage } from './image-sanitize.util.js';
import sharp from 'sharp';

describe('image upload sanitizer', () => {
  it('rejects a JPEG marker prefix without a frame and end marker', async () => {
    const spoofed = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02, 0x41, 0x42]);
    await expect(sanitizeImage(spoofed, 'image/jpeg')).rejects.toThrow();
  });

  it('rejects a mismatched declared image type', async () => {
    await expect(sanitizeImage(Buffer.from('not an image'), 'image/png')).rejects.toThrow();
  });
  it.each(['png', 'webp', 'jpeg'] as const)('decodes and re-encodes a valid %s image without metadata', async format => {
    const original = await sharp({ create: { width: 2, height: 3, channels: 3, background: 'red' } })
      .withExif({ IFD0: { Copyright: 'Private metadata' } }).toFormat(format).toBuffer();
    const clean = await sanitizeImage(original, `image/${format}`);
    const metadata = await sharp(clean).metadata();
    expect(metadata).toMatchObject({ format, width: 2, height: 3 });
    expect(metadata.exif).toBeUndefined();
    expect((await sharp(clean).raw().toBuffer()).length).toBeGreaterThan(0);
  });
  it.each([
    ['image/png', Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex')],
    ['image/webp', Buffer.from('524946460c000000574542504a554e4b00000000', 'hex')],
  ])('rejects a %s container with no pixel data', async (type, bytes) => {
    await expect(sanitizeImage(bytes as Buffer, type as string)).rejects.toThrow();
  });
});
