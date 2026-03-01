---
name: sync-docs
description: Analyze codebase changes and update the Docsify documentation site in docs/. Use when the user asks to update docs, sync documentation, refresh docs, or after significant code changes.
---

# Sync Documentation

Detect what changed in the codebase since the docs were last written, then update only the affected documentation pages.

## Workflow

### Phase 1: Detect Changes

Run these in parallel:

1. **Git diff analysis** — `git diff main --stat` and `git diff main --name-only` to identify modified files
2. **Explore codebase** — Launch `explore-codebase` agents targeting the changed areas

Map each changed file to its documentation page:

| Code area | Doc page |
|-----------|----------|
| `frontend/src/components/Aircraft/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/Satellite/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/Traffic/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/Camera/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/Weather/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/Events/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/Aviation/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/City/` | `docs/frontend/globe-layers.md` |
| `frontend/src/components/Sidebar/` | `docs/frontend/ui-components.md` |
| `frontend/src/components/SearchBar/` | `docs/frontend/ui-components.md` |
| `frontend/src/components/HUD/` | `docs/frontend/shaders-hud.md` |
| `frontend/src/shaders/` | `docs/frontend/shaders-hud.md` |
| `frontend/src/hooks/` | `docs/frontend/state-management.md` |
| `frontend/src/services/` | `docs/frontend/structure.md` |
| `frontend/src/types/` | `docs/frontend/structure.md` |
| `frontend/src/App.tsx` | `docs/frontend/structure.md` |
| `frontend/package.json` | `docs/frontend/structure.md`, `docs/getting-started.md` |
| `backend/crates/server/` | `docs/backend/crate-architecture.md` |
| `backend/crates/api/` | `docs/api-reference.md` |
| `backend/crates/ws/` | `docs/websocket-protocol.md` |
| `backend/crates/cache/` | `docs/backend/cache-layer.md` |
| `backend/crates/services/` | `docs/backend/data-trackers.md` |
| `backend/crates/prediction/` | `docs/backend/prediction-engine.md` |
| `backend/crates/cameras/` | `docs/backend/camera-system.md` |
| `backend/crates/satellites/` | `docs/backend/data-trackers.md` |
| `backend/crates/events/` | `docs/backend/data-trackers.md` |
| `backend/crates/weather/` | `docs/backend/data-trackers.md` |
| `backend/crates/traffic/` | `docs/backend/data-trackers.md` |
| `backend/Cargo.toml` | `docs/backend/crate-architecture.md` |
| `docker-compose.yml` | `docs/getting-started.md`, `docs/backend/cache-layer.md` |
| `.env.example` | `docs/getting-started.md` |
| New crate or component | `docs/architecture.md`, `docs/_sidebar.md` |

### Phase 2: Analyze Impacted Docs

For each affected doc page:

1. **Read the current doc page**
2. **Read the changed source files** identified in Phase 1
3. **Diff the doc content against the code** — identify:
   - Outdated descriptions (code changed, doc didn't)
   - Missing features (new code, no doc entry)
   - Stale references (deleted code, doc still references it)
   - Wrong numbers/values (changed constants, TTLs, limits, etc.)

### Phase 3: Update Docs

Apply targeted edits using `StrReplace`. Rules:

- **Only update what changed** — don't rewrite whole pages
- **Match existing style** — dark/military/surveillance tone, concise technical writing
- **English only** — all documentation is written in English
- **No narration comments** — no "Updated on..." or changelog noise in docs
- **Tables and code blocks** — prefer structured formats over prose
- **Keep line counts stable** — don't bloat pages, replace outdated content rather than appending

For new features that need a new section or page:
1. Write the new doc page following the existing pattern
2. Add entry to `docs/_sidebar.md`
3. Cross-reference from `docs/architecture.md` if architecturally significant

### Phase 4: Verify

1. Read each modified doc file to confirm edits look correct
2. Check `docs/_sidebar.md` links match actual files: `ls docs/ docs/frontend/ docs/backend/`
3. Report a summary of what was updated:

```
## Docs Sync Summary
- **Updated**: [list of modified doc pages with 1-line description of change]
- **Created**: [list of new doc pages, if any]
- **No changes needed**: [list of doc pages that were checked but already current]
```

## Doc Site Structure Reference

```
docs/
├── index.html                 # Docsify SPA (don't modify unless theme/plugin changes)
├── .nojekyll                  # GitHub Pages marker
├── _coverpage.md              # Landing page hero
├── _sidebar.md                # Navigation — UPDATE when adding/removing pages
├── _navbar.md                 # Top nav
├── README.md                  # Home page (project overview, tech stack, quick start)
├── getting-started.md         # Installation, env vars, commands
├── architecture.md            # System architecture (data flow diagrams, component hierarchy)
├── frontend/
│   ├── structure.md           # Stack, directory map, bootstrap, styling, build
│   ├── globe-layers.md        # All 9 Cesium visualization layers
│   ├── state-management.md    # Hooks, stores, WebSocket dispatch, data flow
│   ├── shaders-hud.md         # GLSL shaders + HUD overlays
│   └── ui-components.md       # Sidebar, search, minimap, timeline, popups
├── backend/
│   ├── crate-architecture.md  # Workspace, AppState, startup, error handling
│   ├── data-trackers.md       # 6 background polling loops
│   ├── prediction-engine.md   # IMM-EKF, motion models, pattern detection
│   ├── camera-system.md       # 6 providers, health check, proxy
│   └── cache-layer.md         # Redis keys, TTLs, patterns
├── api-reference.md           # REST endpoints (params, responses, errors)
├── websocket-protocol.md      # WS message types, chunking, reconnection
├── data-sources.md            # 12+ external API integrations
├── roadmap.md                 # 8-phase plan
└── contributing.md            # Conventions, how to add a new layer
```

## Important Context

- This is a Docsify site deployed on GitHub Pages from `docs/` folder
- Theme: dark (`#0a0a0a`) with emerald accent (`#34d399`)
- The project is a real-time 3D surveillance globe (CesiumJS + React + Rust)
- Frontend: React 19, TypeScript 5.9, Vite 7, Tailwind 4, CesiumJS 1.138, Resium 1.19
- Backend: Rust, Axum 0.7, 11 workspace crates, Redis cache, WebSocket broadcast
- Primitives migration is ongoing (Entity API → BillboardCollection/LabelCollection)
