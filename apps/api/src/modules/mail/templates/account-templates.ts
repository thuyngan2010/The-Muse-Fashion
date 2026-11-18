import { escapeHtml, clip, formatVnDateTime } from './escape.js';
import { infoRows, notice, steps } from './components.js';
import { composeText, renderEmail, type MailContext } from './layout.js';

export interface EmailMessage { subject: string; text: string; html: string }

export interface AccountEmailInput {
  payload: Record<string, unknown>;
  /** Địa chỉ người nhận (dùng khi payload không có email). */
  to?: string;
  ctx: MailContext;
}

function textOf(value: unknown, max: number): string {
  return clip(value, max);
}

function tokenLink(ctx: MailContext, path: string, payload: Record<string, unknown>): string {
  const token = typeof payload.token === 'string' ? payload.token : '';
  return `${ctx.baseUrl}${path}?token=${encodeURIComponent(token)}`;
}

export function buildVerifyEmail({ payload, ctx }: AccountEmailInput): EmailMessage {
  const name = textOf(payload.fullName, 80);
  const url = tokenLink(ctx, '/verify-email', payload);
  const intro = `${name ? `Xin chào ${name},` : 'Xin chào,'} chỉ còn một bước nữa để bắt đầu mua sắm, thử đồ trực tuyến và theo dõi đơn hàng tại MUSE.`;
  const footnote = [
    'Liên kết có hiệu lực 60 phút và chỉ dùng được một lần.',
    'Nếu bạn không đăng ký tài khoản MUSE, hãy bỏ qua email này.',
  ];
  const subject = 'Xác thực email để kích hoạt tài khoản MUSE';
  return {
    subject,
    html: renderEmail({
      preheader: 'Xác thực email để kích hoạt tài khoản MUSE của bạn.',
      eyebrow: 'XÁC THỰC TÀI KHOẢN',
      title: 'Chào mừng bạn đến với MUSE',
      intro,
      cta: { label: 'XÁC THỰC EMAIL', href: url },
      footnote,
    }, ctx),
    text: composeText([
      'CHÀO MỪNG BẠN ĐẾN VỚI MUSE', intro,
      `Xác thực email: ${url}`,
      footnote.join('\n'),
    ], ctx),
  };
}

const PASSWORD_RULE = 'Mật khẩu mới cần 12–128 ký tự, có chữ hoa, chữ thường và số.';

export function buildResetPasswordEmail({ payload, ctx }: AccountEmailInput): EmailMessage {
  const url = tokenLink(ctx, '/reset-password', payload);
  const intro = 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản MUSE của bạn. Nhấn nút bên dưới để chọn mật khẩu mới.';
  const footnote = [
    'Liên kết có hiệu lực 60 phút và chỉ dùng được một lần.',
    'Nếu không phải bạn yêu cầu, mật khẩu hiện tại vẫn an toàn và bạn có thể bỏ qua email này.',
  ];
  return {
    subject: 'Đặt lại mật khẩu tài khoản MUSE',
    html: renderEmail({
      preheader: 'Đặt lại mật khẩu tài khoản MUSE trong 60 phút.',
      eyebrow: 'BẢO MẬT TÀI KHOẢN',
      title: 'Đặt lại mật khẩu',
      intro,
      bodyHtml: notice([PASSWORD_RULE], 'gray', 'Yêu cầu mật khẩu'),
      cta: { label: 'ĐẶT MẬT KHẨU MỚI', href: url },
      footnote,
    }, ctx),
    text: composeText([
      'ĐẶT LẠI MẬT KHẨU', intro, PASSWORD_RULE,
      `Đặt mật khẩu mới: ${url}`,
      footnote.join('\n'),
    ], ctx),
  };
}

