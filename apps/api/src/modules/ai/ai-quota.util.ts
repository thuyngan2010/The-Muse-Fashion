export const AI_QUOTA_TYPE = 'DAILY_COMBINED';

export function utcDayStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function nextUtcDayStart(from = new Date()): Date {
  const start = utcDayStart(from);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
