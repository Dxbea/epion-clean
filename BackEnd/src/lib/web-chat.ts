import OpenAI from 'openai';
import { ChatOptions } from '../types/chat';
import { logger } from './logger';
import { investigateArticle } from './live-analysis/fact-investigator';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ACCREDITED_MEDIA_DOMAINS = new Set([
    'afp.com',
    'apnews.com',
    'bbc.com',
    'bloomberg.com',
    'dw.com',
    'elpais.com',
    'elmundo.es',
    'francetvinfo.fr',
    'ft.com',
    'kyodonews.net',
    'lefigaro.fr',
    'lemonde.fr',
    'lesechos.fr',
    'liberation.fr',
    'mediapart.fr',
    'nytimes.com',
    'reuters.com',
    'scmp.com',
    'spiegel.de',
    'thehindu.com',
    'washingtonpost.com',
    'wsj.com',
]);

export type WebPromptMode = 'fast' | 'balanced' | 'precise';
export type WebSearchProfile = 'standard' | 'deep';

export interface WebChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface WebSearchSource {
    title: string;
    url: string;
    domain: string;
    content: string;
    publishedDate?: string;
    score: number;
    favicon?: string;
    provider?: 'web' | 'rag';
    articleSlug?: string;
}

interface SearchWebContextOptions {
    profile?: string;
    chatOptions?: Partial<ChatOptions>;
    maxResults?: number;
}

