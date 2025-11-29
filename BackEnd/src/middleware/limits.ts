import rateLimit from 'express-rate-limit';

// 5 tentatives / minute par IP sur login
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

// 3 demandes de reset / 10 min par IP
export const forgotLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});
