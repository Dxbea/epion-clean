// src/pages/Chat.tsx
// DEBUT BLOC
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';

export default function Chat() {
  const nav = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/chat/sessions`,
          await withCsrf({
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          }),
        );

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
          nav(`/chat/${s.id}`, { replace: true, state: location.state });
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
