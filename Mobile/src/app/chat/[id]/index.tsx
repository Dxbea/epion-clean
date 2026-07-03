import { Link, router, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowUp, ChevronDown, Folder, FolderPlus, Home, Menu, MessageCircle, Mic, MoreHorizontal, Plus, Search, Settings, ShieldCheck, SlidersHorizontal, Sparkles, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  createChatFolder,
  createChatSession,
  deleteChatFolder,
  deleteChatSession,
  fetchChatFolders,
  fetchChatMessages,
  fetchChatSession,
  fetchChatSessions,
  sendChatMessage,
  updateChatSession,
  type ChatFolder,
  type ChatMessageItem,
  type ChatResponseStyle,
  type ChatRigor,
  type ChatSessionDetail,
  type ChatSessionSummary,
} from '@/lib/api';

type ChatModel = 'web-sonar' | 'web-sonar-pro' | 'rag';
type Toast = { id: number; text: string };

const RESPONSE_STYLES: Array<{ id: ChatResponseStyle; label: string; desc: string }> = [
  { id: 'concise', label: 'Concis', desc: 'Reponse courte et directe' },
  { id: 'normal', label: 'Standard', desc: 'Equilibre entre clarte et detail' },
  { id: 'detailed', label: 'Detaille', desc: 'Analyse plus complete et structuree' },
];

const toRoute = (id: string) => ({ pathname: '/chat/[id]', params: { id } }) as unknown as Href;
const titleOf = (session?: Pick<ChatSessionSummary, 'title'> | null) => session?.title?.trim() || 'Sans titre';
const getStatus = (error: unknown) => error instanceof Error && 'status' in error ? (error as { status?: number }).status : undefined;
const getCode = (error: unknown) => error instanceof Error && 'code' in error ? (error as { code?: string }).code : undefined;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function messageText(message: ChatMessageItem) {
  try { const parsed = JSON.parse(message.content) as { answer?: unknown }; return typeof parsed.answer === 'string' ? parsed.answer : message.content; } catch { return message.content; }
}
function sourcesOf(message: ChatMessageItem) {
  if (Array.isArray(message.sources)) return message.sources;
  try { const parsed = JSON.parse(message.content) as { sources?: unknown[] }; return Array.isArray(parsed.sources) ? parsed.sources : []; } catch { return []; }
}
function supportOf(message: ChatMessageItem) {
  const metadata = message.metadata && typeof message.metadata === 'object' ? message.metadata as Record<string, unknown> : null;
  return typeof metadata?.supportLevel === 'string' ? metadata.supportLevel : null;
}

