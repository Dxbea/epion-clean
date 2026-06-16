import type { RequestHandler } from 'express';
import { toNodeHandler } from 'better-auth/node';

import { auth } from './better-auth.js';

const betterAuthHandler = toNodeHandler(auth);

const legacyAuthRoutes = new Set([
  'POST /api/auth/verify-invite',
  'GET /api/auth/beta-status',
]);

function isLegacyAuthRoute(method: string, path: string): boolean {
  const key = `${method.toUpperCase()} ${path}`;
  if (legacyAuthRoutes.has(key)) return true;

  return false;
}

export const betterAuthExpressHandler: RequestHandler = (req, res, next) => {
  if (isLegacyAuthRoute(req.method, req.path)) {
    return next();
  }

  void betterAuthHandler(req, res);
};
