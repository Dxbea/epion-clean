import type { RequestHandler } from 'express';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './better-auth.js';

const betterAuthHandler = toNodeHandler(auth);

const legacyAuthRoutes = new Set([
  'POST /api/auth/verify-invite',
  'POST /api/auth/signup',
  'GET /api/auth/beta-status',
  'POST /api/auth/login',
  'POST /api/auth/request-verify',
  'POST /api/auth/logout',
  'GET /api/auth/me',
  'GET /api/auth/sessions',
  'DELETE /api/auth/sessions',
  'DELETE /api/auth/sessions/others',
  'POST /api/auth/email/verification-link',
  'POST /api/auth/verify-email',
  'POST /api/auth/change-email-request',
  'POST /api/auth/confirm-email-change',
]);

function isLegacyAuthRoute(method: string, path: string): boolean {
  const key = `${method.toUpperCase()} ${path}`;
  if (legacyAuthRoutes.has(key)) return true;

  if (
    method.toUpperCase() === 'DELETE' &&
    /^\/api\/auth\/sessions\/[^/]+$/.test(path)
  ) {
    return true;
  }

  return false;
}

export const betterAuthExpressHandler: RequestHandler = (req, res, next) => {
  if (isLegacyAuthRoute(req.method, req.path)) {
    return next();
  }

  void betterAuthHandler(req, res);
};
