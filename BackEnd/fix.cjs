const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$executeRawUnsafe("DELETE FROM _prisma_migrations WHERE migration_name = '20260509202700_sync_drift'")
  .then(() => { console.log('deleted'); prisma.$disconnect(); })
  .catch(e => { console.error(e); prisma.$disconnect(); });
