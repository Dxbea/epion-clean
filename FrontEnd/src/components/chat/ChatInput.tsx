// src/components/chat/ChatInput.tsx
import React from 'react';
import {
  FiPlus, FiMic, FiX, FiFileText, FiZap, FiTarget, FiMoreHorizontal,
  FiCpu, FiChevronDown, FiImage, FiLink, FiDatabase, FiAlignLeft
} from 'react-icons/fi';
import { AI_MODELS, MODEL_DETAILS } from '@/constants/ai-models';

export type ResponseStyle = 'concise' | 'normal' | 'detailed';

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  isImage: boolean;
};

type Props = {
  responseStyle: ResponseStyle;
  setResponseStyle: (s: ResponseStyle) => void;
  onSend: (text: string, attachments?: UploadedFile[], modelId?: string) => Promise<any> | void;
  onOpenTransparency?: () => void;
};

export default function ChatInput({
  responseStyle, setResponseStyle, onSend, onOpenTransparency
}: Props) {
  const [value, setValue] = React.useState('');
  const [attachments, setAttachments] = React.useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  // New UI states
  const [model, setModel] = React.useState<string>(AI_MODELS.SONAR);
  const [showModelMenu, setShowModelMenu] = React.useState(false);
  const [showImportMenu, setShowImportMenu] = React.useState(false);

  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const textRef = React.useRef<HTMLTextAreaElement | null>(null);

  const MAX_FILES = 10;
  const MAX_PER_FILE_MB = 25;
  const MAX_CHARS = 8_000;

  // ------- Files helpers
  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    setAttachments(prev => {
      const next = [...prev];
      for (const f of list) {
        if (next.length >= MAX_FILES) break;
        if (f.size / (1024 * 1024) > MAX_PER_FILE_MB) continue;
        next.push({
          id: crypto.randomUUID(),
          name: f.name,
          size: f.size,
          type: f.type || 'application/octet-stream',
          url: URL.createObjectURL(f),
          isImage: (f.type || '').startsWith('image/'),
        });
      }
      return next;
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const a = prev.find(x => x.id === id);
      if (a) URL.revokeObjectURL(a.url);
      return prev.filter(x => x.id !== id);
    });
  };

  React.useEffect(() => {
    return () => {
      // cleanup URLs on unmount
      attachments.forEach(a => URL.revokeObjectURL(a.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- Paste (images/docs)
  React.useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items || [];
      const files: File[] = [];
      for (const it of items as any) {
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste as any);
    return () => window.removeEventListener('paste', onPaste as any);
  }, []);

  // ------- Textarea autosize
  const MAX_ROWS = 8;
  const LINE_PX = 28; // Increased for text-base
  const autoResize = React.useCallback(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = '0px';
    const max = MAX_ROWS * LINE_PX;
    const h = Math.min(el.scrollHeight, max);
    el.style.height = `${h}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, []);
  React.useEffect(() => { autoResize(); }, [value, autoResize]);

  // ------- Submit
  const doSubmit = async () => {
    if (submitting) return;
    const v = value.trim();
    if (!v && attachments.length === 0) return;
    setSubmitting(true);
    try {
      // Pass the selected model ID and let parent handle logic
      await onSend(v.slice(0, MAX_CHARS), attachments, model);
      // cleanup
      attachments.forEach(a => URL.revokeObjectURL(a.url));
      setAttachments([]);
      setValue('');
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSubmit();
    }
  };

  const hasText = value.trim().length > 0;
  const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
    const next = e.target.value;

    if (next.length > MAX_CHARS) {
      setValue(next.slice(0, MAX_CHARS));
    } else {
      setValue(next);
    }
  };

  const handleImportClick = (type: 'doc' | 'image' | 'url') => {
    if (type === 'doc' || type === 'image') {
      fileRef.current?.click();
    }
    setShowImportMenu(false);
  }

  // Close menus on backdrop click
  const closeMenus = () => {
    setShowModelMenu(false);
    setShowImportMenu(false);
  };


  return (
    <div
      className={[
        'relative mx-auto w-full max-w-3xl rounded-[24px]',
        'border border-surface-200 bg-white shadow-lg', // Opaque bg
        'dark:border-white/5 dark:bg-[#121212]',
        'px-4 py-4'
      ].join(' ')}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer?.files || []); }}
    >
      {/* Invisible backdrop for menus */}
      {(showModelMenu || showImportMenu) && (
        <div className="fixed inset-0 z-40" onClick={closeMenus} />
      )}

      {/* Header: Model Selector */}
      <div className="relative mb-3 flex items-center justify-between px-1">
        <div className="relative z-50">
          <button
            onClick={(e) => { e.stopPropagation(); setShowModelMenu(!showModelMenu); }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white transition-colors"
          >
            {model === AI_MODELS.RAG ? <FiDatabase className="text-base text-emerald-500" /> :
              model === AI_MODELS.SONAR_PRO ? <FiCpu className="text-base text-purple-600" /> :
                <FiZap className="text-base text-amber-500" />}

            <span>{MODEL_DETAILS[model as keyof typeof MODEL_DETAILS]?.label || 'Model'}</span>
            <FiChevronDown className={`text-xs transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
          </button>

          {showModelMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-64 overflow-hidden rounded-xl bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                {/*
                 Current model list:
                 1. Web (web-sonar)
                 2. Web Deep (web-sonar-pro)
                 3. Base Epion (rag)
               */}
              <ModelOption
                id={AI_MODELS.SONAR}
                current={model}
                onSelect={(id) => { setModel(id); setShowModelMenu(false); }}
              />
              <ModelOption
                id={AI_MODELS.SONAR_PRO}
                current={model}
                onSelect={(id) => { setModel(id); setShowModelMenu(false); }}
              />
              <div className="my-1 h-px bg-gray-100 dark:bg-white/5" />
              <ModelOption
                id={AI_MODELS.RAG}
                current={model}
                onSelect={(id) => { setModel(id); setShowModelMenu(false); }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Main Input Area */}
      <div className="relative flex items-end gap-3 p-1">

        {/* Import Button */}
        <div className="relative z-50">
          <button
            onClick={(e) => { e.stopPropagation(); setShowImportMenu(!showImportMenu); }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors"
            title="Importer"
          >
            <FiPlus className="text-xl" />
          </button>

          {showImportMenu && (
            <div className="absolute bottom-full left-0 mb-2 w-72 overflow-hidden rounded-xl bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-800 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100 slide-in-from-bottom-2">
              <button
                onClick={() => handleImportClick('doc')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                  <FiFileText className="text-lg" />
                </div>
                <div>
                  <div className="font-medium">Analyser un Document</div>
                  <div className="text-xs text-gray-400">PDF, DOCX (Rapports pros)</div>
                </div>
              </button>
              <button
                onClick={() => handleImportClick('image')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  <FiImage className="text-lg" />
                </div>
                <div>
                  <div className="font-medium">Décrypter une Image</div>
                  <div className="text-xs text-gray-400">OCR, Graphiques</div>
                </div>
              </button>
              <button
                onClick={() => handleImportClick('url')}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <FiLink className="text-lg" />
                </div>
                <div>
                  <div className="font-medium">Lire une URL</div>
                  <div className="text-xs text-gray-400">Résumer le web</div>
                </div>
              </button>
            </div>
          )}
        </div>

        <textarea
          ref={textRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onInput={autoResize as any}
          onKeyDown={onKeyDown}
          placeholder="Ask Epion something..."
          maxLength={MAX_CHARS}
          className="
            relative flex-1 min-w-0 bg-transparent outline-none
            placeholder-gray-400 dark:placeholder-gray-500
            text-base leading-7 resize-none max-h-[200px] min-h-[36px] overflow-hidden py-1
            text-gray-900 dark:text-gray-100
          "
          aria-label="Prompt"
          spellCheck={true}
          disabled={submitting}
        />

        <button
          onClick={hasText || attachments.length ? doSubmit : undefined}
          disabled={submitting || (!hasText && attachments.length === 0)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200 transition-colors"
          aria-label={hasText || attachments.length ? 'Send' : 'Voice input'}
        >
          {(hasText || attachments.length) ? (
            <FiZap className="h-5 w-5" />
          ) : (
            <FiMic className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 px-1">
          {attachments.map(a => (
            <div
              key={a.id}
              className="group flex items-center gap-2 rounded-lg border border-black/10 bg-white/50 px-2 py-1.5 pr-1 text-sm dark:border-white/10 dark:bg-white/5"
              title={a.name}
            >
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded bg-black/5 dark:bg-white/10">
                {a.isImage ? (
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                ) : (
                  <FiFileText className="text-xs opacity-70" />
                )}
              </div>
              <span className="max-w-[140px] truncate">{a.name}</span>
              <button
                onClick={() => removeAttachment(a.id)}
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10"
              >
                <FiX className="text-xs" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer: Response Style & Tools */}
      <div className="mt-3 flex items-center justify-between px-1">
        {/* Style Selector (formerly Rigor) */}
        <ResponseStyleIcons style={responseStyle} onChange={setResponseStyle} disabled={submitting} />

        {/* Discreet Tools */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenTransparency}
            className="group flex items-center gap-1.5 rounded-md py-1.5 px-2 text-xs font-medium text-gray-400 hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-300 transition-all"
          >
            {/* <FiShield className="text-sm" /> */}
            <span className="opacity-70 group-hover:opacity-100">Transparence</span>
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.csv,.doc,.docx"
        className="hidden"
        onChange={(e) => e.target.files && addFiles(e.target.files)}
      />
    </div>
  );
}

/* ================= UI bits ================= */

function ModelOption({ id, current, onSelect }: { id: string, current: string, onSelect: (id: string) => void }) {
  const detail = MODEL_DETAILS[id as keyof typeof MODEL_DETAILS];
  if (!detail) return null;

  return (
    <button
      onClick={() => onSelect(id)}
      className={`flex w-full items-center gap-3 rounded-none px-4 py-2.5 text-left text-sm transition-colors ${current === id
        ? 'bg-black/5 font-medium text-gray-900 dark:bg-white/10 dark:text-white'
        : 'text-gray-600 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5'
        }`}
    >
      <span className="text-base">
        {id === AI_MODELS.SONAR_PRO ? <FiCpu className="text-purple-600" /> :
          id === AI_MODELS.RAG ? <FiDatabase className="text-emerald-500" /> :
            <FiZap className="text-amber-500" />}
      </span>
      <div className="flex flex-col items-start">
        <span className="flex items-center gap-2">
          {detail.label}
          {detail.tier === 'premium' && (
            <span className="rounded-full bg-gradient-to-r from-amber-200 to-yellow-400 px-1.5 py-0.5 text-[10px] font-bold text-black shadow-sm">
              PRO
            </span>
          )}
        </span>
        <span className="text-xs opacity-60">{detail.description}</span>
      </div>
    </button>
  );
}

function ResponseStyleIcons({
  style,
  onChange,
  disabled,
}: {
  style: ResponseStyle;
  onChange: (v: ResponseStyle) => void;
  disabled?: boolean;
}) {
  const opts: Array<{ key: ResponseStyle; label: string; icon: React.ReactNode }> = [
    { key: 'concise', label: 'Concis', icon: <FiZap /> },
    { key: 'normal', label: 'Standard', icon: <FiMoreHorizontal /> },
    { key: 'detailed', label: 'Détaillé', icon: <FiTarget /> },
  ];

  return (
    <div
      className="flex items-center gap-1 rounded-lg border border-black/5 bg-gray-50/50 p-1 dark:border-white/5 dark:bg-white/5"
    >
      {opts.map(({ key, label, icon }) => {
        const active = style === key;
        return (
          <button
            key={key}
            onClick={() => !disabled && onChange(key)}
            title={label}
            disabled={disabled}
            className={[
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-all',
              'text-xs font-medium',
              active
                ? 'bg-white shadow-sm text-black dark:bg-[#2A2A2A] dark:text-white'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-black/5 dark:hover:bg-white/5',
              disabled ? 'opacity-50' : ''
            ].join(' ')}
          >
            <span className="text-sm">{icon}</span>
            {/* Only show label for active or all? User said "Boutons de Style", maybe labels are good */}
            {active && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
