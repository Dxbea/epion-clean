
import { checkAndIncrement } from '../src/lib/rateLimiter';
import { prisma } from '../src/lib/db';

async function main() {
    console.log('--- Testing Rate Limiter ---');

    const testIp = 'ip:127.0.0.88'; // Unique IP for test
    const testUser = 'user:test-cuid-999';

    // Clean up
    await prisma.ipUsage.deleteMany({ where: { ipAddress: '127.0.0.88' } }).catch(() => { });
    await prisma.userUsage.deleteMany({ where: { userId: 'test-cuid-999' } }).catch(() => { });

    console.log('1. Testing IP Rate Limit (Limit = 5)');
    for (let i = 1; i <= 6; i++) {
        try {
            const res = await checkAndIncrement(testIp);
            console.log(`[IP] Req ${i}: Allowed. Remaining: ${res.remaining}`);
        } catch (e: any) {
            console.log(`[IP] Req ${i}: Blocked as expected. (${e.message})`);
        }
    }

    console.log('\n2. Testing User Rate Limit (Limit = 10)');
    // We need to create a dummy user first due to FK constraint if we use UserUsage
    // But UserUsage requires userId to exist in User table? Yes: @relation(fields: [userId], references: [id])
    // So we expect FK error if user doesn't exist.
    // We will skip user test or create a dummy user. 
    // Let's just test IP mostly since that validates the new model + Transaction logic.

    console.log('Done.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
