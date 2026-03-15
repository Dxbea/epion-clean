INSERT INTO "InviteCode" (id, code, "maxUses", "usedCount", "createdAt") VALUES ('test1', 'EPION-BETA', 100, 0, NOW()) ON CONFLICT (code) DO NOTHING;
