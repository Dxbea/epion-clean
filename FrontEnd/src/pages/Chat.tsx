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
        // 2. On récupère la liste des chats existants
        const listRes = await fetch(`${API_BASE}/api/chat/sessions?take=10`, {
          credentials: 'include',
        });

        // Gestion Not Authorized (Guest)
        if (listRes.status === 401) {
          if (!cancelled) nav('/chat/guest', { replace: true });
          return;
        }

        const listData = await listRes.json();
        const sessions = listData.items || [];
        let targetId: string | null = null;

        // 3. Logique de sélection / Création
        if (sessions.length > 0) {
          // On prend le dernier chat (le premier de la liste)
          targetId = sessions[0].id;

          // 4. Cleanup (Nettoyage des chats vides parasites)
          // On vérifie les chats SUIVANTS (pas le premier). S'ils sont vides => poubelle.
          // On le fait "en parallèle" pour ne pas bloquer la nav trop longtemps, 
          // mais on attend un peu pour être sûr que le serveur encaisse.
          const potentalZombies = sessions.slice(1).filter((s: any) =>
            !s.title || s.title === 'New chat' || s.title === 'Sans titre'
          );

          if (potentalZombies.length > 0) {
            // On lance le nettoyage sans await bloquant pour l'UI, 
            // ou on fait un check rapide. Pour la sécurité, on check les messages.
            Promise.all(potentalZombies.map(async (zombie: any) => {
              try {
                const check = await fetch(`${API_BASE}/api/chat/sessions/${zombie.id}/messages?take=1`, { credentials: 'include' });
                const data = await check.json();
                if (data.items && data.items.length === 0) {
                  await fetch(`${API_BASE}/api/chat/sessions/${zombie.id}`, await withCsrf({ method: 'DELETE' }));
                }
              } catch (e) {
                console.error('Cleanup failed for', zombie.id);
              }
            }));
          }

        } else {
          // Aucun chat n'existe, on en crée un
          const createRes = await fetch(
            `${API_BASE}/api/chat/sessions`,
            await withCsrf({
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
            }),
          );
          if (!createRes.ok) throw new Error(`HTTP ${createRes.status}`);
          const s = await createRes.json();
          targetId = s.id;
        }

        // 5. Redirection finale
        if (!cancelled && targetId) {
          nav(`/chat/${targetId}`, { replace: true, state: location.state });
        } else if (!cancelled) {
          nav('/chat/guest', { replace: true });
        }

      } catch (err) {
        console.error('Chat init error', err);
        if (!cancelled) {
          nav('/', { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nav, location.state]);

  return null;
}
// FIN BLOC
