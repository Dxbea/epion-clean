import React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  ExternalLink,
  FilePlus2,
  Lock,
  PlusCircle,
  Scale,
  ShieldQuestion,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { useI18n } from '@/i18n/I18nContext';

type ContributionType = 'source' | 'nuance' | 'contradiction' | 'question' | 'correction';
type PositionValue = -1 | -0.6 | -0.2 | 0.2 | 0.6 | 1;

type Contribution = {
  id: string;
  type: ContributionType;
  text: string;
  sourceUrl?: string;
  author: string;
  local?: boolean;
};

const typeTone: Record<ContributionType, string> = {
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

const typeIcons: Record<ContributionType, React.ComponentType<{ className?: string }>> = {
  source: FilePlus2,
  nuance: Scale,
  contradiction: AlertTriangle,
  question: CircleHelp,
  correction: CheckCircle2,
};

export default function ArticleInteractionSpace() {
  const { t } = useI18n();
  const [selectedPosition, setSelectedPosition] = React.useState<number | null>(null);
  const [lacksContext, setLacksContext] = React.useState(false);
  const [isConfirmed, setIsConfirmed] = React.useState(false);
  const [isGatewayOpen, setIsGatewayOpen] = React.useState(false);
  const [selectedType, setSelectedType] = React.useState<ContributionType | null>(null);
  const [draftText, setDraftText] = React.useState('');
  const [draftSourceUrl, setDraftSourceUrl] = React.useState('');
  const [submittedContributions, setSubmittedContributions] = React.useState<Contribution[]>([]);
  const [submitMessage, setSubmitMessage] = React.useState<string | null>(null);

  const canConfirmPosition = selectedPosition !== null || lacksContext;
  const hasInsufficientContext = isConfirmed && lacksContext;

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

  const mockContributions = React.useMemo<Contribution[]>(
    () => [
      {
        id: 'mock-source',
        type: 'source',
        text: t('article_interactions_mock_source_text'),
        sourceUrl: 'https://example.com/source',
        author: 'ML',
      },
      {
        id: 'mock-nuance',
        type: 'nuance',
        text: t('article_interactions_mock_nuance_text'),
        author: 'AR',
      },
      {
        id: 'mock-question',
        type: 'question',
        text: t('article_interactions_mock_question_text'),
        author: 'EP',
      },
    ],
    [t]
  );

  const resetDraft = (clearMessage = true) => {
    setDraftText('');
    setDraftSourceUrl('');
    if (clearMessage) setSubmitMessage(null);
  };

  const handlePositionSelect = (position: PositionValue) => {
    if (isConfirmed) return;
    setSelectedPosition(position);
    setLacksContext(false);
  };

  const handleLacksContext = () => {
    if (isConfirmed) return;
    setSelectedPosition(null);
    setLacksContext(true);
  };

  const handleConfirmPosition = () => {
    if (!canConfirmPosition || isConfirmed) return;
    setIsConfirmed(true);

    if (lacksContext) {
      setIsGatewayOpen(false);
      setSelectedType(null);
      resetDraft();
    }
  };

  const handleTypeSelect = (type: ContributionType) => {
    setSelectedType(type);
    resetDraft();
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedType) return;

    const text = draftText.trim();
    const sourceUrl = draftSourceUrl.trim();

    if (selectedType === 'source' && !sourceUrl) return;
    if (selectedType !== 'source' && !text) return;

    const fallbackText = selectedType === 'source'
      ? t('article_interactions_source_added_text')
      : text;

    setSubmittedContributions((current) => [
      {
        id: `local-${Date.now()}`,
        type: selectedType,
        text: fallbackText,
        sourceUrl: sourceUrl || undefined,
        author: t('article_interactions_local_author'),
        local: true,
      },
      ...current,
    ]);
    setSubmitMessage(t('article_interactions_saved_locally'));
    setSelectedType(null);
    resetDraft(false);
  };

  const displayedContributions = [...submittedContributions, ...mockContributions];

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

          <div className="mt-6 space-y-4">
            <div className="flex items-start justify-between gap-4 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              <span className="max-w-[45%] text-left">{t('article_interactions_thesis_a')}</span>
              <span className="max-w-[45%] text-right">{t('article_interactions_thesis_b')}</span>
            </div>

            <div className="relative px-1 py-4">
              <div className="absolute left-5 right-5 top-1/2 h-1 -translate-y-1/2 rounded-full bg-black/10 dark:bg-white/10" />
              <div className="relative grid grid-cols-6 gap-1">
                {positionValues.map((position) => {
                  const isSelected = selectedPosition === position;
                  return (
                    <button
                      key={position}
                      type="button"
                      disabled={isConfirmed}
                      aria-pressed={isSelected}
                      onClick={() => handlePositionSelect(position)}
                      className={`group flex min-h-[54px] flex-col items-center justify-center gap-2 rounded-xl transition disabled:cursor-default ${
                        isSelected
                          ? 'text-neutral-950 dark:text-white'
                          : 'text-black/45 hover:text-neutral-900 dark:text-white/45 dark:hover:text-white'
                      }`}
                    >
                      <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-white transition dark:bg-neutral-900 ${
                        isSelected
                          ? 'border-[#00dc82] shadow-sm ring-4 ring-[#00dc82]/15'
                          : 'border-black/20 group-hover:border-black/40 dark:border-white/25 dark:group-hover:border-white/50'
                      }`}>
                        {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-[#00dc82]" />}
                      </span>
                      <span className="text-[11px] font-semibold tabular-nums">{position}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-[44px] rounded-xl border border-dashed border-black/10 bg-white px-3 py-2 text-sm leading-6 text-black/60 dark:border-white/10 dark:bg-neutral-950/40 dark:text-white/60">
              {selectedPosition !== null ? (
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {t(positionLabels[selectedPosition as PositionValue])}
                </span>
              ) : lacksContext ? (
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {t('article_interactions_lacks_context_selected')}
                </span>
              ) : (
                t('article_interactions_position_empty')
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            disabled={isConfirmed}
            aria-pressed={lacksContext}
            onClick={handleLacksContext}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-default ${
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
            disabled={isConfirmed || !canConfirmPosition}
            className="gap-2"
          >
            {isConfirmed ? <Lock className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
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
            disabled={hasInsufficientContext}
            onClick={() => {
              if (hasInsufficientContext) return;
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
                  <span className="text-xs text-black/50 dark:text-white/50">
                    {t('article_interactions_form_local_hint')}
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
                        className="mt-2 w-full resize-y rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-[#4290D3] focus:ring-2 focus:ring-[#4290D3]/25 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
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
                      className="mt-2 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900 outline-none transition focus:border-[#4290D3] focus:ring-2 focus:ring-[#4290D3]/25 dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100"
                      placeholder="https://"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSelectedType(null);
                      resetDraft();
                    }}
                  >
                    {t('cancel')}
                  </Button>
                  <Button type="submit" className="gap-2">
                    <PlusCircle className="h-4 w-4" />
                    {t('article_interactions_submit_local')}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
            {t('article_interactions_contributions_title')}
          </h3>
          <span className="text-xs text-black/50 dark:text-white/50">
            {submittedContributions.length > 0
              ? t('article_interactions_local_list_hint')
              : t('article_interactions_mock_list_hint')}
          </span>
        </div>

        <div className="space-y-3">
          {displayedContributions.map((contribution) => {
            const Icon = typeIcons[contribution.type];
            return (
              <article
                key={contribution.id}
                className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-neutral-900"
              >
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-xs font-semibold text-black/60 dark:bg-white/10 dark:text-white/70">
                    {contribution.author}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${typeTone[contribution.type]}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {contributionTypes.find((type) => type.value === contribution.type)?.label}
                      </span>
                      {contribution.local && (
                        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-medium text-black/55 dark:bg-white/10 dark:text-white/55">
                          {t('article_interactions_local_badge')}
                        </span>
                      )}
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
                  {[t('article_interactions_validate_sourced'), t('article_interactions_validate_nuance'), t('article_interactions_validate_check')].map((label) => (
                    <button
                      key={label}
                      type="button"
                      disabled={hasInsufficientContext}
                      className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black/65 transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent dark:border-white/10 dark:text-white/65 dark:hover:bg-white/10 dark:disabled:hover:bg-transparent"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
