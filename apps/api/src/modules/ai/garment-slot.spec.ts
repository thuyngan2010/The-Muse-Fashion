import { describe, expect, it } from 'vitest';
import { detectGarmentSlot, findOutfitConflict, matchGarmentText } from './garment-slot.js';

describe('detectGarmentSlot: vị trí mặc từ tên danh mục và tên sản phẩm', () => {
  it.each([
    ['Quần jean ống suông', 'BOTTOM', 'jeans'],
    ['Chân váy xếp ly', 'BOTTOM', 'skirt'],
    ['Đầm hoa nhí', 'ONE_PIECE', 'dress'],
    ['Áo khoác dạ', 'OUTERWEAR', 'jacket'],
    ['Áo sơ mi lụa', 'TOP', 'shirt'],
    ['Giày cao gót', 'FOOTWEAR', 'high heels'],
    ['Túi xách mini', 'BAG', 'handbag'],
    ['Váy maxi đi biển', 'ONE_PIECE', 'maxi dress'],
    ['Jumpsuit ống rộng', 'ONE_PIECE', 'jumpsuit'],
    ['Quần short kaki', 'BOTTOM', 'shorts'],
    ['Áo thun basic', 'TOP', 't-shirt'],
    ['Blazer oversize', 'OUTERWEAR', 'blazer'],
    ['Mũ lưỡi trai', 'HEADWEAR', 'cap'],
    ['Kính râm mắt mèo', 'EYEWEAR', 'sunglasses'],
    ['Thắt lưng da', 'ACCESSORY', 'belt'],
    ['Dép quai ngang', 'FOOTWEAR', 'sandals'],
  ])('%s → %s (%s)', (name, slot, noun) => {
    expect(detectGarmentSlot(null, name)).toMatchObject({ slot, noun });
  });

  it('handles names without accents and any letter case', () => {
    expect(detectGarmentSlot(null, 'quan jean ong suong')).toMatchObject({ slot: 'BOTTOM', noun: 'jeans' });
    expect(detectGarmentSlot(null, 'CHAN VAY XEP LY')).toMatchObject({ slot: 'BOTTOM', noun: 'skirt' });
    expect(detectGarmentSlot(null, 'ao khoac da')).toMatchObject({ slot: 'OUTERWEAR' });
    expect(detectGarmentSlot(null, 'dam hoa nhi')).toMatchObject({ slot: 'ONE_PIECE' });
  });

  it('checks longer phrases first ("áo khoác" before "áo", "chân váy" before "váy")', () => {
    expect(matchGarmentText('Áo khoác jean').slot).toBe('OUTERWEAR');
    expect(matchGarmentText('Chân váy jean').slot).toBe('BOTTOM');
    expect(matchGarmentText('Váy jean').slot).toBe('ONE_PIECE');
    expect(matchGarmentText('Áo dài tay basic').slot).toBe('TOP');
  });

  it('treats "jean" as a material when another keyword is present', () => {
    expect(matchGarmentText('Đầm jean').slot).toBe('ONE_PIECE');
    expect(matchGarmentText('Áo jean').slot).toBe('TOP');
    expect(matchGarmentText('Jeans ống loe').slot).toBe('BOTTOM');
  });

  it('does not confuse accented words that only look alike without accents', () => {
    expect(matchGarmentText('Set đồ đẹp').slot).toBe('UNKNOWN');
    expect(matchGarmentText('Áo thun đẹp').slot).toBe('TOP');
  });

  it('prefers the category name, using the product name for a more specific noun', () => {
    expect(detectGarmentSlot('Phụ kiện', 'Khăn lụa')).toMatchObject({ slot: 'ACCESSORY' });
    expect(detectGarmentSlot('Quần', 'Quần jean ống suông')).toMatchObject({ slot: 'BOTTOM', noun: 'jeans' });
    expect(detectGarmentSlot('Đầm', 'Mẫu mới mùa hè')).toMatchObject({ slot: 'ONE_PIECE', noun: 'dress' });
  });

  it('uses the product name when the category is only a generic word (Áo / Váy / Quần)', () => {
    expect(detectGarmentSlot('Áo', 'Áo khoác dạ')).toMatchObject({ slot: 'OUTERWEAR' });
    expect(detectGarmentSlot('Váy', 'Chân váy xếp ly')).toMatchObject({ slot: 'BOTTOM', noun: 'skirt' });
    expect(detectGarmentSlot('Áo', 'Mẫu mới')).toMatchObject({ slot: 'TOP' });
  });

  it('returns UNKNOWN with no noun for unknown names', () => {
    expect(detectGarmentSlot(null, 'Sản phẩm XYZ')).toEqual({ slot: 'UNKNOWN', noun: null, label: 'Khác' });
    expect(detectGarmentSlot('', '')).toMatchObject({ slot: 'UNKNOWN' });
    expect(detectGarmentSlot(undefined, undefined)).toMatchObject({ slot: 'UNKNOWN' });
  });
});

describe('findOutfitConflict: quy tắc bộ phối', () => {
  it('rejects two items in the same position', () => {
    expect(findOutfitConflict(['BOTTOM', 'BOTTOM'])).toBe('Bạn đang chọn 2 món cùng vị trí (quần/chân váy). Mỗi vị trí chỉ chọn 1 món.');
    expect(findOutfitConflict(['TOP', 'FOOTWEAR', 'FOOTWEAR'])).toContain('(giày/dép)');
  });

  it('rejects a dress or jumpsuit together with a top or bottom', () => {
    const message = 'Đầm/jumpsuit đã là cả bộ, không phối cùng áo hoặc quần. Vui lòng bỏ bớt một món.';
    expect(findOutfitConflict(['ONE_PIECE', 'TOP'])).toBe(message);
    expect(findOutfitConflict(['BOTTOM', 'ONE_PIECE'])).toBe(message);
  });

  it('allows normal outfits, several accessories and unknown items', () => {
    expect(findOutfitConflict(['TOP', 'BOTTOM', 'FOOTWEAR'])).toBeNull();
    expect(findOutfitConflict(['ONE_PIECE', 'OUTERWEAR', 'FOOTWEAR', 'BAG'])).toBeNull();
    expect(findOutfitConflict(['TOP', 'BOTTOM', 'ACCESSORY', 'ACCESSORY'])).toBeNull();
    expect(findOutfitConflict(['UNKNOWN', 'UNKNOWN'])).toBeNull();
  });
});