export default function ChatSessionScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id) ?? '', [params.id]);
  const { user, loading: authLoading } = useAuth();
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView | null>(null);

  const [session, setSession] = useState<ChatSessionDetail | null>(null);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [folderItems, setFolderItems] = useState<ChatSessionSummary[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [model, setModel] = useState<ChatModel>('web-sonar');
  const [responseStyle, setResponseStyle] = useState<ChatResponseStyle>('normal');
  const [sourceRestricted, setSourceRestricted] = useState(true);
  const [neutralityForced, setNeutralityForced] = useState(true);
  const [timeRecent, setTimeRecent] = useState(false);
  const [actions, setActions] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [transparencyOpen, setTransparencyOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<ChatSessionSummary | null>(null);
  const [query, setQuery] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [folderLoading, setFolderLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((text: string) => {
    const toast = { id: Date.now() + Math.random(), text };
    setToasts((current) => [...current, toast]);
    setTimeout(() => setToasts((current) => current.filter((item) => item.id !== toast.id)), 2600);
  }, []);

  const refreshSidebar = useCallback(async () => {
    if (!user) return;
    const [nextSessions, nextFolders] = await Promise.all([fetchChatSessions({ take: 50 }), fetchChatFolders().catch(() => [])]);
    setSessions(nextSessions);
    setFolders(nextFolders);
  }, [user]);

  const loadConversation = useCallback(async () => {
    if (!user || !id) return;
    setIsLoading(true); setError(null);
    try {
      const [nextSession, nextMessages] = await Promise.all([fetchChatSession(id), fetchChatMessages(id), refreshSidebar()]);
      setSession(nextSession); setMessages(nextMessages);
      if (nextSession.mode) setModel(nextSession.mode === 'fast' ? 'rag' : 'web-sonar');
    } catch (loadError) {
      const status = getStatus(loadError);
      setError(status === 404 ? 'Conversation introuvable.' : status === 401 || status === 403 ? 'Connecte-toi pour acceder a cette conversation.' : 'Impossible de charger la conversation.');
    } finally { setIsLoading(false); }
  }, [id, refreshSidebar, user]);

  const openChat = useCallback((chatId: string) => { setActiveFolderId(null); setDrawerOpen(false); setSearchOpen(false); router.push(toRoute(chatId)); }, []);

  const createNewChat = useCallback(async () => {
    if (!user || isCreating) return;
    setIsCreating(true);
    try {
      const created = await createChatSession({ mode: 'balanced' });
      setSessions((current) => [created, ...current]);
      setActiveFolderId(null); setDrawerOpen(false); router.push(toRoute(created.id));
    } catch (createError) { pushToast(getStatus(createError) === 401 ? 'Reconnecte-toi pour utiliser le chat.' : 'Impossible de creer un nouveau chat.'); }
    finally { setIsCreating(false); }
  }, [isCreating, pushToast, user]);

  const openFolder = useCallback(async (folderId: string) => {
    setActiveFolderId(folderId); setDrawerOpen(false); setFolderLoading(true);
    try { setFolderItems(await fetchChatSessions({ take: 50, folderId })); }
    catch { pushToast('Impossible de charger ce dossier.'); setFolderItems([]); }
    finally { setFolderLoading(false); }
  }, [pushToast]);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim(); if (!name) return;
    try { const folder = await createChatFolder(name); setFolders((current) => [...current, folder]); setNewFolderName(''); setFolderModalOpen(false); pushToast(`Dossier "${folder.name}" cree`); }
    catch { pushToast('Creation du dossier impossible.'); }
  }, [newFolderName, pushToast]);

  const removeFolder = useCallback((folder: ChatFolder) => {
    Alert.alert('Supprimer ce dossier ?', 'Les chats resteront accessibles dans la liste generale.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => void deleteChatFolder(folder.id).then(() => { setFolders((current) => current.filter((item) => item.id !== folder.id)); if (activeFolderId === folder.id) setActiveFolderId(null); pushToast('Dossier supprime'); }).catch(() => pushToast('Suppression impossible.')) },
    ]);
  }, [activeFolderId, pushToast]);

  const deleteConversation = useCallback((conversation: ChatSessionSummary) => {
    Alert.alert('Supprimer cette conversation ?', titleOf(conversation), [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => void deleteChatSession(conversation.id).then(async () => {
        setSessions((current) => current.filter((item) => item.id !== conversation.id));
        if (conversation.id === id) {
          const remaining = sessions.filter((item) => item.id !== conversation.id);
          if (remaining[0]) router.replace(toRoute(remaining[0].id)); else router.replace(toRoute((await createChatSession({ mode: 'balanced' })).id));
        }
        pushToast('Conversation supprimee');
      }).catch(() => pushToast('Suppression impossible.')) },
    ]);
  }, [id, pushToast, sessions]);

  const moveConversation = useCallback(async (conversation: ChatSessionSummary, folderId: string | null) => {
    try {
      await updateChatSession(conversation.id, { folderId }); await refreshSidebar();
      if (activeFolderId) setFolderItems(await fetchChatSessions({ take: 50, folderId: activeFolderId }));
      setMoveTarget(null); pushToast(folderId ? 'Chat deplace dans le dossier' : 'Chat retire du dossier');
    } catch { pushToast('Deplacement impossible.'); }
  }, [activeFolderId, pushToast, refreshSidebar]);

  const handleSend = useCallback(async () => {
    const content = draft.trim(); if (!user || !id || !content || isSending) return;
    const now = new Date().toISOString();
    const optimisticUser: ChatMessageItem = { id: `local-user-${Date.now()}`, role: 'user', content, createdAt: now };
    const optimisticAssistant: ChatMessageItem = { id: `local-assistant-${Date.now()}`, role: 'assistant', content: '', createdAt: now };
    const apiMode: ChatRigor = model === 'rag' ? 'fast' : 'balanced';
    const apiModel = model === 'web-sonar-pro' ? 'sonar-pro' : model === 'web-sonar' ? 'sonar' : undefined;
    setDraft(''); setIsSending(true); setActions(['Recherche et verification des sources']); setError(null); setMessages((current) => [...current, optimisticUser, optimisticAssistant]);
    try {
      const result = await sendChatMessage(id, content, { ...(apiModel ? { model: apiModel } : {}), mode: apiMode, responseStyle, sourceRestricted, neutralityForced, timeRecent });
      if (result.streamedText.trim()) setMessages((current) => current.map((message) => message.id === optimisticAssistant.id ? { ...message, content: result.streamedText.trim() } : message));
      setMessages(await fetchChatMessages(id)); await refreshSidebar();
    } catch (sendError) {
      setMessages((current) => current.filter((message) => message.id !== optimisticUser.id && message.id !== optimisticAssistant.id));
      const status = getStatus(sendError); const code = getCode(sendError);
      setError(code === 'EMAIL_NOT_VERIFIED' ? 'Verifie ton email avant d utiliser le chat.' : status === 401 || status === 403 ? 'Connecte-toi pour envoyer un message.' : status === 402 ? 'Quota ou credits insuffisants pour envoyer ce message.' : sendError instanceof Error ? sendError.message : 'Impossible d envoyer le message.');
      setDraft(content);
    } finally { setActions([]); setIsSending(false); }
  }, [draft, id, isSending, model, neutralityForced, refreshSidebar, responseStyle, sourceRestricted, timeRecent, user]);

  const filteredSessions = useMemo(() => { const q = query.trim().toLowerCase(); return q ? sessions.filter((item) => titleOf(item).toLowerCase().includes(q)) : sessions; }, [query, sessions]);
  useEffect(() => { if (!authLoading) void loadConversation(); }, [authLoading, loadConversation]);
  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [messages.length, isSending, activeFolderId]);

  if (authLoading) return <CenteredState text="Verification de la session..." />;
  if (!user) return <AuthRequired />;

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.topBar, { backgroundColor: colors.headerBackground, borderBottomColor: colors.borderSubtle, paddingTop: insets.top + 10 }]}>
        <IconButton onPress={() => setDrawerOpen(true)}><Menu size={21} color={colors.text} /></IconButton>
        <View style={styles.topBarTitleWrap}><Text style={[styles.eyebrow, { color: colors.textMuted }]}>Chat Epion</Text><Text style={[styles.topBarTitle, { color: colors.text }]} numberOfLines={1}>{activeFolderId ? 'Dossier' : titleOf(session)}</Text></View>
        <IconButton onPress={createNewChat} disabled={isCreating}><Plus size={21} color={colors.text} /></IconButton>
      </View>
      {isLoading ? <View style={[styles.loadingStrip, { backgroundColor: colors.backgroundElevated, borderBottomColor: colors.borderSubtle }]}><ActivityIndicator size="small" color={colors.accent} /><Text style={[styles.loadingText, { color: colors.textMuted }]}>Chargement des messages...</Text></View> : null}
      {error ? <Pressable onPress={loadConversation} style={[styles.errorStrip, { backgroundColor: colors.errorBackground, borderBottomColor: colors.error }]}><Text style={[styles.errorText, { color: colors.error }]}>{error}</Text><Text style={[styles.errorHint, { color: colors.error }]}>Toucher pour reessayer</Text></Pressable> : null}
      <ScrollView ref={scrollRef} style={styles.messages} contentContainerStyle={[styles.messagesContent, { paddingBottom: 154 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {activeFolderId ? <FolderPanel folders={folders} activeFolderId={activeFolderId} items={folderItems} loading={folderLoading} onClose={() => setActiveFolderId(null)} onOpenChat={openChat} /> : messages.length === 0 && !isLoading ? <EmptyChat /> : messages.map((message) => <ChatBubble key={message.id} message={message} />)}
        {(isSending || actions.length > 0) && !activeFolderId ? <Progress actions={actions} /> : null}
      </ScrollView>
      {!activeFolderId ? <View style={[styles.inputDock, { backgroundColor: colors.scheme === 'dark' ? 'rgba(14,17,22,0.94)' : 'rgba(250,250,245,0.92)', paddingBottom: insets.bottom + 10 }]}><Composer draft={draft} isSending={isSending} modeMenuOpen={modeMenuOpen} transparencyOpen={transparencyOpen} responseStyle={responseStyle} sourceRestricted={sourceRestricted} neutralityForced={neutralityForced} timeRecent={timeRecent} onChangeDraft={setDraft} onSend={handleSend} onToggleModeMenu={() => { setModeMenuOpen((value) => !value); setTransparencyOpen(false); }} onSelectResponseStyle={(value) => { setResponseStyle(value); setModeMenuOpen(false); }} onToggleTransparency={() => { setTransparencyOpen((value) => !value); setModeMenuOpen(false); }} onSourceRestricted={setSourceRestricted} onNeutralityForced={setNeutralityForced} onTimeRecent={setTimeRecent} /></View> : null}
      <ChatDrawer open={drawerOpen} conversations={sessions} currentId={id} folders={folders} isCreating={isCreating} onClose={() => setDrawerOpen(false)} onNewChat={createNewChat} onOpenSearch={() => setSearchOpen(true)} onOpenNewFolder={() => setFolderModalOpen(true)} onOpenFolder={openFolder} onOpenChat={openChat} onDeleteChat={deleteConversation} onMoveChat={setMoveTarget} onDeleteFolder={removeFolder} />
      <SearchModal open={searchOpen} query={query} results={filteredSessions} onQuery={setQuery} onClose={() => setSearchOpen(false)} onOpenChat={openChat} />
      <NewFolderModal open={folderModalOpen} value={newFolderName} onChange={setNewFolderName} onClose={() => setFolderModalOpen(false)} onSubmit={createFolder} />
      <MoveModal target={moveTarget} folders={folders} onClose={() => setMoveTarget(null)} onMove={moveConversation} />
      <View style={[styles.toastStack, { bottom: insets.bottom + 116 }]} pointerEvents="none">{toasts.map((toast) => <View key={toast.id} style={styles.toast}><Text style={styles.toastText}>{toast.text}</Text></View>)}</View>
    </KeyboardAvoidingView>
  );
}
function CenteredState({ text }: { text: string }) { const colors = useTheme(); return <View style={[styles.centeredScreen, { backgroundColor: colors.background }]}><ActivityIndicator size="large" color={colors.accent} /><Text style={[styles.stateText, { color: colors.textSecondary }]}>{text}</Text></View>; }
function AuthRequired() { const colors = useTheme(); return <View style={[styles.centeredScreen, { backgroundColor: colors.background }]}><Text style={[styles.stateTitle, { color: colors.text }]}>Connecte-toi pour acceder au chat</Text><Text style={[styles.stateText, { color: colors.textSecondary }]}>Cette conversation est liee a ton compte Epion.</Text><Link href="/account" asChild><Pressable style={StyleSheet.flatten([styles.primaryButton, { backgroundColor: colors.primary }])}><Text style={[styles.primaryButtonText, { color: colors.primaryText }]}>Aller au compte</Text></Pressable></Link></View>; }
function EmptyChat() { const colors = useTheme(); return <View style={styles.emptyState}><Text style={[styles.emptyTitle, { color: colors.text }]}>Learn with epion</Text><Text style={[styles.emptyText, { color: colors.textSecondary }]}>Ask for facts, summaries, or explanations. Epion answers with source-aware context.</Text></View>; }
function IconButton({ children, disabled, onPress }: { children: React.ReactNode; disabled?: boolean; onPress: () => void }) { const colors = useTheme(); return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.roundIconButton, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }, pressed || disabled ? styles.pressed : null]}>{children}</Pressable>; }

