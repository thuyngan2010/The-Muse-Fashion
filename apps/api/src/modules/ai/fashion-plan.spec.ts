import { describe, expect, it } from 'vitest';
import { BODY_REGIONS, FASHION_CATEGORIES, FASHION_RULES, buildFashionPrompt, validateAnalysis, validateStyling } from './fashion-plan.js';

function detection(category = 'shoes', region = 'feet') {
  return { person: { count: 1, pose: 'standing', visibleRegions: [...BODY_REGIONS] },
    products: [{ productId: 'p1', category, targetRegion: region, confidence: 0.95, details: 'Blue reference product, original silhouette.' }] };
}

describe('Fashion analysis and category-specific prompts', () => {
  it.each(FASHION_CATEGORIES)('builds an anatomically scoped prompt for %s', (category) => {
    const rule = FASHION_RULES[category];
    const analysis = validateAnalysis(detection(category, rule.regions[0]), ['p1']);
    const styling = validateStyling({ compatible: true, explanation: 'Phù hợp.', summary: 'Bản thử sản phẩm.',
      items: [{ productId: 'p1', action: rule.action, notes: 'Keep the original design.' }] }, analysis);
    const plan = buildFashionPrompt('TRY_ON', analysis, styling);
    expect(plan.prompt).toContain(rule.instruction);
    expect(plan.prompt).toContain('Image 2, product p1');
    expect(plan.detectedItems).toEqual([{ productId: 'p1', category, targetRegion: rule.regions[0] }]);
    expect(plan.prompt).toContain('keep all other clothing unchanged');
    expect(plan.prompt).not.toContain('https://');
  });

  it.each([0, 2])('rejects an image with %i people', count => {
    const value = detection(); value.person.count = count;
    expect(() => validateAnalysis(value, ['p1'])).toThrow('đúng một người');
  });
  it('does not invent feet in a cropped portrait to fit shoes', () => {
    const value = detection(); value.person.visibleRegions = ['face', 'torso'];
    expect(() => validateAnalysis(value, ['p1'])).toThrow('chưa hiển thị vùng');
  });
  it('rejects uncertain detections and fabricated product ids', () => {
    const value = detection(); value.products[0].confidence = 0.3;
    expect(() => validateAnalysis(value, ['p1'])).toThrow('Chưa nhận diện rõ');
    expect(() => validateAnalysis(detection(), ['foreign'])).toThrow('Invalid product');
  });
  it('rejects placing shoes on the face', () => {
    expect(() => validateAnalysis(detection('shoes', 'face'), ['p1'])).toThrow('placement mismatch');
  });
  it('does not force an unknown product into a supported category', () => {
    expect(() => validateAnalysis(detection('unknown', 'unknown'), ['p1'])).toThrow('Chưa nhận diện được loại');
  });
  it('cannot silently omit or duplicate a selected product', () => {
    expect(() => validateAnalysis(detection(), ['p1', 'p2'])).toThrow('Missing product');
    const value = detection(); value.products.push({ ...value.products[0] });
    expect(() => validateAnalysis(value, ['p1', 'p2'])).toThrow('Duplicate product');
  });
  it('rejects conflicting shoes and sandals in the same outfit', () => {
    const value = detection();
    value.products.push({ ...value.products[0], productId: 'p2', category: 'sandals' });
    expect(() => validateAnalysis(value, ['p1', 'p2'])).toThrow('trùng vị trí');
  });
  it('keeps reference order and layers outerwear over a selected top', () => {
    const value = detection('outerwear', 'torso');
    value.products.push({ ...value.products[0], productId: 'p2', category: 'top' });
    const analysis = validateAnalysis(value, ['p2', 'p1']);
    const styling = validateStyling({ compatible: true, explanation: 'Phù hợp.', summary: 'Áo trong và áo khoác.',
      items: [{ productId: 'p2', action: 'replace', notes: 'Inner top.' }, { productId: 'p1', action: 'layer', notes: 'Outer layer.' }] }, analysis);
    const plan = buildFashionPrompt('MIX_MATCH', analysis, styling);
    expect(plan.prompt.indexOf('Image 2, product p2')).toBeLessThan(plan.prompt.indexOf('Image 3, product p1'));
    expect(plan.prompt).toContain('Compose all selected products');
    expect(plan.prompt).toContain('Preserve any selected inner top');
  });
  it('does not accept arbitrary actions or silently dropped styling items', () => {
    const analysis = validateAnalysis(detection(), ['p1']);
    expect(() => validateStyling({ compatible: true, explanation: 'ok', summary: 'ok', items: [] }, analysis)).toThrow('Missing styling');
    expect(() => validateStyling({ compatible: true, explanation: 'ok', summary: 'ok',
      items: [{ productId: 'p1', action: 'add', notes: 'wrong' }] }, analysis)).toThrow('Invalid styling action');
  });
});
