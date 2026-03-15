# Changelog

All notable changes to ClawPier will be documented in this file.

## [0.2.0] - 2026-03-15

### Chat

- Interactive chat with OpenClaw agents via `openclaw agent` CLI
- Session persistence across messages using `--session-id`
- Multi-session support: create, rename, delete chat sessions
- Typing indicator with animated dots while agent responds
- Streaming response display
- Markdown rendering in chat messages (react-markdown + remark-gfm)
- Message search and copy-to-clipboard

### Dashboard

- Config dashboard tab showing agent configuration (model, channels, gateway, skills, web tools)
- Structured cards for Model and Channels with compact rows for other settings
- Links to Terminal tab for configuration changes

### Resource Management

- Configurable CPU core limit (min 1 core)
- Configurable memory limit (min 2 GB)
- Unified Docker settings UI

### UX

- Zoom in/out feature (Cmd+=/Cmd+-/Cmd+0)

### Testing & Security

- Unit tests for BotStore, ChatStore, and use-chat hook
- Docker integration tests
- Security fixes

## [0.1.0] - 2026-03-14

First public release.

### Core

- Multi-bot management: create, start, stop, restart, delete bot instances
- Docker container lifecycle via bollard (Docker Engine API)
- Bot profiles persisted to `~/.config/clawpier/bots.json`
- Background status polling every 5 seconds via Tauri events
- Container restart handling with config persistence

### Container & Security

- Sandbox-by-default: containers run with `--network none`
- Per-bot network toggle (sandboxed / bridge)
- Workspace directory bind mounting
- Environment variable management per bot
- OpenClaw config persistence across container restarts (host bind mounts)

### Dashboard

- OpenClaw agent configuration overview (model, channels, gateway)
- Telegram bot info card with live API resolution
- Read-only view of `openclaw.json` settings

### Interactive Terminal

- Full PTY terminal via xterm.js with Docker exec
- Proper TERM/PS1 environment setup
- Terminal resize support
- Auto-reconnect on container restart

### Logs

- Continuous real-time log streaming (stdout + stderr)
- Timestamp parsing and display
- Race-condition-free listener/stream startup
- requestAnimationFrame batching for high-frequency logs

### File Browser

- Browse workspace directory contents
- File preview with syntax-highlighted content
- Path traversal protection

### Monitoring

- Live CPU and memory usage display
- CPU core count indicator
- Network I/O bytes (rx/tx)

### UX

- Welcome screen with first-launch onboarding
- Docker Desktop detection with retry + download link
- OpenClaw image pull with progress indication
- Zoom in/out support (Cmd+=/Cmd+-/Cmd+0)
- Inline bot renaming
- Keyboard shortcut: Cmd+N to create bot
- Version display in header

### Infrastructure

- CI pipeline: frontend lint/type-check/tests + Rust unit tests + Docker integration tests
- MIT license
