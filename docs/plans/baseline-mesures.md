# Baseline mesuré — SeeYou v2

Mesures prises en local le 2026-08-10 sur la machine cible (macOS, 10 cœurs, 24 GB RAM),
stack Docker complète up, secrets injectés par Infisical. Ce ne sont pas des estimations :
chaque ligne vient d'une exécution réelle. Toute optimisation doit être comparée à ces valeurs.

## Environnement de référence

| Élément | Valeur |
|---|---|
| Infra | `docker compose up -d redis postgres redpanda surrealdb` |
| Secrets | `infisical run --env=dev --path=/ --` (20 secrets), aucun `.env` |
| Backend | `cargo run -p server --manifest-path backend/Cargo.toml` (profil **debug**) |
| Frontend | `vite` dev server (**non bundlé** — voir la réserve plus bas) |
| SurrealDB | 3.2.4, backend rocksdb |
| Postgres | pgvector/pgvector:pg17, **hôte 5433** |
| Redpanda | v24.3.6, `--smp=1 --memory=1G` |
| Navigateur | Chromium via Playwright, viewport 1920×1080, DPR 1, WebGL 2.0 |

> **Réserve de méthode.** Backend en profil debug et frontend en dev server non bundlé.
> Les chiffres de latence backend et de poids de page ne sont donc pas des chiffres de prod.
> Ils restent valides comme base de comparaison tant que l'après est mesuré dans les mêmes
> conditions. Une mesure en `--release` + `vite build` reste à faire.

---

## Trois pannes d'infra trouvées et corrigées

### 1. Postgres masqué par un cluster hôte

Un Postgres de l'hôte (PID 49628, actif depuis le 27 juillet) tient `127.0.0.1:5432` et
`[::1]:5432` ; Docker publiait sur `*:5432`. Le bind spécifique gagne, donc le backend se
connectait au mauvais cluster et échouait sur `role "seeyou" does not exist`.

**Corrigé** en publiant le conteneur sur `5433` et en pointant `DATABASE_URL` dessus.
Redis (6379), SurrealDB (8000) et Redpanda (19092, 18081) ne sont pas masqués — vérifié par
`lsof -nP -iTCP:<port> -sTCP:LISTEN`.

### 2. Graph totalement hors service — mismatch de version SurrealDB

`docker-compose.yml` épinglait `surrealdb/surrealdb:v2` (changement non commité) alors que le
SDK Rust est `surrealdb = "3.0.2"` (`backend/Cargo.toml:53`). Un serveur 2.x refuse le
protocole v3 → `graph client unavailable; /graph endpoints will return 503`.

Le pin v2 venait probablement du fait que v3 a supprimé le scheme `file://` :
`The 'file://' scheme is no longer supported; use 'rocksdb://' or 'surrealkv://' instead`.
Le downgrade a corrigé le symptôme et cassé la compatibilité SDK.

**Corrigé** : image `surrealdb/surrealdb:v3.2`, commande `start ... rocksdb:/data/surreal.db`.
Volume recréé — vérifié vide au préalable (`INFO FOR ROOT` → `namespaces: {}`), donc aucune
donnée perdue.

**Conséquence pour P1 :** le moteur de corrélation ne part pas d'un existant à optimiser.
Le graph n'a jamais tourné dans cette configuration. Zéro table, zéro namespace.

### 3. Bus désactivé

`BUS_ENABLED=false` alors que Redpanda est healthy. Passé à `true` : `bus producer enabled`.

**`GET /health` avant :** `postgres: "disabled"`, `redpanda: "disabled"`.
**`GET /health` après :** les quatre services à `"connected"`.

---

## P0 — Le vrai goulot : volume de données, pas rendu

L'utilisateur a explicitement recadré : le problème est le **temps de chargement**, pas les FPS.
La mesure confirme qu'il a raison, et que la métrique FPS était un cul-de-sac.

### Pourquoi la métrique FPS ne veut rien dire ici

| Métrique | Valeur |
|---|---|
| FPS moyen | 58,7 |
| frame p50 | 16,7 ms |
| frame p95 | **17,4 ms** |
| frame p99 | 33,4 ms |

**17,4 ms de p95 est le plancher vsync d'un écran 60 Hz.** `requestAnimationFrame` ne descend
pas sous ~16,7 ms. Viser « p95 divisé par 2 » est physiquement impossible et ne mesure rien
d'utile. À remplacer par les métriques de chargement ci-dessous.

### WebSocket — 31,67 MB/minute vers chaque client

Mesuré sur une connexion WS indépendante de l'app, 45 s d'observation :

| Type | 1er message | Messages | Volume | **Poids/message** |
|---|---|---|---|---|
| `Predictions` | 2014 ms | 19 | **23,02 MB** | **1240,8 KB** |
| `AircraftBatch` | 2017 ms | 15 | 0,73 MB | 49,8 KB |
| `Connected` | 2 ms | 1 | ~0 | 0,1 KB |

