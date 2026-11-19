/**
 * Giới hạn dung lượng ảnh server chấp nhận cho mỗi lần tải lên (khớp mặc định R2_UPLOAD_MAX_BYTES = 5 MB của API).
 * Nếu đổi R2_UPLOAD_MAX_BYTES trên server thì cập nhật hằng số này cho khớp.
 */
export const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const UPLOAD_MAX_LABEL = '5 MB';
