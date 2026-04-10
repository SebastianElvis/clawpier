# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawPier is a macOS desktop app for managing sandboxed [OpenClaw](https://github.com/openclaw/openclaw) and [Hermes](https://github.com/NousResearch/hermes-agent) AI agent instances via Docker. Built with Tauri v2 (Rust backend + React frontend).

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
pnpm test             # Unit tests (vitest)
```

### Running Single Tests

```bash
# Frontend — filter by filename pattern
pnpm test bot-store
pnpm test use-auto-restart

# Rust — all unit tests
cargo test --manifest-path src-tauri/Cargo.toml

# Rust — single test by name
cargo test --manifest-path src-tauri/Cargo.toml split_timestamp

# Rust — integration tests only (requires Docker running)
cargo test --manifest-path src-tauri/Cargo.toml -- --ignored
```

### Type-check Only

```bash
pnpm exec tsc -b
```

## Architecture

### Data Flow

```
React UI (Zustand store) ←→ Tauri IPC (invoke / events) ←→ Rust commands ←→ Docker (bollard)
```

The frontend calls typed `invoke()` wrappers in `lib/tauri.ts` which map to `#[tauri::command]` handlers in `commands.rs`. The Rust backend emits `bot-status-update` events every 5s; the frontend subscribes via `use-bot-events.ts` hook.

### Rust Backend (`src-tauri/src/`)

- `lib.rs` — Tauri app setup, plugin registration, 5s status polling loop
- `main.rs` — Entry point, calls `clawpier_lib::run()`
- `models.rs` — `BotProfile`, `BotStatus`, `BotWithStatus`, `ContainerStats`, `LogEntry`, `FileEntry` (serde-serializable)
- `docker_manager.rs` — Docker operations via bollard (start/stop/status/pull/stats/logs/exec)
- `bot_store.rs` — JSON persistence at `~/.config/clawpier/bots.json`
- `commands.rs` — All `#[tauri::command]` IPC handlers
- `state.rs` — `AppState` with `tokio::sync::Mutex<BotStore>`, `Mutex<DockerManager>`, `Mutex<StreamManager>`
- `streaming.rs` — Manages active log/stats streams and interactive terminal sessions per bot
- `error.rs` — `AppError` enum with `thiserror`, implements `Serialize` for IPC

### Frontend (`src/`)

- `App.tsx` — Root: Docker check → welcome screen → bot list
- `stores/bot-store.ts` — Zustand store for all bot state + actions
- `hooks/` — Custom hooks for Tauri event subscriptions, log/stats streaming, interactive terminal, zoom
- `lib/tauri.ts` — Typed `invoke()` wrappers for all IPC commands
- `lib/types.ts` — TypeScript types mirroring Rust models
- `components/` — One component per file (BotCard, BotDetail, ConfigDashboard, etc.)

### IPC Commands

All defined in `commands.rs`, invoked from `lib/tauri.ts`:
- `check_docker` / `check_image` — Verify Docker daemon and image availability
- `list_bots` — Get all bots with live status
- `create_bot` / `delete_bot` / `rename_bot` — Bot profile CRUD
- `start_bot` / `stop_bot` / `restart_bot` — Container lifecycle
- `toggle_network` — Flip network isolation per bot
- `set_workspace_path` — Configure workspace directory
- `update_env_vars` — Set environment variables per bot
- `pull_image` — Pull Docker image
- `start_stats_stream` / `stop_stats_stream` — Live CPU/memory/network stats
- `start_log_stream` / `stop_log_stream` — Real-time container log streaming
- `start_terminal_session` / `write_terminal_input` / `resize_terminal` — Interactive PTY terminal
- `exec_command` — Run a one-off command in a container
- `list_workspace_files` / `read_workspace_file` — File browser
- `get_bot_config` — Read OpenClaw config files
- `resolve_telegram_bot` — Resolve Telegram bot info via API

## Key Patterns

### Tauri v2 Specifics
- Must `use tauri::{Emitter, Manager}` in `lib.rs` for `handle.state()` and `handle.emit()`
- Capabilities defined in `src-tauri/capabilities/default.json`
- Identifier is `com.clawpier.manager` (not `.app` — conflicts with macOS)

### Docker Conventions
- Container names: `clawpier-{uuid}`
- Default: `--network none` (sandbox isolation)
- Always injects: `OPENCLAW_GATEWAY_HOST=127.0.0.1`
- Container matching uses exact name comparison via bollard filters
- OpenClaw config persisted via host bind mounts at `~/.config/clawpier/data/{bot-id}/`

### State Management
- Rust: `AppState` holds `Mutex<BotStore>` + `Mutex<DockerManager>` + `Mutex<StreamManager>`, accessed via `State<'_, AppState>`
- Frontend: Zustand store with `actionInProgress` set for optimistic UI loading states
- Status sync: Rust emits `bot-status-update` events every 5s; frontend listens via `@tauri-apps/api/event`
- Streams: `StreamManager` tracks active log/stats streams and interactive sessions per bot; streams are cleaned up on bot stop/delete/restart

### Persistence
- Bot profiles saved to `~/.config/clawpier/bots.json`
- OpenClaw config data at `~/.config/clawpier/data/{bot-id}/`
- Auto-saves on every mutation (create, delete, rename, toggle network, env vars, workspace path)
- Name uniqueness enforced case-insensitively

## Testing

### Frontend
- Vitest with jsdom environment, configured in `vite.config.ts` (not a separate vitest config)
- Setup file at `src/test/setup.ts` mocks `@tauri-apps/api/core` and `@tauri-apps/api/event`
- Test files live in `__tests__/` subdirectories next to their source (e.g., `stores/__tests__/`, `hooks/__tests__/`)

### Rust
- Unit tests use `#[test]` and `#[tokio::test]` within `#[cfg(test)]` modules
- Integration tests requiring Docker use `#[tokio::test]` + `#[ignore]` — CI runs them separately with `-- --ignored`
- Test modules in: `models.rs`, `docker_manager.rs`, `streaming.rs`

### CI Pipeline (`.github/workflows/ci.yml`)
Three jobs: **frontend** (lint → type-check → vitest), **rust** (cargo test → cargo check --release), **integration** (pulls `busybox:latest`, runs `-- --ignored` tests)

## Versioning

The app version is defined in **three files** that must be kept in sync:
1. `package.json` → `"version"` (frontend / pnpm)
2. `src-tauri/Cargo.toml` → `version` (Rust crate)
3. `src-tauri/tauri.conf.json` → `"version"` (Tauri app metadata, shown in UI title bar)

**When tagging a release**, always update all three files to match the tag (e.g., `v0.3.1` → `"0.3.1"` in all three). The version in `tauri.conf.json` is what the user sees in the app header.

## Build Gotchas

- **Vite version**: Must use Vite 6 (not 8) — Vite 8 has esbuild issues with Tauri
- **React plugin**: Must use `@vitejs/plugin-react@4` (not v6) — v6 requires Vite 8
- **pnpm esbuild**: Needs `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` in package.json
- **Icons**: Must be RGBA PNGs (color type 6), not RGB
- **Tailwind v4**: Uses `@import "tailwindcss"` in CSS, no `tailwind.config.js` needed
- **ESLint**: Uses flat config (`eslint.config.js`); react-hooks v7 enforces `set-state-in-effect` — do not call `setState` synchronously inside `useEffect` bodies (async callbacks like `.then()` are fine)

## Code Style

- Rust: standard `rustfmt`, `thiserror` for errors, async/await with tokio
- TypeScript: strict mode, functional React components, Tailwind utility classes
- Components: one component per file in `src/components/`
- No barrel exports — import directly from component files
