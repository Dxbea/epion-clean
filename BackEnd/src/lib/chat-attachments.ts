import type { Express } from 'express';
import { PDFParse } from 'pdf-parse';
import { logger } from './logger.js';

const MAX_PDF_TEXT_CHARS = 12_000;

export type ChatAttachmentKind = 'pdf' | 'image';

export interface ChatAttachmentSummary {
    kind: ChatAttachmentKind;
    name: string;
    size: number;
    type: string;
}

export interface PreparedChatAttachment {
    kind: ChatAttachmentKind;
    summary: ChatAttachmentSummary;
    promptText?: string;
    searchText?: string;
    imageDataUrl?: string;
}

function truncate(text: string, maxChars: number): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxChars) {
        return normalized;
    }

    return `${normalized.slice(0, maxChars)}…`;
}

function toSummary(file: Express.Multer.File, kind: ChatAttachmentKind): ChatAttachmentSummary {
    return {
        kind,
        name: file.originalname,
        size: file.size,
        type: file.mimetype,
    };
}

async function preparePdfAttachment(file: Express.Multer.File): Promise<PreparedChatAttachment> {
  try {
        const parser = new PDFParse({ data: file.buffer });
        const parsed = await parser.getText();
        await parser.destroy();
        const extractedText = truncate(parsed.text || '', MAX_PDF_TEXT_CHARS);

        if (!extractedText) {
            const error = new Error('Le PDF fourni ne contient aucun texte exploitable.') as Error & { status?: number; code?: string };
            error.status = 400;
            error.code = 'EMPTY_PDF_ATTACHMENT';
            throw error;
        }

        return {
            kind: 'pdf',
            summary: toSummary(file, 'pdf'),
            promptText: `Voici le document fourni par l'utilisateur (${file.originalname}) :\n\n${extractedText}`,
            searchText: extractedText.slice(0, 1_500),
        };
    } catch (error: unknown) {
        logger.warn('PDF attachment parsing failed', {
            module: 'ChatAttachments',
            fileName: file.originalname,
            error: error instanceof Error ? error.message : 'Unknown PDF parse error',
        });

        if (error instanceof Error && 'status' in error) {
            throw error;
        }

        const parseError = new Error('Impossible de lire le PDF fourni.') as Error & { status?: number; code?: string };
        parseError.status = 400;
        parseError.code = 'INVALID_PDF_ATTACHMENT';
        throw parseError;
    }
}

function prepareImageAttachment(file: Express.Multer.File): PreparedChatAttachment {
    const base64 = file.buffer.toString('base64');

    return {
        kind: 'image',
        summary: toSummary(file, 'image'),
        promptText: `L'utilisateur a joint l'image "${file.originalname}". Analyse-la en priorité avec précision et reste strictement descriptif.`,
        searchText: `Analyse de l'image ${file.originalname}`,
        imageDataUrl: `data:${file.mimetype};base64,${base64}`,
    };
}

export async function prepareChatAttachment(file?: Express.Multer.File): Promise<PreparedChatAttachment | null> {
    if (!file) {
        return null;
    }

    if (file.mimetype === 'application/pdf') {
        return preparePdfAttachment(file);
    }

    return prepareImageAttachment(file);
}
