import axios, { type AxiosResponse, type RawAxiosResponseHeaders } from 'axios';
import { JSDOM } from 'jsdom';
import { redis } from './redis.js';
import logger from './logger.js';
const log = logger.child({ module: 'Extractor' });

export interface ExtractedDocument {
  title: string;
  content: string;
  metaDescription?: string;
  author?: string;
  siteName?: string;
}

interface FetchHtmlResult {
  html: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string | string[] | undefined>;
}

interface CircuitBreakerState {
  failures: number;
  openUntil: number | null;
}

const REQUEST_TIMEOUT_MS = 10_000;
const PARSE_TIMEOUT_MS = 10_000;
const MAX_HTML_PARSE_BYTES = 2_000_000;
const EXTRACTION_CACHE_TTL_SECONDS = 3600;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60 * 60 * 1000;
const CIRCUIT_BREAKER_KEY_PREFIX = 'news:extractor:circuit';
const CIRCUIT_BREAKER_STATUS_CODES = new Set([401, 402, 403, 429]);
const inMemoryCircuitBreaker = new Map<string, CircuitBreakerState>();

export interface ExtractLogContext {
  jobId?: string;
}

export class DomainCircuitOpenError extends Error {
  readonly hostname: string;
  readonly openUntil: number;

  constructor(hostname: string, openUntil: number) {
    super(`Circuit breaker open for ${hostname} until ${new Date(openUntil).toISOString()}`);
    this.name = 'DomainCircuitOpenError';
    this.hostname = hostname;
    this.openUntil = openUntil;
  }
}

export class ExtractorTimeoutError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = 'ExtractorTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

export class ExtractorHttpStatusError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(status: number, url: string) {
    super(`Extraction failed with status ${status}`);
    this.name = 'ExtractorHttpStatusError';
    this.status = status;
    this.url = url;
  }
}

export class ExtractorParseSafetyError extends Error {
  readonly htmlBytes: number;
  readonly maxHtmlBytes: number;

  constructor(htmlBytes: number, maxHtmlBytes: number) {
    super(`HTML payload too large for safe parsing (${htmlBytes} bytes > ${maxHtmlBytes} bytes)`);
    this.name = 'ExtractorParseSafetyError';
    this.htmlBytes = htmlBytes;
    this.maxHtmlBytes = maxHtmlBytes;
  }
}

function buildExtractorMeta(
  url: string,
  context: ExtractLogContext = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    url,
    jobId: context.jobId ?? null,
    ...extra,
  };
}

export function isOperationalExtractionError(error: unknown): boolean {
  if (
    error instanceof DomainCircuitOpenError ||
    error instanceof ExtractorTimeoutError ||
    error instanceof ExtractorHttpStatusError ||
    error instanceof ExtractorParseSafetyError
  ) {
    return true;
  }

  return error instanceof Error && (
    error.message === 'Extraction returned empty HTML' ||
    error.message === 'Extracted content is too short'
  );
}

function normalizeHostname(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}

function getExtractionCacheKey(url: string): string {
  return `ext:${encodeURIComponent(url)}`;
}

function getCircuitBreakerKey(hostname: string): string {
  return `${CIRCUIT_BREAKER_KEY_PREFIX}:${hostname}`;
}

async function readExtractionCache(
  url: string,
  context: ExtractLogContext = {},
): Promise<ExtractedDocument | null> {
  try {
    const raw = await redis.get(getExtractionCacheKey(url));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ExtractedDocument>;
    if (typeof parsed.title !== 'string' || typeof parsed.content !== 'string') {
      return null;
    }

    return {
      title: parsed.title,
      content: parsed.content,
      metaDescription: typeof parsed.metaDescription === 'string' ? parsed.metaDescription : undefined,
      author: typeof parsed.author === 'string' ? parsed.author : undefined,
      siteName: typeof parsed.siteName === 'string' ? parsed.siteName : undefined,
    };
  } catch (error: any) {
    log.warn('Extraction cache read failed, continuing without cache', {
      ...buildExtractorMeta(url, context),
      error: error.message,
    });
    return null;
  }
}

