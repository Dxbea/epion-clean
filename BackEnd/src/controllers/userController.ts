import { type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../lib/db';

/**
 * GET /api/users/:id/followers
 */
export async function getUserFollowers(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                followers: {
                    select: {
                        follower: {
                            select: {
                                id: true,
                                username: true,
                                name: true,
                                avatarUrl: true,
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const followers = user.followers.map(f => ({
            ...f.follower,
            displayName: f.follower.name
        }));

        return res.json(followers);
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/users/:id/following
 */
export async function getUserFollowing(req: Request, res: Response, next: NextFunction) {
    try {
        const { id } = req.params;

        const user = await prisma.user.findUnique({
            where: { id },
            select: {
                following: {
                    select: {
                        following: {
                            select: {
                                id: true,
                                username: true,
                                name: true,
                                avatarUrl: true,
                            }
                        }
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                }
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const following = user.following.map(f => ({
            ...f.following,
            displayName: f.following.name
        }));

        return res.json(following);
    } catch (error) {
        next(error);
    }
}