function ChatBubble({ message }: { message: ChatMessageItem }) {
  const isUser = message.role === 'user'; const sources = sourcesOf(message); const createdAt = formatDate(message.createdAt); const label = supportOf(message);
  return <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}><View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
    {!isUser ? <View style={styles.assistantHeader}><View style={styles.assistantBrand}><ShieldCheck size={14} color="#059669" /><Text style={styles.assistantBrandText}>Epion</Text></View>{label ? <Text style={styles.supportLabel}>{label}</Text> : null}</View> : null}
    <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}>{messageText(message)}</Text>
    {sources.length > 0 ? <View style={styles.sourcesRow}>{sources.slice(0, 4).map((_, index) => <View key={index} style={styles.sourcePill}><Text style={styles.sourcePillText}>Source {index + 1}</Text></View>)}</View> : null}
    {createdAt ? <Text style={[styles.messageDate, isUser ? styles.userDate : styles.assistantDate]}>{createdAt}</Text> : null}
  </View></View>;
}
function Progress({ actions }: { actions: string[] }) { return <View style={styles.progressBox}><ActivityIndicator size="small" color="#059669" /><Text style={styles.progressText}>{actions[actions.length - 1] || 'Epion prepare la reponse...'}</Text></View>; }

function Composer(props: { draft: string; isSending: boolean; modeMenuOpen: boolean; transparencyOpen: boolean; responseStyle: ChatResponseStyle; sourceRestricted: boolean; neutralityForced: boolean; timeRecent: boolean; onChangeDraft: (value: string) => void; onSend: () => void; onToggleModeMenu: () => void; onSelectResponseStyle: (value: ChatResponseStyle) => void; onToggleTransparency: () => void; onSourceRestricted: (value: boolean) => void; onNeutralityForced: (value: boolean) => void; onTimeRecent: (value: boolean) => void }) {
  const colors = useTheme();
  const isDark = colors.scheme === 'dark';
  const selectedStyle = RESPONSE_STYLES.find((item) => item.id === props.responseStyle) ?? RESPONSE_STYLES[1];
  const canSend = props.draft.trim().length > 0 && !props.isSending;
  const switchTrack = { false: isDark ? 'rgba(255,255,255,0.18)' : '#D4D4D4', true: isDark ? 'rgba(52,211,153,0.36)' : '#A7F3D0' };

  const openVoiceFallback = () => {
    Alert.alert('Dictee vocale', 'Utilise la dictee du clavier de ton telephone. Une integration micro native demandera un module mobile dedie.');
  };

  return <View style={[styles.composerShell, { backgroundColor: isDark ? 'rgba(23,27,34,0.78)' : 'rgba(255,255,255,0.78)', borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)', shadowColor: colors.shadow }]}>
    <View style={styles.composerTopRow}><Pressable onPress={props.onToggleModeMenu} style={({ pressed }) => [styles.modelButton, pressed ? styles.softPressed : null]}><Sparkles size={15} color="#F59E0B" /><Text style={[styles.modelButtonText, { color: colors.textMuted }]}>{selectedStyle.label}</Text><ChevronDown size={15} color={colors.textMuted} /></Pressable></View>
    {props.modeMenuOpen ? <View style={[styles.menuPanel, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>{RESPONSE_STYLES.map((option) => { const active = option.id === props.responseStyle; return <Pressable key={option.id} onPress={() => props.onSelectResponseStyle(option.id)} style={[styles.menuOption, active ? { backgroundColor: colors.backgroundSubtle } : null]}><Text style={[styles.menuOptionTitle, { color: colors.text }]}>{option.label}</Text><Text style={[styles.menuOptionDescription, { color: colors.textMuted }]}>{option.desc}</Text></Pressable>; })}</View> : null}
    {props.transparencyOpen ? <View style={[styles.transparencyPanel, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}>
      <TransparencyToggle title="Filtre de sources" detail={props.sourceRestricted ? 'Priorite aux domaines .gov, .edu et presse accreditee.' : 'Recherche ouverte sur tout le web.'} value={props.sourceRestricted} onValueChange={props.onSourceRestricted} colors={colors} switchTrack={switchTrack} />
      <TransparencyToggle title="Neutralite" detail={props.neutralityForced ? 'Interdiction de donner un avis.' : 'Analyse nuancee autorisee.'} value={props.neutralityForced} onValueChange={props.onNeutralityForced} colors={colors} switchTrack={switchTrack} />
      <TransparencyToggle title="News recentes" detail={props.timeRecent ? 'Se concentrer sur les dernieres 48h.' : 'Recherche historique + temps reel.'} value={props.timeRecent} onValueChange={props.onTimeRecent} colors={colors} switchTrack={switchTrack} />
    </View> : null}
    <View style={styles.inputRow}><Pressable style={({ pressed }) => [styles.importButton, pressed ? styles.softPressed : null]} onPress={() => Alert.alert('Importer', 'Documents et images suivront le comportement web lorsque l upload mobile sera active.')}><Plus size={21} color={colors.textMuted} /></Pressable><TextInput value={props.draft} onChangeText={(value) => props.onChangeDraft(value.slice(0, 8000))} editable={!props.isSending} multiline keyboardType="default" autoCapitalize="sentences" autoCorrect spellCheck textContentType="none" maxLength={8000} placeholder="Ask Epion something..." placeholderTextColor={colors.inputPlaceholder} style={[styles.input, { color: colors.text }]} /><Pressable onPress={openVoiceFallback} style={({ pressed }) => [styles.voiceButton, { borderColor: colors.borderSubtle }, pressed ? styles.softPressed : null]}><Mic size={18} color={colors.textMuted} /></Pressable><Pressable disabled={!canSend} onPress={props.onSend} style={[styles.sendButton, { backgroundColor: colors.primary }, !canSend ? styles.sendButtonDisabled : null]}><ArrowUp size={19} color={colors.primaryText} /></Pressable></View>
    <View style={styles.composerFooterRow}><Pressable onPress={props.onToggleTransparency} style={({ pressed }) => [styles.transparencyButton, props.transparencyOpen ? { backgroundColor: colors.backgroundSubtle } : null, pressed ? styles.softPressed : null]}><SlidersHorizontal size={15} color={colors.textMuted} /><Text style={[styles.transparencyText, { color: colors.textMuted }]}>Transparence</Text></Pressable></View>
  </View>;
}

type ThemeLike = ReturnType<typeof useTheme>;
function TransparencyToggle({ title, detail, value, onValueChange, colors, switchTrack }: { title: string; detail: string; value: boolean; onValueChange: (value: boolean) => void; colors: ThemeLike; switchTrack: { false: string; true: string } }) {
  return <View style={[styles.transparencyRow, { borderBottomColor: colors.borderSubtle }]}><View style={styles.transparencyCopy}><Text style={[styles.transparencyTitle, { color: colors.text }]}>{title}</Text><Text style={[styles.transparencyDetail, { color: colors.textMuted }]}>{detail}</Text></View><Switch value={value} onValueChange={onValueChange} trackColor={switchTrack} thumbColor={value ? colors.success : colors.backgroundElevated} /></View>;
}
function ChatDrawer(props: { open: boolean; conversations: ChatSessionSummary[]; currentId: string; folders: ChatFolder[]; isCreating: boolean; onClose: () => void; onNewChat: () => void; onOpenSearch: () => void; onOpenNewFolder: () => void; onOpenFolder: (id: string) => void; onOpenChat: (id: string) => void; onDeleteChat: (conversation: ChatSessionSummary) => void; onMoveChat: (conversation: ChatSessionSummary) => void; onDeleteFolder: (folder: ChatFolder) => void }) {
  const colors = useTheme();
  const iconColor = colors.textMuted;

  return <Modal visible={props.open} transparent animationType="fade" onRequestClose={props.onClose}><View style={styles.drawerBackdrop}><Pressable style={[styles.drawerScrim, { backgroundColor: colors.scheme === 'dark' ? 'rgba(0,0,0,0.58)' : 'rgba(0,0,0,0.40)' }]} onPress={props.onClose} /><View style={[styles.drawerPanel, { backgroundColor: colors.scheme === 'dark' ? 'rgba(14,17,22,0.98)' : 'rgba(255,255,255,0.98)', borderRightColor: colors.border }]}><View style={styles.drawerHeader}><Pressable onPress={props.onClose} style={[styles.drawerIconButton, { backgroundColor: colors.backgroundElevated, borderColor: colors.border }]}><X size={20} color={colors.text} /></Pressable></View><ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
    <View style={[styles.drawerNavBlock, { borderBottomColor: colors.borderSubtle }]}><DrawerNavItem href="/" icon={<Home size={17} color={iconColor} />} label="Accueil" onClose={props.onClose} /><DrawerNavItem href="/news" icon={<MessageCircle size={17} color={iconColor} />} label="News" onClose={props.onClose} /><DrawerNavItem href="/settings" icon={<Settings size={17} color={iconColor} />} label="Parametres" onClose={props.onClose} /></View>
    <DrawerButton primary disabled={props.isCreating} icon={<Plus size={18} color={colors.text} />} label={props.isCreating ? 'Creation...' : 'Nouveau chat'} onPress={props.onNewChat} /><DrawerButton icon={<Search size={17} color={iconColor} />} label="Rechercher" onPress={props.onOpenSearch} /><DrawerButton icon={<FolderPlus size={17} color={iconColor} />} label="Nouveau dossier" onPress={props.onOpenNewFolder} />
    <Text style={[styles.drawerSectionTitle, { color: colors.textSecondary }]}>Dossiers</Text>{props.folders.length === 0 ? <Text style={[styles.drawerEmptyText, { borderColor: colors.border, color: colors.textMuted }]}>Aucun dossier</Text> : null}{props.folders.slice(0, 3).map((folder) => <View key={folder.id} style={styles.drawerRowWrap}><Pressable onPress={() => props.onOpenFolder(folder.id)} style={({ pressed }) => [styles.drawerRowMain, pressed ? styles.softPressed : null]}><Folder size={16} color={iconColor} /><Text style={[styles.drawerRowText, { color: colors.textTertiary }]} numberOfLines={1}>{folder.name}</Text></Pressable><Pressable onPress={() => Alert.alert(folder.name, undefined, [{ text: 'Supprimer le dossier', style: 'destructive', onPress: () => props.onDeleteFolder(folder) }, { text: 'Annuler', style: 'cancel' }])} style={styles.drawerMoreButton}><MoreHorizontal size={17} color={iconColor} /></Pressable></View>)}
    <Text style={[styles.drawerSectionTitle, { color: colors.textSecondary }]}>Chats</Text>{props.conversations.map((conversation) => { const active = conversation.id === props.currentId; return <View key={conversation.id} style={[styles.drawerRowWrap, active ? [styles.drawerRowActive, { backgroundColor: colors.tabBarActive }] : null]}><Pressable onPress={() => props.onOpenChat(conversation.id)} style={({ pressed }) => [styles.drawerRowMain, pressed ? styles.softPressed : null]}><Text style={[styles.drawerRowText, { color: colors.textTertiary }, active ? [styles.drawerRowTextActive, { color: colors.text }] : null]} numberOfLines={1}>{titleOf(conversation)}</Text></Pressable><Pressable onPress={() => Alert.alert(titleOf(conversation), undefined, [{ text: 'Ouvrir', onPress: () => props.onOpenChat(conversation.id) }, { text: 'Deplacer vers...', onPress: () => props.onMoveChat(conversation) }, { text: 'Supprimer', style: 'destructive', onPress: () => props.onDeleteChat(conversation) }, { text: 'Annuler', style: 'cancel' }])} style={styles.drawerMoreButton}><MoreHorizontal size={17} color={iconColor} /></Pressable></View>; })}
    <Text style={[styles.drawerFooter, { color: colors.textMuted }]}>� 2025 Epion</Text>
  </ScrollView></View></View></Modal>;
}
function DrawerNavItem({ href, icon, label, onClose }: { href: Href; icon: React.ReactNode; label: string; onClose: () => void }) { const colors = useTheme(); return <Pressable onPress={() => { onClose(); router.push(href); }} style={({ pressed }) => [styles.drawerNavItem, pressed ? styles.softPressed : null]}>{icon}<Text style={[styles.drawerNavText, { color: colors.textTertiary }]}>{label}</Text></Pressable>; }
function DrawerButton({ icon, label, primary, disabled, onPress }: { icon: React.ReactNode; label: string; primary?: boolean; disabled?: boolean; onPress: () => void }) { const colors = useTheme(); return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [primary ? styles.primaryDrawerButton : styles.secondaryDrawerButton, { backgroundColor: primary ? colors.backgroundElevated : 'transparent', borderColor: colors.border }, pressed || disabled ? styles.pressed : null]}>{icon}<Text style={[primary ? styles.primaryDrawerText : styles.secondaryDrawerText, { color: primary ? colors.text : colors.textTertiary }]}>{label}</Text></Pressable>; }
function FolderPanel({ folders, activeFolderId, items, loading, onClose, onOpenChat }: { folders: ChatFolder[]; activeFolderId: string; items: ChatSessionSummary[]; loading: boolean; onClose: () => void; onOpenChat: (id: string) => void }) {
  const folderName = folders.find((folder) => folder.id === activeFolderId)?.name ?? 'Folder';
  return <View style={styles.folderPanel}><View style={styles.folderPanelHeader}><Pressable onPress={onClose} style={styles.smallOutlineButton}><Text style={styles.smallOutlineText}>Back</Text></Pressable><Text style={styles.folderPanelTitle}>{folderName}</Text><View style={{ width: 54 }} /></View>{loading ? <ActivityIndicator size="small" color="#0A0A0A" /> : null}{!loading && items.length === 0 ? <Text style={styles.folderEmptyText}>This folder does not contain any chats yet.</Text> : null}{items.map((item) => <Pressable key={item.id} onPress={() => onOpenChat(item.id)} style={styles.folderChatRow}><MessageCircle size={17} color="#525252" /><Text style={styles.folderChatTitle} numberOfLines={1}>{titleOf(item)}</Text></Pressable>)}</View>;
}

function SearchModal({ open, query, results, onQuery, onClose, onOpenChat }: { open: boolean; query: string; results: ChatSessionSummary[]; onQuery: (value: string) => void; onClose: () => void; onOpenChat: (id: string) => void }) { return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><Pressable style={styles.modalScrim} onPress={onClose} /><View style={styles.modalCard}><Text style={styles.modalTitle}>Rechercher un chat</Text><TextInput autoFocus value={query} onChangeText={onQuery} keyboardType="default" autoCapitalize="sentences" autoCorrect spellCheck textContentType="none" placeholder="Tape un titre..." placeholderTextColor="#9CA3AF" style={styles.modalInput} /><ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">{results.map((item) => <Pressable key={item.id} onPress={() => onOpenChat(item.id)} style={styles.searchResultRow}><Text style={styles.searchResultTitle} numberOfLines={1}>{titleOf(item)}</Text><Text style={styles.searchResultAction}>Ouvrir</Text></Pressable>)}{results.length === 0 ? <Text style={styles.modalEmptyText}>Aucun resultat.</Text> : null}</ScrollView><Pressable onPress={onClose} style={styles.modalCloseButton}><Text style={styles.modalCloseText}>Fermer</Text></Pressable></View></View></Modal>; }
function NewFolderModal({ open, value, onChange, onClose, onSubmit }: { open: boolean; value: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void }) { return <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><Pressable style={styles.modalScrim} onPress={onClose} /><View style={styles.modalCard}><Text style={styles.modalTitle}>Nouveau dossier</Text><TextInput autoFocus value={value} onChangeText={onChange} keyboardType="default" autoCapitalize="sentences" autoCorrect spellCheck textContentType="none" placeholder="Nom du dossier" placeholderTextColor="#9CA3AF" style={styles.modalInput} /><View style={styles.modalActionsRow}><Pressable onPress={onClose} style={styles.modalSecondaryButton}><Text style={styles.modalSecondaryText}>Annuler</Text></Pressable><Pressable onPress={onSubmit} style={styles.modalPrimaryButton}><Text style={styles.modalPrimaryText}>Creer</Text></Pressable></View></View></View></Modal>; }
function MoveModal({ target, folders, onClose, onMove }: { target: ChatSessionSummary | null; folders: ChatFolder[]; onClose: () => void; onMove: (conversation: ChatSessionSummary, folderId: string | null) => void }) { return <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onClose}><View style={styles.modalBackdrop}><Pressable style={styles.modalScrim} onPress={onClose} /><View style={styles.modalCard}><Text style={styles.modalTitle}>Deplacer vers...</Text>{target ? <Pressable onPress={() => onMove(target, null)} style={styles.searchResultRow}><Text style={styles.searchResultTitle}>(Sans dossier)</Text></Pressable> : null}{target && folders.map((folder) => <Pressable key={folder.id} onPress={() => onMove(target, folder.id)} style={styles.searchResultRow}><Text style={styles.searchResultTitle}>{folder.name}</Text></Pressable>)}<Pressable onPress={onClose} style={styles.modalCloseButton}><Text style={styles.modalCloseText}>Fermer</Text></Pressable></View></View></Modal>; }
const styles = StyleSheet.create({
  screen: { backgroundColor: '#FAFAF5', flex: 1 },
  centeredScreen: { alignItems: 'center', backgroundColor: '#FAFAF5', flex: 1, gap: 14, justifyContent: 'center', padding: 24 },
  topBar: { alignItems: 'center', backgroundColor: 'rgba(250,250,245,0.96)', borderBottomColor: 'rgba(0,0,0,0.08)', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingBottom: 10, paddingHorizontal: 12 },
  roundIconButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  topBarTitleWrap: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#737373', fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  topBarTitle: { color: '#0A0A0A', fontSize: 18, fontWeight: '800', marginTop: 2 },
  loadingStrip: { alignItems: 'center', backgroundColor: '#FFFFFF', borderBottomColor: 'rgba(0,0,0,0.08)', borderBottomWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', padding: 10 },
  loadingText: { color: '#525252', fontSize: 13 },
  errorStrip: { backgroundColor: '#FEF2F2', borderBottomColor: '#FECACA', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  errorText: { color: '#991B1B', fontSize: 14, fontWeight: '800' },
  errorHint: { color: '#991B1B', fontSize: 12, marginTop: 2, opacity: 0.75 },
  messages: { flex: 1 },
  messagesContent: { gap: 12, paddingHorizontal: 14, paddingTop: 18 },
  emptyState: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 420, paddingHorizontal: 18 },
  emptyTitle: { color: '#0A0A0A', fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }), fontSize: 32, fontWeight: '600', textAlign: 'center' },
  emptyText: { color: 'rgba(0,0,0,0.68)', fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  bubbleRow: { flexDirection: 'row' },
  bubbleRowUser: { justifyContent: 'flex-end' },
  bubbleRowAssistant: { justifyContent: 'flex-start' },
  bubble: { borderRadius: 18, maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 11 },
  userBubble: { backgroundColor: '#0A0A0A' },
  assistantBubble: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.06)', borderWidth: 1, maxWidth: '100%', padding: 16 },
  assistantHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  assistantBrand: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  assistantBrandText: { color: '#0A0A0A', fontSize: 13, fontWeight: '800' },
  supportLabel: { color: '#059669', fontSize: 12, fontWeight: '800' },
  messageText: { fontSize: 15, lineHeight: 22 },
  userMessageText: { color: '#FFFFFF' },
  assistantMessageText: { color: '#1F2937' },
  sourcesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  sourcePill: { backgroundColor: 'rgba(5,150,105,0.10)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  sourcePillText: { color: '#047857', fontSize: 11, fontWeight: '700' },
  messageDate: { fontSize: 11, marginTop: 8 },
  userDate: { color: 'rgba(255,255,255,0.58)' },
  assistantDate: { color: '#737373' },
  progressBox: { alignItems: 'center', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.04)', borderColor: 'rgba(0,0,0,0.08)', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 6, paddingHorizontal: 14, paddingVertical: 9 },
  progressText: { color: '#525252', fontSize: 13, fontWeight: '700' },
  inputDock: { backgroundColor: 'rgba(250,250,245,0.92)', borderTopWidth: 0, paddingHorizontal: 12, paddingTop: 8 },
  composerShell: { backgroundColor: 'rgba(255,255,255,0.78)', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 22, borderWidth: 1, elevation: 8, gap: 7, padding: 8, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 20 },
  composerTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-start' },
  modelButton: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 7 },
  modelButtonText: { color: '#525252', fontSize: 13, fontWeight: '800' },
  transparencyButton: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 5, marginLeft: 8, paddingHorizontal: 8, paddingVertical: 6 },
  transparencyText: { color: '#737373', fontSize: 12, fontWeight: '700' },
  menuPanel: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  menuOption: { paddingHorizontal: 12, paddingVertical: 10 },
  menuOptionTitle: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
  menuOptionDescription: { color: '#737373', fontSize: 12, marginTop: 2 },
  inputRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 7 },
  importButton: { alignItems: 'center', borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  voiceButton: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  input: { color: '#0A0A0A', flex: 1, fontSize: 16, lineHeight: 22, maxHeight: 132, minHeight: 34, paddingHorizontal: 2, paddingTop: 6, paddingBottom: 6, textAlignVertical: 'top' },
  sendButton: { alignItems: 'center', backgroundColor: '#0A0A0A', borderRadius: 999, height: 36, justifyContent: 'center', width: 36 },
  sendButtonDisabled: { opacity: 0.45 },
  responseStyleRow: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', borderColor: 'rgba(0,0,0,0.05)', borderRadius: 9, borderWidth: 1, flexDirection: 'row', flexShrink: 1, gap: 2, padding: 3 },
  responseStyleButton: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 6 },
  responseStyleButtonActive: { backgroundColor: '#FFFFFF' },
  responseStyleText: { color: '#737373', fontSize: 12, fontWeight: '700' },
  responseStyleTextActive: { color: '#0A0A0A' },
  composerFooterRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'flex-end' },
  transparencyPanel: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  transparencyRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 10 },
  transparencyCopy: { flex: 1, minWidth: 0 },
  transparencyTitle: { fontSize: 14, fontWeight: '800' },
  transparencyDetail: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  softPressed: { opacity: 0.72 },
  drawerBackdrop: { flex: 1, flexDirection: 'row' },
  drawerScrim: { backgroundColor: 'rgba(0,0,0,0.42)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  drawerPanel: { backgroundColor: 'rgba(255,255,255,0.98)', borderRightColor: 'rgba(0,0,0,0.10)', borderRightWidth: 1, height: '100%', maxWidth: 390, width: '86%' },
  drawerHeader: { alignItems: 'flex-start', paddingHorizontal: 12, paddingTop: 18 },
  drawerIconButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 8, borderWidth: 1, height: 38, justifyContent: 'center', width: 38 },
  drawerContent: { gap: 8, padding: 12, paddingBottom: 40 },
  drawerNavBlock: { borderBottomColor: 'rgba(0,0,0,0.08)', borderBottomWidth: 1, gap: 2, marginBottom: 8, paddingBottom: 12 },
  drawerNavItem: { alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingVertical: 9 },
  drawerNavText: { color: '#525252', fontSize: 14, fontWeight: '700' },
  primaryDrawerButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  primaryDrawerText: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
  secondaryDrawerButton: { alignItems: 'center', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  secondaryDrawerText: { color: '#525252', fontSize: 13, fontWeight: '700' },
  drawerSectionTitle: { color: 'rgba(0,0,0,0.72)', fontSize: 14, fontWeight: '800', marginTop: 8 },
  drawerEmptyText: { borderColor: 'rgba(0,0,0,0.10)', borderRadius: 12, borderWidth: 1, color: '#737373', fontSize: 13, padding: 10 },
  drawerRowWrap: { alignItems: 'center', borderRadius: 9, flexDirection: 'row', gap: 4, minHeight: 38 },
  drawerRowActive: { backgroundColor: 'rgba(0,0,0,0.06)' },
  drawerRowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8, minWidth: 0, paddingHorizontal: 8, paddingVertical: 8 },
  drawerRowText: { color: '#525252', flex: 1, fontSize: 13, fontWeight: '600' },
  drawerRowTextActive: { color: '#0A0A0A', fontWeight: '800' },
  drawerMoreButton: { alignItems: 'center', height: 34, justifyContent: 'center', width: 34 },
  drawerFooter: { color: '#737373', fontSize: 11, marginTop: 12 },
  folderPanel: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 16, borderWidth: 1, gap: 10, padding: 14 },
  folderPanelHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  folderPanelTitle: { color: '#0A0A0A', fontSize: 15, fontWeight: '800' },
  smallOutlineButton: { borderColor: 'rgba(0,0,0,0.10)', borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  smallOutlineText: { color: '#0A0A0A', fontSize: 12, fontWeight: '700' },
  folderEmptyText: { color: '#737373', fontSize: 14, paddingVertical: 20, textAlign: 'center' },
  folderChatRow: { alignItems: 'center', borderColor: 'rgba(0,0,0,0.06)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 },
  folderChatTitle: { color: '#0A0A0A', flex: 1, fontSize: 13, fontWeight: '800' },
  modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'flex-start', paddingHorizontal: 16, paddingTop: 90 },
  modalScrim: { backgroundColor: 'rgba(0,0,0,0.48)', bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  modalCard: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 16, borderWidth: 1, gap: 12, maxWidth: 520, padding: 16, width: '100%' },
  modalTitle: { color: '#0A0A0A', fontSize: 18, fontWeight: '800' },
  modalInput: { backgroundColor: '#FFFFFF', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 12, borderWidth: 1, color: '#0A0A0A', fontSize: 15, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10 },
  modalList: { maxHeight: 320 },
  searchResultRow: { alignItems: 'center', borderBottomColor: 'rgba(0,0,0,0.06)', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  searchResultTitle: { color: '#0A0A0A', flex: 1, fontSize: 14, fontWeight: '700' },
  searchResultAction: { color: '#737373', fontSize: 12, fontWeight: '700' },
  modalEmptyText: { color: '#737373', fontSize: 14, paddingVertical: 24, textAlign: 'center' },
  modalActionsRow: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  modalPrimaryButton: { backgroundColor: '#0A0A0A', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  modalPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  modalSecondaryButton: { borderColor: 'rgba(0,0,0,0.10)', borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  modalSecondaryText: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
  modalCloseButton: { alignSelf: 'flex-end', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  modalCloseText: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
  settingRow: { alignItems: 'center', borderBottomColor: 'rgba(0,0,0,0.06)', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 10 },
  settingCopy: { flex: 1 },
  settingTitle: { color: '#0A0A0A', fontSize: 15, fontWeight: '800' },
  settingDetail: { color: '#737373', fontSize: 13, lineHeight: 18, marginTop: 2 },
  settingsNote: { backgroundColor: 'rgba(0,0,0,0.04)', borderRadius: 8, color: '#737373', fontSize: 12, lineHeight: 17, padding: 10 },
  stateTitle: { color: '#0A0A0A', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  stateText: { color: '#525252', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  primaryButton: { alignItems: 'center', backgroundColor: '#0A0A0A', borderRadius: 8, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  toastStack: { alignItems: 'flex-end', gap: 8, left: 12, position: 'absolute', right: 12 },
  toast: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: 'rgba(0,0,0,0.10)', borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  toastText: { color: '#0A0A0A', fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
