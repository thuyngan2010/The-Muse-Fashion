export function vietnamDate(reference = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(reference);
  return ['year', 'month', 'day'].map(name => parts.find(part => part.type === name)!.value).join('-');
}

function calendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Vui lòng chọn đủ ngày bắt đầu và kết thúc.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Ngày báo cáo không hợp lệ.');
  }
  return date;
}

/** Date inputs include both selected days in the store's Vietnam timezone. */
export function salesReportDateRange(fromDate: string, toDate: string): { from: string; to: string } {
  calendarDate(fromDate);
  const end = calendarDate(toDate);
  if (fromDate > toDate) throw new Error('Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    from: new Date(`${fromDate}T00:00:00+07:00`).toISOString(),
    to: new Date(`${end.toISOString().slice(0, 10)}T00:00:00+07:00`).toISOString(),
  };
}
