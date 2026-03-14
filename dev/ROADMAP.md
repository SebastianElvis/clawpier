# ClawPier Product Roadmap

> Last updated: 2026-03-14

- [ClawPier Product Roadmap](#clawpier-product-roadmap)
  - [Vision](#vision)
  - [Scope: What OpenClaw Handles vs. What ClawPier Builds](#scope-what-openclaw-handles-vs-what-clawpier-builds)
  - [Competitive Landscape](#competitive-landscape)
  - [Phase 1: Container Resource Management](#phase-1-container-resource-management)
    - [Why it matters](#why-it-matters)
    - [Features](#features)
    - [Adoption impact](#adoption-impact)
  - [Phase 2: Chat Sessions](#phase-2-chat-sessions)
    - [Why it matters](#why-it-matters-1)
    - [Features](#features-1)
    - [Adoption impact](#adoption-impact-1)
  - [Phase 3: Advanced Network \& Security](#phase-3-advanced-network--security)
    - [Why it matters](#why-it-matters-2)
    - [Features](#features-2)
    - [Adoption impact](#adoption-impact-2)
  - [Phase 4: OpenClaw Skills \& Plugins](#phase-4-openclaw-skills--plugins)
    - [Why it matters](#why-it-matters-3)
    - [Features](#features-3)
    - [Adoption impact](#adoption-impact-3)
  - [Phase 5: Logs \& Operational Health](#phase-5-logs--operational-health)
    - [Why it matters](#why-it-matters-4)
    - [Features](#features-4)
    - [Adoption impact](#adoption-impact-4)
  - [Phase 6: Notifications \& Alerts](#phase-6-notifications--alerts)
    - [Why it matters](#why-it-matters-5)
    - [Features](#features-5)
    - [Adoption impact](#adoption-impact-5)
  - [Phase 7: Usage Analytics \& Metering](#phase-7-usage-analytics--metering)
    - [Why it matters](#why-it-matters-6)
    - [Features](#features-6)
    - [Adoption impact](#adoption-impact-6)
  - [Phase 8: Multi-Bot Orchestration](#phase-8-multi-bot-orchestration)
    - [Why it matters](#why-it-matters-7)
    - [Features](#features-7)
    - [Adoption impact](#adoption-impact-7)
  - [Priority \& Sequencing](#priority--sequencing)
  - [Principles](#principles)

---

## Vision

ClawPier is the definitive desktop companion for managing sandboxed OpenClaw bot instances. The goal is to evolve from a container manager into a full agent operations platform — where users can configure, monitor, converse with, and extend their bots from a single native app.

---

## Scope: What OpenClaw Handles vs. What ClawPier Builds

OpenClaw is a full-featured agent runtime. ClawPier should **not** duplicate capabilities that OpenClaw already provides natively. Instead, ClawPier focuses on container operations, GUI management, and surfacing OpenClaw's capabilities in an accessible way.

| Capability | Owner | Notes |
|------------|-------|-------|
| Scheduled tasks / cron jobs | **OpenClaw** | Users ask the agent to schedule tasks directly. |
| Persistent memory / context | **OpenClaw** | Agent memory is managed by the runtime. ClawPier persists the data directory across restarts. |
| LLM provider selection | **OpenClaw** | Configured via `openclaw.json`. ClawPier surfaces this read-only in the Dashboard. |
| Channel integrations (Telegram, etc.) | **OpenClaw** | Configured via `openclaw configure`. ClawPier shows status in Dashboard. |
| Skills & plugins | **OpenClaw** | Installed via `clawhub` CLI. ClawPier provides a visual browser & manager (Phase 4). |
| Container lifecycle | **ClawPier** | Start, stop, restart, delete — Docker operations. |
| Resource limits (CPU/memory) | **ClawPier** | Docker-level constraints — not an OpenClaw concept. |
| Network isolation & security | **ClawPier** | Docker network modes, port mapping, sandboxing. |
| Chat sessions (GUI) | **ClawPier** | Native chat UI to talk to the agent without external tools. |
| Log streaming & search | **ClawPier** | Real-time logs with search, filtering, and export. |
| File browser | **ClawPier** | Browse and manage the workspace bind mount. |
| Multi-bot management | **ClawPier** | Groups, cloning, templates — container fleet operations. |

---

## Competitive Landscape

| Feature | NanoClaw | ZeroClaw | Docker Desktop | Knolli | **ClawPier** |
|---------|----------|----------|----------------|--------|-------------|
| **Desktop GUI** | No (CLI) | No (CLI) | Partial | Web-only | **Yes** |
| **Container isolation** | MicroVM | Process | MicroVM | Cloud | Docker |
| **Chat with agent** | CLI | CLI | No | Web | **Planned** |
| **Resource limits** | No | N/A (tiny) | Docker settings | Cloud | **Planned** |
| **Network security** | Sandbox policy | Allowlists | MicroVM isolation | Scoped perms | Basic toggle |
| **Skill ecosystem** | Via OpenClaw | MCP | MCP Toolkit | No | **Planned (visual)** |
| **Scheduled tasks** | Via OpenClaw | No | No | Yes | Via OpenClaw |
| **Persistent memory** | Yes | SQLite+vector | No | Cloud | Via OpenClaw |
| **Multi-agent orchestration** | Per-channel | No | docker-agent | Workflows | **Planned** |

**ClawPier's unique advantage:** None of the competitors have a native desktop GUI. NanoClaw, ZeroClaw, and docker-agent are all CLI tools. Knolli is web-only. ClawPier is the only polished native app for managing OpenClaw bots — the tool you recommend to users who want a visual, approachable experience.

---

## Phase 1: Container Resource Management

> *"I want to control how much of my machine each bot uses."*

### Why it matters

Today, containers run with unlimited resources. A runaway bot can consume the entire machine's CPU and memory, degrading other apps. Users running multiple bots need resource guardrails. This is table-stakes functionality that Docker Desktop provides at the VM level — ClawPier should offer it per-bot.

### Features

**1.1 CPU & Memory Limits**
- Per-bot settings for maximum CPU cores (e.g., 0.5 / 1 / 2 / 4) and memory (e.g., 256 MB / 512 MB / 1 GB / 2 GB).
- "No limit" option for users who don't want constraints.
- Changes take effect on next bot restart — clear indicator in the UI.

**1.2 Resource Presets**
- One-click presets: **Lightweight** (0.5 CPU, 256 MB), **Standard** (1 CPU, 512 MB), **Performance** (2 CPU, 1 GB).
- Reduces friction for users who don't know what values to pick.
- Presets populate the sliders; users can further customize.

**1.3 Live Resource Sparklines**
- Replace the current static progress bars with mini time-series charts (last 60 seconds).
- At a glance, users can see if CPU is spiking or memory is climbing — not just the current value.
- Helps users decide whether to adjust limits.

### Adoption impact

Unlocks the "I can safely run 3 bots on my laptop" use case. Directly addresses the #3 competitive gap. Essential foundation for Phase 3 (network config) since both are container-level settings.

---

## Phase 2: Chat Sessions

> *"I want to talk to my bot directly from ClawPier — without opening Telegram or a terminal."*

### Why it matters

Every competitor lets users interact with their agent — NanoClaw via CLI, ZeroClaw via CLI, Knolli via web. ClawPier has **zero chat ability** today. The terminal workaround is too technical for daily users. This is the #1 feature gap and the highest-value addition for user engagement.

### Features

**2.1 Chat Tab**
- New tab in the bot detail view, available when the bot is running.
- Familiar chat interface: user messages on the right, agent responses on the left.
- Streaming responses — text appears as the agent generates it, not after.

**2.2 Session Management**
- Create, rename, and delete chat sessions.
- Session list sidebar — switch between conversations.
- Sessions persist across app restarts.
- Auto-archive sessions when the bot stops; restore when it starts again.

**2.3 Rich Messages**
- Markdown rendering for agent responses: code blocks with syntax highlighting, links, lists, tables.
- Copy individual messages.
- Export a session as Markdown for sharing or documentation.

**2.4 Session Search**
- Search across all messages in a session.
- Search across sessions to find past conversations.

### Adoption impact

Transforms ClawPier from "a Docker manager" into "the place where I use my bot." Users will keep ClawPier open all day if they can chat with their agents directly. Dramatically increases session time and daily active use.

---

## Phase 3: Advanced Network & Security

> *"I want fine-grained control over what my bot can access on the network."*

### Why it matters

The current binary toggle (network on/off) is too blunt. Users running bots that need internet for Telegram but shouldn't have unrestricted access need more options. NanoClaw offers sandbox policies, ZeroClaw has allowlists — ClawPier should match or exceed them with a visual interface.

### Features

**3.1 Network Mode Picker**
- Replace the on/off toggle with a dropdown: **Sandboxed** (no network), **Bridge** (default Docker), **Host** (full access), **Custom** (named Docker network).
- Security warning for Host mode.
- Backward compatible — existing bots keep their current setting.

**3.2 Port Mapping**
- Expose specific container ports to the host (e.g., for webhook-based bots).
- Table editor in Settings: container port → host port, TCP/UDP.
- Essential for bots that receive inbound connections (webhooks, API servers).

**3.3 Domain Allowlist** *(future)*
- For sandboxed bots, allow traffic only to specific domains (e.g., `api.telegram.org`, `api.openai.com`).
- Provides security without fully cutting off network access.
- Significantly more complex — deferred until demand justifies it.

### Adoption impact

Unlocks enterprise and security-conscious users who won't run bots without proper network controls. Port mapping enables webhook-based channel integrations that currently don't work in ClawPier.

---

## Phase 4: OpenClaw Skills & Plugins

> *"I want to discover and install new capabilities for my bot — without touching the terminal."*

### Why it matters

OpenClaw's power comes from its ecosystem: [ClawHub](https://github.com/openclaw/clawhub) hosts **13,000+ community-built skills**, plugins can bundle multiple skills with configuration, and workspace-level skills enable per-bot customization. Today, **all of this is CLI-only** — you need to know `clawhub install <name>` exists and run it in the terminal. ClawPier should make this ecosystem visual and approachable.

This is where ClawPier can uniquely differentiate: **no other tool in the space offers a GUI for browsing and managing OpenClaw skills.**

### Features

**4.1 ClawHub Skill Browser**
- New **Skills** tab in the bot detail view.
- Searchable, categorized gallery of skills from ClawHub.
- Each skill card: name, description, author, install count, category tags.
- Semantic search — "find me a skill for summarizing PDFs" — powered by ClawHub's vector search.
- Filter by category: coding, productivity, communication, data, security, etc.
- Link to skill documentation and source code.

**4.2 Skill Installation & Management**
- One-click "Install" button on any skill card.
- **Installed Skills** view showing everything currently active in the bot:
  - Skill name, type (bundled / managed / workspace), version.
  - Skill precedence indicator (workspace overrides managed overrides bundled).
- Uninstall and update buttons for managed skills.
- Dashboard refreshes automatically after install/uninstall.

**4.3 Workspace Skill Development**
- "New Skill" button that scaffolds a `SKILL.md` template in the bot's workspace.
- Integrates with the File Browser for editing skill files.
- Validation: warns if the skill structure is invalid (missing required fields, bad YAML frontmatter).
- "Test Skill" quick action — sends a test prompt to the agent that exercises the new skill.
- Lowers the barrier from "read the docs and use CLI" to "click a button and start editing."

**4.4 Visual Config Editor**
- GUI form for editing `openclaw.json` — the core configuration file that controls models, channels, plugins, and agent behavior.
- Structured sections: **Models** (provider, API keys, model selection), **Channels** (Telegram, Slack, Discord), **Plugins** (enable/disable), **Agents** (primary model, fallbacks).
- Inline validation against OpenClaw's config schema.
- "Apply & Restart" button — save and restart in one action.
- Replaces the current workflow of: open terminal → `openclaw configure` → answer prompts → restart manually.

**4.5 Plugin Lifecycle Management**
- List all installed OpenClaw plugins with their bundled skills and status (enabled/disabled).
- Toggle plugins on/off from the GUI.
- Plugin detail view: bundled skills, configuration options, documentation.
- Install new plugins by name from the GUI.
- Plugin health indicator: are all dependencies satisfied?

### Adoption impact

Turns ClawPier into the **app store experience for OpenClaw agents**. Users can browse 13,000+ skills, install with one click, and create their own — all without a terminal. This is a massive differentiator since no competitor offers a visual skill marketplace. It also drives ecosystem engagement: more skill installs from ClawPier users benefits the entire OpenClaw community.

---

## Phase 5: Logs & Operational Health

> *"I want to quickly find what went wrong and keep my bots healthy."*

### Why it matters

Logs are currently a raw stream — no search, no filtering, no export. When something goes wrong, users have to scroll through hundreds of lines manually. Health monitoring is nonexistent — users find out a bot crashed only when they notice it's not responding. These are day-to-day operational necessities.

### Features

**5.1 Log Search & Filter**
- Full-text search bar above the log viewer.
- Filter by stream: stdout, stderr, or both.
- Highlight matching terms in the log output.
- Time range filter: last 5 min, 15 min, 1 hour, or all.

**5.2 Log Export**
- Export button in the log toolbar.
- Save as `.log` (plain text) or `.json` (structured with timestamps).
- Native save-as dialog for choosing the destination.
- Essential for sharing logs with others when debugging.

**5.3 Health Checks**
- Configurable health command per bot (e.g., `openclaw status`).
- Periodic execution with status badge: Healthy / Unhealthy / Unknown.
- Optional auto-restart after consecutive failures.
- Keeps bots running reliably without manual monitoring.

### Adoption impact

Quality-of-life improvement that every user benefits from. Log search alone saves minutes of debugging time per incident. Health checks enable "set and forget" bot operation.

---

## Phase 6: Notifications & Alerts

> *"I want to know immediately when something needs my attention — even if ClawPier is in the background."*

### Why it matters

Users run bots as background processes. Without notifications, they won't know a bot crashed until they open ClawPier and check manually — which could be hours later. Native notifications are a critical part of the "always-on agent" experience that users expect from a desktop app.

### Features

**6.1 Crash Notifications**
- macOS native notification when a bot stops unexpectedly (exit code ≠ 0).
- Shows bot name, error context, and a "Restart" action button.
- Most important notification — users need to know immediately.

**6.2 Resource Alerts**
- Notification when a bot sustains high CPU (>90%) or high memory (>85%) for a configurable duration.
- Helps users catch runaway processes before they affect the whole machine.
- Ties back to Phase 1 — alerts that suggest adjusting resource limits.

**6.3 Health Check Alerts**
- Notification when a health check fails (requires Phase 5.3).
- "Your bot has been unhealthy for 5 minutes — restart?"
- Pairs with auto-restart for fully autonomous recovery.

**6.4 Notification Preferences**
- Per-bot enable/disable — mute noisy bots during development.
- Global Do Not Disturb mode.
- Notification categories: critical (crash) vs. warning (high CPU) vs. info (health).

### Adoption impact

Transforms ClawPier from an active-monitoring tool into a passive guardian. Users can minimize the app and trust it will tap them on the shoulder when something needs attention. This is a key expectation of native desktop apps that web-based competitors cannot match.

---

## Phase 7: Usage Analytics & Metering

> *"I want to understand how much my bots cost me and where the resources go."*

### Why it matters

Running AI agents costs money — LLM API calls, compute time, network egress. Users need visibility into per-bot resource consumption over time to make informed decisions about which bots to keep running, which to scale down, and how to budget. This is especially important for teams and users running multiple bots with paid LLM providers.

This phase lays the foundation for potential future billing, cost allocation, and chargeback features.

### Features

**7.1 Per-Bot Usage Dashboard**
- Dedicated analytics view per bot showing historical data:
  - Total uptime hours (daily, weekly, monthly).
  - CPU-hours and memory-hours consumed.
  - Network I/O totals (bytes sent/received).
  - Restart count and crash history.
- Sparkline charts showing trends over time.

**7.2 Cost Estimation** *(stretch)*
- Estimate compute cost based on resource usage and configurable $/CPU-hour and $/GB-hour rates.
- Users can set their own cost rates based on their infrastructure (e.g., cloud VM pricing).
- "This bot cost ~$3.20 in compute this month."
- Does NOT track LLM API costs (that's OpenClaw's domain) — focuses purely on infrastructure.

**7.3 Aggregate Fleet View**
- Summary across all bots: total uptime, total resource consumption, most expensive bot.
- Pie chart or bar chart: which bots consume the most resources?
- Helps users with 5+ bots identify which ones to optimize or shut down.

**7.4 Export & Reporting**
- Export usage data as CSV or JSON for external analysis.
- Time range selector: last 7 days, 30 days, custom range.
- Useful for teams that need to report on infrastructure costs or justify bot spending.

### Adoption impact

Critical for users who run bots on behalf of a team or organization. Cost visibility drives informed decisions about scaling. This is a monetization-enabling feature — ClawPier could eventually offer a premium tier with extended analytics retention or team dashboards. The aggregate fleet view pairs with Phase 8 (Multi-Bot Orchestration) to give users a complete operational picture.

---

## Phase 8: Multi-Bot Orchestration

> *"I run 5+ bots and need to manage them as a fleet, not one at a time."*

### Why it matters

Power users and teams will run multiple bots for different purposes (production vs. testing, different channels, different models). Managing them individually becomes tedious. This phase addresses the "scale" dimension — going from 1 bot to many.

### Features

**8.1 Bot Groups**
- Organize bots into named groups (e.g., "Production", "Testing", "Experiments").
- Bulk actions: start all, stop all, restart all bots in a group.
- Group view in the sidebar with collapse/expand.

**8.2 Config Templates**
- Define reusable base configurations: env vars, resource limits, network mode, image version.
- Apply a template when creating a new bot — pre-populates all settings.
- Update a template and optionally propagate changes to all bots using it.

**8.3 Import / Export**
- Export a bot's full configuration as a shareable file (JSON or YAML).
- Import on another machine — prompts for local paths (workspace, etc.) that differ between machines.
- Enables team collaboration: "here's my bot config, try it on your machine."

**8.4 Bot Cloning**
- One-click duplicate a bot with all its settings.
- New identity (UUID, container), same configuration.
- Option to share the workspace path or start fresh.

### Adoption impact

Removes the ceiling for power users. Without fleet management, ClawPier maxes out at ~3 bots before the UX becomes painful. This phase raises that ceiling to dozens.

---

## Priority & Sequencing

```
Phase 1    ██████████  Resource Limits             — Quick win, safety foundation
Phase 3.1  ██████████  Network Mode Picker          — Completes the "container config" story
Phase 2    ██████████████████ Chat Sessions          — Highest-value user feature
Phase 4.1  ██████████  ClawHub Skill Browser        — Ecosystem differentiator
Phase 4.2  ████████    Skill Install & Management   — Pairs with browser
Phase 5.1  ████████    Log Search & Filter          — Quality of life
Phase 6    ██████████  Notifications & Alerts        — "Always-on guardian"
Phase 4.4  ██████████  Visual Config Editor          — Major UX improvement
Phase 3.2  ██████      Port Mapping                  — Enables webhooks
Phase 5.3  ████████    Health Checks                 — Reliability
Phase 4.3  ████████    Workspace Skill Dev           — Power users
Phase 7    ██████████████ Usage Analytics & Metering  — Cost visibility, billing foundation
Phase 8    ████████████████ Multi-Bot Orchestration   — Scale
Phase 4.5  ██████      Plugin Lifecycle              — Completeness
```

**Recommended sequence:** 1 → 3.1 → 2 → 4.1-4.2 → 5.1 → 6 → 4.4 → 3.2 → 5.3 → 7 → 8 → rest

- **Resource limits + network mode** are quick wins that unlock the "configure your container" story.
- **Chat sessions** are the highest-impact feature for user engagement and daily use.
- **Skill browser & installation** follows naturally — once users chat with their bots, they want to extend what bots can do. This is also ClawPier's strongest competitive differentiator.
- **Log search** is immediate quality-of-life.
- **Notifications** make ClawPier a passive guardian — critical for the "always-on agent" experience.
- **Visual config editor** eliminates the last major reason to open a terminal.
- **Usage analytics** enables cost visibility and future monetization.
- **Multi-bot orchestration** unlocks scale for power users and teams.

---

## Principles

1. **Product-first** — Every feature should answer "what can the user do now that they couldn't before?" Implementation details live in task specs, not the roadmap.
2. **Don't duplicate OpenClaw** — If OpenClaw already does it (memory, scheduling, providers), surface it in the GUI — don't rebuild it.
3. **Incremental delivery** — Each sub-feature ships independently and is immediately useful.
4. **Backward compatible** — Existing bot configurations always continue to work after an upgrade.
5. **Developer experience is a cross-cutting concern** — Not a separate phase. Every feature ships with clear error messages, sensible defaults, and responsive UI. Consider DX in every PR.
6. **Lean into the GUI advantage** — CLI competitors can't match the visual experience. Every feature should feel intuitive and approachable, especially for non-technical users.
