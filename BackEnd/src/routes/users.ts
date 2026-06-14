import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { getCurrentUserId } from '../lib/currentUser.js';
import * as userController from '../controllers/userController.js';

export const router = Router();

router.get('/:id/followers', userController.getUserFollowers);
router.get('/:id/following', userController.getUserFollowing);

/**
 * GET /api/users/:idOrUsername
 * Fetches public profile data.
 * Supports fetching by ID (cuid) or Username.
 */
router.get('/:idOrUsername', async (req, res, next) => {
    try {
        const { idOrUsername } = req.params;
        let currentUserId: string | null = null;
        try {
            currentUserId = await getCurrentUserId(req, res);
        } catch {
            // ignore
        }

        // Determine if logic is by ID or Username
        const isCuid = idOrUsername.startsWith('c') && idOrUsername.length > 20; // Rough CUID check logic or Regex
        // Better: Try to find by ID first, if not found or invalid format, try username.
        // Actually, username is unique, ID is unique.

        const where: any = {};
        // Simple heuristic: if it looks like a CUID (alphanumeric, ~25 chars), try ID.
        // But usernames can match that.
        // Safer: Query both OR? No, `id` and `username` fields.
        // Let's assume unique constraint on username handles collisions.
        // Let's try finding by ID if it matches CUID regex, else Username.
        // Prisma CUID regex: ^c[a-z0-9]{24}$ approximately.

        // Combined OR query is safest if we don't strictly separate.
        // But let's prioritize:
        // Input: "paul" -> Username
        // Input: "cl..." -> ID or Username?
        // Let's query by OR.

        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    { id: idOrUsername },
                    { username: idOrUsername }
                ]
            },
            select: {
                id: true,
                username: true,
                name: true,
                avatarUrl: true,
                bannerUrl: true,
                bio: true,
                createdAt: true,
                followersCount: true,
                followingCount: true,
                role: true,
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Determine "isFollowing" for the current viewer
        let isFollowing = false;
        if (currentUserId && currentUserId !== user.id) {
            const follow = await prisma.follow.findUnique({
                where: {
                    followerId_followingId: {
                        followerId: currentUserId,
                        followingId: user.id
                    }
                }
            });
            isFollowing = !!follow;
        }

        return res.json({
            ...user,
            displayName: user.name, // alias for frontend consistency
            isFollowing,
            isMe: currentUserId === user.id
        });

    } catch (e) {
        next(e);
    }
});
