import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import { createTransport } from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Thin nodemailer wrapper. If SMTP_HOST is empty, runs in "log mode" — useful
 * during local dev so we can see what would have been sent without standing up
 * a real mail server. Drops cleanly into a real SMTP in production.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private from = 'DV-WMS <no-reply@digitalvetri.com>';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('SMTP_HOST');
    this.from = this.config.get<string>('SMTP_FROM', this.from);
    if (!host) {
      this.logger.warn('SMTP_HOST not set — EmailService running in log-only mode');
      return;
    }
    this.transporter = createTransport({
      host,
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<number>('SMTP_PORT', 587) === 465,
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER'),
            pass: this.config.get<string>('SMTP_PASS'),
          }
        : undefined,
    });
    this.logger.log(`EmailService initialized for ${host}`);
  }

  /** Best-effort send. Failures are logged but never thrown back to callers. */
  async send(message: EmailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[email/log] To: ${message.to} · Subject: ${message.subject}\n${message.text}`,
      );
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (err) {
      this.logger.error(
        `Email send failed (${message.to} / ${message.subject}): ${(err as Error).message}`,
      );
    }
  }
}
