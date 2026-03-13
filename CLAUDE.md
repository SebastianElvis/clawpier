# CLAUDE.md — Clawbox

Guidelines for AI assistants working on this codebase.

## Project Overview

Clawbox is a macOS desktop app for managing sandboxed OpenClaw bot instances via Docker. Built with Tauri v2 (Rust backend + React frontend).

## Tech Stack

- **Framework**: Tauri v2 (Rust + WebView)
- **Frontend**: React 19, TypeScript, Tailwind CSS v4 (via `@tailwindcss/vite`), Zustand
- **Backend**: Rust with bollard 0.18 (Docker API), tokio, serde, thiserror
- **Package manager**: pnpm
- **Icons**: lucide-react
- **Build**: Vite 6 + `@vitejs/plugin-react@4`

## Development Commands

```bash
pnpm install          # Install frontend dependencies
pnpm tauri dev        # Run in dev mode with hot-reload
pnpm tauri build      # Release build (.app + DMG)
pnpm build            # Frontend-only build (tsc + vite)
pnpm lint             # ESLint
```

## Architecture

### Rust Backend (`src-tauri/src/`)

- `lib.rs` — Tauri app setup, plugin registration, 5s status polling loop
- `main.rs` — Entry point, calls `clawbox_lib::run()`
- `models.rs` — `BotProfile`, `BotStatus`, `BotWithStatus` (serde-serializable)
- `docker_manager.rs` — Docker operations via bollard (start/stop/status/pull)
- `bot_store.rs` — JSON persistence at `~/.config/clawbox/bots.json`
- `commands.rs` — All `#[tauri::command]` IPC handlers
- `state.rs` — `AppState` with `tokio::sync::Mutex<BotStore>` and `Mutex<DockerManager>`
- `error.rs` — `AppError` enum with `thiserror`, implements `Serialize` for IPC

### Frontend (`src/`)

- `App.tsx` — Root: Docker check → welcome screen → bot list
- `stores/bot-store.ts` — Zustand store for all bot state + actions
- `hooks/use-bot-events.ts` — Subscribes to `bot-status-update` Tauri events
- `lib/tauri.ts` — Typed `invoke()` wrappers for all IPC commands
- `lib/types.ts` — TypeScript types mirroring Rust models
- `components/` — 10 UI components (BotCard, BotList, Layout, NewBotSheet, etc.)

### IPC Commands

All defined in `commands.rs`, invoked from `lib/tauri.ts`:
- `check_docker` — Verify Docker daemon is reachable
- `list_bots` — Get all bots with live status
- `create_bot` — Add a new bot profile
- `start_bot` / `stop_bot` — Container lifecycle
- `delete_bot` — Remove profile + container
- `rename_bot` — Update bot name (unique, case-insensitive)
- `toggle_network` — Flip network isolation per bot
- `pull_image` — Pull Docker image

## Key Patterns

### Tauri v2 Specifics
- Must `use tauri::{Emitter, Manager}` in `lib.rs` for `handle.state()` and `handle.emit()`
- Capabilities defined in `src-tauri/capabilities/default.json`
- Identifier is `com.clawbox.manager` (not `.app` — conflicts with macOS)

### Docker Conventions
- Container names: `clawbox-{uuid}`
- Default: `--network none` (sandbox isolation)
- Always injects: `OPENCLAW_GATEWAY_HOST=127.0.0.1`
- Container matching uses exact name comparison via bollard filters

### State Management
- Rust: `AppState` holds `Mutex<BotStore>` + `Mutex<DockerManager>`, accessed via `State<'_, AppState>`
- Frontend: Zustand store with `actionInProgress` set for optimistic UI loading states
- Status sync: Rust emits `bot-status-update` events every 5s; frontend listens via `@tauri-apps/api/event`

### Persistence
- Bot profiles saved to `~/.config/clawbox/bots.json`
- Auto-saves on every mutation (create, delete, rename, toggle network)
- Name uniqueness enforced case-insensitively

## Build Gotchas

- **Vite version**: Must use Vite 6 (not 8) — Vite 8 has esbuild issues with Tauri
- **React plugin**: Must use `@vitejs/plugin-react@4` (not v6) — v6 requires Vite 8
- **pnpm esbuild**: Needs `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` in package.json
- **Icons**: Must be RGBA PNGs (color type 6), not RGB
- **Tailwind v4**: Uses `@import "tailwindcss"` in CSS, no `tailwind.config.js` needed

## Code Style

- Rust: standard `rustfmt`, `thiserror` for errors, async/await with tokio
- TypeScript: strict mode, functional React components, Tailwind utility classes
- Components: one component per file in `src/components/`
- No barrel exports — import directly from component files
