import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FilePlus2,
  Lock,
  Loader2,
  PlusCircle,
  Scale,
  ShieldQuestion,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nContext';
import { useArticleInteractions, type ContributionType as ApiContributionType, type ValidationType, type SortMode, type Contribution as ApiContribution } from '@/hooks/useArticleInteractions';

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

type OpinionSliderProps = {
  positions: PositionValue[];
  selected: PositionValue | null;
  disabled: boolean;
  onSelect: (position: PositionValue) => void;
};

function OpinionSlider({ positions, selected, disabled, onSelect }: OpinionSliderProps) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const getSnapIndex = React.useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return -1;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * (positions.length - 1));
  }, [positions.length]);

  const handleInteraction = React.useCallback((clientX: number) => {
    if (disabled) return;
    const index = getSnapIndex(clientX);
    if (index >= 0 && index < positions.length) {
      onSelect(positions[index]);
    }
  }, [disabled, getSnapIndex, onSelect, positions]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    handleInteraction(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    handleInteraction(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  const selectedIndex = selected !== null ? positions.indexOf(selected) : -1;
  const thumbPercent = selectedIndex >= 0 ? (selectedIndex / (positions.length - 1)) * 100 : -1;

  return (
    <div
      ref={trackRef}
      className={`relative select-none px-3 py-6 ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="relative h-[3px] rounded-full bg-gradient-to-r from-black/10 via-black/5 to-black/10 dark:from-white/10 dark:via-white/5 dark:to-white/10">
        {positions.map((position, i) => {
          const percent = (i / (positions.length - 1)) * 100;
          const isActive = position === selected;
          return (
            <span
              key={position}
              className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-150 ${
                isActive
                  ? 'h-2.5 w-2.5 bg-[#00dc82]/40'
                  : 'h-[7px] w-[7px] bg-black/15 dark:bg-white/20'
              }`}
              style={{ left: `${percent}%` }}
            />
          );
        })}

        {thumbPercent >= 0 && (
          <span
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] ${isDragging ? 'duration-0' : 'duration-200'}`}
            style={{ left: `${thumbPercent}%` }}
          >
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-[2.5px] border-[#00dc82] bg-white shadow-lg ring-[6px] ring-[#00dc82]/10 transition-transform dark:bg-neutral-900 ${isDragging ? 'scale-110' : ''}`}>
              <span className="h-2.5 w-2.5 rounded-full bg-[#00dc82]" />
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function ArticleInteractionSpace({ articleSlug }: Props) {
  const { t } = useI18n();
  const {
    isLoading,
    isSubmittingPosition,
    isSubmittingContribution,
    error,
    clearError,
    currentPosition,
    contributions,
    canContribute,
    canValidate,
    sortMode,
    changeSort,
    submitPosition,
    submitContribution,
    toggleValidation,
  } = useArticleInteractions(articleSlug);

  const [selectedPosition, setSelectedPosition] = React.useState<number | null>(null);
  const [lacksContext, setLacksContext] = React.useState(false);
  const [isGatewayOpen, setIsGatewayOpen] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<UIContributionType | null>(null);
  const [draftText, setDraftText] = React.useState('');
  const [draftSourceUrl, setDraftSourceUrl] = React.useState('');
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null);

  const isConfirmed = currentPosition !== null;
  const hasInsufficientContext = isConfirmed && (currentPosition?.lacksContext ?? false);
  const canConfirmPosition = selectedPosition !== null || lacksContext;

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
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedType || isSubmittingContribution) return;

    const text = draftText.trim();
    const sourceUrl = draftSourceUrl.trim();

    if (selectedType === 'source' && !sourceUrl) return;
    if (selectedType !== 'source' && !text) return;

    const apiType = UI_TO_API_TYPE[selectedType];
    const success = await submitContribution(apiType, text || ' ', sourceUrl || undefined);

    if (success) {
      setSubmitMessage(t('article_interactions_contribution_submitted'));
      setSelectedType(null);
      resetDraft();
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
            <div className="mt-6 flex justify-between gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="h-6 w-6 animate-pulse rounded-full bg-black/10 dark:bg-white/10" />
                  <div className="h-3 w-6 animate-pulse rounded bg-black/10 dark:bg-white/10" />
                </div>
              ))}
            </div>
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
              : error}
        </div>
      )}

      <div className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-neutral-900 sm:p-5 ${
        isConfirmed
          ? 'border-[#00dc82]/40 dark:border-[#00dc82]/30'
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
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#00dc82]/40 bg-[#00dc82]/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
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
            {t('article_interactions_position_question')}
          </p>

          <div className="mt-6 space-y-5">
            <div className="flex items-start justify-between gap-4 text-xs font-medium text-black/50 dark:text-white/50">
              <span className="max-w-[40%] text-left">{t('article_interactions_thesis_a')}</span>
              <span className="max-w-[40%] text-right">{t('article_interactions_thesis_b')}</span>
            </div>

            <OpinionSlider
              positions={positionValues}
              selected={selectedPosition as PositionValue | null}
              disabled={isConfirmed}
              onSelect={handlePositionSelect}
            />

            <p className={`text-center text-sm leading-6 transition-colors ${
              selectedPosition !== null || lacksContext
                ? 'font-medium text-neutral-900 dark:text-neutral-100'
                : 'text-black/40 dark:text-white/40'
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
          <div className="mt-4 rounded-2xl border border-black/5 bg-black/[0.015] p-4 dark:border-white/5 dark:bg-white/[0.02]">
            <p className="text-xs font-semibold uppercase text-black/40 dark:text-white/40">
              {t('article_interactions_community_map_label')}
            </p>
            <div className="mt-3 flex h-10 items-end gap-[3px]">
              {positionValues.map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-[#00dc82]/20 dark:bg-[#00dc82]/15"
                  style={{ height: `${20 + Math.random() * 60}%` }}
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
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition disabled:cursor-default ${
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
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
            {submitMessage}
          </p>
        )}

        {isGatewayOpen && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {contributionTypes.map(({ value, label, description }) => {
                const Icon = typeIcons[value];
                const isSelected = selectedType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleTypeSelect(value)}
                    className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                      isSelected
                        ? typeTone[value]
                        : 'border-black/10 bg-black/[0.02] hover:bg-black/5 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/10'
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
              <form onSubmit={handleSubmit} className="rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${typeTone[selectedType]}`}>
                    {React.createElement(typeIcons[selectedType], { className: 'h-3.5 w-3.5' })}
                    {contributionTypes.find((type) => type.value === selectedType)?.label}
                  </span>
                </div>

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
                        onChange={(event) => setDraftText(event.target.value)}
                        rows={4}
                        required
                        disabled={isSubmittingContribution}
                        className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-[#4290D3] focus:ring-2 focus:ring-[#4290D3]/25 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                        placeholder={t('article_interactions_text_placeholder')}
                      />
                    </label>
                  )}

                  <label className="block">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                      {selectedType === 'source'
                        ? t('article_interactions_source_required_label')
                        : t('article_interactions_source_optional_label')}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-black/55 dark:text-white/55">
                      {selectedType === 'source'
                        ? t('article_interactions_source_required_help')
                        : t('article_interactions_source_optional_help')}
                    </span>
                    <input
                      type="url"
                      value={draftSourceUrl}
                      onChange={(event) => setDraftSourceUrl(event.target.value)}
                      required={selectedType === 'source'}
                      disabled={isSubmittingContribution}
                      className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-[#4290D3] focus:ring-2 focus:ring-[#4290D3]/25 disabled:opacity-50 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
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
            <div className="flex gap-1 rounded-lg border border-black/10 p-0.5 dark:border-white/10">
              <button
                type="button"
                onClick={() => changeSort('top')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  sortMode === 'top'
                    ? 'bg-black/5 text-neutral-900 dark:bg-white/10 dark:text-white'
                    : 'text-black/50 hover:text-neutral-900 dark:text-white/50 dark:hover:text-white'
                }`}
              >
                {t('article_interactions_sort_top')}
              </button>
              <button
                type="button"
                onClick={() => changeSort('recent')}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  sortMode === 'recent'
                    ? 'bg-black/5 text-neutral-900 dark:bg-white/10 dark:text-white'
                    : 'text-black/50 hover:text-neutral-900 dark:text-white/50 dark:hover:text-white'
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
              return (
                <article
                  key={contribution.id}
                  className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900"
                >
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
                      </div>
                      <p className="mt-3 text-sm leading-6 text-neutral-800 dark:text-neutral-100">
                        {contribution.text}
                      </p>
                      {contribution.sourceUrl && (
                        <a
                          href={contribution.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-white/10 dark:text-blue-300 dark:hover:bg-blue-950/20"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{t('article_interactions_source_link')}</span>
                          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-black/5 pt-3 dark:border-white/5">
                    {([
                      { type: 'WELL_SOURCED' as ValidationType, label: t('article_interactions_validate_sourced') },
                      { type: 'ADDS_NUANCE' as ValidationType, label: t('article_interactions_validate_nuance') },
                      { type: 'NEEDS_CHECK' as ValidationType, label: t('article_interactions_validate_check') },
                    ]).map(({ type: vType, label }) => {
                      const isActive = contribution.currentUserValidations.includes(vType);
                      const count = contribution.validationSummary[vType];
                      return (
                        <button
                          key={vType}
                          type="button"
                          disabled={!canValidate}
                          onClick={() => toggleValidation(contribution.id, vType)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent ${
                            isActive
                              ? 'border-[#00dc82]/40 bg-[#00dc82]/10 text-emerald-700 dark:border-[#00dc82]/30 dark:bg-[#00dc82]/10 dark:text-emerald-300'
                              : 'border-black/10 text-black/65 hover:bg-black/5 dark:border-white/10 dark:text-white/65 dark:hover:bg-white/10'
                          }`}
                        >
                          {label}{count > 0 && <span className="ml-1.5 tabular-nums opacity-70">{count}</span>}
                        </button>
                      );
                    })}
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
