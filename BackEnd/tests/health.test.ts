import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router as healthRouter } from '../src/routes/health';
import { prisma } from '../src/lib/db';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use(cookieParser());
app.use('/api/health', healthRouter);

describe('Health Routes', () => {
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should expose the lightweight health endpoint', async () => {
        const response = await request(app).get('/api/health');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'ok' });
    });

    it('should protect diagnostics from unauthenticated callers', async () => {
        const response = await request(app).get('/api/health/diagnostics');

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('UNAUTHENTICATED');
    });
});
