import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './encryption'; // Import encrypt/decrypt
import authRouter from './auth.routes';
import conversationRouter from './conversation.routes';
import userRouter from './user.routes'; // Import user router

const app = express();
const server = http.createServer(app);
const prisma = new PrismaClient(); // Initialize Prisma

// Middleware
app.use(cors()); // Allow requests from our Next.js client
app.use(express.json());

// Routes
app.use('/api/auth', authRouter); // Use the auth router with a prefix
app.use('/api/conversations', conversationRouter); // Use the conversation router
app.use('/api/users', userRouter); // Use the user router

// Basic route for testing
app.get('/', (req, res) => {
  res.send('Server is running!');
});

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL, // The origin of our client app
    methods: ["GET", "POST"]
  }
});

// A simple in-memory store to map userId to their socketId
const onlineUsers = new Map<string, string>();

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Event for when a user comes online
  socket.on('userConnected', (userId: string) => {
    onlineUsers.set(userId, socket.id);
    // Let all other clients know this user is now online
    socket.broadcast.emit('userStatusChanged', { userId, isOnline: true });
    console.log(`User ${userId} is online.`);
  });

  socket.on('joinConversation', (conversationId) => {
    socket.join(conversationId);
    console.log(`User ${socket.id} joined conversation ${conversationId}`);
  });

  socket.on('sendMessage', async (data) => {
    const { conversationId, authorId, content } = data;

    try {
      // 1. Encrypt the message content
      const encryptedContent = encrypt(content);

      // 2. Save the encrypted message to the database
      const newMessage = await prisma.message.create({
        data: {
          content: encryptedContent,
          authorId: authorId,
          conversationId: conversationId,
        },
        include: { author: true },
      });

      // 3. Decrypt the content to send to clients
      const decryptedMessage = {
          ...newMessage,
          content: decrypt(newMessage.content)
      };

      // 4. Broadcast the new message to all clients in the conversation room
      io.to(conversationId).emit('newMessage', decryptedMessage);

    } catch (error) {
      console.error('Error handling sendMessage:', error);
    }
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.id);
    let userIdToUpdate: string | null = null;
    // Find the user who disconnected
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        userIdToUpdate = userId;
        onlineUsers.delete(userId);
        break;
      }
    }
    // If we found the user, update their status in the DB and notify clients
    if (userIdToUpdate) {
      const lastSeenTime = new Date();
      await prisma.user.update({
        where: { id: userIdToUpdate },
        data: { lastSeen: lastSeenTime },
      });
      // Let all other clients know this user is now offline
      socket.broadcast.emit('userStatusChanged', { 
        userId: userIdToUpdate, 
        isOnline: false,
        lastSeen: lastSeenTime 
      });
      console.log(`User ${userIdToUpdate} is offline.`);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
