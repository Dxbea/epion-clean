// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { inject } from '@vercel/analytics';
import * as Sentry from "@sentry/react";

inject();

const GA_MEASUREMENT_ID = 'G-NX59W4PKLR'

function initGoogleAnalytics() {
  if (typeof window === 'undefined') return

  const win = window as typeof window & {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }

  win.dataLayer = win.dataLayer || []
  win.gtag = (...args: unknown[]) => {
    win.dataLayer!.push(args)
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  document.head.appendChild(script)

  win.gtag('js', new Date())
  win.gtag('config', GA_MEASUREMENT_ID)
}

initGoogleAnalytics()

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  // Performance Monitoring
  tracesSampleRate: 0.1, // Capture 10% of the transactions
  // Session Replay
  replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
  replaysOnErrorSampleRate: 1.0, // If you're not already sampling the entire session, change the sample rate to 100% when an error occurs.
});

import '@/styles/theme.css'
import './i18n/i18n'
import { I18nProvider } from '@/i18n/I18nContext'

import { BrowserRouter } from 'react-router-dom'
import App from '@/App'

import { MeProvider } from '@/contexts/MeContext'

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
