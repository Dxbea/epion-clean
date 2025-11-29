// FrontEnd/src/components/comments/CommentForm.tsx
import React from 'react';

/**
 * Anti-XSS côté client.
 * On supprime tous les tags HTML possibles.
 */
function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

const MAX_LEN = 5000; // limite raisonnable pour éviter les pavés / spam

export default function CommentForm({
  onSubmit,
  autoFocus,
  placeholder = 'Write a comment…',
}: {
  onSubmit: (text: string) => Promise<void> | void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handle() {
    const raw = text.trim();
    if (!raw) return;

    if (raw.length > MAX_LEN) {
      setError(`Comment is too long (max ${MAX_LEN} characters).`);
      return;
    }

    // 🔒 XSS client-side guard
    const cleaned = stripTags(raw);
    if (cleaned !== raw) {
      setError('HTML is not allowed in comments.');
      return;
    }

    // 🔒 bloque des patterns bruts
    if (/<|>/.test(raw)) {
      setError('HTML is not allowed in comments.');
      return;
    }

    setError(null);
    setSending(true);

    try {
      await onSubmit(cleaned);
      setText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="min-h-[44px] flex-1 rounded-xl border px-3 py-2 resize-none text-sm
                     focus:outline-none focus:ring-2 focus:ring-[#4290D3]
                     dark:border-white/10 dark:bg-neutral-950"
        />

        <button
          onClick={handle}
          disabled={sending || !text.trim()}
          className="h-9 shrink-0 rounded-full bg-black px-4 text-sm text-white
                     disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 ml-1">{error}</p>
      )}
    </div>
  );
}
