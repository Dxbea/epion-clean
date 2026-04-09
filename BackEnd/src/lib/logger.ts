// BackEnd/src/lib/logger.ts
import winston from 'winston';

const isDevelopment = process.env.NODE_ENV !== 'production';

// Format for development: colorized and human-readable
const devFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
    })
);

// Format for production: structured JSON
const prodFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
);

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    format: isDevelopment ? devFormat : prodFormat,
    defaultMeta: { service: 'epion-api' },
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/server.log' }),
    ],
});

// Wrapper methods for convenience
export default logger;
