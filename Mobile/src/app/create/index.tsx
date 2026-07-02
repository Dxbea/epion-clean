import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import {
  fetchCategories,
  generateArticleWithAI,
  type Category,
  type GenerateArticleLanguage,
  type GenerateArticleTone,
} from '@/lib/api';
import { EpionSelect, GradientAccent } from '@/components/ui';
import { Fonts } from '@/constants/theme';

const MAX_PROMPT_CHARS = 2000;

const languageOptions: Array<{ value: GenerateArticleLanguage; label: string }> = [
  { value: 'fr', label: 'French' },
  { value: 'en', label: 'English' },
];

const toneOptions: Array<{ value: GenerateArticleTone; label: string }> = [
  { value: 'neutral', label: 'Neutral / reporter' },
  { value: 'explainer', label: 'Explainer / pedagogique' },
  { value: 'short', label: 'Short / breve' },
  { value: 'indepth', label: 'In-depth' },
];

function forbidHtml(value: string): boolean {
  return /<|>/.test(value);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function CreateArticleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading: authLoading } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [language, setLanguage] = useState<GenerateArticleLanguage>('fr');
  const [tone, setTone] = useState<GenerateArticleTone>('neutral');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const promptTooLong = prompt.length > MAX_PROMPT_CHARS;
  const trimmedPrompt = prompt.trim();
  const emailNotVerified = !!user && user.emailVerified === false;

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === categoryId) ?? null,
    [categories, categoryId],
  );

  const formDisabled = isGenerating || !trimmedPrompt || promptTooLong || !categoryId || emailNotVerified;

  useEffect(() => {
    let alive = true;
    setCategoriesLoading(true);

    void fetchCategories()
      .then((items) => {
        if (alive) setCategories(items);
      })
      .catch(() => {
        if (alive) setCategories([]);
      })
      .finally(() => {
        if (alive) setCategoriesLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  async function handleGenerate() {
    if (!user) {
      router.push('/account');
      return;
    }

    if (emailNotVerified) {
      router.push('/settings/account');
      return;
    }

    if (!trimmedPrompt || !categoryId) return;

    if (forbidHtml(prompt)) {
      setError('HTML tags are not allowed in the prompt.');
      return;
    }

    if (promptTooLong) {
      setError(`Le prompt est trop long (${prompt.length} / ${MAX_PROMPT_CHARS} caracteres).`);
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateArticleWithAI({
        topic: trimmedPrompt,
        language,
        style: tone,
        categoryId,
        categoryName: selectedCategory?.name ?? '',
        generateImage: true,
      });

      const articleTarget = result.article?.id;
      if (!articleTarget) {
        throw new Error('Invalid response from server');
      }

      router.push({ pathname: '/account/articles/[id]/edit', params: { id: articleTarget } });
    } catch (generationError) {
      setError(getErrorMessage(generationError, 'Unable to generate article'));
    } finally {
      setIsGenerating(false);
    }
  }

  if (authLoading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top + 32 }]}>
        <ActivityIndicator color="#000000" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]} showsVerticalScrollIndicator={false}>
          <Header />
          <View style={styles.card}>
            <Text style={styles.cardText}>You need an account to create articles with Epion.</Text>
            <View style={styles.actions}>
              <Pressable style={styles.primaryButton} onPress={() => router.push('/account')}>
                <Text style={styles.primaryButtonText}>Sign in / Create account</Text>
              </Pressable>
              <Pressable style={styles.ghostButton} onPress={() => router.push('/news')}>
                <Text style={styles.ghostButtonText}>Back to news</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  if (emailNotVerified) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]} showsVerticalScrollIndicator={false}>
          <Header />
          <View style={styles.card}>
            <Text style={styles.cardText}>
              You need to verify your email address before creating articles. Go to Settings / Account to resend the verification link.
            </Text>
            <View style={styles.actions}>
              <Pressable style={styles.primaryButton} onPress={() => router.push('/settings/account')}>
                <Text style={styles.primaryButtonText}>Go to account</Text>
              </Pressable>
              <Pressable style={styles.ghostButton} onPress={() => router.push('/news')}>
                <Text style={styles.ghostButtonText}>Back to news</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <Header />

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>What should Epion write? *</Text>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              editable={!isGenerating}
              multiline
              textAlignVertical="top"
              maxLength={MAX_PROMPT_CHARS + 200}
              placeholder="Ex: Fais-moi un article de 600 mots sur l'arrivee de la norme Euro 7 pour le grand public. Ajoute une section 'Pourquoi ca compte ?' et une 'Ce qu'il faut surveiller'."
              placeholderTextColor="#8A8A80"
              style={[styles.textarea, promptTooLong ? styles.textareaError : null]}
            />
            <View style={styles.promptMetaRow}>
              <Text style={styles.helper}>Decris le resultat attendu. Tu pourras affiner sur l'ecran suivant.</Text>
              <Text style={[styles.counter, promptTooLong ? styles.counterError : null]}>
                {prompt.length} / {MAX_PROMPT_CHARS}
              </Text>
            </View>
          </View>

          <EpionSelect label="Language" value={language} options={languageOptions} onChange={(nextValue) => setLanguage(nextValue as GenerateArticleLanguage)} disabled={isGenerating} />
          <EpionSelect label="Style" value={tone} options={toneOptions} onChange={(nextValue) => setTone(nextValue as GenerateArticleTone)} disabled={isGenerating} />

          <View style={styles.fieldGroup}>
            <EpionSelect
              label="Category *"
              value={categoryId}
              onChange={setCategoryId}
              placeholder="Select..."
              disabled={isGenerating || categories.length === 0}
              loading={categoriesLoading}
              options={[{ value: '', label: '-- None --' }, ...categories.map((category) => ({ value: category.id, label: category.name }))]}
            />
            {!categoriesLoading && categories.length === 0 ? (
              <Text style={styles.helper}>Categories could not be loaded right now.</Text>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Pressable
              disabled={formDisabled}
              onPress={() => void handleGenerate()}
              style={({ pressed }) => [styles.primaryButton, formDisabled ? styles.buttonDisabled : null, pressed ? styles.pressed : null]}
            >
              {isGenerating ? <ActivityIndicator color="#FFFFFF" size="small" /> : null}
              <Text style={styles.primaryButtonText}>{isGenerating ? 'Generating...' : 'Generate with AI'}</Text>
            </Pressable>

            <Pressable disabled={isGenerating} onPress={() => router.push('/news')} style={({ pressed }) => [styles.ghostButton, pressed ? styles.pressed : null]}>
              <Text style={styles.ghostButtonText}>Cancel</Text>
            </Pressable>
          </View>

        </View>
      </ScrollView>
    </View>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.breadcrumb}>news / Create</Text>
      <Text style={[styles.title, { fontFamily: Fonts.display }]}>Create an article (AI-first)</Text>
      <GradientAccent />

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
    gap: 28,
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
  form: {
    gap: 22,
  },
  card: {
    backgroundColor: '#FAFAF5',
    borderColor: 'rgba(0,0,0,0.10)',
    borderRadius: 24,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  cardText: {
    color: '#111111',
    fontSize: 14,
    lineHeight: 21,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: 'rgba(0,0,0,0.72)',
    fontSize: 14,
    fontWeight: '500',
  },
  textarea: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    color: '#000000',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 150,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  textareaError: {
    borderColor: '#DC2626',
  },
  promptMetaRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  helper: {
    color: 'rgba(0,0,0,0.58)',
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  counter: {
    color: 'rgba(0,0,0,0.58)',
    fontSize: 12,
    fontWeight: '600',
  },
  counterError: {
    color: '#DC2626',
  },
  actions: {
    gap: 12,
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
  ghostButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  ghostButtonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
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
  pressed: {
    opacity: 0.78,
  },
});
