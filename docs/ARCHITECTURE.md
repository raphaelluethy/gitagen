# Gitagen Architecture

## High-Level Overview

Gitagen is an Electron-based Git client with a strict **main → preload → renderer** boundary. The renderer (React) never touches Node.js or the filesystem—it only talks to the main process via IPC.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              RENDERER PROCESS (Browser Context)                        │
│                              src/renderer/src/                                         │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  React App (App.tsx)                                                          │    │
│  │  • Sidebar (file tree)  • DiffViewer  • CommitPanel  • LogPanel               │    │
│  │  • BranchSelector      • StashPanel  • RemotePanel  • WorktreeSelector       │    │
│  │  • StartPage           • CommandPalette  • ConflictBanner  • GitAgentModal    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                              │
│                                        │ window.gitagen (contextBridge API)           │
│                                        ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  window.gitagen                                                               │    │
│  │  • projects: list, add, remove, switchTo, listGrouped                         │    │
│  │  • repo: openProject, getTree, getStatus, getPatch, stage/unstage, commit…   │    │
│  │  • settings: getGlobal, setGlobal, getProjectPrefs, discoverGitBinaries…      │    │
│  │  • events: onRepoUpdated, onRepoError, onConflictDetected, onOpenRepo…        │    │
│  │  • app: openExternal, confirm                                                │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         │ ipcRenderer.invoke(channel, ...args)
                                         │ ipcRenderer.on(channel, handler)
                                         │
═══════════════════════════════════════════════════════════════════════════════════════
                                    CONTEXT BOUNDARY
═══════════════════════════════════════════════════════════════════════════════════════
                                         │
                                         │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              PRELOAD SCRIPT                                            │
│                              src/preload/index.ts                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  • Exposes api via contextBridge.exposeInMainWorld("gitagen", api)                    │
│  • Validates projectId (UUID), path (no traversal), URL (http/https) before invoke   │
│  • Wraps ipcRenderer.invoke() and ipcRenderer.on() with typed methods                 │
│  • No Node.js exposed to renderer (nodeIntegration: false, sandbox: true)             │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                         │
                                         │ Main ↔ Renderer IPC
                                         │
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              MAIN PROCESS (Node.js)                                    │
│                              src/main/                                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  ipcMain.handle("projects:*", ...)   ipcMain.handle("settings:*", ...)                 │
│  ipcMain.handle("repo:*", ...)       ipcMain.handle("app:*", ...)                      │
│                                                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │  IPC Handlers (src/main/ipc/)                                                 │    │
│  │  • projects.ts  • repo.ts  • settings.ts  • events.ts  • cli.ts              │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                        │                                              │
│          ┌─────────────────────────────┼─────────────────────────────┐               │
│          ▼                             ▼                             ▼               │
│  ┌──────────────┐            ┌─────────────────────┐       ┌──────────────┐         │
│  │  SQLite Cache │            │  Git Provider       │       │  File Watcher│         │
│  │  (projects,   │            │  (simple-git)       │       │  (fs.watch)   │         │
│  │   repo_cache, │            │                     │       │              │         │
│  │   patch_cache,│            │  • getStatus        │       │  .git/, index,│         │
│  │   log_cache)  │◄──────────►│  • getTree          │◄──────│  refs/, cwd   │         │
│  └──────────────┘            │  • getPatch         │       │              │         │
│          │                    │  • stage/unstage    │       │  Debounced    │         │
│          │                    │  • commit, push…   │       │  emitRepoUpdated│       │
│          │                    └─────────────────────┘       └──────────────┘         │
│          │                              │                             │               │
│          │                              │                             │               │
│          │                    ┌─────────▼─────────┐                   │               │
│          │                    │  events.ts        │───────────────────┘               │
│          │                    │  emitRepoUpdated  │                                   │
│          │                    │  emitRepoError     │   BrowserWindow.webContents.send() │
│          │                    │  emitConflictDet. │ ─────────────────────────────────►│
│          │                    └───────────────────┘              RENDERER             │
│          │                                                                             │
└──────────┼───────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  FILESYSTEM                                                                           │
│  • User's Git repos (project paths)                                                   │
│  • ~/.gitagen (SQLite DB, settings, managed worktrees)                                │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## IPC: How Renderer Talks to Main

