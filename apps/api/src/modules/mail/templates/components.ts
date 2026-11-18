import { escapeHtml } from './escape.js';

/** Màu theo docs/ui-style-guide.md. */
export const COLORS = {
  outer: '#f5f3f3',
  white: '#ffffff',
  ink: '#171717',
  inkSoft: '#444748',
  subtle: '#747878',
  line: '#c4c7c7',
  lineSoft: '#e3e2e2',
  pink: '#f4b8c1',
  pinkSoft: '#ffd9e1',
  pinkTint: '#fbeff1',
  accent: '#8f485d',
  price: '#c52929',
  success: '#276749',
} as const;

export const FONT_SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
export const FONT_SANS = "'Montserrat', Arial, Helvetica, sans-serif";

export interface EmailLink { label: string; href: string }

export function paragraph(textHtml: string, opts: { color?: string; size?: number } = {}): string {
  const size = opts.size ?? 14;
  return `<p style="margin:0 0 16px 0;font-family:${FONT_SANS};font-size:${size}px;line-height:${Math.round(size * 1.7)}px;`
    + `color:${opts.color ?? COLORS.inkSoft};word-break:break-word;">${textHtml}</p>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">`
    + `<tr><td height="1" style="height:1px;font-size:1px;line-height:1px;border-top:1px solid ${COLORS.lineSoft};">&nbsp;</td></tr></table>`;
}

/** Nút bấm. Chính: nền đen, chữ trắng. Phụ: viền đen. Cao 48px, rộng tối thiểu 240px, bo góc 0. */
export function button(link: EmailLink, variant: 'primary' | 'secondary' = 'primary'): string {
  const primary = variant === 'primary';
  const bg = primary ? COLORS.ink : COLORS.white;
  const fg = primary ? COLORS.white : COLORS.ink;
  return `<table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;">`
    + `<tr><td align="center" bgcolor="${bg}" style="background-color:${bg};border:1px solid ${COLORS.ink};border-radius:0;">`
    + `<a href="${escapeHtml(link.href)}" class="btn-link" target="_blank" style="display:inline-block;min-width:240px;height:48px;line-height:48px;`
    + `padding:0 28px;box-sizing:border-box;font-family:${FONT_SANS};font-size:12px;font-weight:700;letter-spacing:0.14em;`
    + `text-transform:uppercase;text-decoration:none;text-align:center;color:${fg};">${escapeHtml(link.label)}</a></td></tr></table>`;
}

/** Dòng "Nếu nút không hoạt động..." kèm link đầy đủ, xuống dòng được. */
export function fallbackLink(href: string): string {
  return `<p style="margin:12px 0 0 0;font-family:${FONT_SANS};font-size:11px;line-height:18px;color:${COLORS.subtle};">`
    + `Nếu nút không hoạt động, sao chép đường dẫn sau vào trình duyệt:<br>`
    + `<a href="${escapeHtml(href)}" target="_blank" style="color:${COLORS.accent};word-break:break-all;overflow-wrap:anywhere;text-decoration:underline;">${escapeHtml(href)}</a></p>`;
}

/** Bảng 2 cột nhãn/giá trị; trên mobile thành 1 cột. Dòng thiếu giá trị bị bỏ. */
export function infoRows(rows: Array<{ label: string; value: string | undefined | null }>): string {
  const shown = rows.filter((row) => row.value !== undefined && row.value !== null && String(row.value).trim() !== '');
  if (!shown.length) return '';
  const body = shown.map((row, index) => {
    const border = index === shown.length - 1 ? '' : `border-bottom:1px solid ${COLORS.lineSoft};`;
    return `<tr><td class="stack" width="38%" valign="top" style="padding:12px 12px 12px 0;${border}font-family:${FONT_SANS};font-size:11px;`
      + `font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.subtle};">${escapeHtml(row.label)}</td>`
      + `<td class="stack" valign="top" style="padding:12px 0;${border}font-family:${FONT_SANS};font-size:14px;line-height:22px;`
      + `color:${COLORS.ink};word-break:break-word;">${escapeHtml(row.value)}</td></tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;border-top:1px solid ${COLORS.lineSoft};">${body}</table>`;
}

/** Khung nhắc nhở: nền hồng nhạt (mặc định) hoặc xám. `lines` là văn bản thuần, sẽ được escape. */
export function notice(lines: string[], tone: 'pink' | 'gray' = 'pink', title?: string): string {
  const bg = tone === 'pink' ? COLORS.pinkTint : COLORS.outer;
  const edge = tone === 'pink' ? COLORS.pink : COLORS.line;
  const head = title
    ? `<div style="margin:0 0 6px 0;font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.accent};">${escapeHtml(title)}</div>`
    : '';
  const text = lines.map((line) => `<div style="margin:0 0 4px 0;font-family:${FONT_SANS};font-size:13px;line-height:21px;color:${COLORS.inkSoft};word-break:break-word;">${escapeHtml(line)}</div>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">`
    + `<tr><td bgcolor="${bg}" style="background-color:${bg};border-left:3px solid ${edge};padding:16px 20px;">${head}${text}</td></tr></table>`;
}

/** Danh sách bước đánh số. Mỗi phần tử là HTML đã escape (có thể chứa link). */
export function steps(itemsHtml: string[]): string {
  const rows = itemsHtml.map((item, index) => `<tr><td width="28" valign="top" style="padding:0 0 10px 0;font-family:${FONT_SERIF};font-size:16px;color:${COLORS.accent};">${index + 1}.</td>`
    + `<td valign="top" style="padding:0 0 10px 0;font-family:${FONT_SANS};font-size:14px;line-height:22px;color:${COLORS.inkSoft};word-break:break-word;">${item}</td></tr>`).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">${rows}</table>`;
}
