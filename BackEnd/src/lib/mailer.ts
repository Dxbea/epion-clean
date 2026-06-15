// BackEnd/src/lib/mailer.ts
import { logger } from './logger.js';
import axios from 'axios';

const {
  SMTP_PASS, // fallback
  BRAVO_API_KEY, // The actual API key the user added
  BREVO_API_KEY,
  MAIL_FROM,
  APP_URL: APP_URL_ENV,
  APP_BASE_URL,
  FRONTEND_ORIGIN,
} = process.env;

const actualApiKey = BREVO_API_KEY || BRAVO_API_KEY || SMTP_PASS;

// URL de base pour les liens dans les emails (vérif, reset, etc.)
export const APP_URL =
  APP_URL_ENV || APP_BASE_URL || FRONTEND_ORIGIN || 'http://localhost:5173';

// ---------- Transport API Brevo ----------
const hasApiKey = Boolean(actualApiKey);

// ---------- Helper générique ----------
type MailOpts = {
  to: string;
  subject: string;
  text?: string;
  html: string;
};

export async function sendMail(opts: MailOpts) {
  // Dev / pas de config Brevo → on log juste
  if (!hasApiKey) {
    logger.warn('DEV EMAIL (NO API KEY CONFIG)', {
      module: 'Mailer',
      to: opts.to,
      subject: opts.subject,
      hasText: Boolean(opts.text),
      hasHtml: Boolean(opts.html),
    });
    return;
  }

  // Parse MAIL_FROM e.g. "epion <epion.contact@gmail.com>"
  let senderEmail = 'no-reply@epion.app';
  let senderName = 'Epion';

  if (MAIL_FROM) {
    const match = MAIL_FROM.match(/(.*)<(.+)>/);
    if (match) {
      senderName = match[1].replace(/"/g, '').trim() || senderName;
      senderEmail = match[2].trim();
    } else {
      senderEmail = MAIL_FROM.trim();
    }
  }

  try {
    const payload: any = {
      sender: { email: senderEmail, name: senderName },
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: opts.html,
    };
    if (opts.text) {
      payload.textContent = opts.text;
    }

    try {
      const response = await axios.post('https://api.brevo.com/v3/smtp/email', payload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'api-key': actualApiKey as string,
        },
      });
      logger.info('Email sent via Brevo API', { module: 'Mailer', messageId: response.data.messageId });
    } catch (apiErr: any) {
      if (apiErr.response) {
        throw new Error(`Brevo API Error (${apiErr.response.status}): ${JSON.stringify(apiErr.response.data)}`);
      }
      throw apiErr;
    }
  } catch (err: any) {
    logger.error('Error while sending email', { module: 'Mailer', error: err.message });
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
