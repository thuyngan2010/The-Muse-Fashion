import { button, COLORS, FONT_SANS, FONT_SERIF, fallbackLink, type EmailLink } from './components.js';
import { escapeHtml } from './escape.js';

/** Ngữ cảnh dùng chung cho mọi mẫu: địa chỉ web và thông tin liên hệ ở chân thư. */
export interface MailContext {
  baseUrl: string;
  supportEmail?: string;
  supportPhone?: string;
  address?: string;
  year: number;
}

export const BRAND_TAGLINE = 'Architectural elegance & modern romance.';
export const FOOTER_REASON = 'Bạn nhận email này vì có tài khoản hoặc giao dịch tại MUSE.';

export function createMailContext(
  baseUrl: string,
  get: (name: string) => string | undefined,
  now: Date = new Date(),
): MailContext {
  const pick = (name: string) => get(name)?.trim() || undefined;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    supportEmail: pick('MAIL_SUPPORT_EMAIL'),
    supportPhone: pick('MAIL_SUPPORT_PHONE'),
    address: pick('MAIL_ADDRESS'),
    year: now.getFullYear(),
  };
}

export interface RenderEmailInput {
  preheader: string;
  /** HTML đặt phía trên nhãn (ví dụ dấu tích xanh). */
  heroHtml?: string;
  eyebrow: string;
  title: string;
  /** Văn bản thuần, được escape. */
  intro?: string;
  /** HTML đã dựng từ components (đã escape). */
  bodyHtml?: string;
  cta?: EmailLink;
  secondaryCta?: EmailLink;
  /** Các dòng ghi chú nhỏ, văn bản thuần. */
  footnote?: string[];
}

const FONT_LINK = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600&display=swap';

const HEAD_STYLE = `
    @media only screen and (max-width: 600px) {
      .outer-pad { padding: 0 !important; }
      .container { width: 100% !important; }
      .pad { padding-left: 20px !important; padding-right: 20px !important; }
      .h1 { font-size: 26px !important; line-height: 34px !important; }
      .btn-table { width: 100% !important; }
      .btn-link { display: block !important; min-width: 0 !important; width: 100% !important; }
      .stack { display: block !important; width: 100% !important; box-sizing: border-box; padding-right: 0 !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .email-bg { background-color: ${COLORS.outer} !important; }
      .email-card { background-color: ${COLORS.white} !important; }
    }`;

function logoHtml(ctx: MailContext): string {
  if (ctx.baseUrl.startsWith('https://')) {
    const src = `${ctx.baseUrl}/assets/brand/muse-logo-black.png`;
    return `<a href="${escapeHtml(ctx.baseUrl)}/" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(src)}" width="90" height="29" alt="MUSE" `
      + `style="display:block;border:0;outline:none;width:90px;height:29px;font-family:${FONT_SERIF};font-size:22px;letter-spacing:0.3em;color:${COLORS.ink};"></a>`;
  }
  return `<span style="font-family:${FONT_SERIF};font-size:24px;line-height:29px;letter-spacing:0.3em;color:${COLORS.ink};">MUSE</span>`;
}

function footerHtml(ctx: MailContext): string {
  const line = (inner: string) => `<div style="margin:0 0 4px 0;font-family:${FONT_SANS};font-size:12px;line-height:20px;color:${COLORS.lineSoft};word-break:break-word;">${inner}</div>`;
  const contacts: string[] = [];
  if (ctx.supportEmail) contacts.push(line(`Email: <a href="mailto:${escapeHtml(ctx.supportEmail)}" style="color:${COLORS.white};text-decoration:underline;">${escapeHtml(ctx.supportEmail)}</a>`));
  if (ctx.supportPhone) contacts.push(line(`Hotline: ${escapeHtml(ctx.supportPhone)}`));
  if (ctx.address) contacts.push(line(`Địa chỉ: ${escapeHtml(ctx.address)}`));
  const contactBlock = contacts.length ? `<div style="margin:16px 0 0 0;">${contacts.join('')}</div>` : '';
  return `<tr><td class="pad" bgcolor="${COLORS.ink}" style="background-color:${COLORS.ink};padding:32px 40px;">`
    + `<div style="font-family:${FONT_SERIF};font-size:20px;line-height:26px;letter-spacing:0.3em;color:${COLORS.white};">MUSE</div>`
    + `<div style="margin:6px 0 0 0;font-family:${FONT_SERIF};font-size:13px;line-height:20px;font-style:italic;color:${COLORS.line};">${escapeHtml(BRAND_TAGLINE)}</div>`
    + contactBlock
    + `<div style="margin:20px 0 0 0;padding:16px 0 0 0;border-top:1px solid ${COLORS.inkSoft};font-family:${FONT_SANS};font-size:11px;line-height:18px;color:${COLORS.line};">`
    + `© ${ctx.year} MUSE<br>${escapeHtml(FOOTER_REASON)}</div></td></tr>`;
}

