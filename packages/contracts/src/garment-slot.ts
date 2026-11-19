/**
 * Vị trí mặc (slot) của một sản phẩm thời trang, đoán từ tên danh mục và tên sản phẩm.
 * Hàm thuần, không gọi mạng; dùng chung cho API (kiểm tra bộ phối, viết prompt) và web (cảnh báo khi chọn món).
 */
export const GARMENT_SLOTS = ['OUTERWEAR', 'ONE_PIECE', 'TOP', 'BOTTOM', 'FOOTWEAR', 'BAG', 'HEADWEAR', 'EYEWEAR', 'ACCESSORY', 'UNKNOWN'] as const;
export type GarmentSlot = typeof GARMENT_SLOTS[number];

export type GarmentSlotMatch = {
  slot: GarmentSlot;
  /** Danh từ tiếng Anh ngắn cho prompt, ví dụ "jeans", "skirt"; null khi UNKNOWN. */
  noun: string | null;
  /** Nhãn tiếng Việt hiển thị cho khách, ví dụ "Quần jean", "Chân váy". */
  label: string;
};

/** Tên vị trí dùng trong câu báo lỗi trùng vị trí. */
export const GARMENT_SLOT_POSITIONS: Record<GarmentSlot, string> = {
  OUTERWEAR: 'áo khoác', ONE_PIECE: 'đầm/jumpsuit', TOP: 'áo', BOTTOM: 'quần/chân váy', FOOTWEAR: 'giày/dép',
  BAG: 'túi', HEADWEAR: 'mũ/nón', EYEWEAR: 'kính', ACCESSORY: 'phụ kiện', UNKNOWN: 'khác',
};

type Rule = readonly [phrase: string, slot: Exclude<GarmentSlot, 'UNKNOWN'>, noun: string, label: string];

