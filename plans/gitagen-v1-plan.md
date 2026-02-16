# Gitagen v1 Plan: Fast Electron Git Client (Tailwind + SQLite Cache)

## Summary
Build a macOS-first Electron app with a two-pane layout:
- Left sidebar: `Projects` section on top and collapsible repository file tree below.
- Center panel: diff viewer using `@pierre/diffs` (`PatchDiff`) with `unstaged` and `staged` toggle.

Core goals:
- Very fast startup (interactive under 500ms).
- Fast project switching and diff loading via SQLite-backed cache.
- Use `simple-git` first, with a pluggable `/lib/git` adapter layer for fallback/custom git commands when needed.

## Implementation Scope (Decision-Complete)
1. Scaffold app stack with:
- Electron + `electron-vite`
- React 19 + TypeScript
- Tailwind v4 (`@tailwindcss/vite`)
- `@pierre/diffs/react`
- `simple-git`
- `better-sqlite3`
2. Build the main shell UI:
- Sidebar fixed width (desktop first), styled to match the screenshot direction.
- Top `Projects` area with quick actions: add, remove, search, switch.
- File tree below with collapsible folders and a toggle filter for changed files only.
- Center diff panel with staged/unstaged switch and file header metadata.
3. Build main-process data services:
- Git service with adapter boundary in `/lib/git`.
- SQLite cache service in main process.
- IPC bridge exposed through preload only.
4. Deliver startup/perf behaviors:
- No auto-open project at launch from GUI.
- If CLI path argument is provided, open that project directly.
- Load app shell first, then async hydrate project list/tree/diff.
- Warm cache-first reads, then background refresh.
5. Testing and acceptance checks for startup latency, tree correctness, and diff correctness.

## Architecture and File Layout
- `electron/main.ts`: app lifecycle, BrowserWindow, IPC handlers, CLI arg parsing.
- `electron/preload.ts`: `contextBridge` typed API.
- `src/renderer/App.tsx`: root shell.
- `src/renderer/components/ProjectsPanel.tsx`
- `src/renderer/components/FileTreePanel.tsx`
- `src/renderer/components/DiffPanel.tsx`
- `src/renderer/components/DiffToolbar.tsx`
- `src/renderer/state/*`: UI and query state.
- `lib/git/types.ts`: provider interface.
- `lib/git/simpleGitProvider.ts`
- `lib/git/rawGitProvider.ts` (fallback/custom commands).
- `lib/git/index.ts`: provider resolver.
- `lib/cache/sqlite.ts`: DB init, schema, queries, retention.
- `lib/cache/keys.ts`: repo/file fingerprint logic.
- `lib/models/*`: shared types.
- `styles/*`: Tailwind setup + design tokens.

## Public APIs / Interfaces / Types
`preload` exposes `window.gitagen` with:
- `projects.list(): Promise<Project[]>`
- `projects.add(path: string): Promise<Project>`
- `projects.remove(projectId: string): Promise<void>`
- `projects.switch(projectId: string): Promise<void>`
- `repo.getTree(projectId: string, opts: { changedOnly: boolean; includeIgnored: boolean }): Promise<TreeNode[]>`
- `repo.getStatus(projectId: string): Promise<RepoStatus>`
- `repo.getPatch(projectId: string, filePath: string, scope: "unstaged" | "staged"): Promise<PatchResult>`
- `repo.refresh(projectId: string): Promise<void>`
- `settings.getProjectPrefs(projectId: string): Promise<ProjectPrefs>`
- `settings.setProjectPrefs(projectId: string, prefs: Partial<ProjectPrefs>): Promise<void>`
- `events.onRepoUpdated(cb)`
- `events.onRepoError(cb)`

