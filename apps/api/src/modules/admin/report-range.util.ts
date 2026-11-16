import { BadRequestException } from '@nestjs/common';

export const REPORT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function vnMonthStartUtc(reference = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(reference);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (!year || !month) throw new BadRequestException('Unable to resolve report timezone');
  return new Date(`${year}-${month}-01T00:00:00+07:00`);
}

export function resolveSalesReportRange(fromInput?: string, toInput?: string): { from: Date; to: Date } {
  if (!fromInput && !toInput) {
    const to = new Date();
    return { from: vnMonthStartUtc(to), to };
  }
  if (!fromInput || !toInput) {
    throw new BadRequestException('Both from and to are required for a custom report range');
  }
  const from = new Date(fromInput);
  const to = new Date(toInput);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new BadRequestException('Invalid report date range');
  }
  return { from, to };
}
