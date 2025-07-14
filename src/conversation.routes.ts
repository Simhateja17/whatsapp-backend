// In packages/server/src/conversation.routes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { decrypt } from './encryption';

const prisma = new PrismaClient();
const router = Router();

// NEW ENDPOINT: GET /api/conversations/:id
// This fetches the conversation details including its members.
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const conversation = await prisma.conversation.findUnique({
            where: { id },
            include: {
                members: { // Include the user data of all members
                    select: {
                        id: true,
                        username: true,
                        email: true,
                    }
                }
            }
        });

        if (!conversation) {
            return res.status(404).json({ error: 'Conversation not found.' });
        }

        res.json(conversation);
    } catch (error) {
        console.error("Failed to fetch conversation details:", error);
        res.status(500).json({ error: 'Could not fetch conversation details.' });
    }
});

// GET /api/conversations/:id/messages
// For now, we'll imagine a single conversation with a hardcoded ID.
router.get('/:id/messages', async (req, res) => {
    const { id } = req.params;
    try {
        const messages = await prisma.message.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' },
            include: { author: true }, // Include author details
        });

        // Decrypt message content before sending to client
        const decryptedMessages = messages.map(msg => ({
            ...msg,
            content: decrypt(msg.content),
        }));

        res.status(200).json(decryptedMessages);
    } catch (error) {
        console.error("Failed to fetch messages:", error);
        res.status(500).json({ error: 'Could not fetch messages.' });
    }
});

// GET /api/conversations/user/:userId
// Fetches all conversations for a specific user.
router.get('/user/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const conversations = await prisma.conversation.findMany({
            where: { members: { some: { id: userId } } },
            include: {
                members: { // Include data about who is in the chat
                    select: { id: true, username: true, profilePicUrl: true },
                },
                messages: { // Include the last message to show a preview
                    orderBy: { createdAt: 'desc' },
                    take: 1, // Only take the most recent one
                },
            },
            orderBy: {
                updatedAt: 'desc' // Show the most recently active chats first
            }
        });

        // Decrypt the last message for each conversation
        const decryptedConversations = conversations.map(convo => {
            if (convo.messages[0]) {
                convo.messages[0].content = decrypt(convo.messages[0].content);
            }
            return convo;
        });

        res.json(decryptedConversations);
    } catch (error) {
        console.error("Failed to fetch user conversations:", error);
        res.status(500).json({ error: 'Could not fetch conversations.' });
    }
});

// POST /api/conversations/initiate
router.post('/initiate', async (req, res) => {
    const { userId1, userId2 } = req.body;

    if (!userId1 || !userId2) {
        return res.status(400).json({ error: 'Two user IDs are required.' });
    }

    try {
        // --- THIS IS THE REFINED QUERY ---
        // It now finds a conversation where:
        // 1. Both users are members.
        // 2. The total number of members is exactly 2.
        const conversation = await prisma.conversation.findFirst({
            where: {
                AND: [
                    { members: { some: { id: userId1 } } },
                    { members: { some: { id: userId2 } } },
                ],
            },
            include: {
                _count: {
                    select: { members: true }
                }
            }
        });

        // Check if conversation exists and has exactly 2 members
        if (conversation && conversation._count.members === 2) {
            return res.status(200).json(conversation);
        }
        
        // If no such conversation exists, create a new one
        const newConversation = await prisma.conversation.create({
            data: {
                members: {
                    connect: [{ id: userId1 }, { id: userId2 }],
                },
            },
        });
        
        res.status(200).json(newConversation);
    } catch (error) {
        console.error("Failed to initiate conversation:", error);
        res.status(500).json({ error: 'Could not initiate conversation.' });
    }
});

export default router;