**Un message `Predictions` pèse 1,24 MB — 25× le poids des données avions qu'il dérive.**
97 % du trafic WebSocket sert de la donnée calculée. C'est le premier poste à attaquer.

### REST — deux réponses obèses

| Endpoint | Temps | Taille | Items |
|---|---|---|---|
| `/fires` | **1,896 s** | **17,87 MB** | 89 552 |
| `/cameras` | 212 ms | 3,95 MB | 11 020 |
| `/cables` | 53 ms | 871 KB | 718 |
| `/satellites` | 3,5 ms (chaud) / **628,8 ms** (froid) | 25 KB | **119** |
| `/events` | 2,6 ms | 22 KB | 100 |
| `/seismic` | 3,0 ms | 12 KB | 47 |
| `/space-weather` | 3,0 ms | 8,9 KB | 10 |
| `/weather` | — | — | 40 |
| `/maritime` | 1,6 ms | 62 o | **0** |
| `/cyber` | 1,3 ms | 62 o | **0** |
| `/gdelt` | 2,2 ms | 61 o | **0** |
| `/aircraft`, `/metar`, `/military`, `/nuclear` | — | — | **404 (route inexistante)** |

Aucune pagination, aucun filtrage spatial : `/fires` renvoie les 89 552 foyers du globe en un
bloc, y compris quand la caméra regarde un continent.

### Chargement de la page (dev server)

| Métrique | Valeur |
|---|---|
| TTFB | 5 ms |
| DOMContentLoaded | 579 ms |
| load event | 581 ms |
| **first-contentful-paint** | **1632 ms** |
| Requêtes totales | 274 |
| dont modules Vite dev | 220 requêtes / 16,52 MB |
| Appels REST backend pendant le chargement | **2** |

Les 16,52 MB de modules sont un artefact du dev server et disparaîtront au build. À remesurer
sur `vite build` + preview avant d'en tirer une conclusion.

---

## Écart entre le README et la réalité mesurée