// Từ khóa có dấu (hoặc tiếng Anh). Bản không dấu được sinh tự động. Thứ tự trong danh sách không quan trọng:
// khi so khớp, cụm dài luôn được thử trước cụm ngắn ("áo khoác" trước "áo", "chân váy" trước "váy").
const RULES: readonly Rule[] = [
  ['áo khoác', 'OUTERWEAR', 'jacket', 'Áo khoác'], ['áo măng tô', 'OUTERWEAR', 'coat', 'Áo măng tô'], ['măng tô', 'OUTERWEAR', 'coat', 'Áo măng tô'],
  ['áo blazer', 'OUTERWEAR', 'blazer', 'Áo blazer'], ['blazer', 'OUTERWEAR', 'blazer', 'Áo blazer'], ['áo vest', 'OUTERWEAR', 'blazer', 'Áo vest'],
  ['vest', 'OUTERWEAR', 'blazer', 'Áo vest'], ['cardigan', 'OUTERWEAR', 'cardigan', 'Áo cardigan'], ['áo gió', 'OUTERWEAR', 'windbreaker jacket', 'Áo khoác'],
  ['áo phao', 'OUTERWEAR', 'puffer jacket', 'Áo khoác'], ['áo choàng', 'OUTERWEAR', 'coat', 'Áo khoác'], ['trench coat', 'OUTERWEAR', 'trench coat', 'Áo khoác'],
  ['jacket', 'OUTERWEAR', 'jacket', 'Áo khoác'], ['coat', 'OUTERWEAR', 'coat', 'Áo khoác'],

  ['đầm', 'ONE_PIECE', 'dress', 'Đầm'], ['váy liền', 'ONE_PIECE', 'dress', 'Váy liền'], ['váy maxi', 'ONE_PIECE', 'maxi dress', 'Váy maxi'],
  ['váy', 'ONE_PIECE', 'dress', 'Váy'], ['jumpsuit', 'ONE_PIECE', 'jumpsuit', 'Jumpsuit'], ['playsuit', 'ONE_PIECE', 'playsuit', 'Jumpsuit'],
  ['quần yếm', 'ONE_PIECE', 'overalls', 'Quần yếm'], ['quần váy', 'BOTTOM', 'skort', 'Quần váy'], ['áo dài tay', 'TOP', 'long-sleeve top', 'Áo dài tay'], ['yếm', 'ONE_PIECE', 'pinafore dress', 'Yếm'], ['áo dài', 'ONE_PIECE', 'ao dai dress', 'Áo dài'],
  ['dress', 'ONE_PIECE', 'dress', 'Đầm'],

  ['chân váy', 'BOTTOM', 'skirt', 'Chân váy'], ['skirt', 'BOTTOM', 'skirt', 'Chân váy'],
  ['quần jean', 'BOTTOM', 'jeans', 'Quần jean'], ['quần jeans', 'BOTTOM', 'jeans', 'Quần jean'], ['quần bò', 'BOTTOM', 'jeans', 'Quần jean'],
  ['jeans', 'BOTTOM', 'jeans', 'Quần jean'], ['jean', 'BOTTOM', 'jeans', 'Quần jean'],
  ['quần short', 'BOTTOM', 'shorts', 'Quần short'], ['quần shorts', 'BOTTOM', 'shorts', 'Quần short'], ['quần sooc', 'BOTTOM', 'shorts', 'Quần short'],
  ['quần soóc', 'BOTTOM', 'shorts', 'Quần short'], ['quần đùi', 'BOTTOM', 'shorts', 'Quần short'], ['shorts', 'BOTTOM', 'shorts', 'Quần short'],
  ['quần tây', 'BOTTOM', 'trousers', 'Quần tây'], ['quần âu', 'BOTTOM', 'trousers', 'Quần tây'], ['quần kaki', 'BOTTOM', 'chinos', 'Quần kaki'],
  ['quần khaki', 'BOTTOM', 'chinos', 'Quần kaki'], ['quần jogger', 'BOTTOM', 'joggers', 'Quần jogger'], ['jogger', 'BOTTOM', 'joggers', 'Quần jogger'],
  ['legging', 'BOTTOM', 'leggings', 'Quần legging'], ['leggings', 'BOTTOM', 'leggings', 'Quần legging'],
  ['quần', 'BOTTOM', 'trousers', 'Quần'], ['pants', 'BOTTOM', 'trousers', 'Quần'], ['trousers', 'BOTTOM', 'trousers', 'Quần'],

  ['áo sơ mi', 'TOP', 'shirt', 'Áo sơ mi'], ['sơ mi', 'TOP', 'shirt', 'Áo sơ mi'], ['somi', 'TOP', 'shirt', 'Áo sơ mi'],
  ['áo thun', 'TOP', 't-shirt', 'Áo thun'], ['áo phông', 'TOP', 't-shirt', 'Áo thun'], ['t shirt', 'TOP', 't-shirt', 'Áo thun'],
  ['tshirt', 'TOP', 't-shirt', 'Áo thun'], ['tee', 'TOP', 't-shirt', 'Áo thun'], ['áo polo', 'TOP', 'polo shirt', 'Áo polo'], ['polo', 'TOP', 'polo shirt', 'Áo polo'],
  ['croptop', 'TOP', 'crop top', 'Áo croptop'], ['crop top', 'TOP', 'crop top', 'Áo croptop'], ['áo len', 'TOP', 'knit sweater', 'Áo len'],
  ['sweater', 'TOP', 'sweater', 'Áo len'], ['áo nỉ', 'TOP', 'sweatshirt', 'Áo nỉ'], ['hoodie', 'TOP', 'hoodie', 'Áo hoodie'],
  ['áo ba lỗ', 'TOP', 'tank top', 'Áo ba lỗ'], ['áo hai dây', 'TOP', 'camisole top', 'Áo hai dây'], ['áo 2 dây', 'TOP', 'camisole top', 'Áo hai dây'],
  ['áo kiểu', 'TOP', 'blouse', 'Áo kiểu'], ['blouse', 'TOP', 'blouse', 'Áo kiểu'], ['shirt', 'TOP', 'shirt', 'Áo'], ['top', 'TOP', 'top', 'Áo'],
  ['tops', 'TOP', 'top', 'Áo'], ['áo', 'TOP', 'top', 'Áo'],

  ['giày cao gót', 'FOOTWEAR', 'high heels', 'Giày cao gót'], ['cao gót', 'FOOTWEAR', 'high heels', 'Giày cao gót'],
  ['giày thể thao', 'FOOTWEAR', 'sneakers', 'Giày thể thao'], ['giày búp bê', 'FOOTWEAR', 'ballet flats', 'Giày búp bê'],
  ['sneaker', 'FOOTWEAR', 'sneakers', 'Giày sneaker'], ['sneakers', 'FOOTWEAR', 'sneakers', 'Giày sneaker'], ['giày', 'FOOTWEAR', 'shoes', 'Giày'],
  ['dép', 'FOOTWEAR', 'sandals', 'Dép'], ['sandal', 'FOOTWEAR', 'sandals', 'Sandal'], ['sandals', 'FOOTWEAR', 'sandals', 'Sandal'],
  ['bốt', 'FOOTWEAR', 'boots', 'Bốt'], ['boot', 'FOOTWEAR', 'boots', 'Bốt'], ['boots', 'FOOTWEAR', 'boots', 'Bốt'], ['guốc', 'FOOTWEAR', 'clogs', 'Guốc'],
  ['loafer', 'FOOTWEAR', 'loafers', 'Giày lười'], ['loafers', 'FOOTWEAR', 'loafers', 'Giày lười'], ['heels', 'FOOTWEAR', 'high heels', 'Giày cao gót'],
  ['shoes', 'FOOTWEAR', 'shoes', 'Giày'], ['shoe', 'FOOTWEAR', 'shoes', 'Giày'],

  ['túi xách', 'BAG', 'handbag', 'Túi xách'], ['túi', 'BAG', 'bag', 'Túi'], ['ví', 'BAG', 'purse', 'Ví'], ['balo', 'BAG', 'backpack', 'Balo'],
  ['ba lô', 'BAG', 'backpack', 'Balo'], ['clutch', 'BAG', 'clutch', 'Túi'], ['handbag', 'BAG', 'handbag', 'Túi xách'], ['tote', 'BAG', 'tote bag', 'Túi'],
  ['bag', 'BAG', 'bag', 'Túi'],

  ['mũ lưỡi trai', 'HEADWEAR', 'cap', 'Mũ lưỡi trai'], ['mũ', 'HEADWEAR', 'hat', 'Mũ'], ['nón', 'HEADWEAR', 'hat', 'Nón'],
  ['beret', 'HEADWEAR', 'beret', 'Mũ nồi'], ['hat', 'HEADWEAR', 'hat', 'Mũ'], ['cap', 'HEADWEAR', 'cap', 'Mũ lưỡi trai'],

  ['kính râm', 'EYEWEAR', 'sunglasses', 'Kính râm'], ['kính mát', 'EYEWEAR', 'sunglasses', 'Kính râm'], ['kính', 'EYEWEAR', 'glasses', 'Kính'],
  ['sunglasses', 'EYEWEAR', 'sunglasses', 'Kính râm'], ['glasses', 'EYEWEAR', 'glasses', 'Kính'],

  ['thắt lưng', 'ACCESSORY', 'belt', 'Thắt lưng'], ['dây lưng', 'ACCESSORY', 'belt', 'Thắt lưng'], ['belt', 'ACCESSORY', 'belt', 'Thắt lưng'],
  ['khăn', 'ACCESSORY', 'scarf', 'Khăn'], ['scarf', 'ACCESSORY', 'scarf', 'Khăn'], ['vòng cổ', 'ACCESSORY', 'necklace', 'Vòng cổ'],
  ['vòng tay', 'ACCESSORY', 'bracelet', 'Vòng tay'], ['lắc tay', 'ACCESSORY', 'bracelet', 'Vòng tay'], ['vòng', 'ACCESSORY', 'bracelet', 'Vòng'],
  ['dây chuyền', 'ACCESSORY', 'necklace', 'Dây chuyền'], ['bông tai', 'ACCESSORY', 'earrings', 'Bông tai'], ['khuyên tai', 'ACCESSORY', 'earrings', 'Bông tai'],
  ['nhẫn', 'ACCESSORY', 'ring', 'Nhẫn'], ['đồng hồ', 'ACCESSORY', 'watch', 'Đồng hồ'], ['kẹp tóc', 'ACCESSORY', 'hair clip', 'Kẹp tóc'],
  ['băng đô', 'ACCESSORY', 'headband', 'Băng đô'], ['trang sức', 'ACCESSORY', 'jewelry', 'Trang sức'], ['phụ kiện', 'ACCESSORY', 'accessory', 'Phụ kiện'],
  ['necklace', 'ACCESSORY', 'necklace', 'Vòng cổ'], ['bracelet', 'ACCESSORY', 'bracelet', 'Vòng tay'], ['earrings', 'ACCESSORY', 'earrings', 'Bông tai'],
  ['earring', 'ACCESSORY', 'earrings', 'Bông tai'], ['ring', 'ACCESSORY', 'ring', 'Nhẫn'], ['watch', 'ACCESSORY', 'watch', 'Đồng hồ'],
];

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}
/** Chữ thường, bỏ ký tự không phải chữ/số, bọc khoảng trắng hai đầu để so khớp theo nguyên từ. */
function words(value: string, accents: boolean): string {
  const lower = value.normalize('NFC').toLowerCase();
  const base = accents ? lower : stripAccents(lower);
  return ` ${base.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}
function hasAccents(value: string): boolean {
  return /[đĐ]/.test(value) || /[̀-ͯ]/.test(value.normalize('NFD'));
}

// Từ chung chung: danh mục chỉ ghi "Áo", "Váy", "Quần" thì chưa đủ biết vị trí (áo khoác? chân váy? quần yếm?).
const GENERIC_PHRASES = new Set(['áo', 'váy', 'quần', 'top', 'tops']);
// Từ chỉ chất liệu: "jean" đứng một mình là quần jean, nhưng "Váy jean", "Áo jean" là váy/áo bằng vải jean.
// Chỉ dùng khi không có từ khóa nào khác khớp.
const WEAK_PHRASES = new Set(['jean', 'jeans']);

type PreparedRule = { accented: string; plain: string; slot: Rule[1]; noun: string; label: string; generic: boolean; weak: boolean };
// Cụm dài trước: tránh "áo" ăn mất "áo khoác", "váy" ăn mất "chân váy".
const PREPARED: readonly PreparedRule[] = RULES
  .map(([phrase, slot, noun, label]) => ({ accented: words(phrase, true), plain: words(phrase, false), slot, noun, label, generic: GENERIC_PHRASES.has(phrase), weak: WEAK_PHRASES.has(phrase) }))
  .sort((a, b) => b.plain.length - a.plain.length);

const UNKNOWN_MATCH: GarmentSlotMatch = { slot: 'UNKNOWN', noun: null, label: 'Khác' };

/**
 * Đoán vị trí mặc từ một đoạn chữ. Chữ có dấu thì so với từ khóa có dấu (tránh nhầm "đẹp" với "dép");
 * chữ không dấu thì so với từ khóa đã bỏ dấu.
 */
export function matchGarmentText(value: string | null | undefined): GarmentSlotMatch {
  const hit = findRule(value);
  return hit ? { slot: hit.slot, noun: hit.noun, label: hit.label } : UNKNOWN_MATCH;
}

function findRule(value: string | null | undefined): PreparedRule | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const accents = hasAccents(value);
  const text = words(value, accents);
  const matches = (rule: PreparedRule) => text.includes(accents ? rule.accented : rule.plain);
  return PREPARED.find(rule => !rule.weak && matches(rule)) ?? PREPARED.find(rule => rule.weak && matches(rule));
}

/**
 * Ưu tiên tên danh mục, sau đó tới tên sản phẩm. Hai ngoại lệ:
 * - danh mục chỉ là chữ chung chung ("Áo", "Váy", "Quần") mà tên sản phẩm nói rõ hơn thì theo tên sản phẩm
 *   (danh mục "Áo" + "Áo khoác dạ" là áo khoác; danh mục "Váy" + "Chân váy xếp ly" là chân váy);
 * - cùng vị trí thì lấy danh từ/nhãn cụ thể hơn của tên sản phẩm (danh mục "Quần" + "Quần jean" là "jeans").
 */
export function detectGarmentSlot(categoryName?: string | null, productName?: string | null): GarmentSlotMatch {
  const category = findRule(categoryName);
  const byName = matchGarmentText(productName);
  if (!category) return byName;
  if (category.generic && byName.slot !== 'UNKNOWN') return byName;
  return byName.slot === category.slot ? byName : { slot: category.slot, noun: category.noun, label: category.label };
}

export const OUTFIT_ONE_PIECE_CONFLICT = 'Đầm/jumpsuit đã là cả bộ, không phối cùng áo hoặc quần. Vui lòng bỏ bớt một món.';

/** Quy tắc phối: mỗi vị trí 1 món (trừ phụ kiện và món không rõ), đầm/jumpsuit không đi cùng áo hoặc quần. */
export function findOutfitConflict(slots: readonly GarmentSlot[]): string | null {
  const counted = slots.filter(slot => slot !== 'ACCESSORY' && slot !== 'UNKNOWN');
  const duplicate = counted.find((slot, index) => counted.indexOf(slot) !== index);
  if (duplicate) return `Bạn đang chọn 2 món cùng vị trí (${GARMENT_SLOT_POSITIONS[duplicate]}). Mỗi vị trí chỉ chọn 1 món.`;
  if (slots.includes('ONE_PIECE') && (slots.includes('TOP') || slots.includes('BOTTOM'))) return OUTFIT_ONE_PIECE_CONFLICT;
  return null;
}
