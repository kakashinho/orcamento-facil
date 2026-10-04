import nodemailer from "nodemailer";
import type { Logger } from "../logging/logger.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Envio real por SMTP (produção). */
export class SmtpMailer implements Mailer {
  private readonly transport: ReturnType<typeof nodemailer.createTransport>;

  constructor(
    options: { host: string; port: number; secure: boolean; user?: string; password?: string },
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      ...(options.user ? { auth: { user: options.user, pass: options.password ?? "" } } : {}),
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

/**
 * Sem SMTP configurado: registra o e-mail no log. Em desenvolvimento inclui o conteúdo
 * (para o link de recuperação ser utilizável); em produção, apenas o fato do envio.
 */
export class LogMailer implements Mailer {
  constructor(
    private readonly logger: Logger,
    private readonly revealContent: boolean,
  ) {}

  async send(message: MailMessage): Promise<void> {
    if (this.revealContent) {
      this.logger.info({ mail: { to: message.to, subject: message.subject, text: message.text } }, "E-mail (modo log)");
    } else {
      this.logger.error(
        { mail: { subject: message.subject } },
        "SMTP não configurado: e-mail não enviado. Defina SMTP_HOST para habilitar o envio.",
      );
    }
  }
}

/** Caixa de saída em memória para testes. */
export class MemoryMailer implements Mailer {
  readonly outbox: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.outbox.push(message);
  }

  lastTo(email: string): MailMessage | undefined {
    return [...this.outbox].reverse().find((message) => message.to === email);
  }
}
