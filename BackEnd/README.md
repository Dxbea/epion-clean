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
```

## Auth rate limits

Sensitive authentication traffic is protected by `src/lib/auth-rate-limit.ts` before Better Auth handles the request. Redis is used outside tests; test runs use an in-memory store with high default thresholds unless a test lowers a specific action. In production, if Redis is unavailable, auth rate limiting fails closed with `503` instead of silently disabling protection.

| Action | Protected endpoints | Window and max |
| --- | --- | --- |
| Login | `POST /api/auth/sign-in/email` | IP: 20 / 15 min; email: 5 / 15 min; IP+email: 5 / 15 min |
| Signup | `POST /api/auth/sign-up/email` | IP: 10 / 1 h; email: 3 / 1 h; IP+email: 3 / 1 h |
| Reset password request | `POST /api/auth/request-password-reset` | IP: 8 / 15 min; email: 3 / 1 h; IP+email: 3 / 1 h |
| Reset password confirm | `POST /api/auth/reset-password`, `GET /api/auth/reset-password/:token` | IP: 15 / 15 min; token: 5 / 15 min; IP+token: 5 / 15 min |
| Resend verification | `POST /api/auth/send-verification-email` | IP: 6 / 15 min; email: 3 / 1 h; IP+email: 3 / 1 h |
| Email verification | `GET /api/auth/verify-email` | IP: 30 / 15 min; token: 10 / 15 min; IP+token: 10 / 15 min |
| Change password | `POST /api/auth/change-password` | IP: 10 / 15 min; session: 5 / 15 min; IP+session: 5 / 15 min |
| Change email | `POST /api/auth/change-email` | IP: 10 / 15 min; new email: 5 / 1 h; session: 5 / 15 min; IP+identity: 5 / 15 min |
| Account deletion | Better Auth `delete-user` endpoints, if enabled | IP: 5 / 1 h; session: 3 / 1 h; token/user identity: 5 / 1 h |
| Sessions | Better Auth session endpoints and `/api/me/sessions*` | Reads: 120 / 1 min; mutations: IP 20 / 15 min, session 10 / 15 min, IP+session 10 / 15 min |
| Beta invite validation | `POST /api/auth/verify-invite` | IP: 20 / 15 min; invite code: 8 / 15 min; IP+code: 8 / 15 min |

Redis keys hash IPs, emails, tokens, invite codes, user IDs, and session identifiers before storage. Rate-limit responses are generic `429` JSON responses with `RateLimit-*` and `Retry-After` headers and do not reveal whether an email or account exists.
