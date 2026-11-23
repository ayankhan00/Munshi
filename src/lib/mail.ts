import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let transporter: Transporter | null = null;

// Env names intentionally match the deployed STMP_* keys.
export function mailConfigured(): boolean {
  return Boolean(process.env.STMP_USERNAME && process.env.STMP_PASSWORD);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.STMP_USERNAME,
        pass: process.env.STMP_PASSWORD,
      },
    });
  }
  return transporter;
}

export function resetLink(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = resetLink(token);
  await getTransporter().sendMail({
    from: `Munshi <${process.env.STMP_USERNAME}>`,
    to,
    subject: "Reset your Munshi password",
    text: `Use this link within 30 minutes to reset your password:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
  });
}
