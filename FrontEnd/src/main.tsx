// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics';
import * as Sentry from "@sentry/react";
import { Capacitor } from '@capacitor/core';

import '@/styles/theme.css'
import './i18n/i18n'
import { I18nProvider } from '@/i18n/I18nContext'
import { BrowserRouter } from 'react-router-dom'
import App from '@/App'
import { MeProvider } from '@/contexts/MeContext'

inject();

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 0.1,
  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Enregistrement du service worker PWA uniquement hors contexte Capacitor natif.
// Dans la WebView Android, Capacitor.isNativePlatform() retourne true → SW non enregistré.
// Sur navigateur web standard, isNativePlatform() retourne false → SW enregistré (PWA network-only).
if ('serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root container missing: <div id="root"></div> absent de index.html')
}

const root = ReactDOM.createRoot(container)

root.render(
  <React.StrictMode>
    <I18nProvider>
      <MeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MeProvider>
    </I18nProvider>
  </React.StrictMode>
)
