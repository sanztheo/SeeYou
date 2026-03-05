# Rapport Full Test Intégration Phase 1a/1b/1c (Rerun)

Date: 2026-03-05  
Repo: `/Users/sanz/Desktop/SeeYou`  
Plan de référence: `docs/plans/2026-03-02-gotham-architecture.md`

## Addendum correctif (2026-03-05, post-rerun)

Correctifs appliqués suite au rapport:
- `GET /health` SurrealDB est maintenant borné par timeout applicatif court (2s), évitant les sondes bloquantes.
- `GET /health` redpanda ne retourne plus un faux positif basé uniquement sur `enabled`; le statut distingue désormais connectivité réelle (`connected`) et configuration (`configured`).
- Tests unitaires ajoutés et passants sur les chemins critiques:
  - `resolve_brokers_from_env` (matrice Railway interne/public/local)
  - `normalize_surreal_url` (ws/wss/http + suffixe `/rpc`)

Ces correctifs améliorent la robustesse applicative, mais ne lèvent pas à eux seuls les blocages d’accessibilité réseau (`*.railway.internal` hors réseau Railway) documentés plus bas.

## Résumé exécutif

Verdict global: **FAIL (NO-GO)**  

Résultat du rerun:
- **PASS**: build/tests statiques backend/frontend.
- **PASS**: test fallback Redpanda down (mode broker indisponible) avec live actif et ingestion Redis/Postgres observée.
- **BLOCKED**: validation runtime Docker (commande `docker compose` indisponible dans cet environnement), reprise consumers après “relance Redpanda”, et tous les tests SurrealDB (endpoint interne non résolu).

Couverture validée (checklist demandée): **33.3% (5/15)**.

## Tableau des tests

| ID | Commande / Test | Attendu | Obtenu | Statut |
|---|---|---|---|---|
| 1.1 | `cd backend && cargo check --workspace` | Build OK | Exit `0` | PASS |
| 1.2 | `cd backend && cargo test --workspace --quiet` | Tests backend OK | Exit `0` | PASS |
| 1.3 | `cd frontend && npm test` | Tests frontend OK | Exit `0`, `24 files / 186 tests` | PASS |
| 1.4 | `cd frontend && npm run build` | Build frontend OK | Exit `0` | PASS |
| 2.1 | `docker compose up -d redis postgres redpanda surrealdb` | Infra Docker up | `docker: No such file or directory` | BLOCKED |
| 2.2 | `cargo run -p server` + `/health` | Backend up + dépendances OK | Backend up, `/health` OK mais `surrealdb=disconnected`, redpanda non joignable | BLOCKED |
| 2.3 | `cargo run -p consumer_redis` | Consumer connecté au broker | Démarre, puis `Resolve ... kafka.railway.internal ...` | BLOCKED |
| 2.4 | `cargo run -p consumer_postgres` | Consumer connecté au broker | Démarre, puis `Resolve ... kafka.railway.internal ...` | BLOCKED |
| 2.5 | `cargo run -p consumer_graph` | Consumer connecté SurrealDB + broker | Échec: `failed to connect surrealdb ... railway.internal` | BLOCKED |
| 2.6 | Vérifier `/health` (redis/postgres/redpanda/surrealdb) | Tous services de phase 1 connectés | `{"redis":"connected","postgres":"connected","redpanda":"enabled","surrealdb":"disconnected"}` | BLOCKED |
| 3.1 | Phase 1b: Redpanda down -> fallback live | Backend OK, pas de crash, ingestion continue via fallback Redis/Postgres | Broker indisponible observé + live actif + croissance Postgres + payload Redis change | PASS |
| 3.2 | Phase 1b: relancer Redpanda -> reprise consumers sans perte (lag/groupes/logs) | Reprise conso sans perte visible | Impossible: broker `*.railway.internal` non résolu depuis cet environnement | BLOCKED |
| 4.1 | Phase 1c: connexion SurrealDB au démarrage backend | Connexion OK | `surrealdb=disconnected` + DNS `NXDOMAIN` | BLOCKED |
| 4.2 | Phase 1c: migration ontologie crée schéma | Migration sans erreur | Non exécutable sans accès SurrealDB | BLOCKED |
| 4.3 | Phase 1c: insert + query entité + relation | Insert/query OK | Non exécutable sans accès SurrealDB | BLOCKED |

## Extraits de preuves

### Build/tests statiques

```text
cargo check --workspace -> exit_code=0
cargo test --workspace --quiet -> exit_code=0
npm test -> 24 passed / 186 passed
npm run build -> exit_code=0
```

### Runtime backend / health

```json
{"status":"ok","redis":"connected","postgres":"connected","redpanda":"enabled","surrealdb":"disconnected"}
```

Logs backend:

```text
bus producer enabled brokers=kafka.railway.internal:9092
... Failed to resolve 'kafka.railway.internal:9092'
server listening address=0.0.0.0:3001
```

### Fallback validé (Redpanda indisponible)

Postgres (croissance observée pendant broker down):

```text
count1=5583922
count2=5617331
delta=33409
```

Redis (payload live change):

```text
ping=PONG
payload_changed=1
```

### Blocage réseau endpoints internes

```text
nslookup kafka.railway.internal -> NXDOMAIN
nslookup surrealdb-3x--latest.railway.internal -> NXDOMAIN
```

## Blockers

1. `docker` indisponible dans l’environnement courant -> commande Docker de la checklist non exécutable.
2. `REDPANDA_BROKERS` pointe vers `kafka.railway.internal:9092` (résolution DNS impossible hors réseau Railway interne).
3. `SURREALDB_URL` pointe vers `surrealdb-3x--latest.railway.internal:8000` (DNS impossible hors réseau Railway interne).
4. Sans broker SurrealDB/Redpanda joignables, impossible de valider reprise consumers, migration ontologie, insert/query graphe.

## Recommandation GO / NO-GO

**NO-GO**.

Conditions minimales pour repasser en GO potentiel:
- Endpoint Redpanda accessible publiquement depuis l’environnement de test (pas `*.railway.internal`), puis rerun test 3.2 (reprise consumers + lag/groupes).
- Endpoint SurrealDB accessible publiquement depuis l’environnement de test, puis rerun tests 4.1/4.2/4.3.
- (Optionnel) runtime local Docker opérationnel si vous voulez rester sur la procédure `docker compose` du plan.

## Artefacts du rerun

`docs/reports/artifacts/2026-03-05-phase1-full-test-rerun/`

Fichiers clés:
- `backend-cargo-check.log`, `backend-cargo-test.log`
- `frontend-npm-test.log`, `frontend-npm-build.log`
- `docker-compose-up.log`
- `server-rerun.meta`, `server-rerun.log`, `server-rerun-health.json`
- `consumer-redis-rerun.log`, `consumer-postgres-rerun.log`, `consumer-graph-rerun.log`
- `fallback-postgres-growth.log`, `fallback-redis-live.log`
- `dns-resolution.log`, `env-endpoint-scope.log`
