import { Mistral } from '@mistralai/mistralai';
import { env } from '../../env.js';
import { logger } from '../logger.js';
import {
  EDITORIAL_MISTRAL_PROMPT_VERSION,
  type EditorialClaimForAudit,
  type EditorialMistralAuditResult,
  type EditorialMistralClaimAudit,
  type EditorialMistralAuditor,
  type EditorialVerificationEvidence,
} from './types.js';

const VALID_VERDICTS = new Set(['SUPPORTED', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED', 'CONTRADICTED']);

export class MistralEditorialAuditor implements EditorialMistralAuditor {
  readonly model = 'mistral-small-latest';

  async audit(input: {
    title: string;
    summary: string;
    contentHtml: string;
    claims: EditorialClaimForAudit[];
    evidence: EditorialVerificationEvidence[];
  }): Promise<EditorialMistralAuditResult> {
    if (!env.MISTRAL_API_KEY) return failClosed(this.model, 'MISTRAL_UNAVAILABLE');
    const mistral = new Mistral({ apiKey: env.MISTRAL_API_KEY });
    try {
      const response = await mistral.chat.complete({
        model: this.model,
        temperature: 0,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt() },
          { role: 'user', content: userPrompt(input) },
        ],
      });
      const raw = extractMessageContent(response.choices?.[0]?.message?.content);
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return failClosed(this.model, 'MISTRAL_INVALID_JSON');
      }
      return validateMistralAudit(parsed, input.claims, input.evidence, this.model, response.usage as any);
    } catch (error) {
      logger.error('Editorial Mistral audit failed closed', {
        module: 'EditorialVerification',
        model: this.model,
        error: error instanceof Error ? error.message : String(error),
      });
      return failClosed(this.model, 'MISTRAL_UNAVAILABLE');
    }
  }
}

export function validateMistralAudit(
  raw: unknown,
  claims: EditorialClaimForAudit[],
  evidence: EditorialVerificationEvidence[],
  model = 'mistral-small-latest',
  usage?: { promptTokens?: number; completionTokens?: number },
): EditorialMistralAuditResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failClosed(model, 'MISTRAL_INVALID_JSON');
  const payload = raw as Record<string, unknown>;
  if (!Array.isArray(payload.claims)) return failClosed(model, 'MISTRAL_INVALID_JSON');
  const claimByKey = new Map(claims.map((claim) => [claim.claimKey, claim]));
  const evidenceKeys = new Set(evidence.map((item) => item.evidenceKey));
  const seenClaims = new Set<string>();
  const invalidEvidenceKeys = new Set<string>();
  const auditedClaims: EditorialMistralClaimAudit[] = [];
  const reasons = new Set<string>();
  for (const item of payload.claims) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return failClosed(model, 'MISTRAL_INVALID_JSON');
    const row = item as Record<string, unknown>;
    const claimKey = typeof row.claimKey === 'string' ? row.claimKey : '';
    const primary = claimByKey.get(claimKey);
    if (!primary || seenClaims.has(claimKey) || !VALID_VERDICTS.has(String(row.verdict))) {
      return failClosed(model, 'MISTRAL_INVALID_JSON');
    }
    seenClaims.add(claimKey);
    const citedKeys = Array.isArray(row.evidenceKeys)
      ? row.evidenceKeys.filter((key): key is string => typeof key === 'string')
      : [];
    for (const key of citedKeys) if (!evidenceKeys.has(key)) invalidEvidenceKeys.add(key);
    const sourceValid = row.sourceValid === true;
    const citationValid = row.citationValid === true && sourceValid && citedKeys.length > 0
      && citedKeys.every((key) => evidenceKeys.has(key));
    const verdict = String(row.verdict) as EditorialMistralClaimAudit['verdict'];
    const agreesWithPrimary = verdict === primary.primaryVerdict;
    const contradiction = row.contradiction === true || verdict === 'CONTRADICTED';
    if (!citationValid) reasons.add('MISTRAL_INVALID_SOURCE_OR_CITATION');
    if (primary.importance === 'CORE' && !agreesWithPrimary) reasons.add('MISTRAL_CORE_CLAIM_DISAGREEMENT');
    if (primary.importance === 'CORE' && verdict !== 'SUPPORTED') reasons.add('MISTRAL_CORE_CLAIM_NOT_SUPPORTED');
    if (contradiction) reasons.add('MISTRAL_CONTRADICTION_PRESENT');
    auditedClaims.push({
      claimKey,
      verdict,
      evidenceKeys: citedKeys,
      citationValid,
      contradiction,
      agreesWithPrimary,
      explanation: typeof row.explanation === 'string' ? row.explanation.trim().slice(0, 2_000) : '',
    });
  }
  if (seenClaims.size !== claims.length) reasons.add('MISTRAL_INCOMPLETE_CLAIM_AUDIT');
  if (invalidEvidenceKeys.size > 0) reasons.add('MISTRAL_UNKNOWN_EVIDENCE');
  const contradictions = Array.isArray(payload.contradictions)
    ? payload.contradictions.filter((value): value is string => typeof value === 'string').map((value) => value.slice(0, 2_000))
    : [];
  if (contradictions.length > 0) reasons.add('MISTRAL_CONTRADICTION_PRESENT');
  return {
    outcome: reasons.size === 0 ? 'PASSED' : 'HUMAN_REVIEW_REQUIRED',
    available: true,
    validJson: true,
    model,
    claims: auditedClaims,
    contradictions,
    invalidEvidenceKeys: [...invalidEvidenceKeys],
    reasons: [...reasons],
    inputTokens: numberOrNull(usage?.promptTokens),
    outputTokens: numberOrNull(usage?.completionTokens),
    estimatedCostMicros: null,
  };
}

