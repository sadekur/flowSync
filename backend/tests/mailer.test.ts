import { describe, expect, it } from "vitest";
import { redactSmtpSecrets, smtpUrlProblem } from "../src/utils/mailer";

// Made-up credentials in the shapes the real providers use.
const KEY = "xsmtpsib-0123456789abcdef0123456789abcdef-AbCdEfGhIjKlMnOp";
const GOOD = `smtp://abc123%40smtp-brevo.com:${KEY}@smtp-relay.brevo.com:587`;

describe("smtpUrlProblem", () => {
  it("accepts smtp:// and smtps:// URLs with a login and password", () => {
    expect(smtpUrlProblem(GOOD)).toBeNull();
    expect(smtpUrlProblem("smtps://user:pass@smtp.example.com:465")).toBeNull();
  });

  it("rejects the key pasted in front of the URL, without echoing either", () => {
    const pastedWrong = `${KEY}:${GOOD}`;
    const problem = smtpUrlProblem(pastedWrong);
    expect(problem).toMatch(/must start with smtp:\/\//);
    expect(problem).not.toContain(KEY);
    expect(problem).not.toContain("brevo");
  });

  it("rejects text that isn't a URL, and a URL without credentials", () => {
    expect(smtpUrlProblem("hunter2")).toMatch(/isn't a URL/);
    expect(smtpUrlProblem("smtp://smtp-relay.brevo.com:587")).toMatch(/no login or password/);
    expect(smtpUrlProblem("https://user:pass@example.com")).toMatch(/must start with smtp/);
  });
});

describe("redactSmtpSecrets", () => {
  it("removes the whole URL and the password, raw or decoded, from error text", () => {
    const leaky = `TypeError: Cannot create property 'mailer' on string '${KEY}:${GOOD}'`;
    const clean = redactSmtpSecrets(leaky, `${KEY}:${GOOD}`);
    expect(clean).not.toContain(KEY);
    expect(clean).toContain("<redacted>");

    const encoded = "smtp://u:p%40ss%2Fword@host:587";
    expect(redactSmtpSecrets("auth failed for p@ss/word and p%40ss%2Fword", encoded)).toBe(
      "auth failed for <redacted> and <redacted>",
    );
  });

  it("leaves text alone when there's no SMTP_URL", () => {
    expect(redactSmtpSecrets("plain error", undefined)).toBe("plain error");
  });
});
