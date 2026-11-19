export const AI_QUOTA_TYPE = 'DAILY_COMBINED';

/** Bộ đếm tổng lượt tạo ảnh AI của cả hệ thống trong ngày (một bản ghi chung, không thuộc khách nào). */
export const AI_TOTAL_QUOTA_TYPE = 'DAILY_TOTAL';
export const AI_TOTAL_QUOTA_OWNER = '000000000000000000000000';
export const DEFAULT_DAILY_TOTAL = 40;
export const AI_QUOTA_EXCEEDED_MESSAGE = 'Bạn đã dùng hết lượt thử đồ AI hôm nay. Vui lòng quay lại vào ngày mai.';

/** AI_DAILY_LIMIT_TOTAL: số nguyên ≥ 0 (0 = tạm dừng tạo ảnh); thiếu hoặc sai thì dùng mặc định 40. */
export function totalDailyLimit(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_TOTAL;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? Math.min(value, 100_000) : DEFAULT_DAILY_TOTAL;
}

export function utcDayStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function nextUtcDayStart(from = new Date()): Date {
  const start = utcDayStart(from);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
