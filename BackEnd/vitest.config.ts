/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true, // Allows describe, it, expect without imports
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        fileParallelism: false,
        isolate: true, // Maintain isolation between tests
    },
});
