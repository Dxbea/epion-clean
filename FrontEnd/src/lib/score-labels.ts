/**
 * score-labels.ts — Frontend utility for score display
 *
 * The frontend does NOT compute scores. It reads them from the backend.
 * This file only handles:
 *   - Mapping internal support levels to localized labels
 *   - Score status display states
 *   - Color theming for score badges
 *
 * Important: A score is NOT a truth probability.
 * It indicates how well content is supported by its sources and analysis.
 */

// ---------------------------------------------------------------------------
//  Support Level labels (i18n ready)
// ---------------------------------------------------------------------------

export type SupportLevel = 'very_strong' | 'strong' | 'nuanced' | 'fragile' | 'unverified' | 'unsourced';

export type ScoreStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'STALE' | null;

const SUPPORT_LABELS: Record<SupportLevel, { fr: string; en: string }> = {
  very_strong: { fr: 'Très solide', en: 'Very strong' },
  strong:      { fr: 'Solide', en: 'Strong' },
  nuanced:     { fr: 'À nuancer', en: 'Nuanced' },
  fragile:     { fr: 'Fragile', en: 'Fragile' },
  unverified:  { fr: 'À vérifier', en: 'Unverified' },
  unsourced:   { fr: 'Appui non évalué', en: 'Not evaluated' },
};

const SUPPORT_BADGE_CLASSES: Record<SupportLevel, string> = {
  very_strong: 'border-emerald-400/60 bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-sm',
  strong: 'border-teal-400/60 bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm',
  nuanced: 'border-yellow-400/70 bg-gradient-to-r from-yellow-400 to-amber-400 text-gray-900 shadow-sm',
  fragile: 'border-amber-500/60 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm',
  unverified: 'border-rose-500/60 bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm',
  unsourced: 'border-gray-400/60 bg-gradient-to-r from-gray-400 to-slate-500 text-white shadow-sm',
};

export function getPublicSupportBadgeClass(level: SupportLevel): string {
  return SUPPORT_BADGE_CLASSES[level] ?? SUPPORT_BADGE_CLASSES.unsourced;
}

/** Get the localized label for a support level. */
export function getSupportLabel(level: SupportLevel, lang: 'fr' | 'en' = 'fr'): string {
  return SUPPORT_LABELS[level]?.[lang] ?? SUPPORT_LABELS.unverified[lang];
}

export function getPublicSupportLabel({
  supportLevel,
  backendScore,
  status = 'COMPLETED',
  lang = 'fr',
}: {
  supportLevel?: SupportLevel | null;
  backendScore?: number | null;
  status?: ScoreStatus;
  lang?: 'fr' | 'en';
}): string {
  if (status && status !== 'COMPLETED' && status !== 'STALE') {
    return getSupportLabel('unsourced', lang);
  }
  if (supportLevel) return getSupportLabel(supportLevel, lang);
  return getSupportLabel(deriveSupportLevelFromScore(backendScore ?? null), lang);
}

/**
 * Derive support level from a numeric score.
 * Duplicated from backend for display-only purposes (e.g. legacy data without supportLevel field).
 * The backend is still the source of truth — this is a fallback.
 */
export function deriveSupportLevelFromScore(score: number | null): SupportLevel {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'unsourced';
  if (score >= 90) return 'very_strong';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'nuanced';
  if (score >= 30) return 'fragile';
  return 'unverified';
}

// ---------------------------------------------------------------------------
//  Score status display
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, { fr: string; en: string }> = {
  PENDING:   { fr: 'Analyse en attente', en: 'Analysis pending' },
  RUNNING:   { fr: 'Analyse en cours…', en: 'Analyzing…' },
  COMPLETED: { fr: '', en: '' }, // No label needed, show score instead
  FAILED:    { fr: 'Analyse indisponible', en: 'Analysis unavailable' },
  STALE:     { fr: 'Score basé sur une version précédente', en: 'Score based on previous version' },
};

export function getStatusLabel(status: ScoreStatus, lang: 'fr' | 'en' = 'fr'): string | null {
  if (!status || status === 'COMPLETED') return null;
  return STATUS_LABELS[status]?.[lang] ?? null;
}

export function isScoreDisplayable(status: ScoreStatus): boolean {
  return status === 'COMPLETED' || status === 'STALE';
}

// ---------------------------------------------------------------------------
//  Score color theming
// ---------------------------------------------------------------------------

export function getScoreColor(score: number | null): string {
  if (score === null) return 'var(--score-neutral, #888)';
  if (score >= 90) return 'var(--score-very-strong, #00dc82)';
  if (score >= 70) return 'var(--score-strong, #00dc82)';
  if (score >= 50) return 'var(--score-nuanced, #f59e0b)';
  if (score >= 30) return 'var(--score-fragile, #f97316)';
  return 'var(--score-unverified, #ef4444)';
}

// ---------------------------------------------------------------------------
//  Microcopy / Disclaimer
// ---------------------------------------------------------------------------

export const SCORE_DISCLAIMER = {
  fr: "Ce score n'est pas une probabilité de vérité. Il indique à quel point ce contenu est appuyé par les sources disponibles et par notre méthode d'analyse.",
  en: "This score is not a truth probability. It indicates how well this content is supported by available sources and our analysis methodology.",
};
