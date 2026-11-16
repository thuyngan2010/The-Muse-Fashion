import mongoose from 'mongoose';
import sgMail from '@sendgrid/mail';
import { randomUUID } from 'node:crypto';
import { decryptEmailToken } from '../modules/mail/email-token-crypto.util.js';

function buildMessage(template: string, payload: Record<string, unknown>): { subject: string; text: string } {
  const baseUrl = (process.env.PUBLIC_WEB_URL ?? 'http://localhost:4200').replace(/\/$/, '');
  const tokenFromPayload = (p: Record<string, unknown>) =>
    typeof p.token === 'string' ? p.token : decryptEmailToken(String(p.tokenCiphertext ?? ''));
  if (template === 'user.verify_email') {
    const token = tokenFromPayload(payload);
    const url = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
    return { subject: 'Xác minh email tài khoản', text: `Vui lòng truy cập đường dẫn để xác minh email: ${url}\nĐường dẫn chỉ sử dụng một lần và có thời hạn.` };
  }
  if (template === 'user.reset_password') {
    const token = tokenFromPayload(payload);
    const url = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return { subject: 'Khôi phục mật khẩu', text: `Bạn đã yêu cầu đặt lại mật khẩu. Truy cập: ${url}\nNếu không phải bạn, hãy bỏ qua email này.` };
  }
  return { subject: 'Thông báo', text: 'Bạn có thông báo mới từ Fashion Commerce.' };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM_EMAIL;
  if (!uri || !key || !from) throw new Error('MONGODB_URI, SENDGRID_API_KEY, SENDGRID_FROM_EMAIL required');
  await mongoose.connect(uri);
  const events = mongoose.connection.collection('email_events');
  const now = new Date();
  const due = await events.find({
    state: { $in: ['PENDING', 'SENDING'] },
    attempts: { $lt: 5 },
    $or: [{ expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
  }).limit(50).toArray();

  sgMail.setApiKey(key);
  let sent = 0;
  for (const event of due) {
    const leaseId = randomUUID();
    const claimed = await events.findOneAndUpdate(
      { _id: event._id, state: event.state },
      { $set: { state: 'SENDING', leaseId, leaseUntil: new Date(Date.now() + 5 * 60_000) }, $inc: { attempts: 1 } },
      { returnDocument: 'after' },
    );
    if (!claimed) continue;
    try {
      const { subject, text } = buildMessage(String(claimed.template), (claimed.payload ?? {}) as Record<string, unknown>);
      const [response] = await sgMail.send({
        to: String(claimed.to),
        from: { email: from, name: process.env.SENDGRID_FROM_NAME || 'Fashion Commerce' },
        subject,
        text,
        trackingSettings: {
          clickTracking: { enable: false },
          openTracking: { enable: false },
        },
      });
      await events.updateOne({ _id: claimed._id, leaseId }, {
        $set: { state: 'SENT', providerId: response.headers['x-message-id'] as string | undefined },
        $unset: { lastError: 1, leaseUntil: 1, leaseId: 1, nextAttemptAt: 1, 'payload.tokenCiphertext': 1 },
      });
      sent += 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Send failed';
      await events.updateOne({ _id: claimed._id, leaseId }, {
        $set: { state: 'PENDING', lastError: message.slice(0, 500), nextAttemptAt: new Date(Date.now() + 60_000) },
        $inc: { attempts: -1 },
        $unset: { leaseUntil: 1, leaseId: 1 },
      });
    }
  }
  console.log(`Flushed ${sent} email event(s)`);
}

main()
  .catch((error: unknown) => {
    console.error('flush-emails failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
