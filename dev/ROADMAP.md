# Clawbox Product Roadmap

> Last updated: 2026-03-14

## Vision

Clawbox is the definitive desktop companion for managing sandboxed OpenClaw bot instances. The goal is to evolve from a container manager into a full agent operations platform — where users can configure, monitor, converse with, and orchestrate their bots from a single app.

---

## Phase 1: Container Resource Management

> Give users control over the compute resources each bot consumes.

### 1.1 CPU & Memory Limits

**Goal:** Let users cap how much CPU and memory each bot container is allowed to use.

**Backend (`src-tauri/`):**

- Extend `BotProfile` in `models.rs` with new fields:
  ```rust
  pub cpu_limit: Option<f64>,       // e.g. 0.5 = half a core, 2.0 = two cores
  pub memory_limit_mb: Option<u64>, // e.g. 512 = 512 MB
  ```
- In `docker_manager.rs` → `start_bot()`, map these into bollard's `HostConfig`:
  ```rust
  HostConfig {
      nano_cpus: cpu_limit.map(|c| (c * 1_000_000_000.0) as i64),
      memory: memory_limit_mb.map(|m| (m * 1024 * 1024) as i64),
      ..existing
  }
  ```
- Add `set_resource_limits` command in `commands.rs`:
  ```rust
  #[tauri::command]
  pub async fn set_resource_limits(
      state: State<'_, AppState>,
      id: String,
      cpu_limit: Option<f64>,
      memory_limit_mb: Option<u64>,
  ) -> Result<(), AppError>
  ```
- Register in `lib.rs`.

**Frontend (`src/`):**

- Add TypeScript types for `cpu_limit` and `memory_limit_mb` in `lib/types.ts`.
- Add `setResourceLimits` IPC wrapper in `lib/tauri.ts`.
- Add `setResourceLimits` action to `stores/bot-store.ts`.
- In `BotDetail.tsx` Settings tab, add a **Resource Limits** section:
  - CPU slider: 0.25 / 0.5 / 1 / 2 / 4 cores (or "No limit")
  - Memory dropdown: 256 MB / 512 MB / 1 GB / 2 GB / 4 GB (or "No limit")
  - Yellow banner: "Changes take effect after restarting the bot."

**Files to modify:**
- `src-tauri/src/models.rs` — add fields
- `src-tauri/src/bot_store.rs` — add `set_resource_limits()` method
- `src-tauri/src/docker_manager.rs` — wire into `HostConfig`
- `src-tauri/src/commands.rs` — add command
- `src-tauri/src/lib.rs` — register command
- `src/lib/types.ts` — add fields
- `src/lib/tauri.ts` — add IPC wrapper
- `src/stores/bot-store.ts` — add store action
- `src/components/BotDetail.tsx` — Settings tab UI

### 1.2 Resource Presets

**Goal:** One-click presets for common configurations.

- **Lightweight:** 0.5 CPU, 256 MB — for idle/monitoring bots
- **Standard:** 1 CPU, 512 MB — default for most bots
- **Performance:** 2 CPU, 1 GB — for bots doing heavy processing

Implementation: Frontend-only feature. Preset buttons that populate the CPU/memory sliders. No backend changes needed beyond 1.1.

### 1.3 Live Resource Sparklines

**Goal:** Replace the simple progress bars with mini time-series charts (last 60s).

- Store last 60 stats snapshots in the `useContainerStats` hook (ring buffer).
- Render as a tiny SVG sparkline next to the CPU/MEM labels.
- Library: hand-rolled SVG polyline (no dependency needed for a sparkline).

---

## Phase 2: Chat Sessions

> Let users interact with their OpenClaw agents directly from Clawbox.

### 2.1 Data Model & Persistence

**Backend:**

- New types in `models.rs`:
  ```rust
  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct Session {
      pub id: String,
      pub bot_id: String,
      pub name: String,
      pub created_at: String,    // ISO 8601
      pub updated_at: String,
      pub state: SessionState,   // Active | Archived
  }

  #[derive(Debug, Serialize, Deserialize, Clone)]
  pub struct ChatMessage {
      pub id: String,
      pub role: String,          // "user" | "assistant"
      pub content: String,
      pub timestamp: String,
  }
  ```

- New `SessionStore` in `session_store.rs`:
  - Persistence path: `~/.config/clawbox/sessions/{bot_id}/`
  - Each session is a separate JSON file: `{session_id}.json`
  - Methods: `create_session()`, `list_sessions()`, `get_session()`, `add_message()`, `delete_session()`, `archive_session()`