function systemPrompt(): string {
  return `Tu es l'auditeur éditorial indépendant d'Epion. Le brouillon et son premier audit ont été produits par OpenAI. Vérifie chaque affirmation sans leur faire confiance. Pour chaque claim, contrôle que toutes les evidenceKeys déjà attachées à ce claim sont examinées et recopiées dans evidenceKeys si elles sont utilisables, que les URLs et extraits fournis sont utilisables, et signale les contradictions. N'omets pas une source citée par le claim et n'ajoute jamais de preuve non citée par ce claim. Un claim central doit être pleinement supporté. Réponds uniquement en JSON conforme au format demandé. Version: ${EDITORIAL_MISTRAL_PROMPT_VERSION}.`;
}

function userPrompt(input: {
  title: string;
  summary: string;
  contentHtml: string;
  claims: EditorialClaimForAudit[];
  evidence: EditorialVerificationEvidence[];
}): string {
  return JSON.stringify({
    task: 'independent_editorial_claim_and_citation_audit',
    citationRule: 'For every claim, inspect and return every evidenceKey already attached to that claim when the cited source is usable. Never add an evidenceKey from another claim.',
    article: {
      title: input.title,
      summary: input.summary,
      contentHtml: input.contentHtml.slice(0, 20_000),
    },
    primaryOpenAIAudit: input.claims,
    evidence: input.evidence.map((item) => ({
      evidenceKey: item.evidenceKey,
      title: item.title,
      url: item.url,
      domain: item.domain,
      lane: item.lane,
      origin: item.origin,
      extractionStatus: item.extractionStatus ?? (item.origin === 'SERPER' ? 'metadata_only' : 'full'),
      content: item.content.slice(0, 3_000),
    })),
    responseFormat: {
      claims: [{
        claimKey: 'claim_key',
        verdict: 'SUPPORTED | PARTIALLY_SUPPORTED | UNSUPPORTED | CONTRADICTED',
        evidenceKeys: ['evidence_key'],
        citationValid: true,
        sourceValid: true,
        contradiction: false,
        explanation: 'explication courte',
      }],
      contradictions: ['contradiction éventuelle'],
    },
  });
}

function extractMessageContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((chunk) =>
    chunk && typeof chunk === 'object' && 'text' in chunk ? String((chunk as { text?: unknown }).text ?? '') : '').join('');
  return '';
}

function failClosed(model: string, reason: string): EditorialMistralAuditResult {
  return {
    outcome: 'HUMAN_REVIEW_REQUIRED',
    available: reason !== 'MISTRAL_UNAVAILABLE',
    validJson: reason !== 'MISTRAL_INVALID_JSON',
    model,
    claims: [],
    contradictions: [],
    invalidEvidenceKeys: [],
    reasons: [reason],
    inputTokens: null,
    outputTokens: null,
    estimatedCostMicros: null,
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}
