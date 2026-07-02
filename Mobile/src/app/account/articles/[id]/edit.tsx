import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EpionSelect, GradientAccent } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { Fonts } from '@/constants/theme';
import {
  deleteEditableArticle,
  editArticleWithAI,
  fetchArticleImageProposals,
  fetchEditableArticle,
  updateEditableArticle,
  type EditableArticle,
  type EditArticleWithAIParams,
  type ImageProposal,
} from '@/lib/api';
import { getArticleStockImages } from '@/lib/article-images';

type PreviewMode = 'edit' | 'preview';
type AskTarget = Extract<EditArticleWithAIParams['field'], 'title' | 'summary' | 'content'>;
type ImageMode = 'proposals' | 'url' | 'stock';

const askTargetOptions: Array<{ value: AskTarget; label: string }> = [
  { value: 'content', label: 'Content' },
  { value: 'summary', label: 'Summary' },
  { value: 'title', label: 'Title' },
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getViewTarget(article: EditableArticle | null): string | null {
  if (!article) return null;
  return article.slug ?? article.id;
}

export default function EditArticleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const idOrSlug = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);
  const { user, loading: authLoading } = useAuth();

  const [article, setArticle] = useState<EditableArticle | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [imageMode, setImageMode] = useState<ImageMode>('proposals');
  const [imageUrl, setImageUrl] = useState('');
  const [pickedStock, setPickedStock] = useState<string | null>(null);
  const [proposals, setProposals] = useState<ImageProposal[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [mode, setMode] = useState<PreviewMode>('edit');
  const [askTarget, setAskTarget] = useState<AskTarget>('content');
  const [askInstruction, setAskInstruction] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailNotVerified = !!user && user.emailVerified === false;
  const forbidden = !!article?.authorId && !!user?.id && article.authorId !== user.id;
  const viewTarget = getViewTarget(article);
  const stockList = useMemo(() => getArticleStockImages(article?.categorySlug ?? article?.categoryName), [article?.categoryName, article?.categorySlug]);
  const previewSrc = imageMode === 'stock' ? pickedStock ?? '' : imageUrl.trim();
  const busy = loading || saving || deleting || asking;

  useEffect(() => {
    if (!idOrSlug) {
      setLoading(false);
      setError('Article introuvable.');
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    void fetchEditableArticle(idOrSlug)
      .then((loadedArticle) => {
        if (!alive) return;
        if (!loadedArticle) {
          setArticle(null);
          setError('Article introuvable.');
          return;
        }

        setArticle(loadedArticle);
        setTitle(loadedArticle.title);
        setSummary(loadedArticle.summary);
        setContent(loadedArticle.content);
        setImageUrl(loadedArticle.imageUrl ?? '');
        setImageMode('proposals');
        setPickedStock(null);
        setDirty(false);
      })
      .catch((loadError) => {
        if (alive) {
          setArticle(null);
          setError(getErrorMessage(loadError, 'Failed to load article'));
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [idOrSlug]);

  useEffect(() => {
    if (!article?.id || forbidden) return;

    let alive = true;
    setProposalsLoading(true);

    void fetchArticleImageProposals(article.id)
      .then((items) => {
        if (alive) setProposals(items);
      })
      .catch(() => {
        if (alive) setProposals([]);
      })
      .finally(() => {
        if (alive) setProposalsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [article?.id, forbidden]);

  function selectProposal(url: string) {
    setImageUrl(url);
    setImageMode('proposals');
    setPickedStock(null);
    setDirty(true);
  }

  function selectStockImage(url: string) {
    setPickedStock(url);
    setImageMode('stock');
    setDirty(true);
  }

  async function saveArticle(nextStatus: EditableArticle['status']) {
    if (!article || forbidden || emailNotVerified || !user) return;

    setSaving(true);
    setError(null);

    try {
      const result = await updateEditableArticle(article.id, {
        title: title.trim(),
        summary: summary.trim() || null,
        content: content.trim() || null,
        imageUrl: imageMode === 'stock' ? pickedStock : imageUrl.trim() || null,
        categoryId: article.categoryId,
        status: nextStatus,
      });

      const nextArticle = {
        ...article,
        slug: result.slug ?? article.slug,
        title: title.trim(),
        summary: summary.trim(),
        content: content.trim(),
        status: nextStatus,
        imageUrl: imageMode === 'stock' ? pickedStock : imageUrl.trim() || null,
      };
      setArticle(nextArticle);
      setDirty(false);

      if (nextStatus === 'PUBLISHED') {
        router.push({ pathname: '/article/[id]', params: { id: result.slug ?? result.id } });
      }
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Failed to save article'));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!article || forbidden || emailNotVerified || !user) return;

    Alert.alert('Delete this article?', 'This action cannot be undone from the mobile app.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void deleteArticle(),
      },
    ]);
  }

  async function deleteArticle() {
    if (!article) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteEditableArticle(article.id);
      router.replace('/account/articles');
    } catch (deleteError) {
      setError(getErrorMessage(deleteError, 'Failed to delete article'));
    } finally {
      setDeleting(false);
    }
  }

  async function askEpionToEdit() {
    if (!article || forbidden || emailNotVerified || !user) return;
    const instruction = askInstruction.trim();
    if (!instruction) return;

    const currentContent = askTarget === 'title' ? title : askTarget === 'summary' ? summary : content;

    setAsking(true);
    setError(null);

    try {
      const result = await editArticleWithAI(article.id, {
        instruction,
        currentContent,
        field: askTarget,
      });

      if (askTarget === 'title') setTitle(result.result);
      if (askTarget === 'summary') setSummary(result.result);
      if (askTarget === 'content') setContent(result.result);
      setAskInstruction('');
      setDirty(true);
    } catch (askError) {
      setError(getErrorMessage(askError, 'Failed to edit with Epion'));
    } finally {
      setAsking(false);
    }
  }

  function viewArticle() {
    if (!viewTarget) return;
    router.push({ pathname: '/article/[id]', params: { id: viewTarget } });
  }

  if (authLoading || loading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top + 32 }]}>
        <ActivityIndicator color="#000000" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <StateScreen
        insetsTop={insets.top}
        title="Edit article"
        message="You need an account to edit articles."
        primaryLabel="Sign in / Create account"
        onPrimary={() => router.push('/account')}
        secondaryLabel="View article"
        onSecondary={viewTarget ? viewArticle : undefined}
      />
    );
  }

  if (emailNotVerified) {
    return (
      <StateScreen
        insetsTop={insets.top}
        title="Edit article"
        message="You need to verify your email address before editing articles. Go to Settings / Account to resend the verification link."
        primaryLabel="Go to account"
        onPrimary={() => router.push('/settings/account')}
        secondaryLabel="View article"
        onSecondary={viewTarget ? viewArticle : undefined}
      />
    );
  }

  if (forbidden) {
    return (
      <StateScreen
        insetsTop={insets.top}
        title="Edit article"
        message="You are not allowed to edit this article."
        primaryLabel="View article"
        onPrimary={viewTarget ? viewArticle : () => router.push('/news')}
        secondaryLabel="Back to my articles"
        onSecondary={() => router.push('/account/articles')}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + 28 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.breadcrumb}>news / Edit</Text>
          <Text style={[styles.title, { fontFamily: Fonts.display }]}>Edit article</Text>
          <GradientAccent />
        </View>

        <View style={styles.topBar}>
          <Text style={styles.statusText}>{dirty ? 'Unsaved changes' : saving ? 'Saving draft...' : 'Up to date'}</Text>
          <Text style={[styles.statusPill, article?.status === 'PUBLISHED' ? styles.publishedPill : null]}>{article?.status ?? 'DRAFT'}</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {!article ? (
          <View style={styles.card}>
            <Text style={styles.cardText}>Article introuvable.</Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Field label="Title *" value={title} height={48} />
              <Text style={styles.helper}>This field is controlled by Epion. Use Ask Epion to edit.</Text>

              <Field label="Summary" value={summary} height={96} multiline />
              <Text style={styles.helper}>This field is controlled by Epion. Ask Epion to rewrite it.</Text>

              <View style={styles.contentHeader}>
                <Text style={styles.label}>Content</Text>
                <View style={styles.segmented}>
                  <SegmentButton label="Edit" active={mode === 'edit'} onPress={() => setMode('edit')} />
                  <SegmentButton label="Preview" active={mode === 'preview'} onPress={() => setMode('preview')} />
                </View>
              </View>

              {mode === 'edit' ? (
                <TextInput
                  value={content}
                  editable={false}
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, styles.monoInput, styles.contentInput]}
                />
              ) : (
                <View style={styles.previewBox}>
                  {content.trim() ? (
                    content.split(/\n{2,}/).map((paragraph, index) => (
                      <Text key={`${index}-${paragraph.slice(0, 12)}`} style={styles.previewText}>
                        {paragraph.trim()}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.previewMuted}>Nothing to preview...</Text>
                  )}
                </View>
              )}
              <Text style={styles.helper}>This field is controlled by Epion. Ask Epion to modify or regenerate it.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Cover image</Text>
              <View style={styles.imageSegmented}>
                <ImageModeButton label="Proposals" active={imageMode === 'proposals'} onPress={() => setImageMode('proposals')} />
                <ImageModeButton label="URL" active={imageMode === 'url'} onPress={() => setImageMode('url')} />
                <ImageModeButton label="Library" active={imageMode === 'stock'} onPress={() => setImageMode('stock')} />
              </View>

              {imageMode === 'proposals' ? (
                <View style={styles.imageSection}>
                  {proposalsLoading ? (
                    <View style={styles.inlineLoading}>
                      <ActivityIndicator color="#000000" size="small" />
                      <Text style={styles.cardText}>Searching images...</Text>
                    </View>
                  ) : proposals.length === 0 ? (
                    <Text style={styles.cardText}>No image proposals found.</Text>
                  ) : (
                    <View style={styles.imageGrid}>
                      {proposals.map((proposal, index) => (
                        <ImageChoice
                          key={`${proposal.url}-${index}`}
                          source={proposal.url}
                          label={proposal.source === 'OPEN_GRAPH' ? 'URL Source' : proposal.source}
                          selected={imageUrl === proposal.url}
                          onPress={() => selectProposal(proposal.url)}
                        />
                      ))}
                    </View>
                  )}
                </View>
              ) : null}

              {imageMode === 'url' ? (
                <TextInput
                  value={imageUrl}
                  onChangeText={(nextValue) => {
                    setImageUrl(nextValue);
                    setPickedStock(null);
                    setDirty(true);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="https://..."
                  placeholderTextColor="#8A8A80"
                  style={[styles.input, styles.urlInput]}
                />
              ) : null}

              {imageMode === 'stock' ? (
                <View style={styles.imageGrid}>
                  {stockList.map((source) => (
                    <ImageChoice
                      key={source}
                      source={source}
                      label="Library"
                      selected={pickedStock === source}
                      onPress={() => selectStockImage(source)}
                    />
                  ))}
                </View>
              ) : null}

              {previewSrc ? (
                <View style={styles.previewImageBox}>
                  <Image source={{ uri: previewSrc }} style={styles.previewImage} contentFit="cover" transition={180} />
                </View>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Ask Epion to edit</Text>
              <Text style={styles.cardText}>Select a field and tell Epion what to change.</Text>
              <EpionSelect label="Target field" value={askTarget} onChange={(value) => setAskTarget(value as AskTarget)} options={askTargetOptions} disabled={busy} />
              <TextInput
                value={askInstruction}
                onChangeText={setAskInstruction}
                editable={!busy}
                multiline
                textAlignVertical="top"
                placeholder="Ex: Raccourcis le texte, change le ton..."
                placeholderTextColor="#8A8A80"
                style={[styles.input, styles.askInput]}
              />
              <Pressable
                disabled={busy || !askInstruction.trim()}
                onPress={() => void askEpionToEdit()}
                style={({ pressed }) => [styles.primaryButton, busy || !askInstruction.trim() ? styles.buttonDisabled : null, pressed ? styles.pressed : null]}
              >
                {asking ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
                <Text style={styles.primaryButtonText}>{asking ? 'Epion is working...' : 'Apply change'}</Text>
              </Pressable>
            </View>

            <View style={styles.actionsCard}>
              <Pressable disabled={busy || !viewTarget} onPress={viewArticle} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
                <Text style={styles.secondaryButtonText}>View article</Text>
              </Pressable>
              <Pressable disabled={busy || !title.trim()} onPress={() => void saveArticle('DRAFT')} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
                {saving ? <ActivityIndicator color="#000000" size="small" /> : null}
                <Text style={styles.secondaryButtonText}>Save draft</Text>
              </Pressable>
              <Pressable disabled={busy || !title.trim()} onPress={() => void saveArticle('PUBLISHED')} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null]}>
                <Text style={styles.primaryButtonText}>{article.status === 'PUBLISHED' ? 'Update / Republish' : 'Publish'}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={confirmDelete} style={({ pressed }) => [styles.deleteButton, pressed ? styles.pressed : null]}>
                {deleting ? <ActivityIndicator color="#DC2626" size="small" /> : null}
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Field({ label, value, height, multiline = false }: { label: string; value: string; height: number; multiline?: boolean }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        editable={false}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, { minHeight: height }, multiline ? styles.textarea : null]}
      />
    </View>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segmentButton, active ? styles.segmentButtonActive : null]}>
      <Text style={[styles.segmentButtonText, active ? styles.segmentButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function ImageModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.imageModeButton, active ? styles.imageModeButtonActive : null]}>
      <Text style={[styles.imageModeButtonText, active ? styles.imageModeButtonTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

function ImageChoice({ source, label, selected, onPress }: { source: string; label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.imageChoice, selected ? styles.imageChoiceSelected : null]}>
      <Image source={{ uri: source }} style={styles.imageChoiceImage} contentFit="cover" transition={180} />
      <View style={styles.imageChoiceLabel}>
        <Text style={styles.imageChoiceLabelText} numberOfLines={1}>{label}</Text>
      </View>
      {selected ? (
        <View style={styles.imageChoiceOverlay}>
          <View style={styles.imageChoiceCheck}>
            <Text style={styles.imageChoiceCheckText}>OK</Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

function StateScreen({
  insetsTop,
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: {
  insetsTop: number;
  title: string;
  message: string;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insetsTop + 28 }]}>
        <View style={styles.header}>
          <Text style={styles.breadcrumb}>news / Edit</Text>
          <Text style={[styles.title, { fontFamily: Fonts.display }]}>{title}</Text>
          <GradientAccent />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardText}>{message}</Text>
          <View style={styles.actions}>
            <Pressable onPress={onPrimary} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
            </Pressable>
            {secondaryLabel && onSecondary ? (
              <Pressable onPress={onSecondary} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{secondaryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FAFAF5',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  content: {
    gap: 20,
    paddingBottom: 42,
    paddingHorizontal: 20,
  },
  header: {
    gap: 14,
  },
  breadcrumb: {
    color: 'rgba(0,0,0,0.58)',
    fontSize: 13,
  },
  title: {
    color: '#000000',
    fontSize: 34,
    fontWeight: '500',
    lineHeight: 40,
  },
  topBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
  },
  statusText: {
    color: 'rgba(0,0,0,0.62)',
    fontSize: 13,
  },
  statusPill: {
    backgroundColor: '#F5F5F4',
    borderRadius: 999,
    color: '#44403C',
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  publishedPill: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    padding: 18,
  },
  cardTitle: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
  },
  cardText: {
    color: 'rgba(0,0,0,0.68)',
    fontSize: 13,
    lineHeight: 19,
  },
  fieldGroup: {
    gap: 7,
  },
  label: {
    color: 'rgba(0,0,0,0.72)',
    fontSize: 14,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#F5F5F4',
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    color: '#111111',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textarea: {
    paddingTop: 12,
  },
  monoInput: {
    fontFamily: Fonts.mono,
    fontSize: 13,
  },
  contentInput: {
    minHeight: 220,
  },
  askInput: {
    backgroundColor: '#FFFFFF',
    minHeight: 112,
  },
  helper: {
    color: 'rgba(0,0,0,0.54)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: -6,
  },
  contentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  segmented: {
    backgroundColor: '#F5F5F4',
    borderRadius: 999,
    flexDirection: 'row',
    padding: 3,
  },
  segmentButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segmentButtonActive: {
    backgroundColor: '#000000',
  },
  segmentButtonText: {
    color: 'rgba(0,0,0,0.62)',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentButtonTextActive: {
    color: '#FFFFFF',
  },
  previewBox: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    minHeight: 220,
    padding: 14,
  },
  previewText: {
    color: '#111111',
    fontSize: 15,
    lineHeight: 23,
  },
  previewMuted: {
    color: 'rgba(0,0,0,0.48)',
    fontSize: 14,
    fontStyle: 'italic',
  },
  imageSegmented: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5F5F4',
    borderRadius: 12,
    flexDirection: 'row',
    padding: 4,
  },
  imageModeButton: {
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  imageModeButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  imageModeButtonText: {
    color: 'rgba(0,0,0,0.58)',
    fontSize: 12,
    fontWeight: '700',
  },
  imageModeButtonTextActive: {
    color: '#000000',
  },
  imageSection: {
    gap: 12,
  },
  inlineLoading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  imageChoice: {
    aspectRatio: 1.42,
    backgroundColor: '#F5F5F4',
    borderColor: 'transparent',
    borderRadius: 14,
    borderWidth: 2,
    flexBasis: '47%',
    flexGrow: 1,
    maxWidth: '49%',
    minWidth: 130,
    overflow: 'hidden',
  },
  imageChoiceSelected: {
    borderColor: '#000000',
  },
  imageChoiceImage: {
    height: '100%',
    width: '100%',
  },
  imageChoiceLabel: {
    backgroundColor: 'rgba(0,0,0,0.62)',
    bottom: 0,
    left: 0,
    paddingHorizontal: 7,
    paddingVertical: 4,
    position: 'absolute',
    right: 0,
  },
  imageChoiceLabelText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  imageChoiceOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  imageChoiceCheck: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  imageChoiceCheckText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
  },
  urlInput: {
    backgroundColor: '#FFFFFF',
  },
  previewImageBox: {
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 16,
    borderWidth: 1,
    height: 170,
    overflow: 'hidden',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  actionsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  actions: {
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 22,
    paddingVertical: 13,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#FECACA',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  deleteButtonText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  pressed: {
    opacity: 0.78,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 19,
  },
  loadingText: {
    color: 'rgba(0,0,0,0.64)',
    fontSize: 14,
  },
});