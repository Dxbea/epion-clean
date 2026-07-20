import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { parseFeedXml } from '../lib/discovery/connectors/xml-parsers.js';
import { RobotsChecker } from '../lib/document-corpus/robots.js';

const MIN_EXTRACTED_CHARACTERS = 1_500;
const REQUEST_TIMEOUT_MS = 15_000;
const CONFIG_DIR = new URL('../../config/', import.meta.url);
const CANDIDATES_URL = new URL('rss-institutional-candidates.json', CONFIG_DIR);
const WHITELIST_URL = new URL('rss-institutional-whitelist.json', CONFIG_DIR);
const REPORT_URL = new URL('rss-institutional-audit-report.json', CONFIG_DIR);

export type InstitutionalRssAuditStatus =
  | 'VALIDATED_FULL_FETCH' | 'RSS_ONLY' | 'ROBOTS_BLOCKED' | 'FETCH_FAILED'
  | 'EXTRACTION_FAILED' | 'TOO_SHORT' | 'PAYWALL_OR_JS' | 'LEGAL_REVIEW_REQUIRED';

export interface InstitutionalRssCandidate {
  key: string; name: string; domain: string; rssUrl: string; category: string; country: string;
  institutionType: string; priority: number; language: string; licenseNote: string; legalReviewRequired?: boolean;
}

export interface InstitutionalRssAuditResult extends InstitutionalRssCandidate {
  status: InstitutionalRssAuditStatus;
  validation: {
    rssStatus: 'OK' | 'FAILED'; robotsStatus: 'ALLOWED' | 'BLOCKED' | 'UNAVAILABLE' | 'NOT_CHECKED';
    fetchStatus: 'OK' | 'FAILED' | 'NOT_CHECKED'; extractStatus: 'OK' | 'FAILED' | 'TOO_SHORT' | 'NOT_CHECKED';
    sampleExtractedCharacters: number; sampleUrl?: string; checkedAt: string; detail?: string;
  };
}

interface AuditDependencies {
  get: (url: string, options?: object) => Promise<{ status: number; data: string; headers?: Record<string, unknown>; request?: { res?: { responseUrl?: string } } }>;
  robotsChecker: Pick<RobotsChecker, 'check'>;
  extract: (html: string, url: string) => string;
  now: () => Date;
}

const http = axios.create({
  timeout: REQUEST_TIMEOUT_MS, maxRedirects: 5, responseType: 'text', validateStatus: () => true,
  headers: { 'User-Agent': 'EpionBot/1.0 (+https://epion.app)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9,*/*;q=0.8' },
});

const defaultDependencies: AuditDependencies = {
  get: (url, options) => http.get<string>(url, options),
  robotsChecker: new RobotsChecker(),
  extract: extractReadableText,
  now: () => new Date(),
};

