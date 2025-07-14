// In packages/server/src/auth.routes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const router = Router();

// 1. /request-otp Endpoint (MODIFIED FOR VALIDATION)
router.post('/request-otp', async (req, res) => {
    const { email, name: username } = req.body; // Using 'name' from frontend as 'username'
    if (!email || !username) {
        return res.status(400).json({ error: 'Email and username are required.' });
    }

    try {
        // Check if a user with this email already exists
        const existingUserByEmail = await prisma.user.findUnique({ where: { email } });

        if (existingUserByEmail) {
            // If the user exists, they are just logging in. No need to check username.
            // Just generate and save a new OTP for them.
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
            await prisma.user.update({
                where: { email },
                data: { otp, otpExpiresAt },
            });
            return res.status(200).json({ 
                message: 'OTP created successfully.', 
                otp,
                name: username,
                email 
            });
        }

        // --- THIS IS THE NEW VALIDATION LOGIC FOR NEW USERS ---
        // If no user with that email exists, this is a new sign-up.
        // Check if the desired username is already taken.
        const existingUserByUsername = await prisma.user.findUnique({ where: { username } });

        if (existingUserByUsername) {
            // The username is taken. Return a conflict error.
            return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
        }

        // If username is available, proceed to create the new user.
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await prisma.user.create({
            data: {
                email,
                username,
                otp,
                otpExpiresAt,
                // Construct the unique DiceBear avatar URL
                profilePicUrl: `https://api.dicebear.com/8.x/initials/svg?seed=${username}`,
            },
        });

        // Return the OTP to the client to be sent via EmailJS
        res.status(200).json({ 
            message: 'OTP created successfully.', 
            otp,
            name: username,
            email 
        });

    } catch (error) {
        console.error('Error in /request-otp:', error);
        res.status(500).json({ error: 'Failed to process OTP request.' });
    }
});

// 2. /verify-otp Endpoint
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.otp || !user.otpExpiresAt) {
            return res.status(400).json({ error: 'Invalid request. Please request an OTP first.' });
        }

        if (user.otp !== otp) {
            return res.status(400).json({ error: 'Invalid OTP.' });
        }

        if (new Date() > user.otpExpiresAt) {
            return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
        }

        // OTP is correct, clear it from the database
        await prisma.user.update({
            where: { email },
            data: { otp: null, otpExpiresAt: null },
        });
        
        // Generate a JWT token for the session
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET!,
            { expiresIn: '7d' } // Token valid for 7 days
        );
        
        res.status(200).json({ 
            message: 'Authentication successful!',
            token,
            user: { id: user.id, email: user.email, username: user.username }
        });

    } catch (error) {
        console.error('Error in /verify-otp:', error);
        res.status(500).json({ error: 'Server error during verification.' });
    }
});

export default router;