async function writeExtractionCache(
  url: string,
  document: ExtractedDocument,
  context: ExtractLogContext = {},
): Promise<void> {
  try {
    await redis.set(
      getExtractionCacheKey(url),
      JSON.stringify(document),
      'EX',
      EXTRACTION_CACHE_TTL_SECONDS,
    );
  } catch (error: any) {
    log.warn('Extraction cache write failed, continuing without cache persistence', {
      ...buildExtractorMeta(url, context),
      error: error.message,
    });
  }
}

function getMemoryCircuitState(hostname: string): CircuitBreakerState {
  return inMemoryCircuitBreaker.get(hostname) ?? { failures: 0, openUntil: null };
}

function setMemoryCircuitState(hostname: string, state: CircuitBreakerState): void {
  inMemoryCircuitBreaker.set(hostname, state);
}

async function readCircuitState(
  hostname: string,
  url?: string,
  context: ExtractLogContext = {},
): Promise<CircuitBreakerState> {
  const memoryState = getMemoryCircuitState(hostname);

  try {
    const raw = await redis.get(getCircuitBreakerKey(hostname));
    if (!raw) return memoryState;

    const parsed = JSON.parse(raw) as Partial<CircuitBreakerState>;
    return {
      failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
      openUntil: typeof parsed.openUntil === 'number' ? parsed.openUntil : null,
    };
  } catch (error: any) {
    log.warn('Circuit breaker Redis read failed, falling back to memory', {
      ...buildExtractorMeta(url ?? `https://${hostname}`, context, { hostname }),
      hostname,
      error: error.message,
    });
    return memoryState;
  }
}

async function writeCircuitState(
  hostname: string,
  state: CircuitBreakerState,
  url?: string,
  context: ExtractLogContext = {},
): Promise<void> {
  setMemoryCircuitState(hostname, state);

  try {
    await redis.set(
      getCircuitBreakerKey(hostname),
      JSON.stringify(state),
      'PX',
      CIRCUIT_BREAKER_COOLDOWN_MS,
    );
  } catch (error: any) {
    log.warn('Circuit breaker Redis write failed, keeping in-memory fallback', {
      ...buildExtractorMeta(url ?? `https://${hostname}`, context, { hostname }),
      hostname,
      error: error.message,
    });
  }
}

async function assertDomainAvailable(
  hostname: string,
  url: string,
  context: ExtractLogContext = {},
): Promise<void> {
  const state = await readCircuitState(hostname, url, context);
  if (state.openUntil && state.openUntil > Date.now()) {
    throw new DomainCircuitOpenError(hostname, state.openUntil);
  }
}

async function markDomainFailure(
  hostname: string,
  url: string,
  context: ExtractLogContext = {},
): Promise<void> {
  const state = await readCircuitState(hostname, url, context);
  const failures = state.failures + 1;

  if (failures >= CIRCUIT_BREAKER_THRESHOLD) {
    await writeCircuitState(hostname, {
      failures,
      openUntil: Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS,
    }, url, context);
    return;
  }

  await writeCircuitState(hostname, {
    failures,
    openUntil: null,
  }, url, context);
}

async function resetDomainFailures(
  hostname: string,
  url: string,
  context: ExtractLogContext = {},
): Promise<void> {
  await writeCircuitState(hostname, {
    failures: 0,
    openUntil: null,
  }, url, context);
}

function withTimeout<T>(
  operation: string,
  timeoutMs: number,
  task: () => Promise<T> | T,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new ExtractorTimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([
    Promise.resolve().then(task),
    timeoutPromise,
  ]).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  });
}

function isAxiosTimeoutError(error: unknown): boolean {
  return axios.isAxiosError(error) && (
    error.code === 'ECONNABORTED' ||
    error.message.toLowerCase().includes('timeout')
  );
}

function shouldTripCircuitBreaker(error: unknown): boolean {
  if (error instanceof DomainCircuitOpenError) {
    return false;
  }

  if (error instanceof ExtractorTimeoutError || isAxiosTimeoutError(error)) {
    return true;
  }

  if (error instanceof ExtractorHttpStatusError) {
    return CIRCUIT_BREAKER_STATUS_CODES.has(error.status);
  }

  return false;
}

