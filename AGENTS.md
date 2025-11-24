# Repository Guidelines

Concise guide for contributors working on the LAN file-sharing app. Use Node v22.14.0 (`nvm use`) to match `.nvmrc` across root, `client/`, and `server/`.

## Project Structure & Module Organization
- `client/` – Next.js 15 app router project; UI lives in `components/`, shared state in `contexts/`, hooks in `hooks/`, utilities in `lib/`, and static assets in `public/`.
- `server/` – TypeScript WebSocket/Express backend; entry `src/index.ts` with `controllers/`, `routes/api.ts`, `services/`, `ws/handlers.ts`, and config values in `src/config.ts`.
- Root scripts orchestrate both packages; no shared code outside the two workspaces.

## Build, Test, and Development Commands
- Install deps: `npm run clean:install` (root) installs and cleans both apps; or `cd client && npm install`, `cd server && npm install`.
- Run dev servers together: `npm start` (spawns backend then frontend). Individually: `npm run start:backend` / `npm run start:frontend`.
- Production build: `npm run build` (root) → `client/.next` & `server/dist`. Start backend prod build: `npm run start:prod:server`.
- Lint frontend: `cd client && npm run lint`. Backend lint: `cd server && npm run lint`.

## Coding Style & Naming Conventions
- TypeScript everywhere; prefer 2-space indent, semicolons, and single quotes for imports unless tooling changes it.
- Components/contexts in PascalCase (`MainScreen`, `ThemeProvider`); hooks use `useX` naming; utility modules are camelCase.
- Tailwind + shadcn/ui components drive styling; favor existing design tokens and class patterns in `client/app/globals.css`.
- Frontend lint config extends `next/core-web-vitals`; fix warnings before pushing.

## Testing Guidelines
- No automated tests yet; backend `npm test` currently fails by design. Please add unit tests when touching logic (Vitest/Jest acceptable) and keep files near code.
- For manual verification: run both dev servers, confirm WebSocket connection, room creation, file upload/download flows, and UI renders without console errors.

## Commit & Pull Request Guidelines
- Commit history is short, single-line summaries; keep messages imperative and under ~72 chars (e.g., `add room heartbeat`, `fix upload progress`).
- PRs should link related issues, describe the change and validation steps, and attach UI screenshots/gifs for visible tweaks. Note any new env vars or migrations.

## Security & Configuration Tips
- Do not commit `.env*`; frontend expects `NEXT_PUBLIC_APP_URL`, backend ports and timeouts live in `server/src/config.ts`—document changes there.
- Avoid logging secrets; double-check WebSocket endpoints when deploying.
