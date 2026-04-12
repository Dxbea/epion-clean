import type { RequestHandler } from 'express';
import multer from 'multer';

export const CHAT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: CHAT_ATTACHMENT_MAX_BYTES,
        files: 1,
    },
    fileFilter: (_req, file, callback) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            const error = new Error('Unsupported attachment type.') as Error & { status?: number; code?: string };
            error.status = 400;
            error.code = 'UNSUPPORTED_ATTACHMENT_TYPE';
            callback(error);
            return;
        }

        callback(null, true);
    },
});

export const chatAttachmentUpload: RequestHandler = (req, res, next) => {
    upload.fields([
        { name: 'file', maxCount: 1 },
        { name: 'attachment', maxCount: 1 },
    ])(req, res, (error: unknown) => {
        if (!error) {
            const files = (req as typeof req & {
                files?: Record<string, Express.Multer.File[]>;
                file?: Express.Multer.File;
            }).files;

            const resolvedFile = files?.file?.[0] || files?.attachment?.[0];
            if (resolvedFile) {
                (req as typeof req & { file?: Express.Multer.File }).file = resolvedFile;
            }

            next();
            return;
        }

        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                res.status(413).json({
                    error: 'ATTACHMENT_TOO_LARGE',
                    message: 'Le fichier joint dépasse la limite de 5 Mo.',
                });
                return;
            }

            res.status(400).json({
                error: 'ATTACHMENT_UPLOAD_ERROR',
                message: error.message,
            });
            return;
        }

        next(error);
    });
};
