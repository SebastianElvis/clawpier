# ClawPier Product Vision & Roadmap

> Last updated: 2026-03-22

---

## Vision

**The Desktop Control Plane for Local AI Agents.**

ClawPier makes running and managing personal AI agents as easy as managing apps on your phone. It is the GUI layer that makes a powerful-but-complex agent runtime accessible — and the orchestration platform that makes multiple agents work together.

**ClawPier is to OpenClaw what Docker Desktop is to Docker.** But the opportunity is bigger: it can become the universal desktop agent manager, not just for OpenClaw.

---

## Strategic Position

### The Problem

Running OpenClaw (or any self-hosted AI agent) today requires: Docker knowledge, CLI fluency, config file editing, manual monitoring, and juggling multiple terminal sessions. This limits adoption to technical users willing to invest setup time.

### The Moat

The real defensibility comes from being the **workflow layer** — once users build multi-agent setups, configure channels, and rely on scheduled tasks, switching costs are high. The agent runtime underneath matters less over time; the orchestration and UX matter more.

### Core Differentiators

1. **Local-first & private** — your agents, your data, your machine. No SaaS dependency.
2. **Sandboxed by default** — network isolation, resource limits. Safe experimentation.
3. **GUI over CLI** — the terminal is still there for power users, but you never *need* it.
4. **Native desktop app** — no competitor has this. NanoClaw, ZeroClaw, docker-agent are CLI. Knolli is web-only.

---

## Three Horizons

### H1: Best-in-class OpenClaw Manager (now — v0.1–v0.3)

Make ClawPier the definitive tool for running a single OpenClaw bot. Zero-friction setup: download app, click "Create Bot", done. Chat, configure, monitor — all without touching a terminal.

**Target:** Existing OpenClaw users who want a better experience.

**Status after v0.2.0:**
- [x] Container lifecycle (create, start, stop, restart, delete)
- [x] Chat with agents (session persistence, streaming, markdown)
- [x] Config dashboard (model, channels, gateway, skills)
- [x] Interactive terminal with PTY
- [x] Real-time logs, CPU/memory monitoring
- [x] File browser
- [x] Resource limits (CPU cores, memory)
- [x] Network isolation toggle
- [x] ClawHub skill browser & one-click install
- [x] Log search, filtering, and export
- [x] Notifications & alerts (crash, resource, health)
- [x] Health checks with auto-restart
- [x] Port mapping for webhooks

### H2: Multi-Agent Orchestration (next — v0.4–v0.6)

Go from managing one bot to managing a fleet. Agent templates, inter-agent communication, scheduled triggers, shared context.

**Target:** Power users building personal AI workflows.

- [ ] Visual config editor (replace `openclaw configure`)
- [ ] Agent templates/presets (e.g., "Research Assistant", "DevOps Bot", "Customer Support")
- [ ] Bot groups with bulk actions
- [ ] Config templates — reusable base configurations
- [ ] Bot cloning and import/export
- [ ] Inter-agent communication — agents that delegate to each other
- [ ] Scheduled tasks and triggers (e.g., "summarize my emails every morning")
- [ ] Shared memory/context across agents
- [ ] Usage analytics & cost estimation per bot
- [ ] Aggregate fleet dashboard

### H3: Universal Agent Desktop (future — v1.0+)

Support agent runtimes beyond OpenClaw. Become the "Raycast for AI agents" — a desktop power tool that technical users can't live without.

**Target:** Anyone who wants AI agents working for them.

- [ ] Pluggable runtime adapters (AutoGPT, CrewAI, custom containers)
- [ ] Agent marketplace — install community-built agent configs
- [ ] Cross-platform (Windows, Linux) — Tauri already supports this
- [ ] Team features — share agent configurations across an org
- [ ] Premium tier with extended analytics, team dashboards

### H4: Remote & Cloud Operations (future)

Manage agents running on remote machines or cloud infrastructure. ClawPier becomes a true control plane — not just a local app.

**Target:** Users and teams who need agents running 24/7 beyond their laptop.

- [ ] Remote Docker host support (connect to remote Docker daemons via SSH/TLS)
- [ ] One-click cloud deployment (provision and manage agents on VPS/cloud VMs)
- [ ] Remote log streaming, terminal, and chat over the network
- [ ] Multi-machine fleet view — see all agents across all hosts
- [ ] Automatic failover — restart agents on a different host if one goes down
- [ ] Note: Docker context (`DOCKER_HOST`) already works transparently via bollard as a power-user workaround before this is first-class

---

## Scope: What OpenClaw Handles vs. What ClawPier Builds