### Request-Response (invoke/handle)

The renderer never imports `ipcRenderer` directly. It uses `window.gitagen` methods, which the preload script wires to `ipcRenderer.invoke(channel, ...args)`.

| Flow        | Example                                                           |
| ----------- | ----------------------------------------------------------------- |
| 1. Renderer | `await window.gitagen.repo.getStatus(projectId)`                  |
| 2. Preload  | `ipcRenderer.invoke("repo:getStatus", projectId)`                 |
| 3. Main     | `ipcMain.handle("repo:getStatus", async (_, projectId) => {...})` |
| 4. Main     | Calls `createGitProvider().getStatus(cwd)` via `simple-git`       |
| 5. Main     | Returns `RepoStatus` to renderer                                  |
| 6. Renderer | Receives Promise result                                           |

All repo operations (status, tree, patch, stage, commit, push, etc.) follow this pattern. Project and settings APIs work the same way.

### Push Events (Main → Renderer)

Main broadcasts events when the repo state changes; the renderer subscribes via `events.on*`:

| Event                     | When Fired                                                                  | Purpose                                         |
| ------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| `events:repoUpdated`      | After any Git mutation (stage, commit, pull…), file watcher detects changes | Tell UI to refetch status/tree/log              |
| `events:repoError`        | Git command fails                                                           | Show error toast                                |
| `events:conflictDetected` | Merge/rebase/cherry-pick finds conflicts                                    | Show conflict banner and conflict resolution UI |
| `events:openRepo`         | App opened with `--open-repo /path` or second instance                      | Navigate to that project                        |
| `ai:commitChunk`          | AI streaming commit message                                                 | Update textarea in real time                    |

Each `events.on*` returns an unsubscribe function; components typically call it in a `useEffect` cleanup.

---

## Git Integration

### Git Provider Abstraction

- **Entry:** `createGitProvider(settings)` in `src/main/services/git/index.ts`
- **Implementation:** `SimpleGitProvider` in `src/main/services/git/simple-git-provider.ts`
- **Library:** `simple-git` — a Node.js wrapper around the `git` binary

### How It Works

1. **Binary Selection:** App can use system `git` or a user-selected binary (`settings.gitBinaryPath`). Validated via `git --version`.
2. **Per-Repo Instance:** `simpleGit({ baseDir: cwd, binary })` is created per repo path.
3. **Project → Path Resolution:** Projects are stored by main worktree path. `getRepoPath(projectId)` returns either the main path or `activeWorktreePath` from project prefs.
4. **Caching:**
    - **In-memory:** Status cached for 1 second to avoid repeated `git status` in rapid succession.
    - **SQLite:** Tree, status, and patches cached by a “fingerprint” (repo path, HEAD, index mtime, status hash). Invalidated on mutations.

### Key Git Operations (Main Side)

| Operation         | simple-git / Shell                            | Notes                                                 |
| ----------------- | --------------------------------------------- | ----------------------------------------------------- |
| `getStatus`       | `git status --porcelain=v1`                   | Parsed into staged/unstaged/untracked                 |
| `getTree`         | `git ls-files` + `git status`                 | Builds tree with depth and status                     |
| `getPatch`        | `git diff --cached` or `git diff`             | Staged vs unstaged; untracked built from file content |
| `stageFiles`      | `git add <paths>`                             |                                                       |
| `commit`          | `git commit -m "..."`                         | Optional amend, signing                               |
| `fetch/pull/push` | `git fetch`, etc.                             | Returns summaries for toasts                          |
| Worktrees         | `git worktree list`, `add`, `remove`, `prune` | Via `worktree/manager.ts`                             |

### File Watcher

When a project is opened, main calls `watchProject(projectId, cwd)`. It watches:

