# Gitagen – AI Agent Guidelines

Gitagen is a macOS-first Electron Git client: two-pane layout (sidebar + diff viewer), SQLite-backed cache, fast startup target (<500ms).

**Stack:** Electron 40, electron-vite, React 19, TypeScript, Tailwind v4, `@pierre/diffs`, `simple-git`.

## Commands

```bash
pnpm install
pnpm dev          # Start dev server
pnpm build        # Build for production
pnpm typecheck    # TypeScript check
pnpm fmt          # Format with oxfmt
pnpm fmt:check    # Check formatting
pnpm lint         # Lint with oxlint
pnpm lint:fix     # Lint and auto-fix
```

## Code Conventions

- **Formatting:** Use `oxfmt` (config in `.oxfmtrc.json`). Tabs, 4-width, double quotes, semicolons, trailing comma ES5.
- **Linting:** Use `oxlint`. Run `pnpm lint:fix` before committing.
- **TypeScript:** Strict. Run `pnpm typecheck` before committing.
- **Commits:** Use [conventional commits](https://www.conventionalcommits.org/) (e.g. `feat:`, `fix:`, `chore:`).
- **React:** Functional components, React 19 patterns. Colocate styles with components.

## Architecture

- **Main:** `src/main/` — Electron main process, Git via `simple-git`, IPC handlers.
- **Preload:** `src/preload/` — `contextBridge`-exposed API for renderer.
- **Renderer:** `src/renderer/src/` — React UI, Tailwind. Entry: `main.tsx` → `App.tsx`.
- **Shared:** `src/shared/types.ts` — Types shared across processes.

IPC: `projects`, `repo`, `settings`, `events` APIs exposed via preload. No `nodeIntegration`; `contextIsolation` and sandbox enabled.

## File Layout

```
src/
  main/           # Main process
  preload/        # Preload bridge
  renderer/src/   # React app (components/, App.tsx, main.tsx)
  shared/         # Shared types
```

When adding features, respect the main → preload → renderer boundary. Git operations belong in main; renderer uses IPC only.
