import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router as authRouter } from '../src/routes/auth';
import { prisma } from '../src/lib/db';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', authRouter); // Auth routes are mounted at /api/auth in server.ts, but here we mount authRouter.
// Wait, looking at server.ts (not visible here but usually), routes often have their prefix built-in or mounted with prefix.
// In auth.ts, path is `/auth/signup`.
// So if server does `app.use('/api', authRouter)`, full path is `/api/auth/signup`.
// Let's mimic that structure.

const TEST_EMAIL = `test_auth_${Date.now()}@example.com`;
const TEST_PASSWORD = 'Password123!';
const TEST_NAME = 'Test User';

describe('Authentication Routes', () => {

    afterAll(async () => {
        // Cleanup test user and related data
        const user = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
        if (user) {
            await prisma.session.deleteMany({ where: { userId: user.id } });
            await prisma.chatSession.deleteMany({ where: { userId: user.id } });
            await prisma.chatFolder.deleteMany({ where: { userId: user.id } });
            await prisma.passwordReset.deleteMany({ where: { userId: user.id } });
            await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
            await prisma.user.delete({ where: { id: user.id } });
        }
        await prisma.$disconnect();
    });

    it('should sign up a new user', async () => {
        const response = await request(app)
            .post('/api/auth/signup')
            .send({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                displayName: TEST_NAME
            });

        expect(response.status).toBe(201);
        expect(response.body.user).toBeDefined();
        expect(response.body.user.email).toBe(TEST_EMAIL);
        // Should set a cookie
        expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should not allow duplicate signup', async () => {
        const response = await request(app)
            .post('/api/auth/signup')
            .send({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                displayName: TEST_NAME
            });

        // 409 Conflict
        expect(response.status).toBe(409);
    });

    it('should login successfully with valid credentials', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: TEST_EMAIL,
                password: TEST_PASSWORD
            });

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(response.body.user.email).toBe(TEST_EMAIL);
        expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should reject login with wrong password', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: TEST_EMAIL,
                password: 'WrongPassword123!'
            });

        expect(response.status).toBe(401);
    });
});
