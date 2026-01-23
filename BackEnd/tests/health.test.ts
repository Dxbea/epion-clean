import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router as healthRouter } from '../src/routes/health';
import { prisma } from '../src/lib/db';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars for the test (needed for DB, OpenAI, Perplexity keys)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
app.use('/api/health', healthRouter);

describe('Health Diagnostics Route', () => {

    // Explicit clean up of DB connections
    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('should return 200 and formatted JSON structure', async () => {
        // Increase timeout for this test as it hits real external APIs
        // or mocks them. Ideally we mock, but for "Health Check" verification
        // we often want to know what the real output looks like once.
        // However, for stability, we should check structure primarily.

        const response = await request(app).get('/api/health/diagnostics');

        // Status should be 200 even if degraded (unless catastrophic)
        expect(response.status).toBe(200);

        // Check JSON structure
        expect(response.body).toHaveProperty('status');
        expect(response.body).toHaveProperty('checks');
        expect(response.body).toHaveProperty('system');

        const { checks } = response.body;
        expect(checks).toHaveProperty('database');
        expect(checks).toHaveProperty('vectors');
        expect(checks).toHaveProperty('openai');
        expect(checks).toHaveProperty('perplexity');
    }, 10000); // 10s timeout

    it('should have database status up or down', async () => {
        const response = await request(app).get('/api/health/diagnostics');
        expect(['up', 'down', 'timeout']).toContain(response.body.checks.database.status);
    });

});
