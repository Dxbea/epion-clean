// BackEnd/src/lib/viewer.ts
import crypto from 'crypto';
import type { Request } from 'express';

export function getClientIp(req: Request) {
  const xff = (req.headers['x-forwarded-for'] || '') as string;
  const ip = xff.split(',')[0]?.trim() || req.socket.remoteAddress || '';
  return ip;
}

export function getViewerHash(req: Request) {
  const ip = getClientIp(req);
  const ua = String(req.headers['user-agent'] || '');
  // hash(ip + ua) -> non ré-identifiant, suffisant pour dédupliquer
  return crypto.createHash('sha256').update(`${ip}::${ua}`).digest('hex');
}
