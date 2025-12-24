import cron from 'node-cron';
import { prisma } from '../lib/db';

export const initializeCron = () => {
    // Schedule task to run at midnight every day
    cron.schedule('0 0 * * *', async () => {
        console.log('Running daily quota reset...');
        try {
            const { count } = await prisma.user.updateMany({
                data: {
                    dailyQueryCount: 0,
                },
            });
            console.log(`Daily quota reset completed. Updated ${count} users.`);
        } catch (error) {
            console.error('Error resetting daily quotas:', error);
        }
    });
    console.log('Daily cron job initialized (0 0 * * *)');
};