interface CallWebSearchLLMOptions {
    useSearch?: boolean;
    searchQuery?: string;
    profile?: string;
    promptMode?: WebPromptMode;
    chatOptions?: ChatOptions;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

const BASE_IDENTITY = `# ROLE & IDENTITY

### 1. IDENTITY & SELF-AWARENESS (PRIORITY HIGH)
* **Name:** Epion.
* **Nature:** Tu es un média hybride (Moteur de réponse + Journalisme + Vérification).
* **EXCEPTION DE RECHERCHE :** Si l'utilisateur te demande "Qui es-tu ?", "Quel est ton but ?", ou mentionne "Epion", ne fais pas de recherche web. Réponds directement en utilisant ta définition interne.
* **Ton identité :** "Je suis Epion, une intelligence artificielle conçue pour offrir une information objective, transparente et vérifiée. Contrairement à un chatbot classique, je vérifie systématiquement mes sources et je mets en évidence les incertitudes."

### 2. CORE KNOWLEDGE: THE TRUSTSCORE METHODOLOGY (INTERNAL)
Si l'utilisateur demande comment Epion vérifie l'information, la fiabilité ou les sources, explique notre méthodologie propriétaire TrustScore.

Epion n'utilise pas de listes blanches statiques, mais une analyse dynamique en temps réel basée sur 4 piliers pondérés :

1. **Transparence Structurelle (20%)**
2. **Processus Éditorial (30%)**
3. **Analyse Sémantique IA (30%)**
4. **Réputation & UX (20%)**

Tu scannes les aspects techniques, éditoriaux et sémantiques de chaque source citée pour calculer un score de fiabilité unique (0-100%).

You are Epion, an advanced AI news analyst designed for augmented reading.
Your goal is to provide answers that are helpful, fluent, transparent, and grounded in provided sources when they are relevant.

# CORE DIRECTIVES

1. **SOURCE USAGE**
   * You will be provided with a set of live search results inside \`<context>\`.
   * Use these results when they are relevant to the user's question.
   * If the context is partial, noisy, or missing, stay helpful and answer naturally with clear transparency.
   * If the user is simply chatting, answer normally without sounding like a search engine.
   * If the user provides an image or document, prioritize analysis of that attachment.

2. **CITATION PROTOCOL**
   * Every factual claim must be followed by a citation index in brackets, e.g. \`[1]\`, \`[2]\`.
   * Use the exact index numbers from the context.
   * Do not group all citations only at the end.

3. **NEUTRALITY & TONE**
   * Tone: journalistic, objective, concise, professional.
   * If sources conflict, state the disagreement explicitly.

4. **STRUCTURE**
   * Start with a direct answer.
   * Then provide details and nuance.
   * Use short paragraphs and bullet points when useful.

5. **SAFETY**
   * Do not invent support that is not present in the sources.
   * If you rely partly on general knowledge, mention it naturally.

# OUTPUT LANGUAGE
Answer in the same language as the user question.`;

function defaultChatOptions(): ChatOptions {
    return {
        filterSources: false,
        forceNeutrality: false,
        recentEvents: false,
    };
}

function normalizeDomain(inputUrl: string): string {
    try {
        return new URL(inputUrl).hostname.replace(/^www\./, '');
    } catch {
        return 'unknown';
    }
}

function getDomainKeyFromSource(source: Pick<WebSearchSource, 'url'>): string {
    try {
        return new URL(source.url).hostname.replace(/^www\./, '');
    } catch {
        return 'unknown';
    }
}

function normalizeRootDomain(input: string): string {
    const rawValue = input.trim().toLowerCase();
    const hostname = rawValue.includes('://')
        ? new URL(rawValue).hostname.toLowerCase()
        : rawValue;
    const normalized = hostname.replace(/^www\./, '');
    const parts = normalized.split('.').filter(Boolean);

    if (parts.length <= 2) {
        return normalized;
    }

    const lastTwo = parts.slice(-2).join('.');
    const specialSecondLevelSuffixes = new Set([
        'ac.uk',
        'co.jp',
        'co.uk',
        'com.au',
        'com.br',
        'com.mx',
        'gov.au',
        'gov.uk',
        'gouv.fr',
        'net.au',
        'org.au',
        'org.uk',
    ]);

    if (specialSecondLevelSuffixes.has(lastTwo)) {
        return parts.slice(-3).join('.');
    }

    return lastTwo;
}

function selectSourcesForLlm(
    sources: WebSearchSource[],
    limit: number,
): WebSearchSource[] {
    const sorted = [...sources].sort((a, b) => b.score - a.score);
    const seenDomains = new Set<string>();
    const selected: WebSearchSource[] = [];
    const overflow: WebSearchSource[] = [];

    for (const source of sorted) {
        const domainKey = getDomainKeyFromSource(source);
        if (!seenDomains.has(domainKey)) {
            seenDomains.add(domainKey);
            selected.push(source);
        } else {
            overflow.push(source);
        }
    }

    return [...selected, ...overflow].slice(0, limit);
}

function truncate(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n[... truncated ...]`;
}

export function isConversationalQuery(query: string): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return true;
    }

    const shortGreetings = new Set([
        'salut',
        'hello',
        'hi',
        'hey',
        'bonjour',
        'bonsoir',
        'coucou',
        'yo',
        'ca va',
        'comment ca va',
        'comment vas-tu',
        'merci',
        'thank you',
        'thanks',
    ]);

    if (shortGreetings.has(normalized)) {
        return true;
    }

    return normalized.split(/\s+/).length <= 4 && /^(salut|bonjour|bonsoir|hello|hi|hey|coucou|merci|thanks)\b/.test(normalized);
}

function isInstitutionalOrAccredited(domain: string): boolean {
    const normalizedDomain = normalizeRootDomain(domain);
    return (
        normalizedDomain.endsWith('.gov') ||
        normalizedDomain.endsWith('.gouv.fr') ||
        normalizedDomain.endsWith('.edu') ||
        normalizedDomain.includes('.ac.') ||
        ACCREDITED_MEDIA_DOMAINS.has(normalizedDomain)
    );
}

function isInternalKnowledgeSource(url: string, domain: string): boolean {
    if (domain === 'epion.io' || domain.endsWith('.epion.io')) {
        return true;
    }

    return url.startsWith('/article/');
}

export function normalizeWebSearchProfile(profile?: string): WebSearchProfile {
    if (profile === 'deep' || profile === 'sonar-pro' || profile === 'sonar-deep-research' || profile === 'sonar-reasoning-pro') {
        return 'deep';
    }

    return 'standard';
}

export function resolveWebLlmModel(profile?: string): string {
    return normalizeWebSearchProfile(profile) === 'deep' ? 'gpt-4o' : 'gpt-4o-mini';
}

export function sanitizeWebChatMessages(messages: WebChatMessage[]): WebChatMessage[] {
    if (messages.length === 0) return [];

    const sanitized: WebChatMessage[] = [];

    for (const message of messages) {
        const content = message.content?.trim();
        if (!content) continue;

        const lastMessage = sanitized[sanitized.length - 1];
        if (lastMessage && lastMessage.role === message.role) {
            lastMessage.content += `\n\n[Suite du message] ${content}`;
        } else {
            sanitized.push({ role: message.role, content });
        }
    }

    return sanitized;
}

export function generateWebSystemPrompt(mode: WebPromptMode, options: ChatOptions): string {
    let instruction = BASE_IDENTITY;

    if (options.filterSources) {
        instruction += `

### STRICT SOURCE FILTERING (ACTIVATED)
* Utilise en priorité les sources gouvernementales, académiques, et la presse d'agence reconnue.
* Si aucune source institutionnelle ou accréditée n'est trouvée, indique-le clairement.`;
    }