/** Dựng toàn bộ HTML thư theo khung MUSE. */
export function renderEmail(input: RenderEmailInput, ctx: MailContext): string {
  const eyebrow = `<div style="font-family:${FONT_SANS};font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${COLORS.accent};">${escapeHtml(input.eyebrow)}</div>`;
  const title = `<h1 class="h1" style="margin:12px 0 16px 0;font-family:${FONT_SERIF};font-size:30px;line-height:38px;font-weight:400;color:${COLORS.ink};word-break:break-word;">${escapeHtml(input.title)}</h1>`;
  const intro = input.intro
    ? `<p style="margin:0 0 24px 0;font-family:${FONT_SANS};font-size:14px;line-height:24px;color:${COLORS.inkSoft};word-break:break-word;">${escapeHtml(input.intro)}</p>`
    : '';
  const actions = (input.cta ? button(input.cta, 'primary') : '')
    + (input.secondaryCta ? button(input.secondaryCta, 'secondary') : '')
    + (input.cta ? fallbackLink(input.cta.href) : '');
  const footnotes = (input.footnote ?? []).filter(Boolean).map((note) =>
    `<p style="margin:0 0 8px 0;font-family:${FONT_SANS};font-size:12px;line-height:20px;color:${COLORS.subtle};word-break:break-word;">${escapeHtml(note)}</p>`).join('');
  const footnoteBlock = footnotes ? `<div style="margin:28px 0 0 0;padding:20px 0 0 0;border-top:1px solid ${COLORS.lineSoft};">${footnotes}</div>` : '';
  const preheader = `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.outer};">`
    + `${escapeHtml(input.preheader)}${'&nbsp;&zwnj;'.repeat(60)}</div>`;

  return `<!DOCTYPE html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>${escapeHtml(input.title)}</title>
  <link href="${FONT_LINK}" rel="stylesheet">
  <style>${HEAD_STYLE}
  </style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.outer};-webkit-text-size-adjust:100%;">
  ${preheader}
  <table role="presentation" class="email-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.outer}" style="background-color:${COLORS.outer};">
    <tr><td class="outer-pad" align="center" style="padding:24px 12px;">
      <table role="presentation" class="container email-card" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.white}" style="width:100%;max-width:600px;background-color:${COLORS.white};">
        <tr><td class="pad" style="padding:28px 40px 24px 40px;border-bottom:1px solid ${COLORS.lineSoft};">${logoHtml(ctx)}</td></tr>
        <tr><td class="pad" style="padding:40px 40px 36px 40px;">
          ${input.heroHtml ?? ''}
          ${eyebrow}
          ${title}
          ${intro}
          ${input.bodyHtml ?? ''}
          ${actions}
          ${footnoteBlock}
        </td></tr>
        ${footerHtml(ctx)}
      </table>
    </td></tr>
  </table>
</body>
</html>
`;
}

/** Phần chân thư cho bản chữ thuần. */
export function renderTextFooter(ctx: MailContext): string {
  const lines = ['--', 'MUSE', BRAND_TAGLINE];
  if (ctx.supportEmail) lines.push(`Email: ${ctx.supportEmail}`);
  if (ctx.supportPhone) lines.push(`Hotline: ${ctx.supportPhone}`);
  if (ctx.address) lines.push(`Địa chỉ: ${ctx.address}`);
  lines.push(`© ${ctx.year} MUSE`, FOOTER_REASON);
  return lines.join('\n');
}

/** Ghép bản chữ thuần: các khối cách nhau một dòng trống, kèm chân thư. */
export function composeText(blocks: Array<string | undefined | false>, ctx: MailContext): string {
  return `${blocks.filter((block): block is string => Boolean(block)).join('\n\n')}\n\n${renderTextFooter(ctx)}\n`;
}
