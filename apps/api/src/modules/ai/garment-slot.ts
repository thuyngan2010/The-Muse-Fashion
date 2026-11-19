/**
 * Vị trí mặc của sản phẩm (áo, quần, đầm, giày...). Logic nằm ở @fashion/contracts để web và API
 * dùng chung một bản (web cảnh báo khi chọn món, API chặn trước khi tạo job và viết prompt).
 */
export {
  GARMENT_SLOTS, GARMENT_SLOT_POSITIONS, OUTFIT_ONE_PIECE_CONFLICT, detectGarmentSlot, findOutfitConflict, matchGarmentText,
  type GarmentSlot, type GarmentSlotMatch,
} from '@fashion/contracts';
