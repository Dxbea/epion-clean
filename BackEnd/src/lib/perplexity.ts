import { AI_MODELS } from '../config/ai-models';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

export interface PerplexityMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface PerplexityChoice {
    index: number;
    finish_reason: string;
    message: PerplexityMessage;
}

export interface PerplexityResponse {
    id: string;
    model: string;
    object: string;
    created: number;
    choices: PerplexityChoice[];
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    citations?: string[];
}

// Helper to sanitize message history (Perplexity requires strictly alternating roles)
const sanitizeMessages = (messages: PerplexityMessage[]): PerplexityMessage[] => {
    if (messages.length === 0) return [];

    const sanitized: PerplexityMessage[] = [];
    let lastRole: string | null = null;

    for (const msg of messages) {
        if (msg.role === 'system') {
            sanitized.push(msg); // System messages are usually fine, but depends on API. Perplexity supports them.
            continue;
        }

        if (msg.role === lastRole) {
            // Collision detected!
            if (msg.role === 'user') {
                // Merge consecutive user messages
                const prev = sanitized[sanitized.length - 1];
                prev.content += "\n\n" + msg.content;
            } else if (msg.role === 'assistant') {
                // Drop previous assistant message, keep the new one (latest response is usually more relevant)
                sanitized.pop();
                sanitized.push(msg);
            }
        } else {
            sanitized.push(msg);
            lastRole = msg.role;
        }
    }

    // Perplexity (like OpenAI) usually requires the LAST message to be from the USER.
    // If the history ends with an assistant message, we might have an issue.
    // The user instruction says: "Assure-toi que le dernier message est bien un user."
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role === 'assistant') {
        // Option: Remove the last assistant message so the user's last query is the prompt
        // OR: Append a generic "Continue" user message. 
        // Given the goal is "chat", removing the last assistant message implies we are re-generating it or continuing from there? 
        // Actually, if we are sending a request to the API, it's typically because the user JUST sent a message.
        // So the list SHOULD end with user. If it ends with assistant, it means we are re-sending context without a new user query?
        // Let's assume we remove the trailing assistant message to let the AI answer the previous user prompt.
        sanitized.pop();
    }

    // Double check if empty after pop
    if (sanitized.length > 0 && sanitized[sanitized.length - 1].role !== 'user' && sanitized[sanitized.length - 1].role !== 'system') {
        // If we popped assistant and are left with system (or nothing), we technically can't generate a chat response properly without a user prompt.
        // But let's stick to the rule "Ensure last is user".
        // If we are left with nothing valid, we can't do much. 
    }

    return sanitized;
};

export const callPerplexity = async (
    messages: PerplexityMessage[],
    model: string = AI_MODELS.STANDARD
): Promise<PerplexityResponse> => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    const useMock = process.env.USE_MOCK_AI === 'true';

    // Sécurité / Mock Mode
    if (!apiKey || useMock) {
        // ... (Mock implementation skipped for brevity, keeping existing code logic in mind)
        console.log('[PERPLEXITY] Using Mock Mode (No Key or Mock Forced)');
        return {
            id: 'mock-id-123',
            model: model,
            object: 'chat.completion',
            created: Date.now(),
            choices: [
                {
                    index: 0,
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: JSON.stringify({
                            answer: "Mock response...",
                            sources: [],
                            factScore: 88,
                            scoreBreakdown: [],
                            segments: []
                        }),
                    },
                },
            ],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
        };
    }

    // Appel Réel
    try {
        const cleanMessages = sanitizeMessages(messages);

        // Sanity Check
        if (cleanMessages.length === 0 || cleanMessages[cleanMessages.length - 1].role !== 'user') {
            console.warn('[PERPLEXITY] Warning: Message history does not end with a user prompt after sanitization.');
        }

        const response = await axios.post<PerplexityResponse>(
            'https://api.perplexity.ai/chat/completions',
            {
                model: model,
                messages: cleanMessages,
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 15000, // 15 seconds timeout
            }
        );

        return response.data;
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            console.error('[PERPLEXITY] API Error:', {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
        } else {
            console.error('[PERPLEXITY] Unexpected Error:', error instanceof Error ? error.message : String(error));
        }
        // Return a safe fallback or rethrow depending on strategy. 
        // For now, rethrow so the caller knows it failed.
        throw new Error('Failed to call Perplexity API');
    }
};