function normalizeAxiosHeaders(headers: RawAxiosResponseHeaders | AxiosResponse['headers']): Record<string, string | string[] | undefined> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, Array.isArray(value) ? value : value?.toString()]),
  );
}

async function fetchWithAxios(url: string, headers: Record<string, string>): Promise<FetchHtmlResult> {
  const response = await axios.get<string>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    maxRedirects: 5,
    responseType: 'text',
    headers,
    validateStatus: () => true,
  });

  return {
    html: typeof response.data === 'string' ? response.data : '',
    finalUrl: response.request?.res?.responseUrl || url,
    status: response.status,
    headers: normalizeAxiosHeaders(response.headers),
  };
}

async function fetchWithCurlImpersonate(
  url: string,
  context: ExtractLogContext = {},
): Promise<FetchHtmlResult | null> {
  try {
    const curlModule = await import('node-curl-impersonate');
    const moduleRecord = curlModule as Record<string, unknown>;
    const CurlImpersonateClass =
      moduleRecord.CurlImpersonate ??
      moduleRecord.default;

    if (typeof CurlImpersonateClass !== 'function') {
      log.warn('curl-impersonate module shape unsupported, falling back to axios', {
        ...buildExtractorMeta(url, context),
        exports: Object.keys(moduleRecord),
      });
      return null;
    }

    if (process.platform === 'win32') {
      log.warn('curl-impersonate unsupported on Windows, falling back to axios', {
        ...buildExtractorMeta(url, context),
        platform: process.platform,
      });
      return null;
    }

    const instance = new (CurlImpersonateClass as new (requestUrl: string, options: unknown) => {
      makeRequest: (requestUrl?: string) => Promise<unknown>;
    })(url, {
      method: 'GET',
      impersonate: 'chrome-116',
      verbose: false,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    });

    const rawResponse = await withTimeout(
      'curl-impersonate request',
      REQUEST_TIMEOUT_MS,
      () => instance.makeRequest(url),
    );

    const response = rawResponse as {
      statusCode?: number;
      response?: string;
      responseHeaders?: Record<string, string | string[] | undefined>;
    };

    return {
      html: typeof response.response === 'string' ? response.response : '',
      finalUrl: url,
      status: response.statusCode ?? 200,
      headers: response.responseHeaders ?? {},
    };
  } catch (error: any) {
    log.warn('curl-impersonate unavailable, falling back to axios', {
      ...buildExtractorMeta(url, context),
      error: error.message,
    });
    return null;
  }
}

/**
 * Multi-tier HTML fetch cascade:
 *   Tier 1: curl-impersonate (browser TLS fingerprint)
 *   Tier 2: axios + Referer header (fallback on 403)
 * Note: GDELT NGrams Tier 0 was removed — GDELT DOC 2.0 API does not provide article body text.
 */
