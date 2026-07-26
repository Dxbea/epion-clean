import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Flag,
  Pencil,
  FilePlus2,
  Lock,
  Loader2,
  PlusCircle,
  Scale,
  ShieldQuestion,
  Trash2,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nContext';
import { useMe } from '@/contexts/MeContext';
import { useArticleInteractions, type ContributionType as ApiContributionType, type ValidationType, type SortMode, type Contribution as ApiContribution, type ContributionReportReason } from '@/hooks/useArticleInteractions';

type UIContributionType = 'source' | 'nuance' | 'contradiction' | 'question' | 'correction';
type PositionValue = -1 | -0.6 | -0.2 | 0.2 | 0.6 | 1;

const UI_TO_API_TYPE: Record<UIContributionType, ApiContributionType> = {
  source: 'SOURCE',
  nuance: 'NUANCE',
  contradiction: 'CONTRADICTION',
  question: 'QUESTION',
  correction: 'CORRECTION',
};

const API_TO_UI_TYPE: Record<ApiContributionType, UIContributionType> = {
  SOURCE: 'source',
  NUANCE: 'nuance',
  CONTRADICTION: 'contradiction',
  QUESTION: 'question',
  CORRECTION: 'correction',
};

const typeTone: Record<UIContributionType, string> = {
  source: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300',
  nuance: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
  contradiction: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300',
  question: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300',
  correction: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300',
};

const positionValues: PositionValue[] = [-1, -0.6, -0.2, 0.2, 0.6, 1];
const CONTESTED_NEEDS_CHECK_THRESHOLD = 3;
const COMMUNITY_NOTE_MIN_VALIDATIONS = 2;
const reportReasons: ContributionReportReason[] = ['SPAM', 'ABUSE', 'OFF_TOPIC', 'MISLEADING_SOURCE', 'PERSONAL_DATA', 'OTHER'];
const positionLabels: Record<PositionValue, string> = {
  [-1]: 'article_interactions_position_strong_a',
  [-0.6]: 'article_interactions_position_moderate_a',
  [-0.2]: 'article_interactions_position_slight_a',
  [0.2]: 'article_interactions_position_slight_b',
  [0.6]: 'article_interactions_position_moderate_b',
  [1]: 'article_interactions_position_strong_b',
};

const typeIcons: Record<UIContributionType, React.ComponentType<{ className?: string }>> = {
  source: FilePlus2,
  nuance: Scale,
  contradiction: AlertTriangle,
  question: CircleHelp,
  correction: CheckCircle2,
};

type Props = {
  articleSlug: string;
};