Core shared types:
- `Project { id, name, path, lastOpenedAt, createdAt }`
- `TreeNode { path, name, kind: "file" | "dir", depth, hasChildren, gitStatus? }`
- `RepoStatus { headOid, branch, staged: string[], unstaged: string[], untracked: string[] }`
- `PatchResult { filePath, scope, patch, fromCache, fingerprint }`
- `ProjectPrefs { includeIgnored, changedOnly, expandedDirs, selectedFilePath, sidebarScrollTop }`

Git provider interface in `/lib/git/types.ts`:
- `getTree(...)`
- `getStatus(...)`
- `getPatch(...)`
- `getHeadOid(...)`
- `getRepoFingerprint(...)`

Resolver policy:
- Default `simple-git` provider.
- Use `rawGitProvider` for operations where `simple-git` is limiting or too slow.

## Git Data and Cache Strategy
SQLite database in Electron `userData` path.
Tables:
- `projects`
- `project_prefs`
- `repo_state`
- `tree_cache`
- `status_cache`
- `patch_cache`
- `cache_meta`

Retention policy:
- LRU cap `500MB`.
- TTL `30 days`.
- Cleanup on startup and periodically in background.

Fingerprint/invalidation:
- Fingerprint = `{ repoPath, headOid, indexMtimeMs, statusHash }`.
- Tree/status caches keyed by project + fingerprint + includeIgnored flag.
- Patch cache keyed by project + filePath + scope + fingerprint.
- On refresh or fs/git change, stale keys are invalidated.

## UI/UX Behavior
- Projects panel is always above the file tree.
- Project switching preserves per-project UI state (selection, expanded dirs, filter, scroll).
- File tree is full repo tree with collapsible folders.
- Include ignored files toggle is available and remembered per project.
- Changed-only toggle filters the tree without rebuilding project state.
- Diff panel uses `PatchDiff` and supports `unstaged`/`staged` view toggle.

## Performance Plan (Startup and Interaction)
Startup path:
1. Launch window immediately with lightweight shell.
2. Initialize preload API and renderer state.
3. Load project list from SQLite only.
4. Render UI interactive target under `500ms`.
5. Lazy-load selected project tree/status/diff only when selected.
6. Prefetch first changed file patch in background after tree load.

Runtime optimizations:
- Virtualized tree rendering.
- Memoized flattened tree model per project+filter.
- Debounced refresh actions.
- In-memory session LRU above SQLite.
- `@pierre/diffs` worker pool in renderer.
- Default worker pool size: `min(4, max(2, floor(hardwareConcurrency / 2)))`.
- Lazy syntax-heavy diff rendering only when file selected.

## Security and Electron Settings
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- IPC allowlist only (no generic `eval`/raw shell bridge).
- Validate project paths and block non-local/invalid repos gracefully.

## Test Cases and Scenarios
Unit tests:
- Cache key/fingerprint correctness.
- Git status parsing and tree building.
- Changed-only filter logic.
- Project preference persistence.

Integration tests:
- `simpleGitProvider` against fixture repos:
- clean repo
- unstaged changes
- staged changes
- untracked files
- rename/delete cases
- SQLite cache hits/misses and invalidation on repo changes.

E2E (Electron):
- Launch with no active project: project list visible, no auto-open.
- Launch with CLI repo path: that project opens directly.
- Switch projects: state restored per project.
- Toggle changed-only and include-ignored persists per project.
- Select file and toggle staged/unstaged: patch updates correctly.

Performance acceptance:
- Interactive under `500ms` cold launch (target machine: local macOS dev environment).
- Warm project switch under `150ms`.
- Warm cached patch display under `100ms`.

## Assumptions and Defaults
- macOS is primary v1 runtime target.
- React + TypeScript + Tailwind is the chosen renderer stack.
- Projects are user-managed pinned repos.
- GUI launch does not auto-open last project.
- CLI launch with repo path opens that project directly.
- Diff scope for v1 is staged and unstaged only.
- `better-sqlite3` is accepted despite native-module build requirements.
- `simple-git` is primary; `/lib/git` custom provider is available for gaps/perf edge cases.