async function fetchHtmlWithCascade(
  url: string,
  context: ExtractLogContext = {},
): Promise<FetchHtmlResult> {
  const primaryHeaders = {
    'User-Agent': 'Mozilla/5.0',
    'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  };

  const impersonatedResponse = await fetchWithCurlImpersonate(url, context);
  const primaryResponse = impersonatedResponse ?? await fetchWithAxios(url, primaryHeaders);

  if ([401, 402, 403].includes(primaryResponse.status)) {
    log.warn('Primary extraction request was blocked, retrying with social referer fallback', {
      ...buildExtractorMeta(url, context),
      status: primaryResponse.status,
    });
    return fetchWithAxios(url, {
      ...primaryHeaders,
      Referer: 'https://www.facebook.com/',
    });
  }

  return primaryResponse;
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

async function parseWithReadability(
  html: string,
  url: string,
  context: ExtractLogContext = {},
): Promise<ExtractedDocument> {
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  if (htmlBytes > MAX_HTML_PARSE_BYTES) {
    log.warn('Skipping unsafe DOM parse for oversized HTML payload', {
      ...buildExtractorMeta(url, context),
      htmlBytes,
      maxHtmlBytes: MAX_HTML_PARSE_BYTES,
    });
    throw new ExtractorParseSafetyError(htmlBytes, MAX_HTML_PARSE_BYTES);
  }

  return withTimeout('readability parse', PARSE_TIMEOUT_MS, async () => {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    try {
      try {
        const metaDescription = collapseWhitespace(
          document.querySelector('meta[name="description"]')?.getAttribute('content') ||
          document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
          '',
        );

        const readabilityModule = await import('@mozilla/readability');
        const reader = new readabilityModule.Readability(document);
        const parsed = reader.parse();

        if (parsed?.textContent && parsed.textContent.trim().length > 0) {
          return {
            title: collapseWhitespace(parsed.title || document.title || 'Untitled'),
            content: collapseWhitespace(parsed.textContent),
            metaDescription: metaDescription || undefined,
            author: parsed.byline ? collapseWhitespace(parsed.byline) : undefined,
            siteName: parsed.siteName ? collapseWhitespace(parsed.siteName) : undefined,
          };
        }
      } catch (error: any) {
        log.warn('Readability unavailable, using DOM fallback', {
          ...buildExtractorMeta(url, context),
          error: error.message,
        });
      }

      const fallbackTitle = collapseWhitespace(
        document.querySelector('title')?.textContent ||
        document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
        'Untitled',
      );

      const fallbackAuthor = collapseWhitespace(
        document.querySelector('meta[name="author"]')?.getAttribute('content') || '',
      );

      const fallbackSiteName = collapseWhitespace(
        document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '',
      );

      const fallbackContent = collapseWhitespace(document.body?.textContent || '');
      const fallbackMetaDescription = collapseWhitespace(
        document.querySelector('meta[name="description"]')?.getAttribute('content') ||
        document.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
        '',
      );

      return {
        title: fallbackTitle,
        content: fallbackContent,
        metaDescription: fallbackMetaDescription || undefined,
        author: fallbackAuthor || undefined,
        siteName: fallbackSiteName || undefined,
      };
    } finally {
      dom.window.close();
    }
  });
}

export async function extractArticle(
  url: string,
  context: ExtractLogContext = {},
): Promise<ExtractedDocument> {
  const hostname = normalizeHostname(url);
  const startedAt = Date.now();

  log.info('Extraction started', buildExtractorMeta(url, context, { hostname }));

  const cachedDocument = await readExtractionCache(url, context);
  if (cachedDocument) {
    log.info('CACHE HIT', buildExtractorMeta(url, context, {
      hostname,
      elapsedMs: Date.now() - startedAt,
      contentLength: cachedDocument.content.length,
    }));
    return cachedDocument;
  }

  log.debug('CACHE MISS', buildExtractorMeta(url, context, {
    hostname,
  }));

  await assertDomainAvailable(hostname, url, context);

  try {
    const response = await fetchHtmlWithCascade(url, context);
    if (response.status >= 400) {
      throw new ExtractorHttpStatusError(response.status, response.finalUrl || url);
    }
    if (!response.html) {
      throw new Error('Extraction returned empty HTML');
    }

    const extracted = await parseWithReadability(response.html, response.finalUrl || url, context);
    if (!extracted.content || extracted.content.length < 200) {
      throw new Error('Extracted content is too short');
    }

    await resetDomainFailures(hostname, url, context);
    await writeExtractionCache(url, extracted, context);

    log.info('Extraction completed successfully', buildExtractorMeta(url, context, {
      hostname,
      elapsedMs: Date.now() - startedAt,
      contentLength: extracted.content.length,
      finalUrl: response.finalUrl,
      status: response.status,
    }));

    return extracted;
  } catch (error: any) {
    if (shouldTripCircuitBreaker(error)) {
      await markDomainFailure(hostname, url, context);
    }

    const meta = buildExtractorMeta(url, context, {
      hostname,
      elapsedMs: Date.now() - startedAt,
      error: error.message,
      status: error instanceof ExtractorHttpStatusError ? error.status : undefined,
      operation: error instanceof ExtractorTimeoutError ? error.operation : undefined,
    });

    if (isOperationalExtractionError(error)) {
      log.warn('Extraction completed with operational failure', meta);
    } else {
      log.error('Extraction crashed unexpectedly', meta);
    }

    throw error;
  }
}
