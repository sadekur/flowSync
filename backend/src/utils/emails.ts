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

export function verifyEmailEmail(to: string, name: string, url: string, validHours: number): MailMessage {
  const intro = `Hi ${name}, welcome to FlowSync. Please confirm that this is your email address.`;
  const expiry = `The link works once and expires in ${validHours} hours. You can get a new one from the banner in the app.`;
  const footer = "If you didn't create a FlowSync account, ignore this email.";
  return {
    to,
    subject: "Confirm your FlowSync email address",
    text: `${intro}\n\nConfirm it here:\n${url}\n\n${expiry}\n\n${footer}\n`,
    html: layout("Confirm your email address", [intro, expiry], { label: "Confirm my email", url }, footer),
  };
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

// Names are user-chosen. The HTML escapes them, and this keeps a name with
// line breaks from spreading across a subject line.
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function workspaceInviteEmail(
  to: string,
  inviterName: string,
  workspaceName: string,
  url: string,
  validDays: number,
): MailMessage {
  const inviter = oneLine(inviterName);
  const workspace = oneLine(workspaceName);
  const intro = `${inviter} invited you to join the workspace "${workspace}" on FlowSync.`;
  const how = `Open the link to accept. If you don't have an account yet, you can create one there with this email address (${to}).`;
  const expiry = `The link works once and expires in ${validDays} days.`;
  const footer = "If you weren't expecting this, ignore this email. Nothing happens unless you accept.";
  return {
    to,
    subject: `${inviter} invited you to ${workspace} on FlowSync`,
    text: `${intro}\n\n${how}\n${url}\n\n${expiry}\n\n${footer}\n`,
    html: layout(`Join ${workspace}`, [intro, how, expiry], { label: "Accept the invite", url }, footer),
  };
}

export function addedToWorkspaceEmail(
  to: string,
  name: string,
  inviterName: string,
  workspaceName: string,
  url: string,
): MailMessage {
  const inviter = oneLine(inviterName);
  const workspace = oneLine(workspaceName);
  const intro = `Hi ${oneLine(name)}, ${inviter} added you to the workspace "${workspace}" on FlowSync.`;
  const next = "It's on your dashboard now, with its projects, tasks and chat.";
  const footer = "If you don't know this person, the workspace owner can remove you, or you can ignore it.";
  return {
    to,
    subject: `${inviter} added you to ${workspace} on FlowSync`,
    text: `${intro}\n\n${next}\n${url}\n\n${footer}\n`,
    html: layout(`You've joined ${workspace}`, [intro, next], { label: "Open FlowSync", url }, footer),
  };
}
