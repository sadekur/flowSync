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

// One SMTP path for every provider: Mailtrap's sandbox in dev, Brevo's relay
// in production. Swapping providers is a SMTP_URL change, not a code change.
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter === undefined) {
    transporter = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;
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
    if (isProduction) throw new Error("Email isn't configured: set SMTP_URL");
    logger.info(`[mail] No SMTP configured; printing instead.\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}`);
    return;
  }

  await smtp.sendMail({ from: env.MAIL_FROM, ...message });
}