- `.git` (directory or file for worktrees)
- `.git/index`
- `.git/refs` (recursive)
- Repo root (`cwd`)

Changes are debounced (300ms). When fired, `emitRepoUpdated(projectId)` is broadcast so the renderer refreshes without polling.

---

## Interesting Facts

### 1. **Fast Startup (<500ms target)**

- SQLite caches status, tree, patches, and commit log
- Cached log is returned on `repo:openProject` before any `git` calls
- LRU in-memory caches for status (1s TTL) and toplevel paths (5min)
- Preload runs `preloadRecentProjectLogs()` in background to warm cache for recent projects

### 2. **Strict Security**

- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- Preload validates projectId (UUID), paths (no `..`, null bytes), URLs (http/https only)
- `app:openExternal` restricts allowed domains (e.g. GitHub, GitLab); others require confirmation
- `repo:openInEditor` checks path is inside repo to avoid traversal

### 3. **Worktree Support**

- Projects can represent the main worktree or a linked worktree
- `activeWorktreePath` in project prefs selects which worktree to use
- Worktrees can be added from the UI; paths can be under `~/.gitagen` for “managed” worktrees

### 4. **AI Integration**

- Commit message generation runs in main (`generateCommitMessage`), streams chunks via `ai:commitChunk`
- Multiple AI providers (OpenAI, Anthropic, OpenRouter, Cerebras, Fireworks)
- Git Agent modal uses tools that call `window.gitagen.repo.*` from the renderer

### 5. **Single-Instance + Deep Linking**

- `app.requestSingleInstanceLock()` ensures one app instance
- `--open-repo /path` opens that repo in the existing window
- `events:openRepo` carries `projectId` and optional `worktreePath`

### 6. **Conflict Awareness**

- Merge/rebase/cherry-pick mutations can set `emitConflicts: true` in `runMutation`
- After mutation, `emitConflictsIfAny` checks for conflict files and broadcasts `conflictDetected`
- ConflictBanner and conflict resolution UI react to that event

### 7. **SSH Agent Detection**

- Reads `SSH_AUTH_SOCK`; if it contains “1password”, labels it “1Password SSH Agent”
- `ensureSshAuthSock()` runs at app ready to set env for child processes

### 8. **Retention & Cache Size**

- Periodic retention job (every 30 min) cleans old cache entries
- In-memory caches (status, toplevel) use LRU eviction with max size limits

---

## Data Flow: Opening a Project

```
1. User selects project from StartPage or sidebar
2. App.tsx: window.gitagen.repo.openProject(projectId)
3. Main (repo.ts):
   - getProject(projectId), getProjectPrefs, getLogCache, createGitProvider
   - Resolve cwd (main path or activeWorktreePath)
   - Try SQLite cache for status/tree by fingerprint
   - If miss: git.getStatus(), git.listBranches(), git.listRemotes()
   - Write cache, return ProjectOpenData
4. Renderer receives: status, branches, remotes, cachedLog, cachedUnpushedOids, prefs
5. App sets project state; components render
6. window.gitagen.repo.watchProject(projectId) — main starts file watcher
7. On file changes: main emitRepoUpdated → renderer onRepoUpdated → components refetch
```

---

## File Layout Summary

```
src/
├── main/           # Electron main process
│   ├── index.ts         # App entry, window creation, handler registration
│   ├── ipc/             # IPC handlers (projects, repo, settings, events, cli)
│   └── services/
│       ├── cache/       # SQLite schema, queries, retention
│       ├── git/          # GitProvider, simple-git-provider
│       ├── watcher/      # fs.watch → emitRepoUpdated
│       ├── worktree/     # Worktree add/remove/prune
│       ├── ai/           # Commit message generation
│       └── settings/    # App settings store, git config, keychain
├── preload/
│   └── index.ts         # contextBridge → window.gitagen
├── renderer/src/        # React UI
└── shared/
    └── types.ts         # Shared types, IpcChannel union
```
