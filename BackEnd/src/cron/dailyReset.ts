import cron, { type ScheduledTask } from 'node-cron';
import { prisma } from '../lib/db.js';
import logger from '../lib/logger.js';

export function initializeCron(): ScheduledTask {
    const task = cron.schedule('0 0 * * *', async () => {
        logger.info('Running daily quota reset', { module: 'DailyReset' });
        try {
            const { count } = await prisma.user.updateMany({
                data: {
                    dailyQueryCount: 0,
                },
            });
            logger.info('Daily quota reset completed', { module: 'DailyReset', count });
        } catch (error: any) {
            logger.error('Error resetting daily quotas', {
                module: 'DailyReset',
                error: error?.message,
            });
        }
    });

    logger.info('Daily cron job initialized', { module: 'DailyReset', schedule: '0 0 * * *' });
    return task;
}