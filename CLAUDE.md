# CLAUDE.md

## Workflow

**Plan first:** plan mode for any non-trivial task (3+ steps). Going sideways → stop and re-plan instead of pushing. Write the spec before the code.

**Subagents:** use liberally to keep the main context clean — one task per subagent, offload exploration and parallel analysis.

**Verify before done:** prove it works. This repo has no CI, so local `cargo test`, `npm test` and `npm run build` are the only gate.

**Demand elegance:** on non-trivial changes, pause and ask "is there a more elegant way?" Skip it for simple fixes.

**Autonomous bug fixing:** given a bug report, logs or a failing test, resolve it end to end without asking for hand-holding.

## Code Quality

**The wire protocol is hand-mirrored — edit three places together.** `WsMessage` is `#[serde(tag = "type", content = "payload")]`, PascalCase variants, snake_case fields, no codegen: a new variant means `backend/crates/ws/src/messages.rs` plus both the `WsMessage` and `WsMessageType` unions in `frontend/src/types/ws.ts`. Keep field names verbatim — adding `rename_all` silently breaks every consumer.

**Read the unit suffix, never assume one.** Aircraft carry `altitude_m`/`speed_ms`, satellites `altitude_km`/`velocity_km_s`, METAR raw aviation units (`wind_speed_kt`, `ceiling_ft`); timestamps cross the wire as ISO-8601 strings. WS and REST payloads for the same entity are deliberately different shapes.

**Frontend:** named exports only, relative imports (no path alias exists), `import type` for types (`verbatimModuleSyntax` enforces it), explicit return types, `interface XProps` over `React.FC`. State lives in the `useAppState` hooks as `Map`s keyed by domain id — extract pure logic out of hooks (see `batchAccumulator.ts`) so it stays testable outside React.

**Cesium layers are side-effect components:** take `viewer` from `useCesium`, mirror props into refs synced by tiny effects, hold collections in refs and `return null` — this keeps the expensive setup effect from re-running on every render.

**Backend:** declare deps as `.workspace = true`, register routes in the central `api/src/router.rs` (axum 0.7 `:param` syntax), share resources through `AppState` + `FromRef` rather than `Arc`. Postgres, bus and graph are `Option` — degrade gracefully when they are absent.

**Errors:** `thiserror` enums at the boundaries (`server::AppError`, `db::DbError`), `anyhow` in ingest and consumer code, `?` throughout. That split is intentional — follow the layer you are in.

**Tests are colocated** (`*.test.ts` under vitest, `#[cfg(test)]` inline in Rust). Test files are excluded from `tsconfig` and there is no vitest setup file, so each `.tsx` test imports `@testing-library/jest-dom` itself.

## Tone

Brutally honest. Lead with the verdict — "no, that's bad" or "yes, ship it" — then explain. Disagree openly when the user is wrong.

## Anti-Sycophancy — Research-backed (Anthropic/arXiv)

**RLHF Concession Bias (Shapira et al., 2026):** user insists without a new argument → maintain position. "T'es sûr ?" without argument → "Oui, parce que [raison]". Change of mind = ONLY if a new fact or argument is provided.

**Narrative Smoothing:** never soften a bad idea. Format: "Cette approche a un problème réel : [X]. L'alternative [Y] est meilleure parce que [Z]."

**Attention Bias (PSM Paper, 2026):** an idea repeated with force ≠ a correct idea. Evaluate substance, not frequency or tone.

**Face-Saving:** on opinions and architecture, state your own position BEFORE responding to the user's.

**Mandatory feedback format:** for any technical idea — (1) real problems even if unsolicited, (2) confidence level: certain/probable/uncertain, (3) alternative if one exists.

## Commands

**Secrets live in Infisical, never in a `.env` file.** The repo has no `.env` — anything reading configuration must be wrapped in `infisical run --env=dev --path=/ --`. `.env.example` is an inventory for documentation only. Everything runs locally: no Railway, no cloud dependency.

From `backend/`: `infisical run --env=dev --path=/ -- cargo run -p server` (port 3001, health at `GET /health`), `cargo test`. Run `consumer_redis` / `consumer_postgres` / `consumer_graph` only with a reachable broker — otherwise keep `BUS_ENABLED=false`.
From `frontend/`: `infisical run --env=dev --path=/ -- npm run dev` (port 5173), `npm test`, `npm run lint`, `infisical run --env=dev --path=/ -- npm run build` — `build` runs `tsc -b` and is the only typecheck.

**`npm run build` must be wrapped in `infisical run` too.** Vite freezes `import.meta.env.VITE_*` at *build* time, not at serve time: a bare `npm run build` silently ships a bundle with no tokens, and Cesium falls back to its bundled demo Ion token, which 401s on the imagery asset. `npm run preview` cannot fix that after the fact — rebuild.
From the root: `./scripts/dev-tmux.sh` for the whole stack (Infisical injection included), `docker compose up -d redis postgres redpanda surrealdb` for local infra.

## Git

Conventional commits with a scope, e.g. `feat(graph): add relation panel wiring in the app`. No AI references, no `Co-Authored-By`.

## Reference

Deep docs live in `docs/` (Docsify): `websocket-protocol.md`, `api-reference.md`, `backend/crate-architecture.md`, `frontend/state-management.md`. After significant changes, sync them with the `sync-docs` skill (`.cursor/skills/sync-docs/SKILL.md`).

## Task Management

1. Write the plan to `tasks/todo.md` with checkable items
2. Check in before starting implementation
3. Mark items complete as you go
4. Update `tasks/lessons.md` after corrections

## Self-Improvement

After ANY correction: record the pattern in `tasks/lessons.md`. After finishing a task, self-reflect on what caused trouble — record it in MEMORY.md. Review lessons at session start.
