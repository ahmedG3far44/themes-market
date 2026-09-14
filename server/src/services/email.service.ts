import env from "../config/env.ts";

const templates = {
  welcome: { subject: "Welcome to My SaaS", heading: "Welcome aboard", body: "Your account is ready. We are glad you are here." },
  subscription: { subject: "Your subscription was updated", heading: "Subscription update", body: "Your plan details have been updated in your account." },
  promotion: { subject: "A special offer for you", heading: "A better way to grow", body: "Open your account to see the latest offer available to you." },
};

export async function sendEmailTemplate(to: string, type: keyof typeof templates, variables?: { name?: string }) {
  if (!env.RESEND_API_KEY) throw new Error("Email service is not configured");
  const template = templates[type];
  const name = variables?.name ? `, ${variables.name}` : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject: template.subject,
      html: `<main style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717"><h1>${template.heading}${name}</h1><p style="line-height:1.6">${template.body}</p></main>`,
    }),
  });
  const data = await response.json() as { id?: string; message?: string };
  if (!response.ok) throw new Error(data.message ?? "Unable to send email");
  return data;
}