| Couche | Annoncé README | **Mesuré** |
|---|---|---|
| Aircraft | 30 000+ vols | **1 région sur 43** |
| Satellites | 10 000 objets | **119** |
| Space debris | 63 000 objets | non vérifié |
| Cameras | 800+ | 11 020 ✓ (mieux qu'annoncé) |
| Naval vessels | AIS | **0** |
| Cyber threats | arcs d'attaque | **0** |
| Geopolitical (GDELT) | événements | **0** |
| Graph / relations | moteur de convergence | **503, jamais initialisé** |

---

## P0 bis — L'ingest ADS-B est à 2,3 % de capacité

| Mesure | Valeur observée |
|---|---|
| Points de grille (`services/src/adsb.rs:23`) | **43** |
| `regions_ok` | **1** |
| `regions_failed` | **42** (97,7 % d'échec) |
| HTTP 429 en ~30 s de run | **585** |
| Avions retournés par cycle | 805, puis 7, puis 287 — erratique |

### Cause racine

`DEFAULT_POLL_INTERVAL_SECS = 2` (`server/src/config.rs:4`) combiné à `fetch_all_regions`
(`services/src/adsb.rs:194-205`) qui lance les 43 régions en `tokio::spawn` simultané, sans
sémaphore ni étalement :

```rust
let handles = GRID_POINTS
    .iter()
    .map(|&(lat, lon)| {
        let client = client.clone();
        tokio::spawn(async move { (lat, lon, fetch_region(&client, lat, lon).await) })
    })
    .collect();
```

Soit **~21,5 requêtes/seconde en continu** vers adsb.lol. Aucun backoff, aucune lecture de
`Retry-After`, et un 429 est classé `AdsbError::Parse` — donc indistinguable d'une réponse
malformée. `services::aircraft_tracker` échoue aussi sur les avions militaires :
`failed to fetch military aircraft: HTTP request failed: error decoding response body`.

**Critère de succès :** `regions_failed=0` dans `regional fetch complete`, et un nombre
d'avions stable entre cycles plutôt qu'oscillant d'un facteur 100.

---

## Bugs frontend observés

- `GET /graph/neighbors/satellite/65568?depth=1` → **503** (cause : graph non initialisé, corrigé).
- `TypeError: Cannot read properties of undefined (reading 'trim')` à
  `services/geocodeService.ts:27`, appelé depuis `components/SearchBar/SearchBar.tsx:220`.

---

## Cadences de poll actuelles (`server/src/config.rs:4-16`)

| Domaine | Intervalle |
|---|---|
| Aircraft | **2 s** — à l'origine du rate-limit |
| Satellites | 60 s |
| METAR / Cameras / Seismic | 300 s |
| Weather / Maritime | 600 s |
| GDELT / Cyber / Space weather | 900 s |
| Events / Fires | 1800 s |
| Cables | 86400 s |

---

## Métriques cibles proposées (remplacent la cible FPS)

Le goal parle de « p95 du temps de frame divisé par 2 ». C'est inatteignable par construction.
Métriques de remplacement, toutes mesurables avec l'outillage déjà utilisé ici :

| Métrique | Baseline | Cible |
|---|---|---|
| Débit WS en régime établi | 31,67 MB/min | ≤ 3 MB/min |
| Poids d'un message `Predictions` | 1240,8 KB | ≤ 50 KB |
| `/fires` — temps | 1,896 s | ≤ 200 ms |
| `/fires` — taille | 17,87 MB | ≤ 1 MB (filtré/paginé) |
| `/cameras` — taille | 3,95 MB | ≤ 500 KB |
| first-contentful-paint | 1632 ms | ≤ 800 ms |
| `regions_failed` ADS-B | 42/43 | 0 |
| Couches à 0 item | 3 (maritime, cyber, gdelt) | 0 |

---

## Rapport rétroactif — Lot 1, P0-2 (`Predictions`)

P0-2 a été implémenté (~470 lignes sur `prediction/service.rs`+`trajectory.rs`, `api/predict.rs`,
`app_state`/`main`/`router`, `frontend/src/types/aircraft.ts`, `AircraftPredictions.tsx`,
`AircraftPopup.tsx`, filtre `pattern_only` dans `aircraft_tracker.rs`) sans qu'aucun rapport ni
mesure de gate n'ait été produit avant la revue Lot 0+1. Section ajoutée en correction de cette
revue — **ne jamais merger un lot dont une tâche n'a ni rapport ni sortie observée.**

### Mesuré par la revue Lot 0+1 (non re-vérifié dans cette passe)

| Configuration | Poids `Predictions` | Gate |
|---|---|---|
| `PREDICTIONS_PATTERN_ONLY=0` (flag OFF) | **424,4 KB/msg** | ≤ 450 KB — tenue |

Pour re-vérifier : relancer le serveur avec `PREDICTIONS_PATTERN_ONLY=0`, laisser le tracker
réinitialiser l'IMM sur trafic militaire réel, puis `node scripts/ws-capture.mjs`.

### Re-vérifié indépendamment ce jour (2026-08-10, serveur relancé, config défaut)

Serveur : `infisical run --env=dev --path=/ -- cargo run -p server --manifest-path backend/Cargo.toml`.
Log confirme le flag par défaut : `predictions pattern-only filter (PREDICTIONS_PATTERN_ONLY) pattern_only=true`.

**`node scripts/ws-capture.mjs 45000 ws://localhost:3001/ws`** (aucun `SetViewport` envoyé — vue
monde par défaut) :

| Type | Messages | Poids/msg | MB/min |
|---|---|---|---|
| `Predictions` | **0** | — | 0 |
| `AircraftBatch` | 5 | 404,0 KB | 2,63 |
| `SatelliteBatch` | 1 | 20,9 KB | 0,03 |
| `Connected` | 1 | 0,1 KB | ~0 |
| **Total** | 7 | — | **2,66** |

Au moment de la mesure, le tracker suivait `military=321 civilian=8908` (log
`broadcasting aircraft total=9229 military=321 civilian=8908`) — le flag ON ne cache donc pas une
absence de trafic militaire : sur ces 321 avions IMM-initialisés, aucun n'avait de pattern détecté
(CAP/Orbit/Transit/Holding) pendant la fenêtre de 45 s, donc 0 trajectoire à diffuser. C'est le
comportement attendu du filtre, pas un flag inopérant.

Gates : **Palier A** (WS hors `AircraftBatch` ≤ 1 MB/min) — `Predictions` + `SatelliteBatch` +
`Connected` ≈ 0,04 MB/min, **tenue**. **Palier B** (WS total ≤ 3 MB/min, vue monde) — **2,66 MB/min,
tenue** (à comparer à la baseline 31,67 MB/min ci-dessus : −91,6 % sur cette fenêtre). Ingest ADS-B
sur le même run : `regions_ok=43 regions_failed=0 regions_rate_limited=0` sur 3 cycles consécutifs —
cohérent avec le rapport P0-1 ci-dessus.

**`GET /aircraft/:icao/predict`** testé sur trafic réel extrait du flux `AircraftBatch` du run :

| ICAO | `is_military` | `model` renvoyé | Points | `sigma_growth_m_s` |
|---|---|---|---|---|
| `ae6ce8` | true | `imm` | 60 | 150,18 (non nul — IMM actif) |
| `7c806f` | false | `cv_coldstart` | 60 | 0,0 (cold-start, attendu) |

Conforme au code (`service.rs::get_trajectory` : IMM si tracker initialisé, sinon cold-start
`ConstantVelocity` depuis `last_kinematics`). Les deux leviers du gain P0-2 (payload réduit,
diffusion filtrée) et le levier 3 (route à la demande) sont donc chacun couverts par au moins une
mesure réelle, attribuée à sa source.

## À mesurer encore

- Backend en `--release` et frontend en `vite build` + preview (chiffres de prod).
- Débris spatiaux : 63 000 objets annoncés, volume et cadence non vérifiés.
- Coût du health check caméras de masse par cycle (11 020 caméras).
- Temps de requête de voisinage graph une fois le moteur peuplé.
