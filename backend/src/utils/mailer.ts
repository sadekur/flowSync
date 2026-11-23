import nodemailer, { type Transporter } from "nodemailer";
import { env, isProduction } from "../config/env";
import { logger } from "./logger";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Emails "sent" under NODE_ENV=test land here instead of going anywhere, so
 * backend tests can read the links out of them. Emptied by resetData().
 */
export const testOutbox: MailMessage[] = [];

// One SMTP path for every provider: Mailtrap's sandbox (dev) through SMTP_URL,
// Resend (production) through its SMTP relay with the API key as password.
function smtpUrl(): string | undefined {
  if (env.SMTP_URL) return env.SMTP_URL;
  if (env.RESEND_API_KEY) {
    return `smtps://resend:${encodeURIComponent(env.RESEND_API_KEY)}@smtp.resend.com:465`;
  }
  return undefined;
}

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter === undefined) {
    const url = smtpUrl();
    transporter = url ? nodemailer.createTransport(url) : null;
  }
  return transporter;
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (env.NODE_ENV === "test") {
    testOutbox.push(message);
    return;
  }

  const smtp = getTransporter();
  if (!smtp) {
    // Never print an email in production: it carries a live token, and logs
    // are readable by more people than the inbox is.
    if (isProduction) throw new Error("Email isn't configured: set SMTP_URL or RESEND_API_KEY");
    logger.info(`[mail] No SMTP configured; printing instead.\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return;
  }

  await smtp.sendMail({ from: env.MAIL_FROM, ...message });
}
