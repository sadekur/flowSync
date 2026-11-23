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

/**
 * Why `value` can't be used as SMTP_URL, or null if it can. The answer never
 * contains the value itself: SMTP_URL holds a password, and this text ends up
 * in logs.
 */
export function smtpUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "SMTP_URL isn't a URL. Expected smtp://<login>:<password>@<host>:<port>";
  }
  if (url.protocol !== "smtp:" && url.protocol !== "smtps:") {
    return "SMTP_URL must start with smtp:// or smtps://. Expected smtp://<login>:<password>@<host>:<port>";
  }
  if (!url.hostname) return "SMTP_URL has no host";
  if (!url.username || !url.password) return "SMTP_URL has no login or password (an @ inside the login must be written %40)";
  return null;
}

/** Removes SMTP_URL and its password from `text`, in raw and URL-decoded form. */
export function redactSmtpSecrets(text: string, smtpUrl: string | undefined): string {
  if (!smtpUrl) return text;
  const secrets = new Set([smtpUrl]);
  try {
    const { password } = new URL(smtpUrl);
    if (password) {
      secrets.add(password);
      secrets.add(decodeURIComponent(password));
    }
  } catch {
    // Not a URL: the whole value was already added.
  }
  let out = text;
  for (const secret of [...secrets].sort((a, b) => b.length - a.length)) {
    if (secret) out = out.split(secret).join("<redacted>");
  }
  return out;
}

// One SMTP path for every provider: Mailtrap's sandbox in dev, Brevo's relay
// in production. Swapping providers is a SMTP_URL change, not a code change.
let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter === undefined) {
    if (!env.SMTP_URL) {
      transporter = null;
    } else {
      const problem = smtpUrlProblem(env.SMTP_URL);
      // Not cached: a fixed env var takes effect on the next instance anyway.
      if (problem) throw new Error(`Email isn't configured: ${problem}`);
      transporter = nodemailer.createTransport(env.SMTP_URL);
    }
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

  try {
    await smtp.sendMail({ from: env.MAIL_FROM, ...message });
  } catch (err) {
    // Rethrown as a fresh Error whose text is scrubbed of the SMTP
    // credentials: library errors can quote their configuration, and callers
    // log what they catch. (The first production deploy logged a whole
    // malformed SMTP_URL, key included, this way.)
    const detail = err instanceof Error ? err.message : String(err);
    const code = (err as { responseCode?: number; code?: string } | null) ?? {};
    throw new Error(
      `SMTP send failed${code.responseCode ? ` (${code.responseCode})` : ""}${code.code ? ` [${code.code}]` : ""}: ${redactSmtpSecrets(detail, env.SMTP_URL)}`,
    );
  }
}
