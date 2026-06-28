import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { fetchArticleStats, recordArticleView } from '@/lib/api';
import type { ArticleDetail } from '@/types/article';

type ArticleDetailScreenProps = {
  loadArticle: () => Promise<ArticleDetail | null>;
  missingText?: string;
};

function formatDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function scoreStatusLabel(status?: string): string | undefined {
  if (!status || status === 'COMPLETED') return undefined;
  if (status === 'PENDING') return 'Analyse en attente';
  if (status === 'RUNNING') return 'Analyse en cours';
  if (status === 'FAILED') return 'Analyse indisponible';
  if (status === 'STALE') return 'Score base sur une version precedente';
  return status;
}

export function ArticleDetailScreenContent({ loadArticle, missingText = 'Aucun detail disponible pour cet article.' }: ArticleDetailScreenProps) {
  const router = useRouter();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

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
      }
    } catch {
      setArticle(null);
      setError('Impossible de charger cet article pour le moment.');
    } finally {
      setIsLoading(false);
    }
  }, [loadArticle]);

  useEffect(() => {
    void load();
  }, [load]);

  const publishedAt = formatDate(article?.publishedAt);
  const statusLabel = scoreStatusLabel(article?.factCheckStatus);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </Pressable>

        {isLoading ? (
          <View style={styles.stateBox}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.stateText}>Chargement de l'article...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={styles.stateBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={load}>
              <Text style={styles.retryText}>Reessayer</Text>
            </Pressable>
          </View>
        ) : null}

        {!isLoading && !error && !article ? (
          <View style={styles.stateBox}>
            <Text style={styles.emptyText}>{missingText}</Text>
          </View>
        ) : null}

        {!isLoading && !error && article ? (
          <View style={styles.article}>
            <View style={styles.metaRow}>
              {article.category ? <Text style={styles.category}>{article.category}</Text> : null}
              {publishedAt ? <Text style={styles.meta}>{publishedAt}</Text> : null}
              {typeof article.viewsAll === 'number' ? <Text style={styles.meta}>{article.viewsAll} vues</Text> : null}
              {article.authorName ? <Text style={styles.meta}>{article.authorName}</Text> : null}
            </View>

            <Text style={styles.title}>{article.title}</Text>
            {article.excerpt ? <Text style={styles.excerpt}>{article.excerpt}</Text> : null}

            <View style={styles.trustBox}>
              <Text style={styles.trustTitle}>Transparence</Text>
              <View style={styles.trustRow}>
                {typeof article.factCheckScore === 'number' ? (
                  <Text style={styles.trustPill}>FactScore {article.factCheckScore}</Text>
                ) : (
                  <Text style={styles.trustPill}>Score non disponible</Text>
                )}
                {article.supportLevel ? <Text style={styles.trustPill}>{article.supportLevel}</Text> : null}
                {typeof article.sourcesCount === 'number' ? <Text style={styles.trustPill}>{article.sourcesCount} sources</Text> : null}
              </View>
              {statusLabel ? <Text style={styles.placeholderText}>{statusLabel}</Text> : null}
              <Text style={styles.placeholderText}>Placeholder mobile: detail des sources, modal de fiabilite et surlignage a adapter depuis le web.</Text>
            </View>

            {article.aiSummary ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Resume IA</Text>
                <Text style={styles.infoText}>{article.aiSummary}</Text>
              </View>
            ) : null}

            {article.structuredContentAvailable ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoTitle}>Article structure</Text>
                <Text style={styles.infoText}>Placeholder mobile: le rendu structure avec claims et citations reste a transformer depuis React web.</Text>
              </View>
            ) : null}

            {article.body ? <Text style={styles.body}>{article.body}</Text> : <Text style={styles.emptyText}>Aucun contenu disponible.</Text>}

            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Interactions</Text>
              <Text style={styles.infoText}>Placeholder mobile: sauvegarde, reactions, commentaires, partage, chat avec l'article et prompt de generation existent cote web mais demandent une adaptation React Native dediee.</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 54,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderRadius: 8,
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stateBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 24,
  },
  stateText: {
    color: '#4B5563',
    fontSize: 15,
    marginTop: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyText: {
    color: '#4B5563',
    fontSize: 15,
    lineHeight: 22,
  },
  article: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  category: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  meta: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 35,
  },
  excerpt: {
    color: '#374151',
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 25,
    marginTop: 20,
  },
  body: {
    color: '#1F2937',
    fontSize: 16,
    lineHeight: 25,
    marginTop: 24,
  },
  trustBox: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 22,
    padding: 14,
  },
  trustTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  trustRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  trustPill: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    color: '#111827',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  placeholderText: {
    color: '#6B7280',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  infoBox: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
  },
  infoTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  infoText: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 21,
  },
});
