import React from 'react';
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

export type ContributionType = 'SOURCE' | 'NUANCE' | 'CONTRADICTION' | 'QUESTION' | 'CORRECTION';
export type ValidationType = 'WELL_SOURCED' | 'ADDS_NUANCE' | 'NEEDS_CHECK';
export type SortMode = 'top' | 'recent';
export type ContributionStatus = 'ACTIVE' | 'DELETED' | 'HIDDEN' | 'STALE';
export type ContributionReportReason = 'SPAM' | 'ABUSE' | 'OFF_TOPIC' | 'MISLEADING_SOURCE' | 'PERSONAL_DATA' | 'OTHER';

type OpinionPosition = {
  id: string;
  selectedPosition: number | null;
  lacksContext: boolean;
  confirmedAt: string;
  createdAt: string;
  updatedAt: string;
};

type ContributionAuthor = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

type ValidationSummary = {
  WELL_SOURCED: number;
  ADDS_NUANCE: number;
  NEEDS_CHECK: number;
};

export type OpinionDistribution = {
  counts: Record<string, number>;
  total: number;
  lacksContextCount: number;
};

export type Contribution = {
  id: string;
  targetContributionId: string | null;
  status: ContributionStatus;
  type: ContributionType;
  text: string;
  sourceUrl: string | null;
  bridgingScore: number;
  editedAt: string | null;
  editCount: number;
  createdAt: string;
  updatedAt: string;
  author: ContributionAuthor | null;
  validationSummary: ValidationSummary;
  currentUserValidations: string[];
  children: Contribution[];
};

type InteractionsResponse = {
  opinionQuestion: {
    id: string;
    articleId: string;
    question: string;
    thesisA: string;
    thesisB: string;
  };
  allowedPositions: number[];
  currentUserOpinionPosition: OpinionPosition | null;
  hasInsufficientContext: boolean;
  canContribute: boolean;
  canValidateContributions: boolean;
  opinionDistribution: OpinionDistribution;
  contributions: Contribution[];
};

const DEFAULT_OPINION_DISTRIBUTION: OpinionDistribution = {
  counts: {},
  total: 0,
  lacksContextCount: 0,
};

function normalizeOpinionDistribution(value: unknown): OpinionDistribution {
  if (!value || typeof value !== 'object') return DEFAULT_OPINION_DISTRIBUTION;
  const distribution = value as Partial<OpinionDistribution>;
  const counts = distribution.counts && typeof distribution.counts === 'object'
    ? distribution.counts
    : {};

  return {
    counts,
    total: typeof distribution.total === 'number' ? distribution.total : 0,
    lacksContextCount: typeof distribution.lacksContextCount === 'number'
      ? distribution.lacksContextCount
      : 0,
  };
}

function mapContributionTree(
  contributions: Contribution[],
  contributionId: string,
  updater: (contribution: Contribution) => Contribution,
): Contribution[] {
  return contributions.map((contribution) => {
    const children = contribution.children?.length
      ? mapContributionTree(contribution.children, contributionId, updater)
      : contribution.children;
    const withChildren = children === contribution.children ? contribution : { ...contribution, children };
    return withChildren.id === contributionId ? updater(withChildren) : withChildren;
  });
}

