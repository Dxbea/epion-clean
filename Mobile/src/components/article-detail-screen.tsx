import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, PanResponder, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, Forward, Heart, Highlighter, MessageSquare, Info, Star, ThumbsUp, ThumbsDown, Repeat2, X, ShieldCheck, BrainCircuit, AlertTriangle, ShieldAlert } from 'lucide-react-native';

import { useTheme } from '@/hooks/use-theme';
import { Fonts, FontSize, Radius, Spacing } from '@/constants/theme';
import {
  WEB_ORIGIN,
  fetchArticleComments,
  fetchArticleInteractions,
  fetchArticleReactions,
  fetchArticleStats,
  fetchFavoriteArticleIds,
  postArticleComment,
  submitArticleContribution,
  submitArticleOpinionPosition,
  recordArticleView,
  removeFavoriteArticle,
  saveFavoriteArticle,
  createChatSession,
  toggleArticleContributionValidation,
  toggleArticleReaction,
  toggleArticleRepost,
  updateContributionTree,
} from '@/lib/api';
import type {
  ArticleComment,
  ArticleContribution,
  ArticleContributionType,
  ArticleDetail,
  ArticleFactCheckDetail,
  ArticleInteractions,
  ArticleInteractionsSortMode,
  ArticleReactionSummary,
  ArticleSource,
  ArticleValidationType,
} from '@/types/article';

// --- CONSTANTS ---

type ArticleDetailScreenProps = {
  loadArticle: () => Promise<ArticleDetail | null>;
  missingText?: string;
};

const EMPTY_REACTIONS: ArticleReactionSummary = {
  likes: 0,
  dislikes: 0,
  reposts: 0,
  userReaction: null,
  userReposted: false,
};
const POSITION_VALUES = [-1, -0.6, -0.2, 0.2, 0.6, 1];
const EMPTY_ADVANCED_INTERACTIONS: ArticleInteractions = {
  opinionQuestion: null,
  allowedPositions: POSITION_VALUES,
  currentUserOpinionPosition: null,
  hasInsufficientContext: false,
  canContribute: false,
  canValidateContributions: false,
  opinionDistribution: {
    counts: Object.fromEntries(POSITION_VALUES.map((position) => [String(position), 0])),
    total: 0,
    lacksContextCount: 0,
  },
  contributions: [],
};
const POSITION_LABELS: Record<string, string> = {
  '-1': 'Fortement A',
  '-0.6': 'Modérément A',
  '-0.2': 'Légèrement A',
  '0.2': 'Légèrement B',
  '0.6': 'Modérément B',
  '1': 'Fortement B',
};

const CONTRIBUTION_TYPES: Array<{
  type: ArticleContributionType;
  label: string;
  help: string;
  colors: { border: string; bg: string; text: string };
}> = [
  { type: 'SOURCE', label: 'Source', help: 'Ajouter une source vérifiable.', colors: { border: '#BFDBFE', bg: '#EFF6FF', text: '#1D4ED8' } },
  { type: 'NUANCE', label: 'Nuance', help: 'Ajouter du contexte ou une distinction.', colors: { border: '#FDE68A', bg: '#FFFBEB', text: '#92400E' } },
  { type: 'CONTRADICTION', label: 'Contradiction', help: 'Signaler un conflit avec un élément.', colors: { border: '#FECACA', bg: '#FEF2F2', text: '#B91C1C' } },
  { type: 'QUESTION', label: 'Question', help: 'Ouvrir un point précis à clarifier.', colors: { border: '#BAE6FD', bg: '#F0F9FF', text: '#0369A1' } },
  { type: 'CORRECTION', label: 'Correction', help: 'Proposer une correction factuelle.', colors: { border: '#A7F3D0', bg: '#ECFDF5', text: '#065F46' } },
];

const VALIDATION_TYPES: Array<{ type: ArticleValidationType; label: string }> = [
  { type: 'WELL_SOURCED', label: 'Bien sourcé' },
  { type: 'ADDS_NUANCE', label: 'Nuance' },
  { type: 'NEEDS_CHECK', label: 'À vérifier' },
];

const EPION_GREEN = '#00dc82';

// --- HELPERS ---

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function scoreStatusLabel(status?: string): string | undefined {
  if (!status || status === 'COMPLETED') return undefined;
  if (status === 'PENDING') return 'Analyse en attente';
  if (status === 'RUNNING') return 'Analyse en cours';
  if (status === 'FAILED') return 'Analyse indisponible';
  if (status === 'STALE') return 'Score basé sur une version précédente';
  return status;
}

function getScoreColor(score: number | undefined): string {
  if (score === undefined) return '#888888';
  if (score >= 80) return '#10B981';
  if (score >= 45) return '#EAB308';
  if (score >= 20) return '#F97316';
  return '#EF4444';
}

function getScoreLabel(score: number | undefined): string {
  if (score === undefined) return 'Non évalué';
  if (score >= 80) return 'Fiable';
  if (score >= 45) return 'Moyen';
  if (score >= 20) return 'Faible';
  return 'Critique';
}

function getSupportLabel(score: number | undefined): string {
  if (score === undefined) return 'Appui non évalué';
  if (score >= 90) return 'Très solide';
  if (score >= 70) return 'Solide';
  if (score >= 50) return 'À nuancer';
  if (score >= 30) return 'Fragile';
  return 'À vérifier';
}

function contributionAuthorLabel(contribution: ArticleContribution): string {
  return contribution.author?.name ?? contribution.author?.username ?? 'Contributeur Epion';
}

function getContributionTypeInfo(type: ArticleContributionType) {
  return CONTRIBUTION_TYPES.find((item) => item.type === type) ?? CONTRIBUTION_TYPES[1];
}

function validUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

const CITATION_RE = /\[\d+(?:,\s*\d+)*\]/;
const HIGHLIGHT_STYLE = { backgroundColor: '#00dc8230', borderLeftWidth: 3, borderLeftColor: '#00dc82', paddingLeft: 8, paddingVertical: 2, borderRadius: 4 } as const;

function renderMarkdownContent(body: string, textColor: string, headingColor: string, mutedColor: string, _borderColor: string, highlightSources?: boolean): React.ReactNode[] {
  const lines = body.split('\n');
  const elements: React.ReactNode[] = [];
  let blockquoteBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushBlockquote = () => {
    if (blockquoteBuffer.length === 0) return;
    elements.push(
      <View key={`bq-${elements.length}`} style={[ms.blockquote, { borderLeftColor: EPION_GREEN + '60' }]}>
        <Text style={[ms.blockquoteText, { color: mutedColor }]}>{blockquoteBuffer.join('\n')}</Text>
      </View>,
    );
    blockquoteBuffer = [];
  };

  const flushList = () => {
    if (listBuffer.length === 0) return;
    elements.push(
      <View key={`list-${elements.length}`} style={ms.list}>
        {listBuffer.map((item, i) => (
          <View key={i} style={ms.listItem}>
            <Text style={[ms.listBullet, { color: EPION_GREEN }]}>•</Text>
            <Text style={[ms.listItemText, { color: textColor }]}>{item}</Text>
          </View>
        ))}
      </View>,
    );
    listBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('> ')) {
      flushList();
      blockquoteBuffer.push(trimmed.slice(2));
      continue;
    }
    flushBlockquote();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s|^\d+\.\s/, '');
      listBuffer.push(content);
      continue;
    }
    flushList();

    if (trimmed === '') {
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(<Text key={`h3-${i}`} style={[ms.h3, { color: headingColor }]}>{trimmed.slice(4)}</Text>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<Text key={`h2-${i}`} style={[ms.h2, { color: headingColor, fontFamily: Fonts.display }]}>{trimmed.slice(3)}</Text>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<Text key={`h1-${i}`} style={[ms.h1, { color: headingColor, fontFamily: Fonts.display }]}>{trimmed.slice(2)}</Text>);
    } else {
      const cleaned = trimmed
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1');
      const hasCitation = CITATION_RE.test(trimmed);
      const hlStyle = highlightSources && hasCitation ? HIGHLIGHT_STYLE : null;
      elements.push(
        <View key={`pw-${i}`} style={hlStyle}>
          <Text style={[ms.paragraph, { color: textColor }]}>{cleaned}</Text>
        </View>,
      );
    }
  }
  flushBlockquote();
  flushList();
  return elements;
}

// --- TRUST SCORE MODAL ---

type TrustScoreModalProps = {
  visible: boolean;
  onClose: () => void;
  detail: ArticleFactCheckDetail;
  sources: ArticleSource[];
  colors: ReturnType<typeof useTheme>;
};

const PILLAR_CONFIGS = [
  { key: 'transparency', label: 'Transparence', color: '#3B82F6' },
  { key: 'editorial', label: 'Processus Éditorial', color: '#10B981' },
  { key: 'semantic', label: 'Sémantique', color: '#8B5CF6' },
  { key: 'logic', label: 'Intégrité Logique', color: '#F59E0B' },
] as const;