### 2.2 Backend Commands

New commands in `commands.rs`:

| Command | Signature | Description |
|---------|-----------|-------------|
| `create_session` | `(bot_id) -> Session` | Create a new chat session |
| `list_sessions` | `(bot_id) -> Vec<Session>` | List all sessions for a bot |
| `get_session` | `(bot_id, session_id) -> (Session, Vec<ChatMessage>)` | Get session with messages |
| `send_message` | `(bot_id, session_id, content) -> ()` | Send a user message, get streamed response |
| `delete_session` | `(bot_id, session_id) -> ()` | Delete a session and its messages |
| `rename_session` | `(bot_id, session_id, name) -> ()` | Rename a session |

**Chat execution strategy:**
- Use `exec_in_container` to invoke the OpenClaw CLI chat command inside the container.
- Stream the response back via Tauri events: `chat-response-{bot_id}-{session_id}`.
- Store both user and assistant messages in the session file.

### 2.3 Frontend — Chat Tab

**New components:**

- `ChatTab.tsx` — Main chat view with session sidebar + message area
- `SessionList.tsx` — Sidebar listing sessions with create/delete/rename
- `ChatMessage.tsx` — Individual message bubble (user right-aligned, assistant left-aligned)
- `ChatInput.tsx` — Text input with send button, loading state

**New hook:**

- `use-chat-session.ts` — Manages active session, message history, streaming state. Listens to `chat-response-{bot_id}-{session_id}` events.

**Integration:**

- Add `"chat"` to the `Tab` type in `BotDetail.tsx`
- Insert between Terminal and Files: `Dashboard → Terminal → Chat → Files → Logs → Settings`
- Only show when bot is running

### 2.4 Chat Polish

- Markdown rendering in assistant messages (code blocks, links, lists)
- Copy message button
- Export session as Markdown
- Session search across messages
- Token usage estimates per message (if available from OpenClaw)

---

## Phase 3: Advanced Network & Security

> Give power users fine-grained control over network isolation.

### 3.1 Network Mode Picker

**Goal:** Replace the boolean `network_enabled` with a proper network mode selector.

**Backend:**

- Replace `network_enabled: bool` in `BotProfile` with:
  ```rust
  pub network_mode: NetworkMode,  // None | Bridge | Host | Custom(String)
  ```
- Maintain backward compatibility via `#[serde(deserialize_with = "...")]` that migrates `network_enabled: true` → `Bridge`, `false` → `None`.
- Map to bollard's `HostConfig.network_mode` directly.

**Frontend:**

- Settings tab: Replace toggle with dropdown: "Sandboxed (none)", "Bridge (default)", "Host", "Custom network..."
- Custom network: text input for Docker network name.
- Show warning for `host` mode (security implications).

### 3.2 Port Mapping

**Goal:** Expose container ports to the host for webhook-based bots.

- Add `port_mappings: Vec<PortMapping>` to `BotProfile`:
  ```rust
  pub struct PortMapping {
      pub container_port: u16,
      pub host_port: u16,
      pub protocol: String,  // "tcp" | "udp"
  }
  ```
- Map to bollard's `HostConfig.port_bindings`.
- Settings UI: table editor for port mappings.

### 3.3 Domain Allowlist (Future)

- For sandboxed bots, allow specific domains via iptables rules.
- Requires a custom Docker network with DNS + firewall.
- Significantly more complex — defer to later.

---

## Phase 4: Observability & Insights

> Help users understand what their bots are doing.

### 4.1 Log Search & Filter

- Add a search bar above the log viewer.
- Filter by stream (stdout / stderr / all).
- Highlight matching terms.
- Timestamp range filter (last 5m, 15m, 1h, all).

### 4.2 Log Export

- "Export" button in LogViewer toolbar.
- Formats: `.log` (plain text) or `.json` (structured).
- Uses Tauri dialog for save-as location.

### 4.3 Health Checks

- Periodic exec of a configurable health command (e.g., `openclaw status`).
- Store health state: Healthy / Unhealthy / Unknown.
- Display health badge next to status badge.
- Optional: auto-restart on consecutive health failures.

### 4.4 Usage Analytics Dashboard

- Track per-bot: uptime hours, restart count, peak CPU/memory, total network I/O.
- Store in `~/.config/clawbox/analytics/{bot_id}.json`.
- Display as a dashboard card with sparklines and summary stats.

