# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

# Epion API (Node/Express + TS)

## Quick start

```bash
pnpm i        # ou npm i / yarn
pnpm dev      # démarre en watch (http://localhost:4000)

## Security environment notes

`FRONTEND_ORIGIN`, `CORS_ALLOWED_ORIGINS`, and `BETTER_AUTH_TRUSTED_ORIGINS` are normalized as URL origins and feed the same browser allowlist for CORS and Better Auth. Local development can use the Vite origins on `localhost:5173`; staging and production must use HTTPS public origins only.

CSP is enabled in report-only mode by default (`CSP_REPORT_ONLY=true`). Keep it that way while validating Sentry, analytics, uploads, external images, fonts, and streaming API calls, then switch to enforcement when reports are clean.

If the frontend is hosted separately from the API, configure equivalent frontend-host headers there. The Vercel deployment path is covered by `FrontEnd/vercel.json`; backend Helmet only covers responses served by the Express API.
