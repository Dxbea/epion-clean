// src/components/chat/ChatInput.tsx
import React from 'react';
import {
  FiPlus, FiMic, FiX, FiFileText, FiZap, FiMoreHorizontal, FiTarget,
  FiLock, FiGlobe, FiArrowUpRight
} from 'react-icons/fi';
import type { Rigor } from '@/utils/rigorLevels';

export type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  isImage: boolean;
};

type Props = {
  rigor: Rigor;
  setRigor: (r: Rigor) => void;
  onSend: (text: string, attachments?: UploadedFile[]) => Promise<any> | void;
  onOpenTransparency?: () => void; // (future couche/overlay)
  onOpenSources?: () => void;      // (future couche/overlay)
};

export default function ChatInput({
  rigor, setRigor, onSend, onOpenTransparency, onOpenSources
}: Props) {
  const [value, setValue] = React.useState('');
  const [attachments, setAttachments] = React.useState<UploadedFile[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

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
  const LINE_PX = 24;
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
      await onSend(v.slice(0, MAX_CHARS), attachments);
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
      // on tronque => impossible de dépasser la limite dans le state
      setValue(next.slice(0, MAX_CHARS));
    } else {
      setValue(next);
    }
  };


  return (
    <div
      className={[
        'relative mx-auto w-full max-w-5xl rounded-[32px]',
        'border border-surface-200 bg-white/80 backdrop-blur shadow-soft',
        'dark:border-neutral-800 dark:bg-neutral-900/80',
        'px-5 py-4'
      ].join(' ')}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer?.files || []); }}
    >
      {/* Ligne: input + bouton send */}
      <div className="flex items-end gap-3">
                <textarea
          ref={textRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onInput={autoResize as any}
          onKeyDown={onKeyDown}
          placeholder="Ask Epion something…"
          maxLength={MAX_CHARS}
          className="
            relative flex-1 min-w-0 bg-transparent outline-none
            placeholder-black/40 dark:placeholder-white/50
            text-[1.05rem] leading-6 resize-none max-h-[192px] min-h-[24px] overflow-hidden
          "
          aria-label="Prompt"
          spellCheck={true}
          disabled={submitting}
        />


        <button
          onClick={hasText || attachments.length ? doSubmit : undefined}
          disabled={submitting || (!hasText && attachments.length === 0)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-200 bg-white hover:bg-black/5 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-white/10"
          aria-label={hasText || attachments.length ? 'Send' : 'Voice input'}
        >
          {(hasText || attachments.length) ? (
            <FiArrowUpRight className="h-5 w-5 text-[#2563EB]" />  
          ) : (
            <FiMic className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Fichiers */}
      {attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {attachments.map(a => (
            <div
              key={a.id}
              className="group flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-2 py-1 pr-1 dark:border-white/10 dark:bg-neutral-800/70"
              title={a.name}
            >
              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                {a.isImage ? (
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                ) : (
                  <FiFileText className="opacity-80" />
                )}
              </div>
              <span className="max-w-[180px] truncate text-xs">{a.name}</span>
              <button
                onClick={() => removeAttachment(a.id)}
                className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                title="Supprimer"
                aria-label="Supprimer"
              >
                <FiX />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Barre d’actions */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* Importer (le + devient import) */}
        <Pill
          onClick={() => fileRef.current?.click()}
          ariaLabel="Importer des fichiers"
        >
          <FiPlus className="text-[18px]" />
          <span className="font-medium">Importer</span>
        </Pill>

        {/* Rigor modes */}
        <RigorIcons rigor={rigor} onChange={setRigor} disabled={submitting} />

        {/* Transparence (icône cadenas ouvert, bouton neutre → ouvrira une vue plus tard) */}
        <Pill onClick={onOpenTransparency} ariaLabel="Transparence">
          <FiLock className="text-[18px]" />
          <span className="font-medium">Transparence</span>
        </Pill>

        {/* Sources (style Perplexity) */}
        <Pill onClick={onOpenSources} ariaLabel="Sources">
          <FiGlobe className="text-[18px]" />
          <span className="font-medium">Sources</span>
        </Pill>
      </div>

      {/* input file caché */}
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

function Pill({
  children,
  onClick,
  ariaLabel,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className="
        inline-flex h-12 items-center gap-2 rounded-full
        border border-surface-200 bg-white px-4
        hover:bg-black/5 active:bg-black/10
        disabled:opacity-50 disabled:cursor-not-allowed
        dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-white/10
      "
    >
      {children}
    </button>
  );
}

function RigorIcons({
  rigor,
  onChange,
  disabled,
}: {
  rigor: Rigor;
  onChange: (v: Rigor) => void;
  disabled?: boolean;
}) {
  const opts: Array<{ key: Rigor; label: string; icon: React.ReactNode }> = [
    { key: 'fast',     label: 'fast',     icon: <FiZap /> },
    { key: 'balanced', label: 'balanced', icon: <FiMoreHorizontal /> },
    { key: 'precise',  label: 'precise',  icon: <FiTarget /> },
  ];

  return (
    <div
      className="
        flex items-center gap-2 rounded-full border border-surface-200 bg-white px-2 py-1
        dark:border-neutral-800 dark:bg-neutral-900
      "
      role="group"
      aria-label="Rigor mode"
      title="Rigor mode"
    >
      {opts.map(({ key, label, icon }) => {
        const active = rigor === key;
        return (
          <button
            key={key}
            onClick={() => !disabled && onChange(key)}
            aria-pressed={active}
            title={label}
            disabled={disabled}
            className={[
              'inline-flex items-center justify-center rounded-full transition focus:outline-none focus-visible:ring-2',
              'h-10',
              active
                ? 'px-3 gap-2 bg-black text-white focus-visible:ring-black/30 dark:bg-white dark:text-black dark:focus-visible:ring-white/40'
                : 'px-2 w-10 hover:bg-black/5 focus-visible:ring-black/15 dark:hover:bg-white/10 dark:focus-visible:ring-white/20',
              disabled ? 'opacity-60 cursor-not-allowed' : ''
            ].join(' ')}
          >
            <span className="text-[18px] leading-none">{icon}</span>
            {active && <span className="text-[0.95rem] font-semibold leading-none">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