export async function auditInstitutionalRssCandidate(
  candidate: InstitutionalRssCandidate,
  dependencies: AuditDependencies = defaultDependencies,
): Promise<InstitutionalRssAuditResult> {
  const checkedAt = dependencies.now().toISOString();
  const base = { ...candidate, validation: { rssStatus: 'FAILED' as const, robotsStatus: 'NOT_CHECKED' as const, fetchStatus: 'NOT_CHECKED' as const, extractStatus: 'NOT_CHECKED' as const, sampleExtractedCharacters: 0, checkedAt } };
  if (candidate.legalReviewRequired) return { ...base, status: 'LEGAL_REVIEW_REQUIRED', validation: { ...base.validation, detail: 'Manual legal review is required by candidate policy.' } };
  try {
    const rss = await dependencies.get(candidate.rssUrl);
    const rssBody = String(rss.data ?? '');
    if (rss.status !== 200 || !looksLikeXmlFeed(rssBody, rss.headers?.['content-type'])) {
      return { ...base, status: 'RSS_ONLY', validation: { ...base.validation, detail: `RSS endpoint returned HTTP ${rss.status} or non-feed content.` } };
    }
    const format = /<\s*feed[\s>]/i.test(rssBody) ? 'ATOM' : 'RSS';
    // RSS descriptions sometimes contain a very large number of HTML named
    // entities. They are irrelevant for selecting the article URL, and the
    // production XML parser intentionally limits entity expansion for safety.
    const item = parseFeedXml(stripNonXmlNamedEntities(rssBody), format, candidate.rssUrl, 1)[0];
    if (!item?.url) return { ...base, status: 'RSS_ONLY', validation: { ...base.validation, detail: 'No usable article URL in feed.' } };
    const sampleUrl = item.url;
    if (!sameOfficialDomain(sampleUrl, candidate.domain)) {
      return { ...base, status: 'RSS_ONLY', validation: { ...base.validation, sampleUrl, detail: 'Article domain differs from the declared official domain.' } };
    }
    const robots = await dependencies.robotsChecker.check(sampleUrl);
    if (!robots.allowed) {
      return { ...base, status: 'ROBOTS_BLOCKED', validation: { ...base.validation, rssStatus: 'OK', robotsStatus: robots.retryable ? 'UNAVAILABLE' : 'BLOCKED', sampleUrl, detail: robots.reason } };
    }
    let article;
    try { article = await dependencies.get(sampleUrl, { headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' } }); }
    catch (error) { return { ...base, status: 'FETCH_FAILED', validation: { ...base.validation, rssStatus: 'OK', robotsStatus: 'ALLOWED', sampleUrl, detail: message(error) } }; }
    const finalUrl = article.request?.res?.responseUrl ?? sampleUrl;
    const html = String(article.data ?? '');
    if (article.status !== 200) return { ...base, status: 'FETCH_FAILED', validation: { ...base.validation, rssStatus: 'OK', robotsStatus: 'ALLOWED', fetchStatus: 'FAILED', sampleUrl: finalUrl, detail: `Article returned HTTP ${article.status}.` } };
    if (isPaywallOrJsShell(html, article.headers?.['content-type'])) return { ...base, status: 'PAYWALL_OR_JS', validation: { ...base.validation, rssStatus: 'OK', robotsStatus: 'ALLOWED', fetchStatus: 'OK', sampleUrl: finalUrl, detail: 'Page appears to be a paywall, challenge, or JavaScript shell.' } };
    let text: string;
    try { text = dependencies.extract(html, finalUrl); }
    catch (error) { return { ...base, status: 'EXTRACTION_FAILED', validation: { ...base.validation, rssStatus: 'OK', robotsStatus: 'ALLOWED', fetchStatus: 'OK', extractStatus: 'FAILED', sampleUrl: finalUrl, detail: message(error) } }; }
    if (text.length < MIN_EXTRACTED_CHARACTERS) return { ...base, status: 'TOO_SHORT', validation: { ...base.validation, rssStatus: 'OK', robotsStatus: 'ALLOWED', fetchStatus: 'OK', extractStatus: 'TOO_SHORT', sampleExtractedCharacters: text.length, sampleUrl: finalUrl, detail: `Extracted text is below ${MIN_EXTRACTED_CHARACTERS} characters.` } };
    return { ...base, status: 'VALIDATED_FULL_FETCH', validation: { ...base.validation, rssStatus: 'OK', robotsStatus: 'ALLOWED', fetchStatus: 'OK', extractStatus: 'OK', sampleExtractedCharacters: text.length, sampleUrl: finalUrl } };
  } catch (error) {
    return { ...base, status: 'RSS_ONLY', validation: { ...base.validation, detail: message(error) } };
  }
}

export async function auditInstitutionalRssCandidates(candidates: InstitutionalRssCandidate[], dependencies: AuditDependencies = defaultDependencies) {
  const results: InstitutionalRssAuditResult[] = [];
  for (const candidate of candidates) results.push(await auditInstitutionalRssCandidate(candidate, dependencies));
  return results;
}

export function validatedWhitelist(results: InstitutionalRssAuditResult[]) {
  return results.filter((result) => result.status === 'VALIDATED_FULL_FETCH').map(({ status: _status, legalReviewRequired: _legalReviewRequired, ...source }) => ({ ...source, validated: true }));
}

export async function runInstitutionalRssAudit(write = false) {
  const input = JSON.parse(await readFile(CANDIDATES_URL, 'utf8')) as { sources: InstitutionalRssCandidate[] };
  const results = await auditInstitutionalRssCandidates(input.sources);
  const generatedAt = new Date().toISOString();
  const report = { schemaVersion: 1, generatedAt, minimumExtractedCharacters: MIN_EXTRACTED_CHARACTERS, results };
  const whitelist = { schemaVersion: 1, generatedAt, sources: validatedWhitelist(results) };
  if (write) {
    await writeFile(REPORT_URL, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(WHITELIST_URL, `${JSON.stringify(whitelist, null, 2)}\n`);
  }
  return { report, whitelist };
}

function looksLikeXmlFeed(body: string, contentType: unknown): boolean { return /<(rss|feed)(?:\s|>)/i.test(body) && (!contentType || /xml|rss|atom|text\//i.test(String(contentType))); }
function stripNonXmlNamedEntities(xml: string): string {
  // The audit only needs the first item URL. Drop verbose HTML-bearing feed
  // fields before parsing so a feed cannot exceed the parser entity-expansion
  // safety cap merely because of an item description.
  return xml
    .replace(/<(description|summary|content)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)[a-z][a-z\d]+;/gi, ' ');
}
function sameOfficialDomain(url: string, domain: string): boolean { const host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); const expected = domain.toLowerCase().replace(/^www\./, ''); return host === expected || host.endsWith(`.${expected}`) || expected.endsWith(`.${host}`); }
function extractReadableText(html: string, url: string): string { const dom = new JSDOM(html, { url }); try { const parsed = new Readability(dom.window.document).parse(); const text = (parsed?.textContent ?? dom.window.document.body?.textContent ?? '').replace(/\s+/g, ' ').trim(); if (!text) throw new Error('No readable text extracted.'); return text; } finally { dom.window.close(); } }
function isPaywallOrJsShell(html: string, contentType: unknown): boolean { const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase(); return !/html|xhtml/i.test(String(contentType ?? 'text/html')) || html.length < 800 || /enable javascript|access denied|captcha|verify you are human|subscribe to continue|paywall/.test(text); }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes('--write');
  runInstitutionalRssAudit(write).then(({ report, whitelist }) => console.log(JSON.stringify({ generatedAt: report.generatedAt, audited: report.results.length, validated: whitelist.sources.length, write }, null, 2))).catch((error) => { console.error(message(error)); process.exitCode = 1; });
}