function getAuthorInitials(author: ApiContribution['author']): string {
  if (!author) return '??';
  const name = author.name || author.username || '';
  if (!name) return '??';
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// Opinion Slider

type OpinionSliderProps = {
  positions: PositionValue[];
  selected: PositionValue | null;
  disabled: boolean;
  onSelect: (position: PositionValue) => void;
};

function OpinionSlider({ positions, selected, disabled, onSelect }: OpinionSliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{ pointerId: number; ratio: number } | null>(null);
  const [dragRatio, setDragRatio] = React.useState<number | null>(null);

  const getRatioFromClientX = React.useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const getSnapIndex = React.useCallback((ratio: number) => {
    return Math.max(
      0,
      Math.min(positions.length - 1, Math.round(ratio * (positions.length - 1))),
    );
  }, [positions.length]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    const ratio = getRatioFromClientX(event.clientX);
    dragRef.current = { pointerId: event.pointerId, ratio };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragRatio(ratio);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const ratio = getRatioFromClientX(event.clientX);
    drag.ratio = ratio;
    setDragRatio(ratio);
  };

  const finishInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const index = getSnapIndex(drag.ratio);
    dragRef.current = null;
    setDragRatio(null);
    onSelect(positions[index]);
  };

  const cancelInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragRatio(null);
  };

  const selectedIndex = selected !== null ? positions.indexOf(selected) : -1;
  const snappedPercent = selectedIndex >= 0 ? (selectedIndex / (positions.length - 1)) * 100 : -1;
  const thumbPercent = dragRatio !== null ? dragRatio * 100 : snappedPercent;
  const hasThumb = thumbPercent >= 0;

  return (
    <div
      ref={trackRef}
      data-opinion-slider
      className={`relative select-none touch-none px-4 py-10 ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishInteraction}
      onPointerCancel={cancelInteraction}
    >
      <div className="relative h-[3px] rounded-full bg-black/25 dark:bg-white/30">
        {positions.map((position, i) => {
          const percent = (i / (positions.length - 1)) * 100;
          const isSelected = position === selected && dragRatio === null;
          return (
            <span
              key={position}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${isSelected ? '' : 'bg-black/35 dark:bg-white/40'}`}
              style={{
                left: `${percent}%`,
                width: isSelected ? '13px' : '9px',
                height: isSelected ? '13px' : '9px',
                backgroundColor: isSelected ? '#38A6A6' : undefined,
                transition: 'width 0.25s ease, height 0.25s ease, background-color 0.25s ease',
              }}
            />
          );
        })}

        {hasThumb && (
          <span
            data-opinion-slider-thumb
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 motion-reduce:transition-none"
            style={{
              left: `${thumbPercent}%`,
              transition: dragRatio !== null ? 'left 0.04s linear' : 'left 0.32s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <span
              className="flex items-center justify-center rounded-full border-2 border-[#38A6A6] bg-white transition-[width,height,box-shadow] duration-200 ease-out motion-reduce:transition-none dark:bg-neutral-900"
              style={{
                width: dragRatio !== null ? '30px' : '24px',
                height: dragRatio !== null ? '30px' : '24px',
                boxShadow: dragRatio !== null ? '0 3px 14px rgba(0,220,130,0.34)' : '0 2px 10px rgba(0,220,130,0.24)',
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-[#38A6A6]" />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

// Main Component

export default function ArticleInteractionSpace({ articleSlug }: Props) {
  const { t } = useI18n();
  const { me } = useMe();
  const {
    isLoading,
    isSubmittingPosition,
    isSubmittingContribution,
    error,
    clearError,
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
  } = useArticleInteractions(articleSlug);

  const [selectedPosition, setSelectedPosition] = React.useState<number | null>(null);
  const [lacksContext, setLacksContext] = React.useState(false);
  const [isGatewayOpen, setIsGatewayOpen] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<UIContributionType | null>(null);
  const [selectedTargetContributionId, setSelectedTargetContributionId] = React.useState<string | null>(null);
  const [draftText, setDraftText] = React.useState('');
  const [draftSourceUrl, setDraftSourceUrl] = React.useState('');
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [editingContributionId, setEditingContributionId] = React.useState<string | null>(null);
  const [editingText, setEditingText] = React.useState('');
  const [editingSourceUrl, setEditingSourceUrl] = React.useState('');
  const [reportingContributionId, setReportingContributionId] = React.useState<string | null>(null);
  const [reportReason, setReportReason] = React.useState<ContributionReportReason>('SPAM');
  const [reportDetails, setReportDetails] = React.useState('');

  const formRef = React.useRef<HTMLFormElement>(null);

  const isConfirmed = currentPosition !== null;
  const hasInsufficientContext = isConfirmed && (currentPosition?.lacksContext ?? false);
  const canConfirmPosition = selectedPosition !== null || lacksContext;
  const opinionCounts = opinionDistribution?.counts ?? {};
  const maxOpinionCount = Math.max(
    1,
    ...positionValues.map((position) => opinionCounts[String(position)] ?? 0),
  );

  React.useEffect(() => {
    if (currentPosition) {
      setSelectedPosition(currentPosition.selectedPosition);
      setLacksContext(currentPosition.lacksContext);
    }
  }, [currentPosition]);

  const contributionTypes = React.useMemo(
    () => [
      { value: 'source' as const, label: t('article_interactions_type_source'), description: t('article_interactions_type_source_desc') },
      { value: 'nuance' as const, label: t('article_interactions_type_nuance'), description: t('article_interactions_type_nuance_desc') },
      { value: 'contradiction' as const, label: t('article_interactions_type_contradiction'), description: t('article_interactions_type_contradiction_desc') },
      { value: 'question' as const, label: t('article_interactions_type_question'), description: t('article_interactions_type_question_desc') },
      { value: 'correction' as const, label: t('article_interactions_type_correction'), description: t('article_interactions_type_correction_desc') },
    ],
    [t]
  );

  const resetDraft = () => {
    setDraftText('');
    setDraftSourceUrl('');
    setFieldError(null);
  };

  const handlePositionSelect = (position: PositionValue) => {
    if (isConfirmed) return;
    setSelectedPosition(position);
    setLacksContext(false);
    clearError();
  };

  const handleLacksContext = () => {
    if (isConfirmed) return;
    setSelectedPosition(null);
    setLacksContext(true);
    clearError();
  };

  const handleConfirmPosition = async () => {
    if (!canConfirmPosition || isConfirmed || isSubmittingPosition) return;
    const success = await submitPosition(selectedPosition, lacksContext);
    if (success && lacksContext) {
      setIsGatewayOpen(false);
      setSelectedType(null);
      resetDraft();
    }
  };

  const handleTypeSelect = (type: UIContributionType) => {
    setSelectedType(type);
    resetDraft();
    setSubmitMessage(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleAddContext = (contributionId: string) => {
    if (!canValidate) return;
    setIsGatewayOpen(true);
    setSelectedType('correction');
    setSelectedTargetContributionId(contributionId);
    resetDraft();
    setSubmitMessage(null);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedType || isSubmittingContribution) return;

    const text = draftText.trim();
    const sourceUrl = draftSourceUrl.trim();
    const isCommunityNoteDraft = selectedTargetContributionId !== null;

    if ((selectedType === 'source' || isCommunityNoteDraft) && !sourceUrl) {
      setFieldError(t('article_interactions_error_source_required'));
      return;
    }
    if (selectedType !== 'source' && !text) {
      setFieldError(t('article_interactions_error_text_required'));
      return;
    }
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      setFieldError(t('article_interactions_error_invalid_url'));
      return;
    }

    setFieldError(null);
    const apiType = UI_TO_API_TYPE[selectedType];
    const success = await submitContribution(
      apiType,
      text || ' ',
      sourceUrl || undefined,
      selectedTargetContributionId || undefined,
    );

    if (success) {
      setSubmitMessage(t('article_interactions_contribution_submitted'));
      setSelectedType(null);
      setSelectedTargetContributionId(null);
      resetDraft();
    }
  };

  const startEditingContribution = (contribution: ApiContribution) => {
    setEditingContributionId(contribution.id);
    setEditingText(contribution.text);
    setEditingSourceUrl(contribution.sourceUrl || '');
    setReportingContributionId(null);
    setFieldError(null);
  };

  const handleEditSubmit = async (event: React.FormEvent<HTMLFormElement>, contribution: ApiContribution) => {
    event.preventDefault();
    const text = editingText.trim();
    const sourceUrl = editingSourceUrl.trim();
    const requiresSource = contribution.type === 'SOURCE' || contribution.targetContributionId !== null;

    if (requiresSource && !sourceUrl) {
      setFieldError(t('article_interactions_error_source_required'));
      return;
    }
    if (contribution.type !== 'SOURCE' && !text) {
      setFieldError(t('article_interactions_error_text_required'));
      return;
    }
    if (sourceUrl && !/^https?:\/\//i.test(sourceUrl)) {
      setFieldError(t('article_interactions_error_invalid_url'));
      return;
    }

    const success = await editContribution(contribution.id, { text: text || ' ', sourceUrl: sourceUrl || undefined });
    if (success) {
      setEditingContributionId(null);
      setEditingText('');
      setEditingSourceUrl('');
      setSubmitMessage(t('article_interactions_contribution_updated'));
    }
  };

  const handleDeleteContribution = async (contributionId: string) => {
    const success = await deleteContribution(contributionId);
    if (success) {
      setSubmitMessage(t('article_interactions_contribution_deleted'));
    }
  };

  const handleReportSubmit = async (event: React.FormEvent<HTMLFormElement>, contributionId: string) => {
    event.preventDefault();
    const success = await reportContribution(contributionId, reportReason, reportDetails.trim() || undefined);
    if (success) {
      setReportingContributionId(null);
      setReportReason('SPAM');
      setReportDetails('');
      setSubmitMessage(t('article_interactions_report_submitted'));
    }
  };

  if (isLoading) {
    return (
      <section className="space-y-5 pt-10" aria-labelledby="article-interactions-title">
        <div className="space-y-2">
          <div className="h-3 w-32 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-7 w-64 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-96 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-neutral-900">
          <div className="space-y-4">
            <div className="h-5 w-48 animate-pulse rounded bg-black/10 dark:bg-white/10" />
            <div className="h-4 w-72 animate-pulse rounded bg-black/10 dark:bg-white/10" />
            <div className="mt-6 h-[3px] w-full animate-pulse rounded-full bg-black/10 dark:bg-white/10" />
            <div className="h-11 w-full animate-pulse rounded-xl bg-black/10 dark:bg-white/10" />
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-neutral-900">
          <div className="h-5 w-48 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5 pt-10" aria-labelledby="article-interactions-title">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase text-black/50 dark:text-white/50">
          {t('article_interactions_eyebrow')}
        </p>
        <h2 id="article-interactions-title" className="font-serif text-2xl font-medium tracking-tight text-neutral-900 dark:text-neutral-50">
          {t('article_interactions_title')}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-black/65 dark:text-white/65">
          {t('article_interactions_lead')}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {error === 'position_already_confirmed'
            ? t('article_interactions_error_already_voted')
            : error === 'insufficient_context_confirmed'
              ? t('article_interactions_gateway_disabled_help')
              : error === 'cannot_validate_own_contribution'
                ? t('article_interactions_error_own_validation')
                : error === 'opinion_position_required'
                  ? t('article_interactions_error_position_required')
                : error}
        </div>
      )}

      <div className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors duration-300 dark:bg-neutral-900 sm:p-5 ${
        isConfirmed
          ? 'border-[#38A6A6]/40 dark:border-[#38A6A6]/30'
          : 'border-black/10 dark:border-white/10'
      }`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
              {t('article_interactions_map_title')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-black/60 dark:text-white/60">
              {t('article_interactions_map_desc')}
            </p>
          </div>
          {isConfirmed && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#38A6A6]/40 bg-[#38A6A6]/10 px-3 py-1 text-xs font-semibold text-[#2C8585] dark:text-[#78DCE3]">
              <Lock className="h-3.5 w-3.5" />
              {t('article_interactions_position_confirmed')}
            </span>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
          <p className="text-xs font-semibold uppercase text-black/45 dark:text-white/45">
            {t('article_interactions_position_question_label')}
          </p>
          <p className="mt-2 text-lg font-semibold leading-7 text-neutral-950 dark:text-neutral-50">
            {opinionQuestion?.question || t('article_interactions_position_question')}
          </p>

          <div className="mt-6 space-y-3">
            <div className="flex items-start justify-between gap-4 text-xs font-medium text-black/50 dark:text-white/50">
              <span className="max-w-[40%] text-left">{opinionQuestion?.thesisA || t('article_interactions_thesis_a')}</span>
              <span className="max-w-[40%] text-right">{opinionQuestion?.thesisB || t('article_interactions_thesis_b')}</span>
            </div>

            <OpinionSlider
              positions={positionValues}
              selected={selectedPosition as PositionValue | null}
              disabled={isConfirmed}
              onSelect={handlePositionSelect}
            />

            <p className={`min-h-[24px] text-center text-sm leading-6 transition-all duration-300 ${
              selectedPosition !== null || lacksContext
                ? 'translate-y-0 font-medium text-neutral-900 opacity-100 dark:text-neutral-100'
                : 'translate-y-1 text-black/35 opacity-80 dark:text-white/35'
            }`}>
              {selectedPosition !== null
                ? t(positionLabels[selectedPosition as PositionValue])
                : lacksContext
                  ? t('article_interactions_lacks_context_selected')
                  : t('article_interactions_position_empty')}
            </p>
          </div>
        </div>

        {isConfirmed && (
          <div className="mt-4 animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-black/5 bg-black/[0.015] p-4 duration-500 dark:border-white/5 dark:bg-white/[0.02]">
            <p className="text-xs font-semibold uppercase text-black/40 dark:text-white/40">
              {t('article_interactions_community_map_label')}
            </p>
            <div className="mt-3 flex h-10 items-end gap-[3px]">
              {positionValues.map((_, i) => (
                <div
                  key={positionValues[i]}
                  className="flex-1 animate-in fade-in slide-in-from-bottom-1 rounded-sm bg-[#38A6A6]/20 dark:bg-[#38A6A6]/15"
                  style={{
                    height: `${Math.max(8, ((opinionCounts[String(positionValues[i])] ?? 0) / maxOpinionCount) * 100)}%`,
                    animationDelay: `${i * 80}ms`,
                    animationFillMode: 'both',
                  }}
                  title={`${opinionCounts[String(positionValues[i])] ?? 0}`}
                />
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-black/40 dark:text-white/40">
              {t('article_interactions_community_map_hint')}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={isConfirmed}
            aria-pressed={lacksContext}
            onClick={handleLacksContext}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-all duration-200 disabled:cursor-default ${
              lacksContext
                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300'
                : 'border-black/10 bg-white text-neutral-800 hover:bg-black/5 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-white/10'
            }`}
          >
            <ShieldQuestion className="h-4 w-4" />
            {t('article_interactions_lacks_context')}
          </button>

          <Button
            type="button"
            onClick={handleConfirmPosition}
            disabled={isConfirmed || !canConfirmPosition || isSubmittingPosition}
            className="h-11 gap-2"
          >
            {isSubmittingPosition ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isConfirmed ? (
              <Lock className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isConfirmed ? t('article_interactions_position_confirmed') : t('article_interactions_confirm_position')}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
              {t('article_interactions_gateway_title')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-black/60 dark:text-white/60">
              {t('article_interactions_gateway_desc')}
            </p>
          </div>
          <Button
            type="button"
            variant={isGatewayOpen ? 'secondary' : 'primary'}
            disabled={hasInsufficientContext || !canContribute}
            onClick={() => {
              if (hasInsufficientContext || !canContribute) return;
              setIsGatewayOpen((open) => !open);
              setSelectedTargetContributionId(null);
              setSubmitMessage(null);
            }}
            className="gap-2"
          >
            {hasInsufficientContext ? (
              <ShieldQuestion className="h-4 w-4" />
            ) : isGatewayOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            {hasInsufficientContext
              ? t('article_interactions_gateway_disabled')
              : isGatewayOpen
                ? t('article_interactions_close_gateway')
                : t('article_interactions_contribute_cta')}
          </Button>
        </div>

        {hasInsufficientContext && (
          <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300">
            {t('article_interactions_gateway_disabled_help')}
          </p>
        )}

        {submitMessage && (
          <p className="mt-4 animate-in fade-in slide-in-from-bottom-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 duration-300 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
            {submitMessage}
          </p>
        )}

        {isGatewayOpen && (
          <div className="mt-5 animate-in fade-in slide-in-from-bottom-2 space-y-5 duration-300">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {contributionTypes.map(({ value, label, description }) => {
                const Icon = typeIcons[value];
                const isSelected = selectedType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleTypeSelect(value)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                      isSelected
                        ? typeTone[value]
                        : 'border-black/10 bg-black/[0.02] hover:border-black/20 hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span className="mt-1 block text-xs leading-5 opacity-70">{description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {selectedType && (
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                noValidate
                className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-black/10 bg-black/[0.02] p-4 duration-200 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${typeTone[selectedType]}`}>
                    {React.createElement(typeIcons[selectedType], { className: 'h-3.5 w-3.5' })}
                    {contributionTypes.find((type) => type.value === selectedType)?.label}
                  </span>
                  {selectedTargetContributionId && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/25 dark:text-sky-300">
                      <ShieldQuestion className="h-3.5 w-3.5" />
                      {t('article_interactions_context_note_badge')}
                    </span>
                  )}
                </div>

                {fieldError && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
                    {fieldError}
                  </p>
                )}

                <div className="mt-4 space-y-4">
                  {selectedType !== 'source' && (
                    <label className="block">
                      <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                        {t('article_interactions_text_label')}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-black/55 dark:text-white/55">
                        {t('article_interactions_text_help')}
                      </span>
                      <textarea
                        value={draftText}
                        onChange={(event) => { setDraftText(event.target.value); setFieldError(null); }}
                        rows={4}
                        disabled={isSubmittingContribution}
                        className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-all duration-200 placeholder:text-black/30 focus:border-[#38A6A6]/50 focus:ring-2 focus:ring-[#38A6A6]/15 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-white/25 dark:focus:border-[#38A6A6]/40"
                        placeholder={t('article_interactions_text_placeholder')}
                      />
                    </label>
                  )}

                  <label className="block">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                      {selectedType === 'source' || selectedTargetContributionId
                        ? t('article_interactions_source_required_label')
                        : t('article_interactions_source_optional_label')}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-black/55 dark:text-white/55">
                      {selectedType === 'source' || selectedTargetContributionId
                        ? t('article_interactions_source_required_help')
                        : t('article_interactions_source_optional_help')}
                    </span>
                    <input
                      type="url"
                      value={draftSourceUrl}
                      onChange={(event) => { setDraftSourceUrl(event.target.value); setFieldError(null); }}
                      disabled={isSubmittingContribution}
                      className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition-all duration-200 placeholder:text-black/30 focus:border-[#38A6A6]/50 focus:ring-2 focus:ring-[#38A6A6]/15 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-white/25 dark:focus:border-[#38A6A6]/40"
                      placeholder="https://"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSubmittingContribution}
                    onClick={() => {
                      setSelectedType(null);
                      setSelectedTargetContributionId(null);
                      resetDraft();
                    }}
                  >
                    {t('cancel')}
                  </Button>
                  <Button type="submit" disabled={isSubmittingContribution} className="gap-2">
                    {isSubmittingContribution ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <PlusCircle className="h-4 w-4" />
                    )}
                    {t('article_interactions_submit_contribution')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {contributions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
              {t('article_interactions_contributions_title')}
            </h3>
            <div className="flex gap-0.5 rounded-lg border border-black/10 p-0.5 dark:border-white/10">
              <button
                type="button"
                onClick={() => changeSort('top')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
                  sortMode === 'top'
                    ? 'bg-black/5 text-neutral-900 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-black/45 hover:text-neutral-900 dark:text-white/45 dark:hover:text-white'
                }`}
              >
                {t('article_interactions_sort_top')}
              </button>
              <button
                type="button"
                onClick={() => changeSort('recent')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
                  sortMode === 'recent'
                    ? 'bg-black/5 text-neutral-900 shadow-sm dark:bg-white/10 dark:text-white'
                    : 'text-black/45 hover:text-neutral-900 dark:text-white/45 dark:hover:text-white'
                }`}
              >
                {t('article_interactions_sort_recent')}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {contributions.map((contribution) => {
              const uiType = API_TO_UI_TYPE[contribution.type];
              const Icon = typeIcons[uiType];
              const positiveValidationCount =
                contribution.validationSummary.WELL_SOURCED + contribution.validationSummary.ADDS_NUANCE;
              const needsCheckCount = contribution.validationSummary.NEEDS_CHECK;
              const isContested =
                needsCheckCount >= CONTESTED_NEEDS_CHECK_THRESHOLD &&
                needsCheckCount > positiveValidationCount;
              const bestCommunityNote = [...(contribution.children || [])]
                .filter((note) => {
                  const noteValidationCount =
                    note.validationSummary.WELL_SOURCED +
                    note.validationSummary.ADDS_NUANCE +
                    note.validationSummary.NEEDS_CHECK;
                  return noteValidationCount > COMMUNITY_NOTE_MIN_VALIDATIONS;
                })
                .sort((a, b) => b.bridgingScore - a.bridgingScore)[0] ?? null;
              const canManageContribution = me?.role === 'ADMIN' || me?.id === contribution.author?.id;
              return (
                <article
                  key={contribution.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:bg-neutral-900 ${
                    isContested
                      ? 'border-amber-300/80 dark:border-amber-700/70'
                      : 'border-black/10 dark:border-white/10'
                  }`}
                >
                  {isContested && (
                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-200">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex gap-2.5">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <p className="text-sm font-medium leading-5">
                            {t('article_interactions_contested_warning')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-semibold text-black/60 dark:bg-white/10 dark:text-white/70">
                      {getAuthorInitials(contribution.author)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${typeTone[uiType]}`}>
                          <Icon className="h-3.5 w-3.5" />
                          {contributionTypes.find((type) => type.value === uiType)?.label}
                        </span>
                        {contribution.editCount > 0 && (
                          <span className="text-xs font-medium text-black/40 dark:text-white/40">
                            {t('article_interactions_edited_badge')}
                          </span>
                        )}
                        <span className="ml-auto flex flex-wrap gap-1">
                          {canManageContribution && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditingContribution(contribution)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-black/50 transition hover:bg-black/5 hover:text-neutral-900 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {t('edit')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteContribution(contribution.id)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/25"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {t('delete')}
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            disabled={!canValidate}
                            onClick={() => {
                              setReportingContributionId((current) => current === contribution.id ? null : contribution.id);
                              setEditingContributionId(null);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-black/50 transition hover:bg-black/5 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-45 dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
                          >
                            <Flag className="h-3.5 w-3.5" />
                            {t('article_interactions_report')}
                          </button>
                        </span>
                      </div>
                      {editingContributionId === contribution.id ? (
                        <form onSubmit={(event) => handleEditSubmit(event, contribution)} className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
                          {fieldError && (
                            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400">
                              {fieldError}
                            </p>
                          )}
                          {contribution.type !== 'SOURCE' && (
                            <textarea
                              value={editingText}
                              onChange={(event) => { setEditingText(event.target.value); setFieldError(null); }}
                              rows={4}
                              className="w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-[#38A6A6]/50 focus:ring-2 focus:ring-[#38A6A6]/15 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                            />
                          )}
                          <input
                            type="url"
                            value={editingSourceUrl}
                            onChange={(event) => { setEditingSourceUrl(event.target.value); setFieldError(null); }}
                            placeholder="https://"
                            className="mt-3 w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-neutral-900 outline-none transition focus:border-[#38A6A6]/50 focus:ring-2 focus:ring-[#38A6A6]/15 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                          />
                          <div className="mt-3 flex justify-end gap-2">
                            <Button type="button" variant="ghost" onClick={() => setEditingContributionId(null)}>
                              {t('cancel')}
                            </Button>
                            <Button type="submit">
                              {t('save')}
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div>
                        <p className="mt-3 text-sm leading-6 text-neutral-800 dark:text-neutral-100">
                          {contribution.text}
                        </p>
                        {contribution.sourceUrl && (() => {
                          let hostname = '';
                          try { hostname = new URL(contribution.sourceUrl).hostname.replace(/^www\./, ''); } catch { hostname = contribution.sourceUrl; }
                          return (
                            <a
                              href={contribution.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex max-w-full items-center gap-2.5 rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 transition-all duration-200 hover:border-black/20 hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
                            >
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                                alt=""
                                className="h-4 w-4 shrink-0 rounded-sm"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <span className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-700 dark:text-neutral-200">
                                {hostname}
                              </span>
                              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-black/30 dark:text-white/30" />
                            </a>
                          );
                        })()}
                      </div>
                      )}
                    </div>
                  </div>
                  {reportingContributionId === contribution.id && (
                    <form onSubmit={(event) => handleReportSubmit(event, contribution.id)} className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                      <div className="grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
                        <label className="block">
                          <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                            {t('article_interactions_report_reason')}
                          </span>
                          <select
                            value={reportReason}
                            onChange={(event) => setReportReason(event.target.value as ContributionReportReason)}
                            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-sm text-neutral-900 dark:border-amber-900/60 dark:bg-neutral-950 dark:text-neutral-100"
                          >
                            {reportReasons.map((reason) => (
                              <option key={reason} value={reason}>{t(`article_interactions_report_reason_${reason.toLowerCase()}`)}</option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                            {t('article_interactions_report_details')}
                          </span>
                          <input
                            value={reportDetails}
                            onChange={(event) => setReportDetails(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-sm text-neutral-900 dark:border-amber-900/60 dark:bg-neutral-950 dark:text-neutral-100"
                          />
                        </label>
                        <Button type="submit" variant="secondary">
                          {t('article_interactions_report_submit')}
                        </Button>
                      </div>
                    </form>
                  )}
                  {bestCommunityNote && (
                    <div className="ml-0 mt-4 rounded-xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-900/60 dark:bg-sky-950/25 sm:ml-[52px]">
                      <div className="flex gap-2.5">
                        <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-sky-700 dark:text-sky-300" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase text-sky-700 dark:text-sky-300">
                            {t('article_interactions_best_note_label')}
                          </p>
                          <p className="mt-1 text-sm leading-6 text-neutral-800 dark:text-neutral-100">
                            {bestCommunityNote.text}
                          </p>
                          {bestCommunityNote.sourceUrl && (() => {
                            let hostname = '';
                            try { hostname = new URL(bestCommunityNote.sourceUrl).hostname.replace(/^www\./, ''); } catch { hostname = bestCommunityNote.sourceUrl; }
                            return (
                              <a
                                href={bestCommunityNote.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-sky-200 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-sky-800 transition hover:bg-white dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-200 dark:hover:bg-sky-900/30"
                              >
                                <span className="truncate">{hostname}</span>
                                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                              </a>
                            );
                          })()}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {([
                              { type: 'WELL_SOURCED' as ValidationType, label: t('article_interactions_validate_sourced') },
                              { type: 'ADDS_NUANCE' as ValidationType, label: t('article_interactions_validate_nuance') },
                              { type: 'NEEDS_CHECK' as ValidationType, label: t('article_interactions_validate_check') },
                            ]).map(({ type: vType, label }) => {
                              const isActive = bestCommunityNote.currentUserValidations.includes(vType);
                              const count = bestCommunityNote.validationSummary[vType];
                              return (
                                <button
                                  key={vType}
                                  type="button"
                                  disabled={!canValidate}
                                  onClick={() => toggleValidation(bestCommunityNote.id, vType)}
                                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                                    isActive
                                      ? 'border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100'
                                      : 'border-sky-200 text-sky-800 hover:bg-sky-100 dark:border-sky-900/70 dark:text-sky-200 dark:hover:bg-sky-900/30'
                                  }`}
                                >
                                  {label}{count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-3 dark:border-white/5">
                    {([
                      { type: 'WELL_SOURCED' as ValidationType, label: t('article_interactions_validate_sourced') },
                      { type: 'ADDS_NUANCE' as ValidationType, label: t('article_interactions_validate_nuance') },
                    ]).map(({ type: vType, label }) => {
                      const isActive = contribution.currentUserValidations.includes(vType);
                      const count = contribution.validationSummary[vType];
                      return (
                        <button
                          key={vType}
                          type="button"
                          disabled={!canValidate}
                          onClick={() => toggleValidation(contribution.id, vType)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${
                            isActive
                              ? 'border-[#38A6A6]/40 bg-[#38A6A6]/10 text-[#2C8585] dark:border-[#38A6A6]/30 dark:bg-[#38A6A6]/10 dark:text-[#78DCE3]'
                              : 'border-black/10 text-black/65 hover:border-black/20 hover:bg-black/5 dark:border-white/10 dark:text-white/65 dark:hover:border-white/20 dark:hover:bg-white/10'
                          }`}
                        >
                          {label}{count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      disabled={!canValidate}
                      onClick={() => handleAddContext(contribution.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-800 transition-all duration-200 hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent dark:border-amber-900/60 dark:text-amber-300 dark:hover:border-amber-800 dark:hover:bg-amber-950/25"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                      {t('article_interactions_add_context')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
