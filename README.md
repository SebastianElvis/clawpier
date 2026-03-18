# ClawPier

A native macOS desktop app for managing sandboxed [OpenClaw](https://github.com/openclaw) bot instances via Docker.

Built with **Tauri v2** (Rust backend + React frontend).

![ClawPier screenshot](docs/screenshot.png)

## What it does

ClawPier gives you a visual, approachable way to run OpenClaw AI agents — no terminal required.

- **Create and manage multiple bots** from a clean dashboard
- **Sandbox by default** — containers run with `--network none`; network access is opt-in per bot
- **Interactive terminal** — full PTY shell into any running container
- **Live logs** — real-time streaming with timestamp display
- **Dashboard** — see your bot's OpenClaw config, model, channels, and Telegram info at a glance
- **File browser** — browse and preview files in your bot's workspace
- **Resource monitoring** — live CPU, memory, and network I/O per bot
- **Environment variables** — configure secrets and settings per bot without touching config files

## Install

### From release (recommended)

Download the latest build for your platform from [Releases](https://github.com/SebastianElvis/clawpier/releases):

| Platform | Format | Notes |
|----------|--------|-------|
| macOS (Apple Silicon) | `.dmg` | Open, drag to Applications |
| macOS (Intel) | `.dmg` | Open, drag to Applications |
| Linux (x86_64) | `.AppImage` | `chmod +x` then run, or install the `.deb` |
| Windows (x86_64) | `.exe` installer | Run the NSIS installer, or use the `.msi` |

**Linux AppImage:**

```bash
chmod +x ClawPier_*.AppImage
./ClawPier_*.AppImage
```

**Linux .deb (Debian/Ubuntu):**

```bash
sudo dpkg -i ClawPier_*.deb
```

### Prerequisites

- **macOS / Linux / Windows**
- **Docker** — must be installed and running (Docker Desktop on macOS/Windows, or Docker Engine on Linux)
- OpenClaw Docker image (ClawPier will prompt you to pull it on first launch)

## Build from source

Requires Rust toolchain (`rustup`), Node.js >= 18, and pnpm.

On Linux, install system dependencies first:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

```bash
pnpm install          # Install frontend dependencies
pnpm tauri dev        # Run in development mode (hot-reload)
pnpm tauri build      # Build release binary + installers
```

## How it works

```
┌─────────────────────────────────────┐
│           React Frontend            │
│  (Zustand store ← Tauri events)     │
├─────────────────────────────────────┤
│          Tauri IPC Bridge           │
│    invoke() ↔ #[tauri::command]     │
├─────────────────────────────────────┤
│           Rust Backend              │
│  DockerManager · BotStore · State   │
├─────────────────────────────────────┤
│      Docker Engine (bollard)        │
│  /var/run/docker.sock               │
└─────────────────────────────────────┘
```

- Each bot gets its own Docker container (`clawpier-{uuid}`)
- Bot profiles are saved locally at `~/.config/clawpier/bots.json`
- OpenClaw config persists across container restarts via host bind mounts
- Status updates stream to the UI every 5 seconds via Tauri events

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Tauri v2 |
| Frontend | React 19, TypeScript, Tailwind CSS v4, Zustand |
| Backend | Rust, bollard 0.18 (Docker API), tokio |
| Package manager | pnpm |

## Contributing

Contributions are welcome. Please open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
