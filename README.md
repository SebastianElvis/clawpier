# Clawbox

A macOS desktop app for managing sandboxed [OpenClaw](https://github.com/openclaw) bot instances via Docker.

Built with **Tauri v2** (Rust backend + React frontend).

## Features

- **Multi-bot dashboard** — Create, start, stop, and delete bot instances from a clean UI
- **Sandbox isolation** — Containers run with `--network none` by default; network access is opt-in per bot
- **Real-time status** — Background polling (5s) shows live Running / Stopped / Error states
- **Workspace mounting** — Optionally bind a local folder into the container
- **Docker prerequisite check** — Friendly error screen if Docker Desktop isn't running
- **Keyboard shortcuts** — `Cmd+N` to create a new bot

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Zustand |
| Backend | Rust, bollard (Docker API), tokio, serde |
| Package manager | pnpm |
| Icons | lucide-react |

## Prerequisites

- **macOS** (primary target)
- **Docker Desktop** — must be installed and running
- **Rust** toolchain (`rustup`)
- **Node.js** ≥ 18 + **pnpm**

## Getting Started

```bash
# Install frontend dependencies
pnpm install

# Run in development mode (hot-reload)
pnpm tauri dev

# Build a release binary + .app bundle
pnpm tauri build
```

The built app lands at `src-tauri/target/release/bundle/macos/Clawbox.app`.

## Project Structure

```
clawbox/
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── BotCard.tsx           # Bot card with inline rename, start/stop
│   │   ├── BotList.tsx           # Grid of bot cards + loading skeleton
│   │   ├── Layout.tsx            # App shell, header, drag region
│   │   ├── NewBotSheet.tsx       # Create-bot modal form
│   │   ├── DeleteConfirm.tsx     # Deletion confirmation dialog
│   │   ├── StatusBadge.tsx       # Running / Stopped / Error indicator
│   │   ├── NetworkBadge.tsx      # Network-enabled indicator
│   │   ├── EmptyState.tsx        # Empty dashboard CTA
│   │   ├── DockerError.tsx       # Docker-not-found screen
│   │   └── WelcomeScreen.tsx     # First-launch onboarding
│   ├── stores/bot-store.ts       # Zustand state management
│   ├── hooks/use-bot-events.ts   # Tauri event listener
│   ├── lib/tauri.ts              # Typed IPC invoke wrappers
│   ├── lib/types.ts              # TypeScript types
│   └── App.tsx                   # Root component
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── docker_manager.rs     # Docker API via bollard
│   │   ├── bot_store.rs          # JSON persistence (~/.config/clawbox/bots.json)
│   │   ├── commands.rs           # Tauri IPC commands
│   │   ├── models.rs             # BotProfile, BotStatus, BotWithStatus
│   │   ├── state.rs              # Shared AppState (Mutex)
│   │   ├── error.rs              # Error types
│   │   ├── lib.rs                # Tauri setup + status polling
│   │   └── main.rs               # Entry point
│   └── tauri.conf.json           # Tauri config
├── package.json
├── vite.config.ts
└── CLAUDE.md                     # AI assistant guidelines
```

## Architecture

```
┌─────────────────────────────────────┐
│           React Frontend            │
│  (Zustand store ← Tauri events)     │
├─────────────────────────────────────┤
│          Tauri IPC Bridge           │
│    invoke() ↔ #[tauri::command]     │
├─────────────────────────────────────┤
│           Rust Core                 │
│  DockerManager · BotStore · State   │
├─────────────────────────────────────┤
│      Docker Engine (bollard)        │
│  /var/run/docker.sock               │
└─────────────────────────────────────┘
```

## Key Design Decisions

- **Container naming**: `clawbox-{uuid}` — one container per bot profile
- **Network isolation**: `--network none` by default; toggled per-bot
- **Environment injection**: `OPENCLAW_GATEWAY_HOST=127.0.0.1` always set
- **Persistence**: Simple JSON file at `~/.config/clawbox/bots.json`
- **Status polling**: 5-second interval via Tauri events (`bot-status-update`)

## License

MIT
