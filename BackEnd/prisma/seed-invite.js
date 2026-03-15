import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const p = new PrismaClient();

const result = await p.inviteCode.upsert({
  where: { code: 'EPION-BETA' },
  update: {},
  create: { code: 'EPION-BETA', maxUses: 100 },
});

console.log('Created invite code:', result);
await p.$disconnect();
