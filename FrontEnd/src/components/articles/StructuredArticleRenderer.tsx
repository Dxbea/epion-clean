import React from 'react';
import { Link2 } from 'lucide-react';
import type {
  StructuredArticleClaim,
  StructuredArticleContent,
  StructuredArticleItem,
  StructuredArticleSection,
} from '@/types/structuredArticle';
import MarkdownRenderer from '@/components/shared/MarkdownRenderer';
import { getSourceKey } from '@/lib/structured-article';

type StructuredArticleRendererProps = {
  article: StructuredArticleContent;
  sources?: any[];
  selectedSourceKey?: string | null;
  selectedClaimId?: string | null;
  onSourceClick?: (sourceKey: string) => void;
  onClaimClick?: (claim: StructuredArticleClaim) => void;
};

const sectionOrder: Record<string, number> = {
  summary: 0,
  facts: 1,
  context: 2,
  analysis: 3,
  limits: 4,
};

function itemClaimIds(item: StructuredArticleItem): string[] {
  return item.claimIds || [];
}

function sectionClaims(section: StructuredArticleSection, claims: StructuredArticleClaim[]): StructuredArticleClaim[] {
  const itemIds = new Set(section.items?.flatMap(itemClaimIds) || []);
  return claims.filter((claim) => claim.sectionId === section.id || itemIds.has(claim.id));
}

function claimUsesSelectedSource(claim: StructuredArticleClaim, selectedSourceKey?: string | null): boolean {
  if (!selectedSourceKey) return false;
  return (claim.sourceIds || []).includes(selectedSourceKey);
}

function ClaimButton({
  claim,
  active,
  selectedBySource,
  onClick,
}: {
  claim: StructuredArticleClaim;
  active: boolean;
  selectedBySource: boolean;
  onClick?: (claim: StructuredArticleClaim) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(claim)}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors ${
        active || selectedBySource
          ? 'border-[#00dc82] bg-[#00dc82]/15 text-black dark:text-white'
          : 'border-black/10 bg-black/[0.03] text-black/70 hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70 dark:hover:bg-white/[0.1]'
      }`}
    >
      <Link2 className="h-3 w-3" aria-hidden="true" />
      <span>{claim.sourceIds?.length || claim.sourceUrls?.length || 0}</span>
    </button>
  );
}

function SectionBlock({
  section,
  claims,
  selectedSourceKey,
  selectedClaimId,
  onClaimClick,
}: {
  section: StructuredArticleSection;
  claims: StructuredArticleClaim[];
  selectedSourceKey?: string | null;
  selectedClaimId?: string | null;
  onClaimClick?: (claim: StructuredArticleClaim) => void;
}) {
  const relatedClaims = sectionClaims(section, claims);

  return (
    <section className="border-t border-black/10 pt-7 first:border-t-0 first:pt-0 dark:border-white/10">
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-black dark:text-white">
          {section.title}
        </h2>
        {relatedClaims.length > 0 && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5 pt-1">
            {relatedClaims.slice(0, 4).map((claim) => (
              <ClaimButton
                key={claim.id}
                claim={claim}
                active={selectedClaimId === claim.id}
                selectedBySource={claimUsesSelectedSource(claim, selectedSourceKey)}
                onClick={onClaimClick}
              />
            ))}
          </div>
        )}
      </div>

      {section.body && (
        <MarkdownRenderer
          content={section.body}
          className="text-base"
        />
      )}

      {section.items?.length ? (
        <ul className="mt-3 space-y-2">
          {section.items.map((item, index) => {
            const active = item.claimIds?.includes(selectedClaimId || '') ||
              item.sourceIds?.includes(selectedSourceKey || '');

            return (
              <li
                key={item.id || index}
                className={`rounded-md border-l-2 py-1 pl-3 text-base leading-7 ${
                  active
                    ? 'border-[#00dc82] bg-[#00dc82]/10'
                    : 'border-black/10 dark:border-white/10'
                }`}
              >
                {item.text}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export default function StructuredArticleRenderer({
  article,
  sources = [],
  selectedSourceKey,
  selectedClaimId,
  onSourceClick,
  onClaimClick,
}: StructuredArticleRendererProps) {
  const sections = [...article.sections].sort((a, b) => {
    return (sectionOrder[a.type] ?? 99) - (sectionOrder[b.type] ?? 99);
  });

  return (
    <div className="space-y-8">
      {(article.lead?.summary || article.lead?.keyTakeaways?.length) && (
        <section className="space-y-4 border-b border-black/10 pb-6 dark:border-white/10">
          {article.lead?.summary && (
            <p className="text-lg leading-8 text-black/80 dark:text-white/80">
              {article.lead.summary}
            </p>
          )}

          {article.lead?.keyTakeaways?.length ? (
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {article.lead.keyTakeaways.map((item, index) => (
                <li
                  key={index}
                  className="rounded-md border border-black/10 px-3 py-2 text-black/75 dark:border-white/10 dark:text-white/75"
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          claims={article.claims || []}
          selectedSourceKey={selectedSourceKey}
          selectedClaimId={selectedClaimId}
          onClaimClick={onClaimClick}
        />
      ))}

      {sources.length > 0 && onSourceClick && selectedClaimId && (
        <div className="flex flex-wrap gap-2 border-t border-black/10 pt-4 dark:border-white/10">
          {(article.claims || [])
            .filter((claim) => claim.id === selectedClaimId)
            .flatMap((claim) => claim.sourceIds || [])
            .map((key) => {
              const source = sources.find((candidate, index) => getSourceKey(candidate, index) === key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSourceClick(key)}
                  className="rounded-full border border-black/10 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/10"
                >
                  {source?.domain || source?.name || key}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
