import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuration Capacitor pour Epion Android.
 *
 * androidScheme: 'https'
 * ─────────────────────
 * Par défaut (scheme 'http'), la WebView Android charge l'app sous l'origine :
 *   http://localhost
 *
 * Avec androidScheme: 'https', l'origine devient :
 *   https://localhost
 *
 * Ce choix est recommandé pour Android 9+ car certaines API Web (Storage Access,
 * secure cookies) nécessitent une origine HTTPS. Cependant, cela signifie que :
 *
 * ⚠️  IMPACT CORS / COOKIES / CSRF :
 * Le backend (https://epion-clean.onrender.com) recevra des requêtes depuis
 * l'origine "https://localhost". Si le backend CORS n'autorise pas cette origine,
 * les appels API échoueront. De même, les cookies SameSite=None requis pour les
 * requêtes cross-origin depuis "https://localhost" devront être validés côté backend.
 * → À tester en priorité sur vrai téléphone. Ajustement backend CORS probable nécessaire.
 */
const config: CapacitorConfig = {
  appId: 'app.epion',
  appName: 'Epion',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
