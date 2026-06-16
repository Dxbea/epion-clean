import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import { prisma } from './db.js';
import { env } from '../env.js';
import { logger } from './logger.js';
import { APP_URL, sendMail } from './mailer.js';
import { prepareBetterAuthSignupUser } from './better-auth-signup.js';
import {
  getBetterAuthBaseUrl,
  getBetterAuthSecret,
  getBetterAuthTrustedOrigins,
} from './better-auth-config.js';

async function sendBetterAuthEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  purpose: 'email-verification' | 'password-reset';
}) {
  try {
    await sendMail(opts);
  } catch (error) {
    logger.error('Better Auth email send failed', {
      module: 'BetterAuth',
      purpose: opts.purpose,
      to: opts.to,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export const auth = betterAuth({
  appName: 'Epion',
  baseURL: getBetterAuthBaseUrl(),
  basePath: '/api/auth',
  secret: getBetterAuthSecret(),
  trustedOrigins: getBetterAuthTrustedOrigins(),
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendBetterAuthEmail({
        to: user.email,
        subject: 'Reset your password for Epion',
        text: `Click this link to reset your password:\n\n${url}\n\nThis link is valid for a limited time.`,
        html: `<p>Click this link to reset your password:</p>
               <p><a href="${url}">${url}</a></p>
               <p>This link is valid for a limited time.</p>`,
        purpose: 'password-reset',
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, token }) => {
      const url = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
      await sendBetterAuthEmail({
        to: user.email,
        subject: 'Verify your email for Epion',
        text: `Click this link to verify your email:\n\n${url}`,
        html: `<p>Click this link to verify your email:</p>
               <p><a href="${url}">${url}</a></p>
               <p>This link is valid for a limited time.</p>`,
        purpose: 'email-verification',
      });
    },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === 'production',
  },
  user: {
    modelName: 'User',
    fields: {
      image: 'avatarUrl',
    },
    additionalFields: {
      username: {
        type: 'string',
        required: false,
        returned: true,
      },
      inviteCodeId: {
        type: 'string',
        required: false,
        input: true,
        returned: false,
      },
    },
  },
  session: {
    modelName: 'BetterAuthSession',
    cookieCache: {
      enabled: false,
    },
  },
  account: {
    modelName: 'BetterAuthAccount',
  },
  verification: {
    modelName: 'BetterAuthVerification',
  },
  databaseHooks: {
    user: {
      create: {
        before: prepareBetterAuthSignupUser,
      },
    },
  },
});
