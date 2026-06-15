import { createAuthClient } from 'better-auth/react';

import { API_BASE } from '@/config/api';

export const authClient = createAuthClient({
  baseURL: API_BASE,
});