### 4.5 macOS Notifications

- Use `tauri-plugin-notification` for:
  - Bot crashed unexpectedly
  - High CPU (>90% for 60s)
  - Health check failed
- Configurable per-bot in Settings.

---

## Phase 5: Multi-Bot Orchestration

> Manage fleets of bots with shared configuration.

### 5.1 Bot Groups

- Organize bots into named groups (e.g., "Production", "Testing").
- Bulk actions: start all, stop all, restart all.
- Group view in the bot list sidebar.

### 5.2 Config Templates

- Define base configurations (env vars, resource limits, network mode).
- Apply a template when creating a new bot.
- Update template → option to propagate to all bots using it.

### 5.3 Import/Export

- Export bot configuration as YAML/JSON (profile + env vars + resource limits).
- Import on another machine.
- Includes workspace path mapping (prompt for local path on import).

### 5.4 Bot Cloning

- One-click duplicate: new UUID, same config, optional name suffix.
- Clone without workspace (fresh) or with workspace (shared path).

---

## Phase 6: Developer Experience

> Make Clawbox the best tool for developing OpenClaw agents.

### 6.1 Visual Config Editor

- Parse `openclaw.json` from the container's config dir.
- Render as a form with sections: Models, Channels, Plugins, Agents.
- Validate against OpenClaw's config schema.
- Save writes back to the bind-mounted config directory.

### 6.2 Hot Reload (Dev Mode)

- Watch workspace files for changes via `notify` crate.
- On change: auto-restart the bot (with debounce).
- Toggle in Settings: "Dev Mode — auto-restart on file changes".

### 6.3 Plugin Browser

- Fetch plugin list from OpenClaw registry.
- Install/uninstall plugins via `openclaw plugin install <name>`.
- Display installed plugins in Dashboard card.

### 6.4 Image Management

- List available Docker images.
- Pull latest OpenClaw image with progress bar.
- Show changelog / release notes for new versions.
- Auto-update check on app launch (optional).

### 6.5 CLI Companion

- `clawbox` CLI tool for headless management:
  ```
  clawbox list
  clawbox start <bot-name>
  clawbox stop <bot-name>
  clawbox logs <bot-name> --follow
  clawbox chat <bot-name> "Hello"
  ```
- Communicates with the running Tauri app via IPC or directly with Docker.

---

## Implementation Priority

```
Phase 1.1  ██████████  Container Resource Limits     (1-2 days)
Phase 1.2  ████        Resource Presets               (0.5 day)
Phase 2.1  ██████████  Chat Data Model                (1 day)
Phase 2.2  ████████████ Chat Backend Commands          (2 days)
Phase 2.3  ████████████████ Chat Frontend UI           (3 days)
Phase 3.1  ██████████  Network Mode Picker            (1 day)
Phase 4.1  ████████    Log Search & Filter            (1 day)
Phase 4.2  ████        Log Export                     (0.5 day)
Phase 3.2  ██████      Port Mapping                   (1 day)
Phase 2.4  ██████      Chat Polish                    (1-2 days)
Phase 1.3  ██████      Sparklines                     (1 day)
Phase 4.3  ████████    Health Checks                  (1-2 days)
Phase 6.1  ██████████  Visual Config Editor           (2-3 days)
Phase 5.*  ████████████████ Multi-Bot Orchestration    (3-5 days)
Phase 6.*  ████████████████ Developer Experience       (5+ days)
```

**Recommended order:** 1.1 → 3.1 → 2.1-2.3 → 4.1 → 1.2 → 3.2 → 2.4 → rest

Resource limits and network mode are quick wins that unlock the "configure container" story. Chat sessions are the highest-value user-facing feature. Log improvements provide immediate quality-of-life benefits.

---

## Technical Principles

1. **Incremental delivery** — Each sub-phase produces working, testable functionality.
2. **Backward compatibility** — New `BotProfile` fields use `Option<T>` with `#[serde(default)]` so existing `bots.json` files still deserialize.
3. **Consistent patterns** — Follow the existing architecture: Rust command → IPC wrapper → Zustand action → React component.
4. **Separate concerns** — Sessions get their own store file (not in `bots.json`). Analytics get their own directory.
5. **Test coverage** — Unit tests for all new Rust code. Integration tests for Docker interactions (marked `#[ignore]`).
