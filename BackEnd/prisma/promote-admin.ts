/**
 * promote-admin.ts
 * 
 * Script one-shot pour promouvoir un utilisateur au rang d'ADMIN.
 * 
 * Usage: npx tsx prisma/promote-admin.ts
 */

import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('👑 Démarrage de la promotion ADMIN...\n');

    // L'email cible (adaptez si nécessaire)
    const targetEmailPrefix = 'hors.paul';

    try {
        // 1. Trouver l'utilisateur
        console.log(`🔍 Recherche de l'utilisateur commençant par "${targetEmailPrefix}"...`);
        const user = await prisma.user.findFirst({
            where: {
                email: {
                    startsWith: targetEmailPrefix,
                    mode: 'insensitive', // Casse indifférente
                },
            },
        });

        if (!user) {
            console.error(`❌ Aucun utilisateur trouvé avec l'email commençant par "${targetEmailPrefix}".`);
            process.exit(1);
        }

        console.log(`✅ Utilisateur trouvé : ${user.name} (${user.email}) - Rôle actuel : ${user.role}`);

        // 2. Mettre à jour le rôle
        if (user.role === Role.ADMIN) {
            console.log('ℹ️  Cet utilisateur est DÉJÀ Admin. Aucune action nécessaire.');
        } else {
            console.log('⬆️  Promotion en cours...');
            const updatedUser = await prisma.user.update({
                where: { id: user.id },
                data: { role: Role.ADMIN },
            });
            console.log(`🎉 SUCCÈS ! ${updatedUser.email} est maintenant ${updatedUser.role}.`);
        }

        console.log('\n💡 Les limites de crédits et quotas sont désormais désactivées pour ce compte.');

    } catch (error) {
        console.error('\n❌ ERREUR lors de la promotion:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
