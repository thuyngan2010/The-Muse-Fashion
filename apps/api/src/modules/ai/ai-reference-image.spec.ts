import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { aiReferenceChoice } from './ai-worker.service.js';
import { aiReferencePatch } from '../catalog/catalog.service.js';

const M1 = '64b0000000000000000000a1';
const M2 = '64b0000000000000000000a2';

describe('Worker chọn ảnh tham chiếu cho AI', () => {
  it('uses the admin-chosen manual URL or uploaded image id', () => {
    expect(aiReferenceChoice({ aiReferenceImage: 'https://cdn/flat.jpg', images: ['https://cdn/model.jpg', 'https://cdn/flat.jpg'] }))
      .toEqual({ url: 'https://cdn/flat.jpg' });
    expect(aiReferenceChoice({ aiReferenceImage: M2, images: [], imageMediaIds: [M1, M2] })).toEqual({ mediaId: M2 });
  });

  it('falls back (null) when nothing is chosen or the choice no longer belongs to the product', () => {
    expect(aiReferenceChoice({ images: ['https://cdn/model.jpg'] })).toBeNull();
    expect(aiReferenceChoice({ aiReferenceImage: null, images: ['https://cdn/model.jpg'] })).toBeNull();
    expect(aiReferenceChoice({ aiReferenceImage: 'https://evil/x.jpg', images: ['https://cdn/model.jpg'], imageMediaIds: [M1] })).toBeNull();
  });
});

describe('Server kiểm tra aiReferenceImage khi lưu sản phẩm', () => {
  it('accepts a URL or media id of this product', () => {
    expect(aiReferencePatch('https://cdn/a.jpg', ['https://cdn/a.jpg'], [], null)).toEqual({ aiReferenceImage: 'https://cdn/a.jpg' });
    expect(aiReferencePatch(M1, [], [M1], null)).toEqual({ aiReferenceImage: M1 });
  });

  it('rejects an image that is not one of this product\'s images with 400', () => {
    expect(() => aiReferencePatch('https://other/b.jpg', ['https://cdn/a.jpg'], [M1], null)).toThrow(BadRequestException);
    expect(() => aiReferencePatch(M2, [], [M1], null)).toThrow('Ảnh dùng cho AI phải là một ảnh của chính sản phẩm này.');
  });

  it('null clears the choice; leaving it out keeps it', () => {
    expect(aiReferencePatch(null, ['https://cdn/a.jpg'], [], 'https://cdn/a.jpg')).toEqual({ aiReferenceImage: null });
    expect(aiReferencePatch(undefined, ['https://cdn/a.jpg'], [], 'https://cdn/a.jpg')).toEqual({});
    expect(aiReferencePatch(undefined, [], [], null)).toEqual({});
  });

  it('clears the choice automatically when that image is removed from the product', () => {
    expect(aiReferencePatch(undefined, ['https://cdn/b.jpg'], [], 'https://cdn/a.jpg')).toEqual({ aiReferenceImage: null });
    expect(aiReferencePatch(undefined, [], [M2], M1)).toEqual({ aiReferenceImage: null });
  });
});
