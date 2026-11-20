import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/lib/env";

/**
 * Message providers behind one small interface. Email (SMTP) is built; SMS and WhatsApp plug in here later
 * (e.g. an Indian DLT-registered SMS gateway, WhatsApp Cloud API) without touching the callers.
 */
export type OutgoingMessage = { to: string; subject: string | null; body: string };
export type Channel = "EMAIL" | "SMS" | "WHATSAPP";

export interface MessageProvider {
  readonly channel: Channel;
  /** False when the provider has no credentials. */
  readonly configured: boolean;
  send(message: OutgoingMessage): Promise<void>;
}

export class NotConfiguredError extends Error {}

let transporter: Transporter | null = null;

class SmtpEmailProvider implements MessageProvider {
  readonly channel = "EMAIL" as const;
  get configured() {
    return !!env.SMTP_HOST;
  }
  async send(m: OutgoingMessage) {
    if (!env.SMTP_HOST) {
      if (env.NODE_ENV !== "production") {
        console.info(`[email:dev] to=${m.to} subject=${m.subject ?? ""}\n${m.body}`);
        return;
      }
      throw new NotConfiguredError("Email isn't set up (SMTP_HOST is empty).");
    }
    transporter ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === "true",
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" } : undefined,
    });
    await transporter.sendMail({
      from: env.MAIL_FROM ?? env.SMTP_USER,
      to: m.to,
      subject: m.subject ?? "",
      text: m.body,
    });
  }
}

class NotBuiltProvider implements MessageProvider {
  readonly configured = false;
  constructor(readonly channel: Channel) {}
  async send(): Promise<void> {
    throw new NotConfiguredError(`${this.channel} messages aren't set up yet.`);
  }
}

const providers: Record<Channel, MessageProvider> = {
  EMAIL: new SmtpEmailProvider(),
  SMS: new NotBuiltProvider("SMS"),
  WHATSAPP: new NotBuiltProvider("WHATSAPP"),
};

export function providerFor(channel: Channel): MessageProvider {
  return providers[channel];
}
