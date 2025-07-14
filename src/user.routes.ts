// In packages/server/src/user.routes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// GET /api/users/search?query=<search_term>&currentUserId=<id>
router.get('/search', async (req, res) => {
    const { query, currentUserId } = req.query;

    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Search query is required.' });
    }
    if (!currentUserId || typeof currentUserId !== 'string') {
        return res.status(400).json({ error: 'Current user ID is required.' });
    }

    try {
        const users = await prisma.user.findMany({
            where: {
                username: {
                    contains: query,
                    mode: 'insensitive', // Case-insensitive search
                },
                id: {
                    not: currentUserId, // Exclude the current user from results
                },
            },
            select: { // Only return public-safe information
                id: true,
                username: true,
                email: true,
                profilePicUrl: true,
            },
            take: 10, // Limit the number of results
        });
        res.json(users);
    } catch (error) {
        console.error("User search failed:", error);
        res.status(500).json({ error: 'Failed to search for users.' });
    }
});

export default router;
