# Contributing

## Development Setup

See [Getting Started](getting-started.md) for full installation instructions.

Quick reference:

```bash
docker compose up -d             # Redis
cd backend && cargo run          # Backend on :3001
cd frontend && npm run dev       # Frontend on :5173
```

## Project Conventions

### TypeScript (Frontend)

- **Imports**: Relative paths only — no `@/` aliases
- **State**: Custom hooks only — no Redux, Zustand, or external state libraries
- **Services**: Standalone `fetch`-based modules with `AbortController` cancellation
- **Components**: Domain-organized folders (`Aircraft/`, `Camera/`, `Satellite/`, etc.)
- **Types**: All interfaces in `src/types/` — manually mirrored from Rust structs
- **Styling**: Tailwind CSS inline classes — no CSS modules or styled-components
- **Testing**: Vitest with jsdom — test files colocated as `*.test.ts`

### Rust (Backend)

- **Crate isolation**: Each crate owns a domain — no cross-domain logic leaking
- **Shared state**: Via `AppState` with Axum `FromRef` extractors
- **Error handling**: `AppError` enum → HTTP status codes via `IntoResponse`
- **Async patterns**: `tokio::spawn` for background tasks, `tokio::select!` for WebSocket
- **Caching**: All external data cached in Redis with domain-specific TTLs
- **External APIs**: `reqwest` HTTP client with error logging (non-fatal)

### Code Quality

- No obvious/redundant comments — code should be self-documenting
- Cancel async operations with `AbortController` (frontend) or `cancelled` flags
- Prefer Cesium primitives over Entity API for performance with large datasets
- Use `scaleByDistance` and `distanceDisplayCondition` for level-of-detail
- All WebSocket messages use chunked delivery for large payloads

## Adding a New Data Layer

### Backend

1. **Create a new crate**: `backend/crates/your-domain/`
2. **Define types**: `types.rs` with serde-serializable structs
3. **Implement fetcher**: Module that calls the external API
4. **Add cache module**: In `cache` crate — `your_domain.rs` with get/set and TTL
5. **Add WS message**: In `ws/messages.rs` — new variant in `WsMessage` enum
6. **Create tracker**: Background loop following the tracker pattern
7. **Add REST endpoint**: In `api` crate if on-demand access is needed
8. **Wire up**: Register in `server/main.rs` (spawn tracker, add route)

### Frontend

1. **Define types**: `types/your-domain.ts` mirroring Rust structs
2. **Add WS handler**: In `useAppState.ts` — handle new message type
3. **Create store** (if real-time): New hook following `useAircraftStore` pattern
4. **Create service** (if REST): New module in `services/`
5. **Build layer component**: In `components/YourDomain/` following imperative Cesium pattern
6. **Add sidebar controls**: Filter component in `Sidebar/`
7. **Mount in Globe**: Add layer to `Globe.tsx`
8. **Update App.tsx**: Wire state and pass props

## Architecture Principles

1. **Poll-Cache-Broadcast**: Backend polls → Redis caches → WebSocket broadcasts
2. **Imperative Cesium**: Layers use `CustomDataSource` APIs, not JSX entities
3. **Chunked delivery**: Large datasets split into 2,000-item WebSocket chunks
4. **Zero-dependency state**: No external state management libraries
5. **Domain isolation**: Each domain (aircraft, satellites, etc.) is self-contained
6. **Fail-safe polling**: Tracker errors are logged, not fatal — next poll retries

## Commands Reference

| Command | Description |
|---------|-------------|
| `cd frontend && npm run dev` | Start frontend dev server |
| `cd frontend && npm run build` | Production build (tsc + vite) |
| `cd frontend && npm run lint` | ESLint check |
| `cd frontend && npm run test` | Run Vitest suite |
| `cd backend && cargo run` | Start backend |
| `cd backend && cargo build` | Compile backend |
| `cd backend && cargo test` | Run all crate tests |
| `docker compose up -d` | Start Redis |