OpenClaw is a full-featured agent runtime. ClawPier should **not** duplicate capabilities that OpenClaw already provides natively. Instead, ClawPier focuses on container operations, GUI management, and surfacing OpenClaw's capabilities in an accessible way.

| Capability | Owner | Notes |
|------------|-------|-------|
| Scheduled tasks / cron jobs | **OpenClaw** | Users ask the agent to schedule tasks directly. |
| Persistent memory / context | **OpenClaw** | Agent memory is managed by the runtime. ClawPier persists the data directory across restarts. |
| LLM provider selection | **OpenClaw** | Configured via `openclaw.json`. ClawPier surfaces this read-only in the Dashboard. |
| Channel integrations (Telegram, etc.) | **OpenClaw** | Configured via `openclaw configure`. ClawPier shows status in Dashboard. |
| Skills & plugins | **OpenClaw** | Installed via `clawhub` CLI. ClawPier provides a visual browser & manager (H1). |
| Container lifecycle | **ClawPier** | Start, stop, restart, delete — Docker operations. |
| Resource limits (CPU/memory) | **ClawPier** | Docker-level constraints — not an OpenClaw concept. |
| Network isolation & security | **ClawPier** | Docker network modes, port mapping, sandboxing. |
| Chat sessions (GUI) | **ClawPier** | Native chat UI to talk to the agent without external tools. |
| Log streaming & search | **ClawPier** | Real-time logs with search, filtering, and export. |
| File browser | **ClawPier** | Browse and manage the workspace bind mount. |
| Multi-bot management | **ClawPier** | Groups, cloning, templates — container fleet operations (H2). |
| Runtime adapters | **ClawPier** | Support for non-OpenClaw agent runtimes (H3). |
| Remote/cloud agents | **ClawPier** | Manage agents on remote Docker hosts or cloud VMs (H4). |

---

## Competitive Landscape

| Feature | NanoClaw | ZeroClaw | Docker Desktop | Knolli | **ClawPier** |
|---------|----------|----------|----------------|--------|-------------|
| **Desktop GUI** | No (CLI) | No (CLI) | Partial | Web-only | **Yes** |
| **Container isolation** | MicroVM | Process | MicroVM | Cloud | Docker |
| **Chat with agent** | CLI | CLI | No | Web | **Yes (v0.2)** |
| **Resource limits** | No | N/A (tiny) | Docker settings | Cloud | **Yes (v0.2)** |
| **Network security** | Sandbox policy | Allowlists | MicroVM isolation | Scoped perms | Basic toggle |
| **Skill ecosystem** | Via OpenClaw | MCP | MCP Toolkit | No | **Planned (visual)** |
| **Scheduled tasks** | Via OpenClaw | No | No | Yes | Via OpenClaw |
| **Persistent memory** | Yes | SQLite+vector | No | Cloud | Via OpenClaw |
| **Multi-agent orchestration** | Per-channel | No | docker-agent | Workflows | **Planned (H2)** |

---

## H1 Status: Complete ✅

All H1 features have been shipped:
- Skill browser, log search, notifications, health checks, port mapping — all delivered in v0.3.0.
- Visual config editor moved to H2 (better fit alongside config templates and multi-agent workflows).

## H2 Priority & Sequencing (next)

```
Config Editor      ██████████  Visual openclaw.json editor        — Eliminates terminal need
Bot Cloning        ██████      Clone and import/export bots       — Quick setup
Config Templates   ████████    Reusable base configurations       — Power users
Agent Templates    ██████████  Preset bot configurations          — Onboarding
Bot Groups         ██████      Bulk actions on bot sets            — Fleet management
```

**Recommended sequence:** Config editor → Bot cloning/import-export → Config templates → Agent templates → Bot groups

---

## Principles

1. **Product-first** — Every feature should answer "what can the user do now that they couldn't before?" Implementation details live in task specs, not the roadmap.
2. **Don't duplicate OpenClaw** — If OpenClaw already does it (memory, scheduling, providers), surface it in the GUI — don't rebuild it.
3. **Incremental delivery** — Each sub-feature ships independently and is immediately useful.
4. **Backward compatible** — Existing bot configurations always continue to work after an upgrade.
5. **Developer experience is a cross-cutting concern** — Not a separate phase. Every feature ships with clear error messages, sensible defaults, and responsive UI.
6. **Lean into the GUI advantage** — CLI competitors can't match the visual experience. Every feature should feel intuitive and approachable, especially for non-technical users.
7. **Local-first, private by default** — Never phone home. Never require accounts. The user's data stays on their machine.
