import type { MailMessage } from "./mailer";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Plain, inline-styled HTML: email clients ignore <style> blocks and most CSS.
function layout(heading: string, paragraphs: string[], action: { label: string; url: string }, footer: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("");
  const url = escapeHtml(action.url);
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">
<h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(heading)}</h1>
${body}
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:bold">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;color:#52525b">Or paste this link into your browser:<br><span style="word-break:break-all">${url}</span></p>
<p style="margin:0;font-size:13px;color:#71717a">${escapeHtml(footer)}</p>
</div></body></html>`;
}

export function passwordResetEmail(to: string, name: string, url: string, validMinutes: number): MailMessage {
  const intro = `Hi ${name}, someone (hopefully you) asked to reset your FlowSync password.`;
  const expiry = `The link works once and expires in ${validMinutes} minutes.`;
  const footer = "If you didn't ask for this, ignore this email. Your password stays the same.";
  return {
    to,
    subject: "Reset your FlowSync password",
    text: `${intro}\n\nChoose a new password here:\n${url}\n\n${expiry}\n\n${footer}\n`,
    html: layout("Reset your password", [intro, expiry], { label: "Choose a new password", url }, footer),
  };
}
