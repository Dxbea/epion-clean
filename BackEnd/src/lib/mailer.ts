// BackEnd/src/lib/mailer.ts
import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  APP_URL: APP_URL_ENV,
  APP_BASE_URL,
  FRONTEND_ORIGIN,
} = process.env;

// URL de base pour les liens dans les emails (vérif, reset, etc.)
export const APP_URL =
  APP_URL_ENV || APP_BASE_URL || FRONTEND_ORIGIN || 'http://localhost:5173';

// ---------- Transport SMTP (Brevo ou autre) ----------
const hasSmtp =
  Boolean(SMTP_HOST) &&
  Boolean(SMTP_PORT) &&
  Boolean(SMTP_USER) &&
  Boolean(SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

if (hasSmtp) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // 465 = SSL, 587 = STARTTLS
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
} else {
  console.log('[mailer] No SMTP config, using console logger only');
}

// ---------- Helper générique ----------
type MailOpts = {
  to: string;
  subject: string;
  text?: string;
  html: string;
};

export async function sendMail(opts: MailOpts) {
  // Dev / pas de SMTP configuré → on log juste
  if (!transporter) {
    console.log('==== DEV EMAIL (NO TRANSPORT) ====');
    console.log('To:', opts.to);
    console.log('Subject:', opts.subject);
    console.log('Text:', opts.text);
    console.log('HTML:', opts.html);
    console.log('==================================');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM || 'Epion <no-reply@epion.app>',
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    console.log('[mailer] Email sent via SMTP:', JSON.stringify(info, null, 2));
  } catch (err) {
    console.error('[mailer] Error while sending email:', err);
    throw err; // important: on remonte l’erreur → le front verra un 500
  }
}


// ---------- Email de vérification ----------
export async function sendEmailVerificationEmail(
  to: string,
  verifyUrl: string,
) {
  const subject = 'Verify your email for Epion';

  const text = [
    'Hi,',
    '',
    'Please verify your email address to activate your Epion account.',
    '',
    `Verification link: ${verifyUrl}`,
    '',
    'If you did not create an account, you can ignore this email.',
  ].join('\n');

  const html = `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; color: #111827;">
      <p>Hi,</p>
      <p>Please verify your email address to activate your Epion account.</p>
      <p style="margin: 24px 0;">
        <a href="${verifyUrl}" style="
          display: inline-block;
          padding: 10px 18px;
          border-radius: 999px;
          background: #111827;
          color: #ffffff;
          text-decoration: none;
          font-weight: 500;
        ">
          Verify my email
        </a>
      </p>
      <p>If the button doesn’t work, copy and paste this link in your browser:</p>
      <p style="word-break: break-all;">
        <a href="${verifyUrl}">${verifyUrl}</a>
      </p>
      <p>If you did not create an Epion account, you can safely ignore this email.</p>
    </div>
  `;

  await sendMail({ to, subject, text, html });
}