function ScoreArc({ score, color }: { score: number; color: string }) {
  const r = 56;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.max(0, Math.min(100, score)) / 100) * circ;
  return (
    <View style={tsm.arcContainer}>
      {/* SVG workaround: use View arcs via border trick (React Native has no SVG built-in) */}
      <View style={tsm.arcOuter}>
        <View style={[tsm.arcTrack, { borderColor: color + '20' }]} />
        <View style={[tsm.arcFill, {
          borderColor: color,
          borderTopColor: offset < circ * 0.25 ? color : 'transparent',
          borderRightColor: offset < circ * 0.75 ? color : 'transparent',
          borderBottomColor: offset < circ * 0.5 ? color : 'transparent',
          borderLeftColor: color,
        }]} />
      </View>
      <View style={tsm.arcCenter}>
        <Text style={[tsm.arcScore, { color }]}>{score}</Text>
        <Text style={tsm.arcLabel}>/100</Text>
      </View>
    </View>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={tsm.barTrack}>
      <View style={[tsm.barFill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

function TrustScoreModal({ visible, onClose, detail, sources, colors }: TrustScoreModalProps) {
  const [showSourceInfo, setShowSourceInfo] = useState(false);
  const [showAiInfo, setShowAiInfo] = useState(false);
  const [showPoliticalInfo, setShowPoliticalInfo] = useState(false);

  const globalScore = Math.max(0, Math.min(100, Math.round(detail.rawSourceScore * 0.75 + detail.aiScore * 0.25)));
  const scoreColor = getScoreColor(globalScore);

  // Political spectrum
  const politicalCounts = { left: 0, center: 0, right: 0, total: 0 };
  sources.forEach((s) => {
    const bias = (s.politicalBias || 'CENTER').toUpperCase();
    if (bias.includes('LEFT')) politicalCounts.left++;
    else if (bias.includes('RIGHT')) politicalCounts.right++;
    else politicalCounts.center++;
    politicalCounts.total++;
  });
  const total = politicalCounts.total || 1;
  const leftPct = (politicalCounts.left / total) * 100;
  const centerPct = (politicalCounts.center / total) * 100;
  const rightPct = (politicalCounts.right / total) * 100;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={tsm.backdrop} onPress={onClose} />
      <View style={[tsm.sheet, { backgroundColor: colors.backgroundElevated }]}>
        {/* Header */}
        <View style={[tsm.sheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[tsm.sheetTitle, { color: colors.text }]}>Détail du Score de Fiabilité</Text>
          <Pressable onPress={onClose} style={tsm.closeBtn}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView style={tsm.sheetBody} showsVerticalScrollIndicator={false}>
          {/* Score circle */}
          <View style={tsm.heroSection}>
            <View style={tsm.circleWrap}>
              {/* Circular ring via border (rough approximation) */}
              <View style={[tsm.circleRing, { borderColor: scoreColor + '30' }]} />
              <View style={[tsm.circleProgress, { borderTopColor: scoreColor, borderRightColor: globalScore > 50 ? scoreColor : 'transparent' }]} />
              <View style={tsm.circleInner}>
                <Text style={[tsm.circleScore, { color: scoreColor }]}>{globalScore}</Text>
              </View>
            </View>
            <Text style={[tsm.heroCaption, { color: colors.textSecondary }]}>
              Score calculé à <Text style={{ fontWeight: '700', color: colors.text }}>75% sur la fiabilité des sources</Text> et <Text style={{ fontWeight: '700', color: colors.text }}>25% sur l'IA</Text>.
            </Text>
          </View>

          <View style={tsm.section}>
            {/* Source reliability bar */}
            <View style={[tsm.gaugeRow, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]}>
              <View style={tsm.gaugeTitleRow}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <ShieldCheck size={16} color={colors.text} />
                  <Text style={[tsm.gaugeTitle, { color: colors.text }]}>Fiabilité des Sources</Text>
                </View>
                <View style={tsm.gaugeRight}>
                  <Text style={[tsm.gaugeValue, { color: scoreColor }]}>{detail.rawSourceScore}/100</Text>
                  <Pressable onPress={() => setShowSourceInfo(!showSourceInfo)}>
                    <Info size={14} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
              <ScoreBar value={detail.rawSourceScore} color={scoreColor} />
              {showSourceInfo ? (
                <Text style={[tsm.infoText, { color: colors.textSecondary, backgroundColor: colors.backgroundElevated }]}>
                  Moyenne des scores de fiabilité des sources utilisées dans cet article. Chaque source est notée individuellement sur sa réputation.
                </Text>
              ) : null}
            </View>

            {/* AI reliability bar */}
            <View style={[tsm.gaugeRow, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]}>
              <View style={tsm.gaugeTitleRow}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 8}}>
                  <BrainCircuit size={16} color={colors.text} />
                  <Text style={[tsm.gaugeTitle, { color: colors.text }]}>Fiabilité de l'IA</Text>
                </View>
                <View style={tsm.gaugeRight}>
                  <Text style={[tsm.gaugeValue, { color: '#6366F1' }]}>{detail.aiScore}/100</Text>
                  <Pressable onPress={() => setShowAiInfo(!showAiInfo)}>
                    <Info size={14} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
              <ScoreBar value={detail.aiScore} color="#6366F1" />

              {showAiInfo && detail.liveAnalysis ? (
                <View style={tsm.liveAnalysisBox}>
                  {/* Intent */}
                  <View style={[tsm.intentBox, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}>
                    <Text style={[tsm.intentLabel, { color: '#4F46E5' }]}>INTENTION DÉTECTÉE</Text>
                    <Text style={[tsm.intentValue, { color: '#3730A3' }]}>{detail.liveAnalysis.contentIntent}</Text>
                    {detail.liveAnalysis.intentReasoning ? (
                      <Text style={[tsm.intentReasoning, { color: '#4338CA' }]}>"{detail.liveAnalysis.intentReasoning}"</Text>
                    ) : null}
                  </View>

                  {/* Pillars grid (2 columns) */}
                  <View style={tsm.pillarsGrid}>
                    {PILLAR_CONFIGS.map((pillar) => {
                      const data = detail.liveAnalysis!.pillarScores[pillar.key];
                      return (
                        <View key={pillar.key} style={[tsm.pillarCard, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
                          <View style={tsm.pillarCardHeader}>
                            <Text style={[tsm.pillarLabel, { color: colors.text }]}>{pillar.label}</Text>
                            <Text style={[tsm.pillarScore, { color: pillar.color }]}>{data.score}/100</Text>
                          </View>
                          {data.quote && data.quote !== 'None' ? (
                            <Text style={[tsm.pillarQuote, { color: colors.textTertiary, borderLeftColor: pillar.color }]}>"{data.quote}"</Text>
                          ) : null}
                          <Text style={[tsm.pillarReasoning, { color: colors.textSecondary }]}>{data.reasoning}</Text>
                        </View>
                      );
                    })}
                  </View>

                  {/* Corrective notes */}
                  {detail.liveAnalysis.correctiveNotes?.length ? (
                    <View style={[tsm.correctiveBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                      <View style={{flexDirection: 'row', alignItems: 'center', gap: 4}}>
                        <AlertTriangle size={14} color="#F97316" />
                        <Text style={[tsm.correctiveTitle, { color: '#C2410C' }]}>INTERVENTION MISTRAL AI (AUDITEUR)</Text>
                      </View>
                      {detail.liveAnalysis.correctiveNotes.map((note, i) => (
                        <Text key={i} style={[tsm.correctiveNote, { color: '#9A3412' }]}>{note}</Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : showAiInfo ? (
                <Text style={[tsm.infoText, { color: colors.textSecondary, backgroundColor: colors.backgroundElevated }]}>
                  Évalue la précision du modèle IA ayant rédigé l'article. Ce score mesure le respect du contexte original.
                </Text>
              ) : null}
            </View>

            {/* Political spectrum */}
            {sources.length > 0 ? (
              <View style={[tsm.gaugeRow, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]}>
                <View style={tsm.gaugeTitleRow}>
                  <Text style={[tsm.gaugeTitle, { color: colors.text }]}>Spectre Politique</Text>
                  <View style={tsm.gaugeRight}>
                    <Text style={[tsm.gaugeCaption, { color: colors.textMuted }]}>Basé sur {sources.length} sources</Text>
                    <Pressable onPress={() => setShowPoliticalInfo(!showPoliticalInfo)}>
                      <Info size={14} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
                {/* Segmented bar */}
                <View style={tsm.spectrumBar}>
                  {leftPct > 0 ? <View style={[tsm.spectrumLeft, { width: `${leftPct}%` }]} /> : null}
                  {centerPct > 0 ? <View style={[tsm.spectrumCenter, { width: `${centerPct}%` }]} /> : null}
                  {rightPct > 0 ? <View style={[tsm.spectrumRight, { width: `${rightPct}%` }]} /> : null}
                </View>
                <View style={tsm.spectrumLegend}>
                  <Text style={tsm.spectrumLabelLeft}>Gauche ({politicalCounts.left})</Text>
                  <Text style={[tsm.spectrumLabelCenter, { color: colors.textMuted }]}>Centre</Text>
                  <Text style={tsm.spectrumLabelRight}>Droite ({politicalCounts.right})</Text>
                </View>
                {showPoliticalInfo ? (
                  <Text style={[tsm.infoText, { color: colors.textSecondary, backgroundColor: colors.backgroundElevated }]}>
                    Répartition des orientations politiques des sources citées : Gauche = progressistes, Centre = factuelles ou non-classées, Droite = conservatrices.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Disclaimer */}
          <View style={tsm.disclaimer}>
            <Text style={[tsm.disclaimerText, { color: colors.textMuted }]}>L'IA peut commettre des erreurs de nuance. Vérifiez toujours les sources originales.</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const tsm = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000060' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '90%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  sheetBody: { paddingHorizontal: 20 },
  heroSection: { paddingVertical: 24, alignItems: 'center', gap: 12 },
  circleWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center' },
  circleRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 10 },
  circleProgress: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 10, borderBottomColor: 'transparent', borderLeftColor: 'transparent', transform: [{ rotate: '-90deg' }] },
  circleInner: { alignItems: 'center', justifyContent: 'center' },
  circleScore: { fontSize: 40, fontWeight: '900', lineHeight: 44 },
  heroCaption: { fontSize: 13, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  arcContainer: {},
  arcOuter: {},
  arcTrack: {},
  arcFill: {},
  arcCenter: {},
  arcScore: {},
  arcLabel: {},
  section: { gap: 12, paddingBottom: 16 },
  gaugeRow: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  gaugeTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gaugeTitle: { fontSize: 14, fontWeight: '600' },
  gaugeRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  gaugeValue: { fontSize: 14, fontWeight: '700' },
  gaugeCaption: { fontSize: 12 },
  barTrack: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  infoText: { fontSize: 12, lineHeight: 18, borderRadius: 8, padding: 10 },
  liveAnalysisBox: { gap: 12, paddingTop: 4 },
  intentBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 4 },
  intentLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },
  intentValue: { fontSize: 15, fontWeight: '700' },
  intentReasoning: { fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
  pillarsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillarCard: { borderRadius: 12, borderWidth: 1, padding: 10, gap: 4, width: '47%', flexGrow: 1 },
  pillarCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pillarLabel: { fontSize: 11, fontWeight: '700', flex: 1 },
  pillarScore: { fontSize: 12, fontWeight: '800' },
  pillarQuote: { fontSize: 10, fontStyle: 'italic', lineHeight: 14, borderLeftWidth: 2, paddingLeft: 6 },
  pillarReasoning: { fontSize: 10, lineHeight: 15 },
  correctiveBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  correctiveTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  correctiveNote: { fontSize: 12, lineHeight: 18 },
  spectrumBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#F3F4F6' },
  spectrumLeft: { height: '100%', backgroundColor: '#DC2626' },
  spectrumCenter: { height: '100%', backgroundColor: '#9CA3AF' },
  spectrumRight: { height: '100%', backgroundColor: '#2563EB' },
  spectrumLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  spectrumLabelLeft: { fontSize: 10, fontWeight: '700', color: '#DC2626' },
  spectrumLabelCenter: { fontSize: 10 },
  spectrumLabelRight: { fontSize: 10, fontWeight: '700', color: '#2563EB' },
  disclaimer: { paddingVertical: 20, paddingBottom: 40, alignItems: 'center' },
  disclaimerText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});

// --- SOURCES MODAL ---

type SourcesModalProps = {
  visible: boolean;
  onClose: () => void;
  sources: ArticleSource[];
  colors: ReturnType<typeof useTheme>;
};

function SourceItemCard({ source, colors }: { source: ArticleSource; colors: ReturnType<typeof useTheme> }) {
  const [expanded, setExpanded] = useState(false);
  const scoreColor = getScoreColor(source.trustScore);
  const isPending = source.trustScore === undefined;

  const categoryLabel = source.type ?? 'Source';
  const hasDetails = !isPending && (source.description || source.politicalBias || source.country || source.metrics || source.justification);

  return (
    <View style={[sm.card, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
      {/* Header row */}
      <Pressable
        style={sm.cardHeader}
        onPress={() => { if (hasDetails) setExpanded(!expanded); if (source.url) Linking.openURL(source.url).catch(() => {}); }}
      >
        {/* Logo / initials */}
        <View style={[sm.logo, { backgroundColor: colors.backgroundSubtle }]}>
          <Text style={[sm.logoText, { color: colors.textMuted }]}>{(source.name || source.domain || '?')[0].toUpperCase()}</Text>
        </View>

        {/* Name + domain */}
        <View style={sm.nameBlock}>
          <View style={sm.nameRow}>
            <Text style={[sm.name, { color: colors.text }]} numberOfLines={1}>{source.name || source.domain}</Text>
            <View style={[sm.catBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <Text style={sm.catBadgeText}>{categoryLabel}</Text>
            </View>
            {source.flags?.hasFactCheckFailures ? (
              <View style={[sm.catBadge, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <ShieldAlert size={10} color="#B91C1C" />
                <Text style={[sm.catBadgeText, { color: '#B91C1C' }]}>Alertes</Text>
              </View>
            ) : null}
          </View>
          <Text style={[sm.domain, { color: colors.textMuted }]} numberOfLines={1}>{source.domain}</Text>
        </View>

        {/* Score badge */}
        {isPending ? (
          <View style={[sm.scoreBadge, { backgroundColor: colors.backgroundSubtle }]}>
            <Text style={[sm.scoreBadgeText, { color: colors.textMuted }]}>Analyse...</Text>
          </View>
        ) : (
          <View style={[sm.scoreBadge, { backgroundColor: scoreColor }]}>
            <Text style={sm.scoreBadgeText}>Fact Score</Text>
            <View style={sm.scoreCircle}>
              <Text style={sm.scoreCircleText}>{source.trustScore}</Text>
            </View>
          </View>
        )}
      </Pressable>

      {/* Expanded details */}
      {expanded && hasDetails ? (
        <View style={[sm.details, { borderTopColor: colors.borderSubtle }]}>
          {/* Score explanation */}
          {typeof source.trustScore === 'number' ? (
            <View style={[sm.scoreExplain, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <View style={sm.scoreExplainHeader}>
                <Text style={sm.scoreExplainLabel}>Score contextuel de la source</Text>
                <Text style={sm.scoreExplainValue}>{source.trustScore}/100</Text>
              </View>
              <Text style={sm.scoreExplainText}>
                {typeof source.reputationScore === 'number' && typeof source.analysisScore === 'number'
                  ? `Ce score combine la réputation (${source.reputationScore}/100) et l'analyse contextuelle (${source.analysisScore}/100), pondération 70/30.`
                  : typeof source.reputationScore === 'number'
                    ? `Score basé sur la réputation de la source : ${source.reputationScore}/100.`
                    : typeof source.analysisScore === 'number'
                      ? `Score basé sur l'analyse contextuelle : ${source.analysisScore}/100.`
                      : source.justification ?? 'Aucun détail de calcul disponible pour cette source.'}
              </Text>
            </View>
          ) : null}

          {/* Identity: country + political bias */}
          {(source.country || source.politicalBias || source.reliability) ? (
            <View style={[sm.identityRow, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}>
              {source.country ? <Text style={[sm.identityChip, { color: colors.text }]}>{source.country}</Text> : null}
              {source.politicalBias ? (
                <Text style={[sm.identityChip, {
                  color: source.politicalBias.toUpperCase().includes('LEFT') ? '#DC2626' : source.politicalBias.toUpperCase().includes('RIGHT') ? '#2563EB' : colors.textSecondary,
                }]}>{source.politicalBias}</Text>
              ) : null}
              {source.reliability ? <Text style={[sm.identityChip, { color: colors.textSecondary }]}>{source.reliability}</Text> : null}
            </View>
          ) : null}

          {/* Metrics bars */}
          {source.metrics ? (
            <View style={sm.metricsGrid}>
              {[
                { label: 'Transparence', value: source.metrics.transparency, color: '#3B82F6' },
                { label: 'Éditorial', value: source.metrics.editorial, color: '#10B981' },
                { label: 'Sémantique', value: source.metrics.semantic, color: '#8B5CF6' },
                { label: 'Intégrité', value: source.metrics.logic, color: '#F59E0B' },
              ].map((m) => (
                <View key={m.label} style={sm.metricRow}>
                  <Text style={[sm.metricLabel, { color: colors.textSecondary }]}>{m.label}</Text>
                  <View style={sm.metricBarTrack}>
                    <View style={[sm.metricBarFill, { width: `${m.value}%`, backgroundColor: m.color }]} />
                  </View>
                  <Text style={[sm.metricValue, { color: m.color }]}>{m.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Description */}
          {source.description ? (
            <Text style={[sm.description, { color: colors.textSecondary }]}>{source.description}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function SourcesModal({ visible, onClose, sources, colors }: SourcesModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={tsm.backdrop} onPress={onClose} />
      <View style={[tsm.sheet, { backgroundColor: colors.backgroundElevated }]}>
        <View style={[tsm.sheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[tsm.sheetTitle, { color: colors.text }]}>Sources analysées ({sources.length})</Text>
          <Pressable onPress={onClose} style={tsm.closeBtn}>
            <X size={20} color={colors.textMuted} />
          </Pressable>
        </View>
        <ScrollView style={tsm.sheetBody} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 16, paddingBottom: 40 }}>
          {sources.length === 0 ? (
            <Text style={[sm.empty, { color: colors.textMuted }]}>Aucune source analysée pour cet article.</Text>
          ) : (
            sources.map((source, i) => (
              <SourceItemCard key={source.id ?? source.url ?? `${source.domain}-${i}`} source={source} colors={colors} />
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoText: { fontSize: 16, fontWeight: '700' },
  nameBlock: { flex: 1, gap: 2, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  name: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  domain: { fontSize: 12 },
  catBadge: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  catBadgeText: { fontSize: 10, fontWeight: '600', color: '#1D4ED8' },
  scoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5, flexShrink: 0 },
  scoreBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', color: '#fff', letterSpacing: 0.4 },
  scoreCircle: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  scoreCircleText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  details: { borderTopWidth: 1, padding: 14, gap: 12 },
  scoreExplain: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  scoreExplainHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreExplainLabel: { fontSize: 11, fontWeight: '700', color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.4 },
  scoreExplainValue: { fontSize: 14, fontWeight: '800', color: '#065F46' },
  scoreExplainText: { fontSize: 12, lineHeight: 18, color: '#047857' },
  identityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderRadius: 12, borderWidth: 1, padding: 10 },
  identityChip: { fontSize: 13, fontWeight: '500' },
  metricsGrid: { gap: 8 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricLabel: { width: 80, fontSize: 11, fontWeight: '500' },
  metricBarTrack: { flex: 1, height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden' },
  metricBarFill: { height: 6, borderRadius: 3 },
  metricValue: { width: 28, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  description: { fontSize: 12, lineHeight: 18 },
  empty: { textAlign: 'center', padding: 32, fontSize: 14 },
});

// --- OPINION SLIDER CARD COMPONENT ---

type OpinionSliderCardProps = {
  positions: number[];
  selectedPosition: number | null;
  lacksContext: boolean;
  confirmedPosition: { selectedPosition: number | null; lacksContext: boolean } | null;
  isSubmittingPosition: boolean;
  opinionQuestion: { question: string; thesisA: string; thesisB: string } | null;
  colors: ReturnType<typeof useTheme>;
  onSelectPosition: (pos: number) => void;
  onLacksContext: () => void;
  onConfirm: () => void;
};

function OpinionSliderCard({
  positions,
  selectedPosition,
  lacksContext,
  confirmedPosition,
  isSubmittingPosition,
  opinionQuestion,
  colors,
  onSelectPosition,
  onLacksContext,
  onConfirm,
}: OpinionSliderCardProps) {
  const trackWidth = useRef(0);
  const isDragging = useRef(false);
  const [thumbRatio, setThumbRatio] = useState<number | null>(null);

  const getSnapIndex = (ratio: number) =>
    Math.max(0, Math.min(positions.length - 1, Math.round(ratio * (positions.length - 1))));

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !confirmedPosition,
      onMoveShouldSetPanResponder: () => !confirmedPosition,
      onPanResponderGrant: (evt) => {
        if (confirmedPosition || trackWidth.current <= 0) return;
        isDragging.current = true;
        const x = evt.nativeEvent.locationX - 16; // subtract left padding
        const ratio = Math.max(0, Math.min(1, x / trackWidth.current));
        setThumbRatio(ratio);
      },
      onPanResponderMove: (evt) => {
        if (!isDragging.current || trackWidth.current <= 0) return;
        const x = evt.nativeEvent.locationX - 16;
        const ratio = Math.max(0, Math.min(1, x / trackWidth.current));
        setThumbRatio(ratio);
      },
      onPanResponderRelease: (evt) => {
        if (!isDragging.current || trackWidth.current <= 0) return;
        isDragging.current = false;
        const x = evt.nativeEvent.locationX - 16;
        const ratio = Math.max(0, Math.min(1, x / trackWidth.current));
        const index = getSnapIndex(ratio);
        setThumbRatio(null);
        onSelectPosition(positions[index]);
      },
      onPanResponderTerminate: () => {
        isDragging.current = false;
        setThumbRatio(null);
      },
    }),
  ).current;

  const selectedIndex = selectedPosition !== null && !lacksContext
    ? positions.indexOf(selectedPosition)
    : -1;
  const snappedPercent = selectedIndex >= 0 ? (selectedIndex / (positions.length - 1)) * 100 : -1;
  const thumbPercent = thumbRatio !== null ? thumbRatio * 100 : snappedPercent;
  const hasThumb = thumbPercent >= 0 && !lacksContext;

  const isConfirmed = !!confirmedPosition;

  const positionLabel = (() => {
    if (lacksContext) return 'Je manque de contexte';
    if (selectedPosition !== null) return POSITION_LABELS[String(selectedPosition)] ?? '';
    return '';
  })();

  return (
    <View style={[ss.opinionCard, { borderColor: isConfirmed ? `${EPION_GREEN}40` : colors.border, backgroundColor: colors.backgroundElevated }]}>
      {/* Header */}
      <View style={ss.opinionCardHeader}>
        <Text style={[ss.opinionCardTitle, { color: colors.text }]}>Positionnez-vous</Text>
        {isConfirmed ? (
          <View style={[ss.confirmedBadge, { backgroundColor: `${EPION_GREEN}12`, borderColor: `${EPION_GREEN}40` }]}>
            <Text style={ss.confirmedBadgeText}>🔒 Position confirmée</Text>
          </View>
        ) : null}
      </View>

      {/* Question box */}
      <View style={[ss.questionBox, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
        <Text style={[ss.questionLabel, { color: colors.textMuted }]}>QUESTION</Text>
        <Text style={[ss.questionText, { color: colors.text }]}>
          {opinionQuestion?.question || 'Les faits présentés pointent-ils plutôt vers un problème ponctuel ou structurel ?'}
        </Text>
      </View>

      {/* Thesis labels — inline like frontend */}
      <View style={ss.thesisInlineRow}>
        <Text style={[ss.thesisLabel, { color: colors.textMuted }]} numberOfLines={2}>
          {opinionQuestion?.thesisA || 'Thèse A'}
        </Text>
        <Text style={[ss.thesisLabel, ss.thesisLabelRight, { color: colors.textMuted }]} numberOfLines={2}>
          {opinionQuestion?.thesisB || 'Thèse B'}
        </Text>
      </View>

      {/* Slider track */}
      <View
        style={ss.sliderWrapper}
        onLayout={(e) => { trackWidth.current = e.nativeEvent.layout.width - 32; }} // -32 for 16px padding each side
        {...panResponder.panHandlers}
      >
        {/* Rail */}
        <View style={[ss.sliderRail, { backgroundColor: isConfirmed ? `${EPION_GREEN}30` : colors.border + '80' }]} />

        {/* Snap dots */}
        {positions.map((pos, i) => {
          const pct = (i / (positions.length - 1)) * 100;
          const isSelected = pos === selectedPosition && thumbRatio === null && !lacksContext;
          const isConfirmedHere = confirmedPosition?.selectedPosition === pos;
          const active = isSelected || isConfirmedHere;
          return (
            <View
              key={String(pos)}
              style={[
                ss.snapDot,
                active ? ss.snapDotActive : { backgroundColor: colors.textMuted + '60' },
                { left: `${pct}%` },
              ]}
            />
          );
        })}

        {/* Thumb */}
        {hasThumb ? (
          <View style={[ss.thumbWrap, { left: `${thumbPercent}%` }]}>
            <View style={[ss.thumb, { borderColor: EPION_GREEN, shadowColor: EPION_GREEN }]}>
              <View style={ss.thumbDot} />
            </View>
          </View>
        ) : null}
      </View>

      {/* Position label */}
      <Text style={[ss.positionLabel, { color: positionLabel ? colors.text : colors.textMuted, fontWeight: positionLabel ? '600' : '400' }]}>
        {positionLabel || 'Faites glisser pour vous positionner'}
      </Text>

      {/* Lacks context button */}
      <Pressable
        style={[ss.lacksContextBtn, {
          borderColor: lacksContext ? '#0EA5E933' : colors.border,
          backgroundColor: lacksContext ? '#F0F9FF' : 'transparent',
        }]}
        disabled={isConfirmed}
        onPress={onLacksContext}
      >
        <Text style={[ss.lacksContextText, { color: lacksContext ? '#0369A1' : colors.textTertiary }]}>
          🛡  Je manque d'éléments de contexte
        </Text>
      </Pressable>

      {/* Confirm button */}
      {!isConfirmed ? (
        <Pressable
          style={[ss.confirmBtn, {
            backgroundColor: (selectedPosition !== null || lacksContext) && !isSubmittingPosition ? EPION_GREEN : colors.backgroundSubtle,
          }]}
          disabled={isSubmittingPosition || (selectedPosition === null && !lacksContext)}
          onPress={onConfirm}
        >
          <Text style={[ss.confirmBtnText, { color: (selectedPosition !== null || lacksContext) ? '#000' : colors.textMuted }]}>
            {isSubmittingPosition ? 'Confirmation...' : '✓  Confirmer ma position'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Styles for OpinionSliderCard (prefixed ss to avoid conflicts)
const ss = StyleSheet.create({
  opinionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  opinionCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  opinionCardTitle: { fontSize: 16, fontWeight: '600' },
  confirmedBadge: { borderRadius: 99, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  confirmedBadgeText: { color: '#065F46', fontSize: 12, fontWeight: '600' },
  questionBox: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  questionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  questionText: { fontSize: 15, fontWeight: '500', lineHeight: 22 },
  thesisInlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  thesisLabel: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 16 },
  thesisLabelRight: { textAlign: 'right' },
  sliderWrapper: {
    position: 'relative',
    height: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  sliderRail: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 3,
    borderRadius: 2,
    top: '50%',
    marginTop: -1.5,
  },
  snapDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    marginLeft: -4.5,
    top: '50%',
    marginTop: -4.5,
  },
  snapDotActive: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: EPION_GREEN,
    marginLeft: -6.5,
    marginTop: -6.5,
    shadowColor: EPION_GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 3,
  },
  thumbWrap: {
    position: 'absolute',
    top: '50%',
    marginTop: -14,
    marginLeft: -14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  thumbDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: EPION_GREEN,
  },
  positionLabel: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  lacksContextBtn: {
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  lacksContextText: {
    fontSize: 14,
    fontWeight: '500',
  },
  confirmBtn: {
    borderRadius: 99,
    alignItems: 'center',
    paddingVertical: 12,
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});

// --- MAIN COMPONENT ---

export function ArticleDetailScreenContent({ loadArticle, missingText = 'Aucun détail disponible pour cet article.' }: ArticleDetailScreenProps) {
  const router = useRouter();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reactions, setReactions] = useState<ArticleReactionSummary>(EMPTY_REACTIONS);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [commentsCursor, setCommentsCursor] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [advancedInteractions, setAdvancedInteractions] = useState<ArticleInteractions | null>(null);
  const [advancedSort, setAdvancedSort] = useState<ArticleInteractionsSortMode>('top');
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [lacksContext, setLacksContext] = useState(false);
  const [isSubmittingPosition, setIsSubmittingPosition] = useState(false);
  const [contributionType, setContributionType] = useState<ArticleContributionType>('NUANCE');
  const [contributionText, setContributionText] = useState('');
  const [contributionSourceUrl, setContributionSourceUrl] = useState('');
  const [contributionTargetId, setContributionTargetId] = useState<string | null>(null);
  const [isSubmittingContribution, setIsSubmittingContribution] = useState(false);
  const [isGatewayOpen, setIsGatewayOpen] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [toolbarPanel, setToolbarPanel] = useState<'interactions' | 'share' | 'info' | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isHighlightActive, setIsHighlightActive] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [showTrustModal, setShowTrustModal] = useState(false);
  const [showSourcesModal, setShowSourcesModal] = useState(false);

  // --- DATA LOADING ---

  const loadComments = useCallback(async (articleId: string, cursor?: string | null) => {
    setCommentsLoading(true);
    setCommentError(null);
    try {
      const page = await fetchArticleComments(articleId, cursor ?? null);
      setComments((current) => (cursor ? [...current, ...page.items] : page.items));
      setCommentsCursor(page.nextCursor);
    } catch {
      if (!cursor) setComments([]);
      setCommentError('Commentaires indisponibles pour le moment.');
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  const loadAdvancedInteractions = useCallback(async (targetArticle: ArticleDetail, sort: ArticleInteractionsSortMode = advancedSort) => {
    const articleSlug = targetArticle.slug ?? targetArticle.id;
    setAdvancedLoading(true);
    setAdvancedError(null);
    try {
      const data = await fetchArticleInteractions(articleSlug, sort);
      setAdvancedInteractions(data);
      setSelectedPosition(data.currentUserOpinionPosition?.selectedPosition ?? null);
      setLacksContext(data.currentUserOpinionPosition?.lacksContext ?? false);
    } catch {
      setAdvancedInteractions(null);
      setAdvancedError("Contributions et carte d'opinion indisponibles pour le moment.");
    } finally {
      setAdvancedLoading(false);
    }
  }, [advancedSort]);

  const hydrateInteractions = useCallback(
    async (nextArticle: ArticleDetail) => {
      setInteractionMessage(null);
      setReactionError(null);
      void fetchFavoriteArticleIds()
        .then((ids) => setIsSaved(ids.includes(nextArticle.id)))
        .catch(() => setIsSaved(false));
      void fetchArticleReactions(nextArticle.id)
        .then(setReactions)
        .catch(() => setReactionError('Réactions indisponibles pour le moment.'));
      void loadComments(nextArticle.id, null);
      void loadAdvancedInteractions(nextArticle);
    },
    [loadAdvancedInteractions, loadComments],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setComments([]);
    setCommentsCursor(null);
    setReactions(EMPTY_REACTIONS);
    setIsSaved(false);
    setAdvancedInteractions(null);
    setAdvancedError(null);
    try {
      const nextArticle = await loadArticle();
      setArticle(nextArticle);
      if (nextArticle?.id) {
        void recordArticleView(nextArticle.id);
        void fetchArticleStats(nextArticle.id).then((stats) => {
          if (typeof stats.viewsAll === 'number') {
            setArticle((current) => (current?.id === nextArticle.id ? { ...current, viewsAll: stats.viewsAll } : current));
          }
        });
        void hydrateInteractions(nextArticle);
      }
    } catch {
      setArticle(null);
      setError('Impossible de charger cet article pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, [hydrateInteractions, loadArticle]);

  useEffect(() => {
    void load();
  }, [load]);

  // --- DERIVED STATE ---

  const publishedAt = formatDate(article?.publishedAt);
  const statusLabel = scoreStatusLabel(article?.factCheckStatus);
  const shareUrl = useMemo(() => {
    if (!article) return WEB_ORIGIN;
    return `${WEB_ORIGIN}/article/${article.slug ?? article.id}`;
  }, [article]);
  const sourceCount = article?.sources?.length ?? article?.sourcesCount ?? 0;
  const hasHighlightableCitations = useMemo(() => Boolean(article?.body && CITATION_RE.test(article.body)), [article?.body]);

  const visibleAdvancedInteractions = advancedInteractions ?? (!advancedLoading ? EMPTY_ADVANCED_INTERACTIONS : null);
  const confirmedPosition = visibleAdvancedInteractions?.currentUserOpinionPosition ?? null;
  const canContribute = visibleAdvancedInteractions?.canContribute === true;
  const canValidate = visibleAdvancedInteractions?.canValidateContributions === true;
  const distribution = visibleAdvancedInteractions?.opinionDistribution;
  const maxOpinionCount = Math.max(1, ...POSITION_VALUES.map((pos) => distribution?.counts[String(pos)] ?? 0));

  // --- ACTIONS ---

  const toggleSave = useCallback(async () => {
    if (!article?.id || isSaving) return;
    const previous = isSaved;
    setIsSaving(true);
    setInteractionMessage(null);
    setIsSaved(!previous);
    try {
      if (previous) await removeFavoriteArticle(article.id);
      else await saveFavoriteArticle(article.id);
    } catch {
      setIsSaved(previous);
      setInteractionMessage('Connexion requise ou sauvegarde indisponible.');
    } finally {
      setIsSaving(false);
    }
  }, [article?.id, isSaved, isSaving]);

  const react = useCallback(
    async (type: 'LIKE' | 'DISLIKE') => {
      if (!article?.id) return;
      const previous = reactions;
      setReactionError(null);
      setReactions((current) => {
        const hadSame = current.userReaction === type;
        const hadOther = current.userReaction && current.userReaction !== type;
        return {
          ...current,
          userReaction: hadSame ? null : type,
          likes: type === 'LIKE' ? current.likes + (hadSame ? -1 : 1) : current.likes + (hadOther ? -1 : 0),
          dislikes: type === 'DISLIKE' ? current.dislikes + (hadSame ? -1 : 1) : current.dislikes + (hadOther ? -1 : 0),
        };
      });
      try {
        setReactions(await toggleArticleReaction(article.id, type));
      } catch {
        setReactions(previous);
        setReactionError('Connexion requise ou réaction indisponible.');
      }
    },
    [article?.id, reactions],
  );

  const submitComment = useCallback(async () => {
    if (!article?.id || !commentText.trim() || isPostingComment) return;
    setIsPostingComment(true);
    setCommentError(null);
    try {
      const created = await postArticleComment(article.id, commentText.trim());
      setComments((current) => [created, ...current]);
      setCommentText('');
    } catch {
      setCommentError('Connexion requise ou commentaire indisponible.');
    } finally {
      setIsPostingComment(false);
    }
  }, [article?.id, commentText, isPostingComment]);

  const confirmOpinionPosition = useCallback(async () => {
    if (!article || confirmedPosition || isSubmittingPosition) return;
    if (selectedPosition === null && !lacksContext) {
      setAdvancedError('Choisissez une position ou indiquez un manque de contexte.');
      return;
    }
    setIsSubmittingPosition(true);
    setAdvancedError(null);
    try {
      const result = await submitArticleOpinionPosition(article.slug ?? article.id, selectedPosition, lacksContext);
      setAdvancedInteractions((current) => current ? {
        ...current,
        currentUserOpinionPosition: result.position,
        canContribute: result.canContribute,
        canValidateContributions: result.canValidateContributions,
      } : current);
    } catch {
      setAdvancedError('Connexion requise ou position déjà confirmée.');
      void loadAdvancedInteractions(article);
    } finally {
      setIsSubmittingPosition(false);
    }
  }, [article, confirmedPosition, isSubmittingPosition, lacksContext, loadAdvancedInteractions, selectedPosition]);

  const submitContribution = useCallback(async () => {
    if (!article || isSubmittingContribution) return;
    const text = contributionText.trim();
    const sourceUrl = contributionSourceUrl.trim();
    const requiresSource = contributionType === 'SOURCE' || contributionTargetId !== null;
    if (requiresSource && !sourceUrl) {
      setAdvancedError('Une URL de source est requise pour ce type de contribution.');
      return;
    }
    if (contributionType !== 'SOURCE' && !text) {
      setAdvancedError('Écrivez une contribution avant de publier.');
      return;
    }
    if (sourceUrl && !validUrl(sourceUrl)) {
      setAdvancedError("L'URL doit commencer par http:// ou https://.");
      return;
    }
    setIsSubmittingContribution(true);
    setAdvancedError(null);
    try {
      const created = await submitArticleContribution(article.slug ?? article.id, contributionType, text || ' ', sourceUrl || undefined, contributionTargetId || undefined);
      setAdvancedInteractions((current) => {
        if (!current) return current;
        if (!created.targetContributionId) return { ...current, contributions: [created, ...current.contributions] };
        return {
          ...current,
          contributions: current.contributions.map((c) => c.id === created.targetContributionId ? { ...c, children: [...c.children, created] } : c),
        };
      });
      setContributionText('');
      setContributionSourceUrl('');
      setContributionTargetId(null);
      setContributionType('NUANCE');
      setIsGatewayOpen(false);
      setSubmitMessage('Contribution soumise avec succès.');
    } catch {
      setAdvancedError("Connexion requise ou contribution refusée par l'API.");
    } finally {
      setIsSubmittingContribution(false);
    }
  }, [article, contributionSourceUrl, contributionTargetId, contributionText, contributionType, isSubmittingContribution]);

  const validateContribution = useCallback(async (contributionId: string, type: ArticleValidationType) => {
    if (!canValidate) {
      setAdvancedError('Confirmez une position avant de valider les contributions.');
      return;
    }
    const previous = advancedInteractions;
    setAdvancedError(null);
    setAdvancedInteractions((current) => current ? {
      ...current,
      contributions: updateContributionTree(current.contributions, contributionId, (c) => {
        const hadIt = c.currentUserValidations.includes(type);
        return {
          ...c,
          currentUserValidations: hadIt ? c.currentUserValidations.filter((v) => v !== type) : [...c.currentUserValidations, type],
          validationSummary: { ...c.validationSummary, [type]: Math.max(0, c.validationSummary[type] + (hadIt ? -1 : 1)) },
        };
      }),
    } : current);
    try {
      const result = await toggleArticleContributionValidation(contributionId, type);
      setAdvancedInteractions((current) => current ? {
        ...current,
        contributions: updateContributionTree(current.contributions, contributionId, (c) => ({
          ...c,
          validationSummary: result.validationSummary,
          currentUserValidations: result.action === 'ADDED'
            ? [...c.currentUserValidations.filter((v) => v !== type), type]
            : c.currentUserValidations.filter((v) => v !== type),
        })),
      } : current);
    } catch {
      setAdvancedInteractions(previous);
      setAdvancedError('Validation impossible: connexion requise ou contribution non éligible.');
    }
  }, [advancedInteractions, canValidate]);

  const changeAdvancedSort = useCallback((sort: ArticleInteractionsSortMode) => {
    setAdvancedSort(sort);
    if (article) void loadAdvancedInteractions(article, sort);
  }, [article, loadAdvancedInteractions]);

  const shareArticle = useCallback(async () => {
    if (!article) return;
    try {
      await Share.share({ title: article.title, message: `${article.title}\n${shareUrl}`, url: shareUrl });
    } catch {
      setInteractionMessage('Partage indisponible sur cet appareil.');
    }
  }, [article, shareUrl]);

  const openShareDestination = useCallback((url: string) => {
    void Linking.openURL(url);
  }, []);

  const copyShareUrl = useCallback(async () => {
    try {
      await Share.share({ message: shareUrl, url: shareUrl });
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
    setTimeout(() => setCopyState('idle'), 1800);
  }, [shareUrl]);

  const toggleRepost = useCallback(async () => {
    if (!article?.id) return;
    const previous = reactions;
    const wasReposted = reactions.userReposted;
    setReactions((current) => ({
      ...current,
      userReposted: !wasReposted,
      reposts: wasReposted ? Math.max(0, current.reposts - 1) : current.reposts + 1,
    }));
    try {
      await toggleArticleRepost(article.id);
    } catch {
      setReactions(previous);
      setReactionError('Connexion requise ou repost indisponible.');
    }
  }, [article?.id, reactions]);

  const openChatWithArticle = useCallback(async () => {
    if (!article || isChatLoading) return;
    setIsChatLoading(true);
    try {
      const session = await createChatSession({ title: article.title, mode: 'balanced' });
      router.push({ pathname: '/chat/[id]', params: { id: session.id } });
    } catch {
      setInteractionMessage('Connexion requise pour le chat.');
    } finally {
      setIsChatLoading(false);
    }
  }, [article, isChatLoading, router]);

  // --- RENDER HELPERS ---

  const renderSource = (source: ArticleSource, index: number) => {
    const scoreColor = getScoreColor(source.trustScore);
    return (
      <Pressable
        key={source.id ?? source.url ?? `${source.domain}-${index}`}
        style={[s.sourceItem, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}
        onPress={() => { if (source.url) void Linking.openURL(source.url); }}
      >
        <View style={s.sourceRow}>
          <View style={[s.sourceFavicon, { backgroundColor: colors.backgroundSubtle }]}>
            <Text style={[s.sourceFaviconText, { color: colors.textMuted }]}>{(source.name || source.domain || '?')[0].toUpperCase()}</Text>
          </View>
          <View style={s.sourceInfo}>
            <Text style={[s.sourceDomain, { color: colors.text }]} numberOfLines={1}>{source.name || source.domain}</Text>
            <Text style={[s.sourceDomainSub, { color: colors.textMuted }]} numberOfLines={1}>{source.domain}</Text>
          </View>
          {typeof source.trustScore === 'number' ? (
            <View style={[s.scorePill, { backgroundColor: scoreColor }]}>
              <Text style={s.scorePillText}>{source.trustScore}%</Text>
            </View>
          ) : null}
        </View>
        {source.description ? <Text style={[s.sourceDesc, { color: colors.textTertiary }]} numberOfLines={2}>{source.description}</Text> : null}
        {source.type ? <Text style={[s.sourceType, { color: colors.textMuted }]}>{source.type}</Text> : null}
      </Pressable>
    );
  };

  const renderContribution = (contribution: ArticleContribution) => {
    const typeInfo = getContributionTypeInfo(contribution.type);
    const positive = contribution.validationSummary.WELL_SOURCED + contribution.validationSummary.ADDS_NUANCE;
    const needsCheck = contribution.validationSummary.NEEDS_CHECK;
    const isContested = needsCheck >= 3 && needsCheck > positive;

    return (
      <View key={contribution.id} style={[s.contributionCard, { borderColor: isContested ? '#F59E0B80' : colors.border, backgroundColor: colors.backgroundElevated }]}>
        {/* Header */}
        <View style={s.contributionHeader}>
          <View style={[s.contributionAvatar, { backgroundColor: colors.backgroundSubtle }]}>
            <Text style={[s.contributionAvatarText, { color: colors.textTertiary }]}>{(contributionAuthorLabel(contribution))[0]?.toUpperCase()}</Text>
          </View>
          <View style={s.contributionMeta}>
            <Text style={[s.contributionAuthor, { color: colors.text }]}>{contributionAuthorLabel(contribution)}</Text>
            <View style={s.contributionTypeBadgeRow}>
              <View style={[s.typeBadgeInline, { backgroundColor: typeInfo.colors.bg, borderColor: typeInfo.colors.border }]}>
                <Text style={[s.typeBadgeInlineText, { color: typeInfo.colors.text }]}>{typeInfo.label}</Text>
              </View>
              {contribution.editCount > 0 ? <Text style={[s.contributionEdited, { color: colors.textMuted }]}>Modifié</Text> : null}
            </View>
          </View>
        </View>

        {/* Contested warning */}
        {isContested ? (
          <View style={[s.contestedBanner, { backgroundColor: '#FFFBEB', borderColor: '#F59E0B60' }]}>
            <Text style={s.contestedIcon}>⚠</Text>
            <Text style={s.contestedText}>Cette contribution nécessite une vérification selon la communauté.</Text>
          </View>
        ) : null}

        {/* Body */}
        {contribution.text.trim() ? (
          <Text style={[s.contributionBody, { color: colors.text }]}>{contribution.text}</Text>
        ) : (
          <Text style={[s.contributionBody, { color: colors.textMuted, fontStyle: 'italic' }]}>Source proposée sans commentaire.</Text>
        )}

        {/* Source link */}
        {contribution.sourceUrl ? (
          <Pressable style={[s.sourceLink, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]} onPress={() => contribution.sourceUrl && void Linking.openURL(contribution.sourceUrl)}>
            <View style={[s.sourceLinkDot, { backgroundColor: typeInfo.colors.text }]} />
            <Text style={[s.sourceLinkText, { color: colors.text }]} numberOfLines={1}>{contribution.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}</Text>
            <Text style={[s.sourceLinkArrow, { color: colors.textMuted }]}>↗</Text>
          </Pressable>
        ) : null}

        {/* Validation buttons (only WELL_SOURCED + ADDS_NUANCE for main contributions) */}
        <View style={s.validationRow}>
          {VALIDATION_TYPES.filter((v) => v.type !== 'NEEDS_CHECK').map((v) => {
            const isActive = contribution.currentUserValidations.includes(v.type);
            const count = contribution.validationSummary[v.type];
            return (
              <Pressable
                key={v.type}
                style={[s.validationPill, {
                  borderColor: isActive ? `${EPION_GREEN}66` : colors.border,
                  backgroundColor: isActive ? `${EPION_GREEN}12` : 'transparent',
                }]}
                disabled={!canValidate}
                onPress={() => void validateContribution(contribution.id, v.type)}
              >
                <Text style={[s.validationPillText, { color: isActive ? '#065F46' : colors.textTertiary }]}>
                  {v.label}{count > 0 ? ` ${count}` : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Context reply */}
        {canValidate ? (
          <Pressable
            style={[s.contextReplyBtn, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}
            onPress={() => { setContributionTargetId(contribution.id); setContributionType('CORRECTION'); setContributionText(''); setContributionSourceUrl(''); }}
          >
            <Text style={[s.contextReplyText, { color: '#92400E' }]}>＋ Ajouter un contexte</Text>
          </Pressable>
        ) : null}

        {/* Best community note (highest validation count, min 2 validations) */}
        {(() => {
          const bestNote = [...contribution.children]
            .filter((note) => {
              const total = note.validationSummary.WELL_SOURCED + note.validationSummary.ADDS_NUANCE + note.validationSummary.NEEDS_CHECK;
              return total >= 2;
            })
            .sort((a, b) => {
              const aTotal = a.validationSummary.WELL_SOURCED + a.validationSummary.ADDS_NUANCE;
              const bTotal = b.validationSummary.WELL_SOURCED + b.validationSummary.ADDS_NUANCE;
              return bTotal - aTotal;
            })[0] ?? null;
          if (!bestNote) return null;
          return (
            <View style={[s.childNote, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
              <Text style={s.childNoteLabel}>NOTE COMMUNAUTAIRE</Text>
              <Text style={[s.childNoteBody, { color: colors.text }]}>{bestNote.text}</Text>
              {bestNote.sourceUrl ? (
                <Pressable onPress={() => bestNote.sourceUrl && void Linking.openURL(bestNote.sourceUrl)}>
                  <Text style={s.childNoteLink}>{bestNote.sourceUrl.replace(/^https?:\/\/(www\.)?/, '')}</Text>
                </Pressable>
              ) : null}
              <View style={s.validationRow}>
                {VALIDATION_TYPES.map((v) => {
                  const isActive = bestNote.currentUserValidations.includes(v.type);
                  const count = bestNote.validationSummary[v.type];
                  return (
                    <Pressable
                      key={v.type}
                      style={[s.validationPill, {
                        borderColor: isActive ? '#7DD3FC' : '#BAE6FD',
                        backgroundColor: isActive ? '#E0F2FE' : 'transparent',
                      }]}
                      disabled={!canValidate}
                      onPress={() => void validateContribution(bestNote.id, v.type)}
                    >
                      <Text style={[s.validationPillText, { color: isActive ? '#0369A1' : '#0369A1' }]}>
                        {v.label}{count > 0 ? ` ${count}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })()}
      </View>
    );
  };

  // --- MAIN RENDER ---

  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[s.content, { paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color={colors.textMuted} />
            <Text style={[s.loadingText, { color: colors.textMuted }]}>Chargement...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={[s.errorBox, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]}>
            <Text style={[s.errorText, { color: colors.error }]}>{error}</Text>
            <Pressable style={[s.retryBtn, { backgroundColor: colors.primary }]} onPress={load}>
              <Text style={[s.retryBtnText, { color: colors.background }]}>Réessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && !article ? (
          <View style={s.centerBox}>
            <Text style={[s.emptyText, { color: colors.textMuted }]}>{missingText}</Text>
          </View>
        ) : null}

        {!isLoading && !error && article ? (
          <>
            {/* ========== ARTICLE CONTENT ========== */}
            <View style={s.articleBody}>

              {/* Hero image */}
              {article.imageUrl ? (
                <View style={[s.imageWrap, { borderColor: colors.borderSubtle }]}>
                  <Image source={{ uri: article.imageUrl }} style={s.heroImage} contentFit="cover" />
                </View>
              ) : null}

              {/* Trust header — vivid badge like web */}
              <View style={[s.trustCard, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
                {typeof article.factCheckScore === 'number' ? (
                  <Pressable 
                    style={[s.trustScoreBadge, { backgroundColor: getScoreColor(article.factCheckScore) }]}
                    onPress={() => { if (article.factCheckDetail) setShowTrustModal(true); }}
                  >
                    <Text style={s.trustScoreText}>Fiabilité : {article.factCheckScore}%</Text>
                  </Pressable>
                ) : (
                  <View style={[s.trustScoreBadge, { backgroundColor: colors.backgroundSubtle }]}>
                    <Text style={[s.trustScoreTextMuted, { color: colors.textMuted }]}>Score indisponible</Text>
                  </View>
                )}
                <View style={s.trustMeta}>
                  {typeof article.factCheckScore === 'number' ? (
                    <Text style={[s.trustMetaLabel, { color: colors.textTertiary }]}>
                      {getScoreLabel(article.factCheckScore)} · {getSupportLabel(article.factCheckScore)}
                    </Text>
                  ) : null}
                  {typeof article.sourcesCount === 'number' && article.sourcesCount > 0 ? (
                    <Pressable style={[s.trustSourcesBtn, { borderColor: colors.border }]} onPress={() => setShowSourcesModal(true)}>
                      <Text style={[s.trustSourcesBtnText, { color: colors.textTertiary }]}>{article.sourcesCount} sources analysées</Text>
                    </Pressable>
                  ) : (
                    <Text style={[s.trustMetaLabel, { color: colors.textMuted }]}>0 source analysée</Text>
                  )}
                </View>
                {statusLabel ? <Text style={[s.trustStatusLabel, { color: colors.textMuted }]}>{statusLabel}</Text> : null}
              </View>

              {/* Meta */}
              <View style={s.metaRow}>
                {article.category ? (
                  <View style={[s.categoryPill, { borderColor: colors.border }]}>
                    <Text style={[s.categoryPillText, { color: colors.accent }]}>{article.category}</Text>
                  </View>
                ) : null}
                {publishedAt ? <Text style={[s.metaText, { color: colors.textMuted }]}>{publishedAt}</Text> : null}
                {typeof article.viewsAll === 'number' ? <Text style={[s.metaText, { color: colors.textMuted }]}>· {article.viewsAll} vues</Text> : null}
                {article.authorName ? <Text style={[s.metaText, { color: colors.textMuted }]}>· {article.authorName}</Text> : null}
              </View>

              {/* Title */}
              <Text style={[s.title, { color: colors.text, fontFamily: Fonts.display }]}>{article.title}</Text>

              {/* Excerpt */}
              {article.excerpt ? <Text style={[s.excerpt, { color: colors.textSecondary }]}>{article.excerpt}</Text> : null}

              {/* AI Summary */}
              {article.aiSummary ? (
                <View style={[s.summaryCard, { borderColor: `${EPION_GREEN}30`, backgroundColor: `${EPION_GREEN}06` }]}>
                  <Text style={[s.summaryLabel, { color: EPION_GREEN }]}>RÉSUMÉ IA</Text>
                  <Text style={[s.summaryText, { color: colors.textSecondary }]}>{article.aiSummary}</Text>
                </View>
              ) : null}

              {/* Body content — rendered markdown */}
              {article.body ? (
                <View style={s.bodyContainer}>
                  {isHighlightActive ? (
                    <View style={[s.highlightNotice, { borderColor: `${EPION_GREEN}66`, backgroundColor: `${EPION_GREEN}10` }]}>
                      <Highlighter size={16} color={EPION_GREEN} />
                      <Text style={[s.highlightNoticeText, { color: colors.textSecondary }]}>
                        {hasHighlightableCitations
                          ? 'Mode surlignage actif : les passages avec citations sont mis en avant.'
                          : 'Mode surlignage actif. Le surlignage exact source-texte sera disponible quand les citations structurees seront presentes dans le texte.'}
                      </Text>
                    </View>
                  ) : null}
                  {renderMarkdownContent(article.body, colors.text, colors.text, colors.textTertiary, colors.border, isHighlightActive)}
                </View>
              ) : (
                <Text style={[s.emptyText, { color: colors.textMuted }]}>Aucun contenu disponible.</Text>
              )}

              {/* Sources (expandable) */}
              {article.sources?.length ? (
                <View style={s.sourcesSection}>
                  <Pressable style={[s.sourcesToggle, { borderColor: colors.border }]} onPress={() => setSourcesExpanded(!sourcesExpanded)}>
                    <Text style={[s.sourcesToggleText, { color: colors.text }]}>Sources ({article.sources.length})</Text>
                    <Text style={[s.sourcesToggleArrow, { color: colors.textMuted }]}>{sourcesExpanded ? '▾' : '▸'}</Text>
                  </Pressable>
                  {sourcesExpanded ? (
                    <View style={s.sourcesList}>{article.sources.map(renderSource)}</View>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* ========== ESPACE EPION (PRIMARY) ========== */}
            <View style={[s.interactionSpace, { borderColor: colors.border }]}>
              <View style={s.interactionHeader}>
                <Text style={[s.interactionTitle, { color: colors.text, fontFamily: Fonts.display }]}>Espace Epion</Text>
                <Text style={[s.interactionSubtitle, { color: colors.textSecondary }]}>Positionnez-vous, contribuez au débat sourcé et validez les apports de la communauté.</Text>
              </View>

              {advancedLoading && !advancedInteractions ? (
                <ActivityIndicator color={colors.textMuted} style={{ marginVertical: Spacing.xl }} />
              ) : null}

              {visibleAdvancedInteractions ? (
                <>
                  {/* ---- OPINION MAP ---- */}
                  <OpinionSliderCard
                    positions={POSITION_VALUES}
                    selectedPosition={selectedPosition}
                    lacksContext={lacksContext}
                    confirmedPosition={confirmedPosition}
                    isSubmittingPosition={isSubmittingPosition}
                    opinionQuestion={visibleAdvancedInteractions.opinionQuestion}
                    colors={colors}
                    onSelectPosition={(pos) => { setSelectedPosition(pos); setLacksContext(false); setAdvancedError(null); }}
                    onLacksContext={() => { setSelectedPosition(null); setLacksContext(true); setAdvancedError(null); }}
                    onConfirm={confirmOpinionPosition}
                  />

                  {/* ---- DISTRIBUTION (only after confirming position) ---- */}
                  {confirmedPosition && distribution ? (
                    <View style={[s.distributionCard, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
                      <Text style={[s.distributionLabel, { color: colors.textTertiary }]}>CARTE DE LA COMMUNAUTÉ</Text>
                      <View style={s.distributionBars}>
                        {POSITION_VALUES.map((pos) => {
                          const count = distribution.counts[String(pos)] ?? 0;
                          const height = Math.max(4, (count / maxOpinionCount) * 48);
                          return (
                            <View key={String(pos)} style={s.distributionCol}>
                              <View style={[s.distributionBar, { height, backgroundColor: `${EPION_GREEN}25` }]} />
                            </View>
                          );
                        })}
                      </View>
                      <Text style={[s.distributionHint, { color: colors.textMuted }]}>Répartition des positions de la communauté</Text>
                    </View>
                  ) : null}

                  {advancedError ? <Text style={[s.notice, { color: '#B45309' }]}>{advancedError}</Text> : null}

                  {/* ---- CONTRIBUTE GATEWAY ---- */}
                  <View style={[s.contributeCard, { borderColor: colors.border, backgroundColor: colors.backgroundElevated }]}>
                    <View style={s.contributeHeader}>
                      <View style={s.contributeHeaderText}>
                        <Text style={[s.contributeTitle, { color: colors.text }]}>Contribuer au débat</Text>
                        <Text style={[s.contributeSubtitle, { color: colors.textSecondary }]}>Sourcez, nuancez, corrigez ou posez une question.</Text>
                      </View>
                      {canContribute && !visibleAdvancedInteractions.hasInsufficientContext ? (
                        <Pressable
                          style={[s.gatewayToggleBtn, {
                            backgroundColor: isGatewayOpen ? colors.backgroundSubtle : EPION_GREEN,
                            borderColor: isGatewayOpen ? colors.border : 'transparent',
                          }]}
                          onPress={() => { setIsGatewayOpen(!isGatewayOpen); setSubmitMessage(null); setContributionTargetId(null); }}
                        >
                          <Text style={[s.gatewayToggleBtnText, { color: isGatewayOpen ? colors.text : '#000' }]}>
                            {isGatewayOpen ? '✕  Fermer' : '+  Contribuer'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    {visibleAdvancedInteractions.hasInsufficientContext ? (
                      <View style={[s.insufficientContextBox, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
                        <Text style={[s.insufficientContextText, { color: '#0369A1' }]}>Vous avez indiqué manquer d'éléments de contexte. Contribuez d'abord une source ou revenez après avoir confirmé une position.</Text>
                      </View>
                    ) : !canContribute ? (
                      <View style={[s.contributeLocked, { backgroundColor: colors.backgroundSubtle, borderColor: colors.borderSubtle }]}>
                        <Text style={[s.contributeLockedText, { color: colors.textMuted }]}>Confirmez une position pour publier une contribution sourcée.</Text>
                      </View>
                    ) : null}

                    {submitMessage ? (
                      <View style={[s.submitMessageBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <Text style={[s.submitMessageText, { color: '#065F46' }]}>{submitMessage}</Text>
                      </View>
                    ) : null}

                    {isGatewayOpen && canContribute ? (
                      <View style={s.gatewayContent}>
                        {/* Type grid — 2 columns like web */}
                        <View style={s.typeGrid}>
                          {CONTRIBUTION_TYPES.map((item) => {
                            const isActive = contributionType === item.type;
                            return (
                              <Pressable
                                key={item.type}
                                style={[s.typeBtn, {
                                  borderColor: isActive ? item.colors.border : colors.border,
                                  backgroundColor: isActive ? item.colors.bg : colors.backgroundSubtle,
                                }]}
                                onPress={() => setContributionType(item.type)}
                              >
                                <Text style={[s.typeBtnLabel, { color: isActive ? item.colors.text : colors.text }]}>{item.label}</Text>
                                <Text style={[s.typeBtnHelp, { color: isActive ? item.colors.text + 'AA' : colors.textMuted }]}>{item.help}</Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        {contributionTargetId ? (
                          <View style={[s.targetInfo, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
                            <Text style={s.targetInfoText}>Note de contexte pour une contribution existante. Source requise.</Text>
                            <Pressable onPress={() => setContributionTargetId(null)}>
                              <Text style={s.targetInfoDismiss}>✕</Text>
                            </Pressable>
                          </View>
                        ) : null}

                        <View style={[s.formBox, { borderColor: colors.border, backgroundColor: colors.backgroundSubtle }]}>
                          {contributionType !== 'SOURCE' ? (
                            <TextInput
                              style={[s.textArea, { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }]}
                              multiline
                              onChangeText={(t) => { setContributionText(t); setAdvancedError(null); }}
                              placeholder="Écrire une contribution précise et vérifiable..."
                              placeholderTextColor={colors.textMuted}
                              value={contributionText}
                            />
                          ) : null}
                          <TextInput
                            style={[s.textInput, { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }]}
                            onChangeText={(t) => { setContributionSourceUrl(t); setAdvancedError(null); }}
                            placeholder={contributionType === 'SOURCE' || contributionTargetId ? 'URL source (requise) — https://' : 'URL source (facultatif) — https://'}
                            placeholderTextColor={colors.textMuted}
                            value={contributionSourceUrl}
                            autoCapitalize="none"
                            keyboardType="url"
                          />
                          <View style={s.formActions}>
                            <Pressable
                              style={[s.cancelBtn, { borderColor: colors.border }]}
                              onPress={() => { setIsGatewayOpen(false); setContributionText(''); setContributionSourceUrl(''); setContributionTargetId(null); }}
                            >
                              <Text style={[s.cancelBtnText, { color: colors.text }]}>Annuler</Text>
                            </Pressable>
                            <Pressable style={[s.submitBtn, { backgroundColor: EPION_GREEN }]} disabled={isSubmittingContribution} onPress={submitContribution}>
                              <Text style={s.submitBtnText}>{isSubmittingContribution ? 'Envoi...' : 'Soumettre'}</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  {/* ---- CONTRIBUTIONS LIST ---- */}
                  {visibleAdvancedInteractions.contributions.length > 0 ? (
                    <>
                      <View style={s.contributionsListHeader}>
                        <Text style={[s.contributionsListTitle, { color: colors.text }]}>
                          Contributions ({visibleAdvancedInteractions.contributions.length})
                        </Text>
                        <View style={[s.sortRow, { borderColor: colors.border }]}>
                          <Pressable
                            style={[s.sortBtn, advancedSort === 'top' ? { backgroundColor: colors.backgroundSubtle } : null]}
                            onPress={() => changeAdvancedSort('top')}
                          >
                            <Text style={[s.sortBtnText, { color: advancedSort === 'top' ? colors.text : colors.textMuted, fontWeight: advancedSort === 'top' ? '600' : '400' }]}>Consensus</Text>
                          </Pressable>
                          <Pressable
                            style={[s.sortBtn, advancedSort === 'recent' ? { backgroundColor: colors.backgroundSubtle } : null]}
                            onPress={() => changeAdvancedSort('recent')}
                          >
                            <Text style={[s.sortBtnText, { color: advancedSort === 'recent' ? colors.text : colors.textMuted, fontWeight: advancedSort === 'recent' ? '600' : '400' }]}>Récents</Text>
                          </Pressable>
                        </View>
                      </View>
                      <View style={s.contributionsList}>
                        {advancedLoading ? <ActivityIndicator color={colors.textMuted} style={{ marginVertical: 12 }} /> : null}
                        {visibleAdvancedInteractions.contributions.map(renderContribution)}
                      </View>
                    </>
                  ) : !advancedLoading ? (
                    <View style={[s.emptyContributions, { borderColor: colors.borderSubtle }]}>
                      <Text style={[s.emptyText, { color: colors.textMuted }]}>Aucune contribution pour le moment. Soyez le premier à contribuer.</Text>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>

            {/* ========== COMMENTS (SECONDARY) ========== */}
            <View style={[s.commentsSection, { borderColor: colors.borderSubtle }]}>
              <Pressable style={s.commentsToggle} onPress={() => setCommentsExpanded(!commentsExpanded)}>
                <Text style={[s.commentsToggleText, { color: colors.textTertiary }]}>
                  Commentaires{comments.length > 0 ? ` (${comments.length})` : ''}
                </Text>
                <Text style={[s.commentsToggleArrow, { color: colors.textMuted }]}>{commentsExpanded ? '▾' : '▸'}</Text>
              </Pressable>

              {commentsExpanded ? (
                <View style={s.commentsContent}>
                  {/* Comment form */}
                  <View style={[s.commentForm, { borderColor: colors.borderSubtle }]}>
                    <TextInput
                      style={[s.commentInput, { borderColor: colors.border, backgroundColor: colors.backgroundElevated, color: colors.text }]}
                      multiline
                      onChangeText={setCommentText}
                      placeholder="Ajouter un commentaire..."
                      placeholderTextColor={colors.textMuted}
                      value={commentText}
                    />
                    <Pressable
                      style={[s.commentSendBtn, { backgroundColor: commentText.trim() ? colors.primary : colors.backgroundSubtle }]}
                      disabled={isPostingComment || !commentText.trim()}
                      onPress={submitComment}
                    >
                      <Text style={[s.commentSendBtnText, { color: commentText.trim() ? colors.background : colors.textMuted }]}>
                        {isPostingComment ? '...' : 'Publier'}
                      </Text>
                    </Pressable>
                  </View>
                  {commentError ? <Text style={[s.notice, { color: colors.error }]}>{commentError}</Text> : null}

                  {/* Comments list */}
                  {commentsLoading && comments.length === 0 ? <ActivityIndicator color={colors.textMuted} style={{ marginTop: 12 }} /> : null}
                  {comments.map((comment) => (
                    <View key={comment.id} style={[s.commentCard, { borderColor: colors.borderSubtle }]}>
                      <View style={s.commentHeader}>
                        <Text style={[s.commentAuthor, { color: colors.text }]}>{comment.authorName ?? 'Utilisateur Epion'}</Text>
                        <Text style={[s.commentDate, { color: colors.textMuted }]}>{formatDate(comment.createdAt)}</Text>
                      </View>
                      <Text style={[s.commentBody, { color: colors.textSecondary }]}>{comment.content}</Text>
                      {typeof comment.repliesCount === 'number' && comment.repliesCount > 0 ? (
                        <Text style={[s.commentReplies, { color: colors.textMuted }]}>{comment.repliesCount} réponses</Text>
                      ) : null}
                    </View>
                  ))}
                  {!commentsLoading && comments.length === 0 ? (
                    <Text style={[s.emptyText, { color: colors.textMuted, marginTop: Spacing.sm }]}>Aucun commentaire.</Text>
                  ) : null}
                  {commentsCursor ? (
                    <Pressable style={[s.loadMoreBtn, { borderColor: colors.border }]} disabled={commentsLoading} onPress={() => article.id && void loadComments(article.id, commentsCursor)}>
                      <Text style={[s.loadMoreText, { color: colors.text }]}>{commentsLoading ? '...' : 'Voir plus'}</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* ========== FLOATING ACTION BAR — single expanding container (like web) ========== */}
      {!isLoading && article ? (
        <View style={[s.floatingBarWrap, { bottom: insets.bottom + 12 }]}>
          <View style={[s.floatingBar, toolbarPanel ? s.floatingBarExpanded : null, { backgroundColor: colors.backgroundElevated + 'F2', borderColor: colors.border }]}>

            {/* === Expanded panel content (inside the bar) === */}
            {toolbarPanel === 'interactions' ? (
              <View style={s.panelContent}>
                <Text style={[s.panelLabel, { color: colors.textMuted }]}>INTERACTIONS</Text>
                <View style={s.panelActionsColumn}>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: reactions.userReaction === 'LIKE' ? '#A7F3D0' : colors.border, backgroundColor: reactions.userReaction === 'LIKE' ? '#ECFDF5' : 'transparent' }]}
                    onPress={() => void react('LIKE')}
                  >
                    <ThumbsUp size={18} color={reactions.userReaction === 'LIKE' ? '#059669' : colors.text} fill={reactions.userReaction === 'LIKE' ? '#059669' : 'none'} />
                    <Text style={[s.panelMenuBtnText, { color: reactions.userReaction === 'LIKE' ? '#059669' : colors.text }]}>{reactions.userReaction === 'LIKE' ? 'Aimé' : 'Aimer'}</Text>
                    {reactions.likes > 0 ? <Text style={[s.panelMenuBtnCount, { color: reactions.userReaction === 'LIKE' ? '#059669' : colors.textMuted }]}>{reactions.likes}</Text> : null}
                  </Pressable>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: reactions.userReaction === 'DISLIKE' ? '#FECACA' : colors.border, backgroundColor: reactions.userReaction === 'DISLIKE' ? '#FEF2F2' : 'transparent' }]}
                    onPress={() => void react('DISLIKE')}
                  >
                    <ThumbsDown size={18} color={reactions.userReaction === 'DISLIKE' ? '#DC2626' : colors.text} fill={reactions.userReaction === 'DISLIKE' ? '#DC2626' : 'none'} />
                    <Text style={[s.panelMenuBtnText, { color: reactions.userReaction === 'DISLIKE' ? '#DC2626' : colors.text }]}>{reactions.userReaction === 'DISLIKE' ? 'Désaimé' : 'Désaimer'}</Text>
                    {reactions.dislikes > 0 ? <Text style={[s.panelMenuBtnCount, { color: reactions.userReaction === 'DISLIKE' ? '#DC2626' : colors.textMuted }]}>{reactions.dislikes}</Text> : null}
                  </Pressable>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: reactions.userReposted ? '#C4B5FD' : colors.border, backgroundColor: reactions.userReposted ? '#F5F3FF' : 'transparent' }]}
                    onPress={() => void toggleRepost()}
                  >
                    <Repeat2 size={18} color={reactions.userReposted ? '#6D28D9' : colors.text} />
                    <Text style={[s.panelMenuBtnText, { color: reactions.userReposted ? '#6D28D9' : colors.text }]}>{reactions.userReposted ? 'Reposté' : 'Reposter'}</Text>
                    {reactions.reposts > 0 ? <Text style={[s.panelMenuBtnCount, { color: reactions.userReposted ? '#6D28D9' : colors.textMuted }]}>{reactions.reposts}</Text> : null}
                  </Pressable>
                  <Pressable
                    style={[s.panelMenuBtn, { borderColor: isSaved ? '#FFB01730' : colors.border, backgroundColor: isSaved ? '#FFF9ED' : 'transparent' }]}
                    disabled={isSaving}
                    onPress={toggleSave}
                  >
                    <Star size={18} color={isSaved ? '#C46101' : colors.text} fill={isSaved ? '#FFB017' : 'none'} />
                    <Text style={[s.panelMenuBtnText, { color: isSaved ? '#C46101' : colors.text }]}>{isSaved ? 'Article sauvegardé' : 'Sauvegarder'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {toolbarPanel === 'share' ? (
              <View style={s.panelContent}>
                <Text style={[s.panelLabel, { color: colors.textMuted }]}>PARTAGER</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shareDestinations}>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(article.title)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>𝕏</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>X</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://wa.me/?text=${encodeURIComponent(article.title + ' ' + shareUrl)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>W</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>WhatsApp</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>f</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>Facebook</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(article.title)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>R</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>Reddit</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={() => openShareDestination(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`)}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Text style={s.shareDestIconText}>in</Text></View>
                    <Text style={[s.shareDestLabel, { color: colors.text }]}>LinkedIn</Text>
                  </Pressable>
                  <Pressable style={s.shareDestBtn} onPress={shareArticle}>
                    <View style={[s.shareDestIcon, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}><Forward size={16} color={colors.textMuted} /></View>
                    <Text style={[s.shareDestLabel, { color: colors.textMuted }]}>Autre</Text>
                  </Pressable>
                </ScrollView>
                <View style={[s.shareUrlRow, { borderColor: copyState === 'copied' ? '#34D39980' : colors.border, backgroundColor: copyState === 'copied' ? '#ECFDF510' : colors.backgroundSubtle }]}>
                  {copyState === 'copied' ? <Check size={14} color="#10B981" /> : null}
                  <Text style={[s.shareUrlText, { color: colors.text }]} numberOfLines={1}>{shareUrl}</Text>
                  <Pressable style={[s.copyBtn, { backgroundColor: colors.text }]} onPress={copyShareUrl}>
                    <Text style={[s.copyBtnText, { color: colors.background }]}>{copyState === 'copied' ? 'Copié' : 'Copier'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {toolbarPanel === 'info' ? (
              <View style={s.panelContent}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Info size={18} color="#3B82F6" />
                  <Text style={[s.panelLabel, { color: colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0 }]}>Contexte de génération IA</Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16 }}>Transparence sur la création du contenu. Voici le prompt utilisé pour générer cet article.</Text>
                <View style={[s.infoPromptBox, { backgroundColor: colors.backgroundSubtle, borderColor: colors.border }]}>
                  {article.generationPrompt ? (
                    <Text style={[s.infoPromptText, { color: colors.textSecondary }]}>{article.generationPrompt}</Text>
                  ) : (
                    <Text style={[s.infoPromptText, { color: colors.textMuted, fontStyle: 'italic' }]}>Aucun contexte disponible.</Text>
                  )}
                </View>
              </View>
            ) : null}

            {/* Separator between panel and buttons */}
            {toolbarPanel ? <View style={[s.panelDivider, { backgroundColor: colors.border }]} /> : null}

            {/* === Bottom button row (always visible) === */}
            <View style={s.floatingButtonRow}>
              <Pressable style={s.floatingBackBtn} onPress={() => router.back()}>
                <ChevronLeft size={16} color={colors.text} />
                <Text style={[s.floatingBackText, { color: colors.text }]}>Actualités</Text>
              </Pressable>

              <View style={[s.floatingSeparator, { backgroundColor: colors.border }]} />

              <View style={s.floatingActions}>
                {/* Share */}
                <Pressable
                  style={[s.floatingBtn, toolbarPanel === 'share' ? s.floatingBtnActive : null]}
                  onPress={() => setToolbarPanel(toolbarPanel === 'share' ? null : 'share')}
                >
                  {toolbarPanel === 'share' ? <X size={20} color="#FFFFFF" /> : <Forward size={20} color={colors.textTertiary} />}
                </Pressable>

                {/* Interactions (heart) */}
                <Pressable
                  style={[s.floatingBtn, toolbarPanel === 'interactions' ? s.floatingBtnActive : null]}
                  onPress={() => setToolbarPanel(toolbarPanel === 'interactions' ? null : 'interactions')}
                >
                  {toolbarPanel === 'interactions' ? <X size={20} color="#FFFFFF" /> : <Heart size={20} color={reactions.userReaction === 'LIKE' ? EPION_GREEN : colors.textTertiary} fill={reactions.userReaction === 'LIKE' ? EPION_GREEN : 'none'} />}
                </Pressable>

                {/* Chat with article */}
                <Pressable
                  style={s.floatingBtn}
                  onPress={() => { setToolbarPanel(null); void openChatWithArticle(); }}
                >
                  <MessageSquare size={20} color={isChatLoading ? EPION_GREEN : colors.textTertiary} />
                </Pressable>

                {/* Sources */}
                <Pressable
                  style={[s.floatingBtn, showSourcesModal ? s.floatingBtnActive : null]}
                  accessibilityLabel={`Sources analysees (${sourceCount})`}
                  onPress={() => { setToolbarPanel(null); setShowSourcesModal(true); }}
                >
                  <ShieldCheck size={20} color={showSourcesModal ? '#FFFFFF' : colors.textTertiary} />
                </Pressable>

                {/* Highlight sources */}
                <Pressable
                  style={[s.floatingBtn, isHighlightActive ? s.floatingBtnActive : null]}
                  accessibilityLabel="Surligner les passages sources"
                  accessibilityState={{ selected: isHighlightActive }}
                  onPress={() => { setToolbarPanel(null); setIsHighlightActive(!isHighlightActive); }}
                >
                  <Highlighter size={20} color={isHighlightActive ? '#FFFFFF' : '#14B8A6'} />
                </Pressable>

                {/* Info / AI context */}
                <Pressable
                  style={[s.floatingBtn, toolbarPanel === 'info' ? s.floatingBtnActive : null]}
                  onPress={() => setToolbarPanel(toolbarPanel === 'info' ? null : 'info')}
                >
                  {toolbarPanel === 'info' ? <X size={20} color="#FFFFFF" /> : <Info size={20} color="#3B82F6" />}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      ) : null}
      {interactionMessage ? <Text style={[s.floatingNotice, { color: '#B45309', bottom: insets.bottom + 80 }]}>{interactionMessage}</Text> : null}
      {reactionError ? <Text style={[s.floatingNotice, { color: '#B45309', bottom: insets.bottom + 80 }]}>{reactionError}</Text> : null}

      {/* Modals for Trust & Sources */}
      {article?.factCheckDetail && (
        <TrustScoreModal
          visible={showTrustModal}
          onClose={() => setShowTrustModal(false)}
          detail={article.factCheckDetail}
          sources={article.sources ?? []}
          colors={colors}
        />
      )}
      {article ? (
        <SourcesModal
          visible={showSourcesModal}
          onClose={() => setShowSourcesModal(false)}
          sources={article.sources ?? []}
          colors={colors}
        />
      ) : null}
    </View>
  );
}

// --- MARKDOWN STYLES ---
const ms = StyleSheet.create({
  h1: { fontSize: FontSize['2xl'], fontWeight: '700', letterSpacing: -0.3, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  h2: { fontSize: FontSize.xl, fontWeight: '600', letterSpacing: -0.2, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  h3: { fontSize: FontSize.lg, fontWeight: '600', marginTop: Spacing.lg, marginBottom: Spacing.xs },
  paragraph: { fontSize: FontSize.md, lineHeight: 26, marginBottom: Spacing.md },
  blockquote: { borderLeftWidth: 3, paddingLeft: Spacing.md, paddingVertical: Spacing.sm, marginVertical: Spacing.md },
  blockquoteText: { fontSize: FontSize.md, lineHeight: 24, fontStyle: 'italic' },
  list: { marginVertical: Spacing.sm, gap: Spacing.xs },
  listItem: { flexDirection: 'row', paddingLeft: Spacing.sm, gap: Spacing.sm },
  listBullet: { fontSize: FontSize.md, lineHeight: 24 },
  listItemText: { flex: 1, fontSize: FontSize.md, lineHeight: 24 },
});

// --- COMPONENT STYLES ---
const s = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg },
  centerBox: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing['3xl'] },
  loadingText: { fontSize: FontSize.base },
  errorBox: { alignItems: 'center', borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.lg, padding: Spacing['2xl'] },
  errorText: { fontSize: FontSize.base, textAlign: 'center', lineHeight: 20 },
  retryBtn: { borderRadius: Radius.full, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  retryBtnText: { fontSize: FontSize.base, fontWeight: '600' },
  emptyText: { fontSize: FontSize.base, lineHeight: 22 },

  // Article body zone
  articleBody: { gap: Spacing.lg },
  imageWrap: { borderRadius: Radius.xl, borderWidth: 1, overflow: 'hidden', aspectRatio: 16 / 9, marginBottom: Spacing.xs },
  heroImage: { width: '100%', height: '100%' },

  // Trust header — vivid badge
  trustCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  trustScoreBadge: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  trustScoreText: { color: '#FFFFFF', fontSize: FontSize.sm, fontWeight: '700' },
  trustScoreTextMuted: { fontSize: FontSize.sm, fontWeight: '500' },
  trustMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  trustMetaLabel: { fontSize: FontSize.sm },
  trustSourcesBtn: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 3 },
  trustSourcesBtnText: { fontSize: FontSize.xs, fontWeight: '500' },
  trustStatusLabel: { fontSize: FontSize.xs, fontStyle: 'italic' },

  // Meta
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  categoryPill: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.sm, paddingVertical: 2 },
  categoryPillText: { fontSize: FontSize.sm, fontWeight: '600' },
  metaText: { fontSize: FontSize.sm },

  // Title + excerpt
  title: { fontSize: FontSize['3xl'], fontWeight: '700', letterSpacing: -0.5, lineHeight: 38 },
  excerpt: { fontSize: FontSize.lg, lineHeight: 26, marginTop: -4 },

  // Summary
  summaryCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.sm },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.8 },
  summaryText: { fontSize: FontSize.md, lineHeight: 24 },

  // Body
  bodyContainer: { gap: 0 },
  highlightNotice: { borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  highlightNoticeText: { flex: 1, fontSize: FontSize.sm, lineHeight: 19 },

  // Sources (expandable)
  sourcesSection: { gap: Spacing.sm },
  sourcesToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  sourcesToggleText: { fontSize: FontSize.base, fontWeight: '600' },
  sourcesToggleArrow: { fontSize: FontSize.lg },
  sourcesList: { gap: Spacing.sm },
  sourceItem: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  sourceFavicon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sourceFaviconText: { fontSize: FontSize.xs, fontWeight: '600' },
  sourceInfo: { flex: 1, gap: 1 },
  sourceDomain: { fontSize: FontSize.base, fontWeight: '600' },
  sourceDomainSub: { fontSize: FontSize.xs },
  sourceDesc: { fontSize: FontSize.sm, lineHeight: 18 },
  sourceType: { fontSize: FontSize.xs, textTransform: 'uppercase' as const },
  scorePill: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  scorePillText: { color: '#FFFFFF', fontSize: FontSize.xs, fontWeight: '700' },

  // --- ESPACE EPION (PRIMARY INTERACTION) ---
  interactionSpace: { marginTop: Spacing['2xl'], borderTopWidth: 1, paddingTop: Spacing['2xl'], gap: Spacing.lg },
  interactionHeader: { gap: Spacing.xs },
  interactionTitle: { fontSize: FontSize['2xl'], fontWeight: '600', letterSpacing: -0.3 },
  interactionSubtitle: { fontSize: FontSize.base, lineHeight: 20 },

  // Opinion card
  opinionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.lg, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  opinionCardTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  confirmedBadge: { alignSelf: 'flex-start', borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 4 },
  confirmedBadgeText: { color: '#065F46', fontSize: FontSize.xs, fontWeight: '600' },
  questionBox: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.lg },
  questionText: { fontSize: FontSize.md, fontWeight: '500', lineHeight: 22 },
  thesisRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  thesisPill: { flex: 1, borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm },
  thesisPillText: { fontSize: FontSize.sm, fontWeight: '500', textAlign: 'center' },

  // Position track
  positionTrack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing['2xl'], paddingHorizontal: 4, position: 'relative' },
  positionRail: { position: 'absolute', left: 4, right: 4, height: 3, borderRadius: 2, top: '50%' },
  positionDot: { width: 11, height: 11, borderRadius: 6, zIndex: 1 },
  positionDotActive: { width: 15, height: 15, borderRadius: 8, backgroundColor: EPION_GREEN, shadowColor: EPION_GREEN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
  positionLabelText: { fontSize: FontSize.base, fontWeight: '500', textAlign: 'center' },
  lacksContextBtn: { borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: Spacing.md },
  lacksContextText: { fontSize: FontSize.base, fontWeight: '500' },
  confirmBtn: { borderRadius: Radius.full, alignItems: 'center', paddingVertical: 12 },
  confirmBtnText: { color: '#FFFFFF', fontSize: FontSize.base, fontWeight: '700' },

  // Distribution
  distributionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  distributionLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.6 },
  distributionHint: { fontSize: FontSize.xs, textAlign: 'center' },
  distributionBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 48, gap: 4 },
  distributionCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  distributionBar: { width: '100%', borderRadius: 3 },

  // Contribute
  contributeCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  contributeHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  contributeHeaderText: { flex: 1, gap: 2 },
  contributeTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  contributeSubtitle: { fontSize: FontSize.sm, lineHeight: 18 },
  gatewayToggleBtn: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  gatewayToggleBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  gatewayContent: { gap: Spacing.md },
  formBox: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.md, gap: Spacing.md },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  cancelBtn: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.lg, paddingVertical: 10 },
  cancelBtnText: { fontSize: FontSize.sm, fontWeight: '500' },
  submitMessageBox: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  submitMessageText: { fontSize: FontSize.sm, fontWeight: '500', lineHeight: 18 },
  insufficientContextBox: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md },
  insufficientContextText: { fontSize: FontSize.sm, lineHeight: 18 },
  contributeLocked: { borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', padding: Spacing.lg, alignItems: 'center' },
  contributeLockedText: { fontSize: FontSize.base, lineHeight: 20, textAlign: 'center' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  typeBtn: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: 2, width: '47%', flexGrow: 1 },
  typeBtnLabel: { fontSize: FontSize.base, fontWeight: '600' },
  typeBtnHelp: { fontSize: FontSize.sm, lineHeight: 18 },
  targetInfo: { flexDirection: 'row', alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, gap: Spacing.sm },
  targetInfoText: { flex: 1, color: '#0369A1', fontSize: FontSize.sm },
  targetInfoDismiss: { color: '#0369A1', fontSize: FontSize.lg, fontWeight: '600' },
  textArea: { borderRadius: Radius.lg, borderWidth: 1, fontSize: FontSize.md, lineHeight: 21, minHeight: 80, padding: Spacing.md, textAlignVertical: 'top' },
  textInput: { borderRadius: Radius.lg, borderWidth: 1, fontSize: FontSize.md, padding: Spacing.md },
  submitBtn: { borderRadius: Radius.full, alignItems: 'center', paddingVertical: 10, paddingHorizontal: Spacing.xl },
  submitBtnText: { color: '#000000', fontSize: FontSize.base, fontWeight: '700' },

  // Contributions list header
  contributionsListHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  contributionsListTitle: { fontSize: FontSize.md, fontWeight: '600' },
  contributionsList: { gap: Spacing.sm },
  sortRow: { flexDirection: 'row', borderRadius: Radius.lg, borderWidth: 1, overflow: 'hidden', padding: 2 },
  sortBtn: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.md },
  sortBtnText: { fontSize: FontSize.xs },

  // Contribution cards
  contributionCard: { borderRadius: Radius.xl, borderWidth: 1, padding: Spacing.lg, gap: Spacing.md },
  contributionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  contributionAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  contributionAvatarText: { fontSize: FontSize.xs, fontWeight: '600' },
  contributionMeta: { flex: 1, gap: 2 },
  contributionAuthor: { fontSize: FontSize.sm, fontWeight: '600' },
  contributionTypeBadgeRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  typeBadgeInline: { borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  typeBadgeInlineText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' as const },
  contributionEdited: { fontSize: FontSize.xs },
  contestedBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm },
  contestedIcon: { fontSize: FontSize.base },
  contestedText: { flex: 1, color: '#92400E', fontSize: FontSize.sm, lineHeight: 18 },
  contributionBody: { fontSize: FontSize.base, lineHeight: 22 },
  sourceLink: { borderRadius: Radius.lg, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  sourceLinkDot: { width: 6, height: 6, borderRadius: 3 },
  sourceLinkText: { flex: 1, fontSize: FontSize.sm },
  sourceLinkArrow: { fontSize: FontSize.base },
  validationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  validationPill: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.md, paddingVertical: 5 },
  validationPillText: { fontSize: FontSize.xs, fontWeight: '500' },
  contextReplyBtn: { borderRadius: Radius.lg, borderWidth: 1, alignItems: 'center', paddingVertical: 8 },
  contextReplyText: { fontSize: FontSize.sm, fontWeight: '500' },
  childNote: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.xs, marginTop: Spacing.sm },
  childNoteLabel: { color: '#0369A1', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  childNoteBody: { fontSize: FontSize.sm, lineHeight: 20 },
  childNoteLink: { color: '#0369A1', fontSize: FontSize.xs },
  emptyContributions: { borderRadius: Radius.lg, borderWidth: 1, borderStyle: 'dashed', padding: Spacing.lg, alignItems: 'center' },

  // --- COMMENTS (SECONDARY) ---
  commentsSection: { marginTop: Spacing.xl, borderTopWidth: 1, paddingTop: Spacing.lg },
  commentsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  commentsToggleText: { fontSize: FontSize.base, fontWeight: '500' },
  commentsToggleArrow: { fontSize: FontSize.lg },
  commentsContent: { gap: Spacing.sm, marginTop: Spacing.sm },
  commentForm: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.sm, flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' },
  commentInput: { flex: 1, borderRadius: Radius.md, borderWidth: 1, fontSize: FontSize.sm, minHeight: 36, paddingHorizontal: Spacing.sm, paddingVertical: 6, textAlignVertical: 'top' },
  commentSendBtn: { borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 7 },
  commentSendBtnText: { fontSize: FontSize.sm, fontWeight: '600' },
  commentCard: { borderRadius: Radius.md, borderBottomWidth: 1, paddingVertical: Spacing.sm },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  commentAuthor: { fontSize: FontSize.sm, fontWeight: '500' },
  commentDate: { fontSize: FontSize.xs },
  commentBody: { fontSize: FontSize.sm, lineHeight: 19, marginTop: 3 },
  commentReplies: { fontSize: FontSize.xs, marginTop: Spacing.xs },
  loadMoreBtn: { borderRadius: Radius.full, borderWidth: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  loadMoreText: { fontSize: FontSize.sm, fontWeight: '500' },

  // --- FLOATING ACTION BAR (single expanding container) ---
  floatingBarWrap: { position: 'absolute', left: Spacing.md, right: Spacing.md, alignItems: 'center' },
  floatingBar: { width: '100%', maxWidth: 430, borderRadius: 32, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8, overflow: 'hidden' },
  floatingBarExpanded: { paddingVertical: 16, gap: 12 },
  floatingButtonRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  floatingBackBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 10, borderRadius: 20 },
  floatingBackText: { fontSize: FontSize.sm, fontWeight: '500' },
  floatingSeparator: { width: 1, height: 20, marginHorizontal: 4 },
  floatingActions: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  floatingBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  floatingBtnActive: { backgroundColor: '#000000' },

  // Panel content (inside the expanding bar)
  panelContent: { gap: Spacing.sm },
  panelDivider: { height: 1, marginVertical: 4 },
  panelLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' as const },
  panelActionsColumn: { gap: Spacing.sm },
  panelMenuBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 48, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.md },
  panelMenuBtnText: { fontSize: 15, fontWeight: '500', flex: 1 },
  panelMenuBtnCount: { fontSize: FontSize.xs, fontWeight: '400', opacity: 0.5 },

  // Share panel
  shareDestinations: { gap: 12, paddingVertical: 4, paddingHorizontal: 2 },
  shareDestBtn: { width: 64, height: 72, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: Radius.lg },
  shareDestIcon: { width: 40, height: 40, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shareDestIconText: { fontSize: 16, fontWeight: '700' },
  shareDestLabel: { fontSize: 11, fontWeight: '500' },
  shareUrlRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, paddingLeft: Spacing.md, paddingVertical: 6, paddingRight: 6 },
  shareUrlText: { flex: 1, fontSize: FontSize.xs },
  copyBtn: { borderRadius: Radius.full, paddingHorizontal: 12, paddingVertical: 8 },
  copyBtnText: { fontSize: FontSize.xs, fontWeight: '600' },

  // Info panel
  infoPromptBox: { borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, maxHeight: 160 },
  infoPromptText: { fontSize: 11, lineHeight: 17, fontFamily: 'monospace' },

  floatingNotice: { position: 'absolute', left: Spacing.xl, right: Spacing.xl, textAlign: 'center', fontSize: FontSize.xs },
  notice: { fontSize: FontSize.sm, lineHeight: 18, marginTop: 4 },
});
