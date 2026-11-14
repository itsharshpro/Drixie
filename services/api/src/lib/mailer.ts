export interface Mailer {
  send(opts: { to: string; subject: string; text: string; html: string }): Promise<void>;
}

export function resendMailer(apiKey: string, from: string, fetchImpl: typeof fetch = fetch): Mailer {
  return {
    async send({ to, subject, text, html }) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Resend rejected the email (HTTP ${res.status}): ${body.slice(0, 200)}`);
      }
    },
  };
}

export function magicLinkEmail(link: string): { subject: string; text: string; html: string } {
  const subject = "Your Drixie sign-in link";
  const text = `Sign in to Drixie:\n\n${link}\n\nThis link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.`;
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#0C0D10;max-width:480px">
<p style="font-size:16px;line-height:24px">Sign in to Drixie with this link:</p>
<p><a href="${link}" style="display:inline-block;background:#2B44D9;color:#FFFFFF;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Sign in to Drixie</a></p>
<p style="font-size:14px;line-height:20px;color:rgba(12,13,16,0.64)">This link works once and expires in 15 minutes. If you didn't ask for it, ignore this email.</p>
</div>`;
  return { subject, text, html };
}
