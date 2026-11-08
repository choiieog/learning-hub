import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import configuration from '../../config/configuration';

interface EmailMessage {
  to: string;
  fullName: string;
  subject: string;
  intro: string;
  link: string;
  expiry: string;
}

/**
 * Sends account emails. Business code only calls `sendVerificationEmail` /
 * `sendPasswordResetEmail`, so switching driver never touches the auth module.
 *
 * Drivers (see docs/DECISIONS.md section 2):
 *  - console: prints the link to the backend log (dev default);
 *  - smtp: real delivery via nodemailer, configured with SMTP_* variables.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly config = configuration();
  private transporter?: Transporter;

  constructor() {
    // Fail fast: MAIL_DRIVER=smtp without a host would otherwise break every registration silently.
    if (this.config.mail.driver === 'smtp' && !this.config.mail.smtp.host) {
      throw new Error(
        'MAIL_DRIVER=smtp requires SMTP_HOST (plus SMTP_PORT/SMTP_USER/SMTP_PASS); see .env.example.',
      );
    }
  }

  async sendVerificationEmail(params: {
    to: string;
    fullName: string;
    token: string;
  }): Promise<void> {
    await this.deliver({
      to: params.to,
      fullName: params.fullName,
      subject: 'Xác thực email Learning Hub',
      intro: 'Cảm ơn bạn đã đăng ký Learning Hub. Nhấn vào nút dưới đây để xác thực email:',
      link: `${this.config.appUrl}/auth/verify-email?token=${params.token}`,
      expiry:
        'Liên kết có hiệu lực trong 24 giờ. Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.',
    });
  }

  async sendPasswordResetEmail(params: {
    to: string;
    fullName: string;
    token: string;
  }): Promise<void> {
    await this.deliver({
      to: params.to,
      fullName: params.fullName,
      subject: 'Đặt lại mật khẩu Learning Hub',
      intro:
        'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản Learning Hub của bạn. Nhấn vào nút dưới đây để chọn mật khẩu mới:',
      link: `${this.config.appUrl}/auth/reset-password?token=${params.token}`,
      expiry:
        'Liên kết có hiệu lực trong 1 giờ và chỉ dùng được một lần. Nếu không phải bạn yêu cầu, hãy bỏ qua email — mật khẩu hiện tại vẫn giữ nguyên.',
    });
  }

  /** One transporter per process: nodemailer pools SMTP connections. */
  private getTransporter(): Transporter {
    if (!this.transporter) {
      const { host, port, user, pass, secure } = this.config.mail.smtp;

      this.transporter = createTransport({
        host,
        port,
        secure,
        // Empty SMTP_USER = server không cần đăng nhập (SMTP nội bộ, MailHog…).
        auth: user ? { user, pass } : undefined,
      });
    }

    return this.transporter;
  }

  private async deliver(message: EmailMessage): Promise<void> {
    if (this.config.mail.driver !== 'smtp') {
      this.logger.log(`${message.subject} for ${message.to} (${message.fullName})`);
      this.logger.log(`Link: ${message.link}`);
      return;
    }

    const escapedName = escapeHtml(message.fullName);

    try {
      const info = await this.getTransporter().sendMail({
        from: this.config.mail.from,
        to: message.to,
        subject: message.subject,
        text: [
          `Xin chào ${message.fullName},`,
          '',
          message.intro,
          message.link,
          '',
          message.expiry,
        ].join('\n'),
        html: [
          `<p>Xin chào <strong>${escapedName}</strong>,</p>`,
          `<p>${message.intro}</p>`,
          `<p><a href="${message.link}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#4f46e5;color:#fff;text-decoration:none">Mở liên kết</a></p>`,
          `<p>Hoặc mở liên kết: <a href="${message.link}">${message.link}</a></p>`,
          `<p>${message.expiry}</p>`,
        ].join(''),
      });

      this.logger.log(`${message.subject} sent to ${message.to} (${info.messageId})`);
    } catch (error) {
      // Không ném lỗi: dữ liệu đã lưu, người dùng vẫn yêu cầu lại được (xác thực / quên mật khẩu).
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send "${message.subject}" to ${message.to}: ${reason}`);
    }
  }
}

/** Full name comes from user input: never interpolate it into HTML unescaped. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