    if (options.forceNeutrality) {
        instruction += `

### EXTREME NEUTRALITY MODE (ACTIVATED)
* Ton style doit être clinique et sans adjectif émotionnel.
* Présente les faits bruts et les désaccords factuels.`;
    }

    if (options.recentEvents) {
        instruction += `

### LIVE NEWS FOCUS (<48H) (ACTIVATED)
* Priorise les développements des 48 dernières heures.
* Mentionne la date des informations quand elle est disponible.`;
    }

    switch (mode) {
        case 'fast':
            return `${instruction}

# FORMAT "SMART BRIEF" (FLASH MODE)
Réponse brève, directe, moins de 100 mots si possible, avec citations intégrées.`;
        case 'precise':
            return `${instruction}

# FORMAT "RAPPORT D'EXPERTISE" (DEEP MODE)
Structure avec sous-titres, nuances, points de vue contradictoires, et citations intégrées.`;
        case 'balanced':
        default:
            return `${instruction}

# FORMAT "ARTICLE STRUCTURÉ" (STANDARD)
Commence par une synthèse claire, puis détaille avec lisibilité et précision.`;
    }
}

export async function searchWebContext(
    query: string,
    options: SearchWebContextOptions = {},
): Promise<WebSearchSource[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return [];
    }

    if (isConversationalQuery(trimmedQuery)) {
        logger.debug('Skipping web context search for conversational query', {
            module: 'WebChat',
            query: trimmedQuery,
        });
        return [];
    }

    const profile = normalizeWebSearchProfile(options.profile);
    const chatOptions = { ...defaultChatOptions(), ...options.chatOptions };
    logger.info('Starting web context investigation', {
        module: 'WebChat',
        query: trimmedQuery,
        profile,
    });
    const investigation = await investigateArticle(trimmedQuery, trimmedQuery);
    const maxResults = options.maxResults ?? (profile === 'deep' ? 8 : 5);

    const seenUrls = new Set<string>();
    const deduped = (investigation.sources || [])
        .map((source) => {
            const domain = source.url ? normalizeDomain(source.url) : normalizeDomain(source.domain || '');
            const rawContent = source.content.trim();
            const provider = source.provider || (isInternalKnowledgeSource(source.url, domain) ? 'rag' : 'web');

            return {
                title: source.title || domain,
                url: source.url,
                domain,
                content: truncate(rawContent, 2200),
                publishedDate: source.publishedDate || undefined,
                score: source.score || 0,
                provider,
                articleSlug: source.articleSlug,
            } satisfies WebSearchSource;
        })
        .filter((result) => {
            if (!result.url || seenUrls.has(result.url)) return false;
            seenUrls.add(result.url);
            if (result.content.length < 50) return false;
            return true;
        });
    const strictEligible = deduped.filter((result) =>
        !chatOptions.filterSources
        || isInstitutionalOrAccredited(result.domain)
        || result.provider === 'rag'
        || isInternalKnowledgeSource(result.url, result.domain),
    );
    const strictSelected = selectSourcesForLlm(strictEligible, maxResults);

    let mapped = strictSelected;

    if (mapped.length < maxResults) {
        const selectedUrls = new Set(mapped.map((source) => source.url));
        const backfillPool = deduped.filter((source) => !selectedUrls.has(source.url));
        mapped = selectSourcesForLlm(
            [...mapped, ...backfillPool],
            maxResults,
        );
    }

    logger.info(`Web context search completed with ${mapped.length} sources`, {
        module: 'WebChat',
        profile,
        query: trimmedQuery,
        provider: 'fact-investigator+serper',
        strictEligibleCount: strictEligible.length,
        dedupedCount: deduped.length,
        domains: mapped.map((source) => source.domain),
    });

    return mapped;
}