export function useArticleInteractions(articleSlug: string | undefined) {
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmittingPosition, setIsSubmittingPosition] = React.useState(false);
  const [isSubmittingContribution, setIsSubmittingContribution] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sortMode, setSortMode] = React.useState<SortMode>('top');

  const [opinionQuestion, setOpinionQuestion] = React.useState<InteractionsResponse['opinionQuestion'] | null>(null);
  const [currentPosition, setCurrentPosition] = React.useState<OpinionPosition | null>(null);
  const [contributions, setContributions] = React.useState<Contribution[]>([]);
  const [canContribute, setCanContribute] = React.useState(false);
  const [canValidate, setCanValidate] = React.useState(false);
  const [opinionDistribution, setOpinionDistribution] = React.useState<OpinionDistribution>({
    counts: {},
    total: 0,
    lacksContextCount: 0,
  });

  const { requireAuth } = useAuthPrompt();

  const fetchInteractions = React.useCallback(async (sort?: SortMode, silent = false) => {
    if (!articleSlug) return;
    if (!silent) setIsLoading(true);
    setError(null);
    const effectiveSort = sort ?? sortMode;
    try {
      const r = await fetch(`${API_BASE}/api/articles/${articleSlug}/interactions?sort=${effectiveSort}`, {
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: InteractionsResponse = await r.json();
      setOpinionQuestion(data.opinionQuestion ?? null);
      setCurrentPosition(data.currentUserOpinionPosition ?? null);
      setContributions(Array.isArray(data.contributions) ? data.contributions : []);
      setCanContribute(data.canContribute === true);
      setCanValidate(data.canValidateContributions === true);
      setOpinionDistribution(normalizeOpinionDistribution(data.opinionDistribution));
    } catch (e: any) {
      setError(e.message || 'Failed to load interactions');
    } finally {
      setIsLoading(false);
    }
  }, [articleSlug, sortMode]);

  const hasMounted = React.useRef(false);

  React.useEffect(() => {
    if (hasMounted.current) {
      fetchInteractions(sortMode, true);
    } else {
      hasMounted.current = true;
      fetchInteractions();
    }
  }, [fetchInteractions]);

  const changeSort = React.useCallback((mode: SortMode) => {
    setSortMode(mode);
  }, []);

  const submitPosition = React.useCallback(async (
    selectedPosition: number | null,
    lacksContext: boolean,
  ) => {
    if (!articleSlug) return;
    setIsSubmittingPosition(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/${articleSlug}/opinion-position`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedPosition, lacksContext }),
        }),
      );

      if (r.status === 401) {
        requireAuth({ message: 'Connectez-vous pour donner votre position.' });
        return false;
      }

      if (r.status === 409) {
        await fetchInteractions();
        setError('position_already_confirmed');
        return false;
      }

      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error || `HTTP ${r.status}`);
        return false;
      }

      const created: OpinionPosition & { canContribute: boolean; canValidateContributions: boolean } = await r.json();
      setCurrentPosition(created);
      setCanContribute(created.canContribute);
      setCanValidate(created.canValidateContributions);
      return true;
    } catch (e: any) {
      setError(e.message || 'Failed to submit position');
      await fetchInteractions();
      return false;
    } finally {
      setIsSubmittingPosition(false);
    }
  }, [articleSlug, fetchInteractions, requireAuth]);

  const submitContribution = React.useCallback(async (
    type: ContributionType,
    text: string,
    sourceUrl?: string,
    targetContributionId?: string,
  ) => {
    if (!articleSlug) return false;
    setIsSubmittingContribution(true);
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/${articleSlug}/contributions`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, text, sourceUrl: sourceUrl || undefined, targetContributionId: targetContributionId || undefined }),
        }),
      );

      if (r.status === 401) {
        requireAuth({ message: 'Connectez-vous pour contribuer.' });
        return false;
      }

      if (r.status === 409) {
        setError('insufficient_context_confirmed');
        return false;
      }

      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error || `HTTP ${r.status}`);
        return false;
      }

      const created: Contribution = await r.json();
      setContributions((prev) => {
        if (!created.targetContributionId) return [created, ...prev];
        return prev.map((contribution) => {
          if (contribution.id !== created.targetContributionId) return contribution;
          return {
            ...contribution,
            children: [...(contribution.children || []), created],
          };
        });
      });
      return true;
    } catch (e: any) {
      setError(e.message || 'Failed to submit contribution');
      return false;
    } finally {
      setIsSubmittingContribution(false);
    }
  }, [articleSlug, requireAuth]);

  const editContribution = React.useCallback(async (
    contributionId: string,
    data: { text: string; sourceUrl?: string },
  ) => {
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/contributions/${contributionId}`,
        await withCsrf({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      );

      if (r.status === 401) {
        requireAuth({ message: 'Connectez-vous pour modifier.' });
        return false;
      }

      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error || `HTTP ${r.status}`);
        return false;
      }

      const updated: Contribution = await r.json();
      setContributions((current) =>
        mapContributionTree(current, contributionId, (contribution) => ({
          ...updated,
          children: updated.targetContributionId ? [] : [],
        })),
      );
      return true;
    } catch (e: any) {
      setError(e.message || 'Failed to edit contribution');
      return false;
    }
  }, [requireAuth]);

  const deleteContribution = React.useCallback(async (contributionId: string) => {
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/contributions/${contributionId}`,
        await withCsrf({ method: 'DELETE' }),
      );

      if (r.status === 401) {
        requireAuth({ message: 'Connectez-vous pour supprimer.' });
        return false;
      }

      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error || `HTTP ${r.status}`);
        return false;
      }

      setContributions((current) =>
        current
          .filter((contribution) => contribution.id !== contributionId)
          .map((contribution) => ({
            ...contribution,
            children: contribution.children.filter((child) => child.id !== contributionId),
          })),
      );
      return true;
    } catch (e: any) {
      setError(e.message || 'Failed to delete contribution');
      return false;
    }
  }, [requireAuth]);

  const reportContribution = React.useCallback(async (
    contributionId: string,
    reason: ContributionReportReason,
    details?: string,
  ) => {
    setError(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/articles/contributions/${contributionId}/reports`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason, details }),
        }),
      );

      if (r.status === 401) {
        requireAuth({ message: 'Connectez-vous pour signaler.' });
        return false;
      }

      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setError(body.error || `HTTP ${r.status}`);
        return false;
      }

      return true;
    } catch (e: any) {
      setError(e.message || 'Failed to report contribution');
      return false;
    }
  }, [requireAuth]);

  const toggleValidation = React.useCallback(async (
    contributionId: string,
    type: ValidationType,
  ) => {
    if (!articleSlug) return;

    const prev = contributions;
    setContributions((current) =>
      mapContributionTree(current, contributionId, (c) => {
        if (c.id !== contributionId) return c;
        const hadIt = c.currentUserValidations.includes(type);
        return {
          ...c,
          currentUserValidations: hadIt
            ? c.currentUserValidations.filter((v) => v !== type)
            : [...c.currentUserValidations, type],
          validationSummary: {
            ...c.validationSummary,
            [type]: c.validationSummary[type] + (hadIt ? -1 : 1),
          },
        };
      }),
    );

    try {
      const r = await fetch(
        `${API_BASE}/api/articles/contributions/${contributionId}/validations`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        }),
      );

      if (r.status === 401) {
        setContributions(prev);
        requireAuth({ message: 'Connectez-vous pour valider.' });
        return;
      }

      if (r.status === 403) {
        setContributions(prev);
        setError('cannot_validate_own_contribution');
        return;
      }

      if (!r.ok) {
        setContributions(prev);
        const body = await r.json().catch(() => ({}));
        setError(body.error || `HTTP ${r.status}`);
        return;
      }

      const data: { action: 'ADDED' | 'REMOVED'; validationSummary: ValidationSummary } = await r.json();
      setContributions((current) =>
        mapContributionTree(current, contributionId, (c) => {
          if (c.id !== contributionId) return c;
          return {
            ...c,
            validationSummary: data.validationSummary,
            currentUserValidations: data.action === 'ADDED'
              ? [...c.currentUserValidations.filter((v) => v !== type), type]
              : c.currentUserValidations.filter((v) => v !== type),
          };
        }),
      );
    } catch {
      setContributions(prev);
    }
  }, [articleSlug, contributions, requireAuth]);

  return {
    isLoading,
    isSubmittingPosition,
    isSubmittingContribution,
    error,
    clearError: () => setError(null),
    opinionQuestion,
    currentPosition,
    contributions,
    opinionDistribution,
    canContribute,
    canValidate,
    sortMode,
    changeSort,
    submitPosition,
    submitContribution,
    editContribution,
    deleteContribution,
    reportContribution,
    toggleValidation,
    refresh: fetchInteractions,
  };
}
