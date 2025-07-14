// In packages/server/src/encryption.ts
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const secretKey = process.env.AES_SECRET_KEY;

if (!secretKey) {
    throw new Error('AES_SECRET_KEY is not defined in the environment variables.');
}

// Function to encrypt text
export function encrypt(text: string): string {
    return CryptoJS.AES.encrypt(text, secretKey!).toString();
}

// Function to decrypt text
export function decrypt(ciphertext: string): string {
    const bytes = CryptoJS.AES.decrypt(ciphertext, secretKey!);
    return bytes.toString(CryptoJS.enc.Utf8);
}