export function formatWebSourcesForPrompt(
    sources: WebSearchSource[],
    maxCharsPerSource = 1400,
): string {
    if (sources.length === 0) {
        return '[No relevant external or internal source was attached to this answer.]';
    }

    return sources
        .map((source, index) => {
            const date = source.publishedDate ? `Published: ${source.publishedDate}\n` : '';
            return `[${index + 1}] Title: ${source.title}
Domain: ${source.domain}
URL: ${source.url}
${date}Content: ${truncate(source.content, maxCharsPerSource)}`;
        })
        .join('\n\n');
}

export function mapWebSourcesToUiSources(sources: WebSearchSource[]) {
    return sources.map((source, index) => {
        const score = Math.max(30, Math.min(100, Math.round(source.score * 100)));
        const isInternal = source.provider === 'rag' || isInternalKnowledgeSource(source.url, source.domain);
        const type = source.domain.endsWith('.gov') || source.domain.endsWith('.gouv.fr')
            ? 'GOVERNMENT'
            : source.domain.endsWith('.edu') || source.domain.includes('.ac.')
                ? 'ACADEMIC'
                : isInternal
                    ? 'DATABASE'
                    : 'MEDIA';

        return {
            id: index + 1,
            name: source.title || source.domain,
            domain: source.domain,
            url: source.url,
            logo: source.favicon || `https://www.google.com/s2/favicons?domain=${source.domain}&sz=64`,
            type,
            score,
            confidence: score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW',
            description: truncate(source.content, 220),
            justification: isInternal
                ? `Source interne Epion retrouvée via le RAG sur ${source.domain}.`
                : `Source web trouvée via Serper sur ${source.domain}.`,
            metadata: {
                publishedDate: source.publishedDate,
                searchScore: source.score,
                provider: isInternal ? 'rag' : 'serper',
                articleSlug: source.articleSlug,
            },
        };
    });
}

export async function callWebSearchLLM(
    messages: WebChatMessage[],
    options: CallWebSearchLLMOptions = {},
): Promise<{ answer: string; sources: WebSearchSource[]; choices: Array<{ message: { content: string } }> }> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY missing');
    }

    const shouldSearch = options.useSearch !== false;
    const profile = normalizeWebSearchProfile(options.profile);
    const cleanMessages = sanitizeWebChatMessages(messages);
    const systemMessages = cleanMessages.filter((message) => message.role === 'system');
    const conversationMessages = cleanMessages.filter((message) => message.role !== 'system');

    let sources: WebSearchSource[] = [];

    if (shouldSearch) {
        const searchQuery = options.searchQuery || [...conversationMessages].reverse().find((message) => message.role === 'user')?.content;
        if (!searchQuery) {
            throw new Error('No search query available for web search');
        }

        sources = await searchWebContext(searchQuery, {
            profile,
            chatOptions: options.chatOptions,
        });
    }

    const systemParts: string[] = [];

    if (options.systemPrompt) {
        systemParts.push(options.systemPrompt);
    } else if (shouldSearch) {
        systemParts.push(generateWebSystemPrompt(options.promptMode || 'balanced', options.chatOptions || defaultChatOptions()));
    }

    if (systemMessages.length > 0) {
        systemParts.push(systemMessages.map((message) => message.content).join('\n\n'));
    }

    if (shouldSearch) {
        systemParts.push(`Use the following live web search context for all current factual claims.

<context>
${formatWebSourcesForPrompt(sources)}
</context>`);
    }

    const llmMessages = systemParts.length > 0
        ? [{ role: 'system' as const, content: systemParts.join('\n\n') }, ...conversationMessages]
        : conversationMessages;

    const completion = await openai.chat.completions.create({
        model: resolveWebLlmModel(profile),
        messages: llmMessages,
        temperature: options.temperature ?? (shouldSearch ? 0.2 : 0.4),
        max_tokens: options.maxTokens ?? (profile === 'deep' ? 2200 : 1400),
    });

    const answer = completion.choices[0]?.message?.content?.trim() || '';

    return {
        answer,
        sources,
        choices: [{ message: { content: answer } }],
    };
}