export function buildStaffInviteEmail({ payload, to, ctx }: AccountEmailInput): EmailMessage {
  const email = textOf(payload.email, 254) || textOf(to, 254);
  const url = tokenLink(ctx, '/reset-password', payload);
  const loginUrl = `${ctx.baseUrl}/admin/login`;
  const intro = email
    ? `Tài khoản nhân viên đã được tạo cho ${email}. Hãy đặt mật khẩu để bắt đầu.`
    : 'Tài khoản nhân viên của bạn đã được tạo. Hãy đặt mật khẩu để bắt đầu.';
  const step1 = 'Nhấn nút bên dưới để đặt mật khẩu và kích hoạt tài khoản.';
  const step2 = 'Sau khi đặt mật khẩu, đăng nhập tại';
  const footnote = ['Lời mời có hiệu lực 24 giờ. Nếu liên kết hết hạn, hãy liên hệ quản trị viên để được gửi lại lời mời.'];
  return {
    subject: 'Lời mời tham gia hệ thống quản trị MUSE',
    html: renderEmail({
      preheader: 'Đặt mật khẩu để kích hoạt tài khoản nhân viên MUSE.',
      eyebrow: 'MUSE ADMIN PORTAL',
      title: 'Bạn được mời tham gia đội ngũ MUSE',
      intro,
      bodyHtml: steps([
        escapeHtml(step1),
        `${escapeHtml(step2)} <a href="${escapeHtml(loginUrl)}" target="_blank" style="color:#8f485d;word-break:break-all;">${escapeHtml(loginUrl)}</a>`,
      ]),
      cta: { label: 'ĐẶT MẬT KHẨU & KÍCH HOẠT', href: url },
      footnote,
    }, ctx),
    text: composeText([
      'BẠN ĐƯỢC MỜI THAM GIA ĐỘI NGŨ MUSE', intro,
      `1. ${step1}\n2. ${step2} ${loginUrl}`,
      `Đặt mật khẩu & kích hoạt: ${url}`,
      footnote.join('\n'),
    ], ctx),
  };
}

export function buildPasswordChangedEmail({ payload, ctx }: AccountEmailInput): EmailMessage {
  const when = formatVnDateTime(payload.changedAt);
  const intro = 'Mật khẩu tài khoản MUSE của bạn vừa được thay đổi.';
  const warning = 'Nếu không phải bạn thực hiện, hãy đặt lại mật khẩu ngay và liên hệ hỗ trợ.';
  const resetUrl = `${ctx.baseUrl}/forgot-password`;
  const supportHref = ctx.supportEmail ? `mailto:${ctx.supportEmail}` : undefined;
  return {
    subject: 'Mật khẩu tài khoản MUSE vừa được thay đổi',
    html: renderEmail({
      preheader: 'Mật khẩu tài khoản MUSE của bạn vừa được thay đổi.',
      eyebrow: 'CẢNH BÁO BẢO MẬT',
      title: 'Mật khẩu của bạn đã được thay đổi',
      intro,
      bodyHtml: infoRows([{ label: 'Thời điểm', value: when }]) + notice([warning], 'pink', 'Không phải bạn?'),
      cta: { label: 'ĐẶT LẠI MẬT KHẨU', href: resetUrl },
      secondaryCta: supportHref ? { label: 'LIÊN HỆ HỖ TRỢ', href: supportHref } : undefined,
    }, ctx),
    text: composeText([
      'MẬT KHẨU CỦA BẠN ĐÃ ĐƯỢC THAY ĐỔI', intro,
      `Thời điểm: ${when}`,
      warning,
      `Đặt lại mật khẩu: ${resetUrl}`,
      ctx.supportEmail && `Liên hệ hỗ trợ: ${ctx.supportEmail}`,
    ], ctx),
  };
}

export function buildDefaultEmail({ ctx }: AccountEmailInput): EmailMessage {
  const url = `${ctx.baseUrl}/`;
  const intro = 'Bạn có thông báo mới từ MUSE. Mở MUSE để xem chi tiết.';
  return {
    subject: 'Thông báo từ MUSE',
    html: renderEmail({
      preheader: 'Bạn có thông báo mới từ MUSE.',
      eyebrow: 'THÔNG BÁO',
      title: 'Bạn có thông báo mới',
      intro,
      cta: { label: 'MỞ MUSE', href: url },
    }, ctx),
    text: composeText(['BẠN CÓ THÔNG BÁO MỚI', intro, `Mở MUSE: ${url}`], ctx),
  };
}

export const ACCOUNT_TEMPLATES: Record<string, (input: AccountEmailInput) => EmailMessage> = {
  'user.verify_email': buildVerifyEmail,
  'user.reset_password': buildResetPasswordEmail,
  'staff.invite': buildStaffInviteEmail,
  'user.password_changed': buildPasswordChangedEmail,
};
