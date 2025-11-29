// src/pages/Chat.tsx
// DEBUT BLOC
import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function Chat() {
  const nav = useNavigate();

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/chat/sessions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });

        if (cancelled) return;

        // invité → pas de redirection vers les settings, on montre le chat "guest"
        if (res.status === 401) {
          nav('/chat/guest', { replace: true });
          return;
        }

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const s = await res.json();

        if (s?.id) {
          nav(`/chat/${s.id}`, { replace: true });
        } else {
          // fallback très improbable
          nav('/chat/guest', { replace: true });
        }
      } catch {
        if (!cancelled) {
          nav('/', { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nav]);

  return null;
}
// FIN BLOC
