// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'

import '@/styles/theme.css'
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
