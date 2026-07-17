# Frontend — Hosting Platform

Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui. This is the web
UI for the Hosting Platform: authentication, project management, and the
deployment lifecycle. It talks to the ASP.NET Core API via the native `fetch`
layer in [`src/services/api.ts`](src/services/api.ts).

For the full picture — running the whole stack locally, architecture, and how the
dev proxy avoids CORS — see the [root README](../README.md) and
[`docs/`](../docs).

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
```

The dev server proxies `/api/*` to the backend (`BACKEND_ORIGIN`, default
`http://localhost:5165`), so the app uses same-origin requests — no CORS setup
needed. Start the backend first (see the root README).

## Checks

```bash
npm run lint       # ESLint
npx tsc --noEmit   # type check
npm test           # Vitest unit tests
npm run build      # production build
```
