<p align="center">
  <img src="resources/icon.png" alt="Gitagen" width="128" height="128" />
</p>

<h1 align="center">Gitagen</h1>

<p align="center">
  A fast, macOS-first Git client built with Electron.
</p>

<p align="center">
  <a href="LICENSE">MIT License</a>
</p>

---

## Overview

Gitagen is a native Git client designed for speed and simplicity. It features a two-pane layout with a sidebar for project navigation and a diff viewer powered by [`@pierre/diffs`](https://github.com/nicolo-ribaudo/pierre-diffs), all backed by a SQLite cache for fast startup and responsive project switching.

### Key Features

- **Fast startup** — interactive in under 500ms with SQLite-backed caching
- **Full Git workflow** — stage, commit, push, pull, branch, merge, rebase, stash, tags, cherry-pick
- **Diff viewer** — side-by-side and inline diffs with syntax highlighting
- **Branch management** — create, switch, rename, delete, and merge branches
- **Remote operations** — fetch, pull, push with tracking info
- **Stash support** — save, pop, apply, and drop stashes
- **Worktrees** — manage multiple working trees per repository
- **Commit signing** — SSH and GPG signing with 1Password SSH agent support
- **Command palette** — keyboard-driven navigation and actions
- **AI-assisted commits** — generate commit messages with configurable AI providers
- **Dark and light themes** — follows system preference or manual toggle
- **Per-project settings** — gitconfig resolution, UI state persistence
- **CLI opener** — open a repository directly in Gitagen from Terminal

## Tech Stack

| Layer   | Technology                            |
| ------- | ------------------------------------- |
| Shell   | Electron 40, electron-vite            |
| UI      | React 19, TypeScript, Tailwind CSS v4 |
| Git     | simple-git                            |
| Diffs   | @pierre/diffs                         |
| Storage | @libsql/client, drizzle-orm           |
| Tooling | pnpm, oxlint, oxfmt, tsgo             |

## Architecture

```
src/
  main/             # Electron main process — Git operations, IPC handlers, SQLite cache
  preload/          # contextBridge API — typed bridge between main and renderer
  renderer/src/     # React UI — components, hooks, themes, settings
  shared/           # Shared TypeScript types across all processes
```

The app enforces strict process isolation: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All Git operations run in the main process; the renderer communicates exclusively through IPC.

See `docs/ARCHITECTURE.md` for a deeper walkthrough (IPC flows, cache strategy, watcher lifecycle, and startup path).

## Getting Started

### Prerequisites

- **macOS** (primary target; Linux support is experimental)
- **Node.js** >= 20
- **pnpm** >= 10
- **Git** installed and available in PATH

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Build macOS DMG

```bash
pnpm dist:mac
```

### macOS Gatekeeper

The app is not notarized (no Apple Developer certificate). After installing, run:

```bash
xattr -cr /Applications/Gitagen.app
```

This removes the quarantine attribute that causes the "damaged" or "unidentified developer" error.

GitHub Actions also builds a macOS `.dmg` via `.github/workflows/build-macos-dmg.yml` when a `v*` tag is pushed. The DMG version is derived from the tag (for example, `v0.0.3` produces `Gitagen-0.0.3-<arch>.dmg`). Download it from the workflow run artifacts or release assets.

### Command Line Tool

Gitagen ships with a small CLI helper script (`resources/cli/gitagen`) that opens repositories in the app.

1. Install from app menu: `Gitagen > Install Command Line Tool...`
2. Use it from Terminal:

```bash
gitagen                 # Open Gitagen start page
gitagen .               # Open current repository
gitagen /path/to/repo   # Open specific repository
```

Internally, this launches the app with `--open-repo <path>`, which routes to the existing app instance.

### Scripts

```bash
pnpm dev          # Start Electron + renderer in development mode
pnpm build        # Build main/preload/renderer output
pnpm preview      # Preview built app
pnpm pack:mac     # Build a macOS DMG without publishing
pnpm dist:mac     # Build + pack macOS DMG
pnpm release      # Build + publish macOS release
pnpm typecheck    # TypeScript type checking (tsgo)
pnpm lint         # Lint with oxlint
pnpm lint:fix     # Lint and auto-fix
pnpm fmt          # Format with oxfmt
pnpm fmt:check    # Check formatting
```

## Screenshots

_Coming soon._

## License

This project is licensed under the [MIT License](LICENSE).
