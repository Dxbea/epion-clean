// BackEnd/src/middleware/error.ts
import { env } from '../env.js';
import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const status = err?.status || 500
  const code = err?.code || 'INTERNAL_ERROR'
  const message = err?.message || 'Unexpected error'
  if (env.NODE_ENV !== 'production') {
    console.error('💥', err)
  }
  res.status(status).json({ error: { code, message } })
}
