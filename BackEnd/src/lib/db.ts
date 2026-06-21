// src/lib/db.ts
import { env } from '../env.js';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // log: ['query', 'info', 'warn', 'error'], // décommente si tu veux voir les requêtes
  });

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
