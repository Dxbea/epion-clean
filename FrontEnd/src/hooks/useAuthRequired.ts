// FrontEnd/src/hooks/useAuthRequired.ts
import * as React from 'react';
import { useMe } from '@/contexts/MeContext';
import { useAuthPrompt } from '@/contexts/AuthPromptContext';

/**
 * Hook de commodité :
 *  - expose isAuthenticated
 *  - expose requireAuth() qui ouvre le popup + bloque l'action
 */
export function useAuthRequired() {
  const { me } = useMe();
  const { requireAuth } = useAuthPrompt();

  const isAuthenticated = !!me;

  const requireAuthGuard = React.useCallback(
    (reason?: string): boolean => {
      if (isAuthenticated) return true;

      requireAuth({
        message:
          reason ??
          'You need an account to use this feature. Sign in or create one for free.',
      });
      return false;
    },
    [isAuthenticated, requireAuth]
  );

  return { isAuthenticated, requireAuth: requireAuthGuard };
}
