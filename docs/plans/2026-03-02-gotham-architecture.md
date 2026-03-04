# SeeYou Gotham — Architecture & Implementation Plan

> Transformer SeeYou d'un dashboard de visualisation en une plateforme d'intelligence temps réel type Palantir Gotham, 100% Rust.

## Architecture globale

```
┌─────────────────────────────────────────────────────────────┐
│                      SOURCES (ingest)                        │
│  ADS-B    TomTom    TfL    Weather    Satellites    Events   │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│               SERVICES RUST (producteurs)                    │
│  Chaque crate existant publie dans Redpanda                  │
│  Fallback direct Redis si Redpanda down                      │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    REDPANDA (bus de messages)                 │
│  Topics: aircraft.positions, traffic.events, cameras.status  │
│          weather.updates, satellites.tle, events.raw         │
└────────┬──────────────┬──────────────────┬──────────────────┘
         ↓              ↓                  ↓
┌──────────────┐ ┌─────────────┐ ┌─────────────────────────┐
│   ARROYO     │ │  CONSUMER   │ │  CONSUMER               │
│  stream      │ │  → Redis    │ │  → PostgreSQL/TimescaleDB│
│  processing  │ │  (cache hot)│ │  (persistance)           │
│  corrélation │ └─────────────┘ └─────────────────────────┘
│  alertes     │
└──────┬───────┘
       ↓
┌─────────────────────────────────────────────────────────────┐
│                    SURREALDB (knowledge graph)                │
│  Entités + relations + événements détectés par Arroyo        │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│              DATAFUSION (query engine analytique)             │
│  SQL cross-domain sur Postgres + SurrealDB                   │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                    AXUM API + WebSocket                       │
│  REST: queries, historique, graph                            │
│  WS: positions temps réel, alertes push                      │
│  SSE: notifications d'événements                             │
└─────────────────────────┬───────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                  REACT + CESIUM (frontend)                    │
│  Globe 3D / Timeline / Alertes / Query builder / Graph view  │
└─────────────────────────────────────────────────────────────┘
```

### Principe de priorité du live

Le hot path (Redis → WebSocket → frontend) ne change pas. Redpanda ajoute ~1-2ms.
Les consumers (Postgres, Arroyo) tournent en parallèle et ne bloquent jamais Redis.
Si Redpanda tombe, fallback direct Redis comme aujourd'hui.

```
| Chemin                          | Latence     | Si ça plante                    |
|---------------------------------|-------------|---------------------------------|
| Live (Redis → WS → frontend)   | ~2ms ajouté | Fallback direct, rien ne change |
| Historique (→ Postgres)         | Async, 1-5s | On perd l'historique, live OK   |
| Alertes (→ Arroyo → SurrealDB) | Async, 5-10s| Pas d'alertes, live OK          |
```

---

## Ontologie — Modèle de données

### Entités (noeuds du graphe)

```
Aircraft    : icao, callsign, location(point), altitude, speed, heading, airline
Camera      : id, name, location(point), stream_type, source, is_online
Weather     : station_id, city, location(point), temp, wind, visibility, conditions
TrafficSeg  : segment_id, road_name, location(point), speed_ratio, delay_min, severity
Satellite   : norad_id, name, orbit_params, location(point), category
Event       : id, type, location(point), severity, description, timestamp
Zone        : name, polygon, type (city/airport/region)
Alert       : id, type, severity, entities[], message, timestamp
```

### Relations (arêtes du graphe)

```
Aircraft  ──flies_over──→   Zone
Aircraft  ──monitored_by──→ Camera
Aircraft  ──affected_by──→  Weather
Aircraft  ──triggered──→    Alert

Camera    ──located_in──→   Zone
Camera    ──observes──→     TrafficSeg

TrafficSeg──located_in──→   Zone
TrafficSeg──affected_by──→  Weather
TrafficSeg──triggered──→    Alert

Weather   ──covers──→       Zone
Satellite ──passes_over──→  Zone

Alert     ──involves──→     [Aircraft|Camera|TrafficSeg|Weather]
Alert     ──located_in──→   Zone
```

Zone est l'entité pivot — tout est relié à une zone géographique.

---

## Infrastructure

### Docker Compose (ajouts)

```yaml
services:
  postgres:
    image: timescale/timescaledb-ha:pg16
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: seeyou
      POSTGRES_USER: seeyou
      POSTGRES_PASSWORD: seeyou_dev
    volumes: [pgdata:/home/postgres/pgdata/data]

  redpanda:
    image: redpandadata/redpanda:latest
    command:
      - redpanda start
      - --smp 1
      - --memory 256M
      - --overprovisioned
    ports: ["9092:9092", "8082:8082"]

  surrealdb:
    image: surrealdb/surrealdb:latest
    command: start --user root --pass root file:/data/srdb.db
    ports: ["8000:8000"]
    volumes: [surrealdata:/data]

  arroyo:
    image: ghcr.io/arroyosystems/arroyo:latest
    ports: ["5115:5115"]
    environment:
      ARROYO__KAFKA__BOOTSTRAP_SERVERS: redpanda:9092

volumes:
  pgdata:
  surrealdata:
```

~1 GB RAM total en dev.

### Nouveaux crates Rust

```
backend/crates/
├── db/             # PostgreSQL + TimescaleDB + PostGIS
│   ├── migrations/
│   ├── aircraft.rs
│   ├── cameras.rs
│   ├── traffic.rs
│   ├── weather.rs
│   └── spatial.rs
├── graph/          # SurrealDB knowledge graph
│   ├── entities.rs
│   ├── relations.rs
│   ├── queries.rs
│   └── ontology.rs
├── bus/            # Redpanda producer/consumer
│   ├── producer.rs
│   ├── consumer.rs
│   └── topics.rs
├── engine/         # DataFusion query engine
│   ├── sources.rs
│   ├── queries.rs
│   └── functions.rs
└── alerts/         # Détection + notification
    ├── detector.rs
    ├── correlator.rs
    └── notifier.rs
```

### Stockage estimé

```
| Données                                          | Taille     |
|--------------------------------------------------|------------|
| Metadata (cameras, weather, traffic, sats)       | < 50 MB    |
| Aircraft positions (90j, compressé TimescaleDB)  | ~3 GB      |
| Index spatiaux PostGIS                           | ~500 MB    |
| SurrealDB (graph entités + relations)            | ~200 MB    |
| Total                                            | ~4 GB      |
```

---

## Stream Processing — Arroyo Pipelines

### Enrichissement géographique (tous les flux)

Chaque message est taggé avec sa zone (ville, aéroport, région).

### Détection d'anomalies aircraft

- Descente rapide (> 3000 ft/min) sur fenêtre de 10s
- Holding pattern (changement de cap > 270° en 5 min)

### Corrélation traffic + weather

- Incident trafic dans une zone de mauvaise météo (visibility < 1000m)
- Jointure temporelle ± 10 minutes

### Alertes composites

- ≥ 3 événements de sources différentes dans la même zone en 5 min
- Création d'une Alert dans SurrealDB avec relations involves/located_in
- Push via topic alerts.new → Axum → WebSocket → frontend

---

## Frontend — L'expérience Gotham

### Nouveaux composants

```
frontend/src/
├── components/
│   ├── QueryBar/           # Recherche globale cmd+K
│   │   ├── QueryBar.tsx
│   │   ├── QueryResults.tsx
│   │   └── QueryParser.ts
│   ├── Alerts/             # Panneau d'alertes flottant
│   │   ├── AlertPanel.tsx
│   │   ├── AlertCard.tsx
│   │   └── AlertBadge.tsx
│   ├── Timeline/           # Timeline enrichie + replay
│   │   ├── EventTicks.tsx
│   │   └── ReplayController.ts
│   ├── Graph/              # Vue knowledge graph
│   │   ├── GraphView.tsx
│   │   ├── GraphNode.tsx
│   │   └── GraphEdge.tsx
│   └── Globe/              # Nouvelles couches globe
│       ├── ZoneHighlight.tsx
│       └── RelationLines.tsx
├── services/
│   ├── queryService.ts
│   ├── alertService.ts
│   ├── graphService.ts
│   └── historyService.ts
└── hooks/
    ├── useAlerts.ts
    ├── useReplay.ts
    └── useGraphNavigation.ts
```

### Query Bar (cmd+K)

- Recherche simple : "AF1234", "CDG", "London cameras"
- Requêtes naturelles : "aircraft near CDG last 2 hours" → DataFusion SQL
- Filtres composés : type:aircraft speed:>500 zone:paris

### Alert Panel (flottant, côté droit)

- Alertes triées par sévérité (CRITICAL / WARNING / INFO)
- Chaque alerte affiche la zone, les entités impliquées, le timestamp
- "View on globe" → fly-to Cesium + highlight des entités

### Timeline améliorée

- Mode LIVE : temps réel comme aujourd'hui
- Mode REPLAY : scrub, toutes les couches se repositionnent via Postgres
- Event ticks : alertes et événements passés marqués sur la timeline

### Graph View (sidebar)

- Sélectionner une entité → voir ses relations
- Navigation noeud en noeud
- Chaque noeud cliquable → fly-to sur le globe

---

## Phases d'implémentation

---

### Phase 1 — Fondations

---

#### Phase 1a — PostgreSQL + Persistance

Objectif : les données sont persistées dans Postgres en plus de Redis. Le live ne change pas.

- [x] Ajouter Postgres (timescale/timescaledb-ha:pg16) au docker-compose
- [x] Ajouter PostGIS : `CREATE EXTENSION postgis;`
- [x] Ajouter TimescaleDB : `CREATE EXTENSION timescaledb;`
- [x] Créer le crate `db/` dans le workspace avec sqlx
- [x] Migration : table `aircraft_positions` (icao, callsign, lat, lon, altitude, speed, heading, timestamp)
- [x] Migration : convertir `aircraft_positions` en TimescaleDB hypertable
- [x] Migration : index PostGIS sur `aircraft_positions` (geometry point)
- [x] Migration : table `cameras` (id, name, lat, lon, stream_type, source, is_online, last_seen)
- [x] Migration : table `traffic_segments` (segment_id, road_name, lat, lon, speed_ratio, delay_min, severity, timestamp)
- [x] Migration : convertir `traffic_segments` en TimescaleDB hypertable
- [x] Migration : table `weather_readings` (station_id, city, lat, lon, temp, wind, visibility, conditions, timestamp)
- [x] Migration : convertir `weather_readings` en TimescaleDB hypertable
- [x] Migration : table `events` (id, type, lat, lon, severity, description, timestamp)
- [x] Implémenter `db::aircraft::insert_positions()` — batch INSERT
- [x] Implémenter `db::cameras::upsert_camera()` — ON CONFLICT UPDATE
- [x] Implémenter `db::traffic::insert_segments()` — batch INSERT
- [x] Implémenter `db::weather::insert_readings()` — batch INSERT
- [x] Implémenter `db::events::insert_events()` — batch INSERT
- [x] Ajouter `PgPool` à `AppState` dans le backend Axum
- [x] Dual-write dans chaque service : écrire Redis ET Postgres
- [x] Configurer TimescaleDB compression policy (> 7 jours)
- [x] Configurer TimescaleDB retention policy (> 90 jours)
- [x] Ajouter DATABASE_URL au .env.example
- [ ] Test : le frontend marche exactement comme avant
- [ ] Test : redémarrer le backend → données toujours dans Postgres
- [ ] Test : `SELECT count(*) FROM aircraft_positions;` croît dans le temps

Livrable : persistance complète, historique queryable en SQL, zéro régression live.

---

#### Phase 1b — Redpanda (message broker)

Objectif : les services publient dans Redpanda au lieu d'écrire directement dans Redis + Postgres. Découple producteurs et consommateurs.

- [ ] Ajouter Redpanda au docker-compose
- [ ] Créer le crate `bus/` dans le workspace avec rdkafka
- [ ] Définir les topics dans `bus::topics` : aircraft.positions, traffic.events, cameras.status, weather.updates, satellites.tle, events.raw
- [ ] Implémenter `bus::producer::publish()` — sérialise + publie dans un topic
- [ ] Implémenter `bus::consumer::redis` — consume topic → Redis SET (hot path, priorité max)
- [ ] Implémenter `bus::consumer::postgres` — consume topic → batch INSERT Postgres (async, peut prendre son temps)
- [ ] Modifier le service `aircraft` : remplacer dual-write par `bus::producer::publish()`
- [ ] Modifier le service `cameras` : idem
- [ ] Modifier le service `traffic` : idem
- [ ] Modifier le service `weather` : idem
- [ ] Modifier le service `satellites` : idem
- [ ] Modifier le service `events` : idem
- [ ] Implémenter fallback : si Redpanda est down → écriture directe Redis (comme avant)
- [ ] Consumer groups séparés : redis-consumer, postgres-consumer (indépendants)
- [ ] Ajouter REDPANDA_URL au .env.example
- [ ] Test : le frontend marche exactement comme avant
- [ ] Test : arrêter Redpanda → fallback Redis fonctionne, live OK
- [ ] Test : relancer Redpanda → les consumers reprennent sans perte

Livrable : architecture event-driven, producteurs découplés des consommateurs.

---

#### Phase 1c — SurrealDB (knowledge graph vide)

Objectif : SurrealDB tourne, le schéma d'ontologie est en place, prêt à être alimenté.

- [ ] Ajouter SurrealDB au docker-compose
- [ ] Créer le crate `graph/` dans le workspace avec surrealdb-rs
- [ ] Implémenter `graph::ontology::migrate()` — crée toutes les tables et champs
- [ ] DEFINE TABLE aircraft, camera, weather, traffic_segment, satellite, event, zone, alert
- [ ] DEFINE les champs typés pour chaque table (cf. ontologie)
- [ ] DEFINE TABLE pour chaque relation : flies_over, monitored_by, affected_by, located_in, covers, passes_over, observes, triggered, involves
- [ ] Définir le dataset de Zones initiales (grandes villes, aéroports majeurs, régions)
- [ ] Implémenter `graph::entities::upsert()` — générique par type d'entité
- [ ] Implémenter `graph::relations::link()` — créer une relation entre deux entités
- [ ] Implémenter `graph::queries::get_entity()` — entité + ses relations directes
- [ ] Implémenter `graph::queries::get_neighbors()` — sous-graphe à N niveaux de profondeur
- [ ] Ajouter SURREALDB_URL au .env.example
- [ ] Test : connexion SurrealDB OK au démarrage du backend
- [ ] Test : `graph::ontology::migrate()` crée le schéma sans erreur
- [ ] Test : insert + query d'une entité avec relations

Livrable : knowledge graph prêt, schéma complet, APIs CRUD fonctionnelles.

---

### Phase 2 — Knowledge Graph (alimenté)

Objectif : les entités et relations sont alimentées en temps réel et navigables depuis le frontend.

---

#### Phase 2a — Alimentation du graphe

- [ ] Ajouter un consumer SurrealDB dans `bus/` — consume topics → upsert entités dans le graphe
- [ ] Implémenter zone_lookup : pour (lat, lon) → trouver la Zone la plus proche
- [ ] Auto-relation : `flies_over` quand un aircraft est dans le polygone d'une zone
- [ ] Auto-relation : `located_in` pour cameras, traffic, weather → zone
- [ ] Auto-relation : `monitored_by` si caméra < 2km d'un aircraft
- [ ] Auto-relation : `affected_by` si weather.visibility < 1000m dans la même zone qu'un aircraft/traffic
- [ ] Auto-relation : `covers` pour weather → zone
- [ ] Auto-relation : `passes_over` pour satellites → zone
- [ ] TTL sur les relations éphémères (flies_over expire quand l'avion quitte la zone)
- [ ] Test : un avion au-dessus de Paris → relation flies_over:paris créée
- [ ] Test : caméra proche d'un avion → relation monitored_by créée
- [ ] Test : query `SELECT <-flies_over<-aircraft FROM zone:paris` → retourne les avions

Livrable : le graphe se remplit automatiquement en temps réel.

---

#### Phase 2b — API + Frontend Graph View

- [ ] API endpoint : GET /api/graph/entity/:type/:id → entité + relations directes
- [ ] API endpoint : GET /api/graph/neighbors/:type/:id?depth=2 → sous-graphe
- [ ] API endpoint : GET /api/graph/zone/:zone_id → toutes les entités dans cette zone
- [ ] API endpoint : GET /api/graph/search?q=... → recherche full-text dans les entités
- [ ] Frontend : créer `graphService.ts`
- [ ] Frontend : créer `useGraphNavigation` hook (entité sélectionnée, historique navigation)
- [ ] Frontend : implémenter `GraphView.tsx` dans la sidebar (section pliable comme cameras)
- [ ] Frontend : implémenter `GraphNode.tsx` (noeud avec icône par type, couleur par domaine)
- [ ] Frontend : implémenter `GraphEdge.tsx` (ligne de relation avec label au hover)
- [ ] Frontend : clic sur un noeud → fly-to sur le globe + charger ses voisins
- [ ] Frontend : implémenter `RelationLines.tsx` sur le globe (lignes entre entités liées quand sélectionnées)
- [ ] Frontend : ajouter section "Relations" dans l'IconRail
- [ ] Test : sélectionner un avion → voir caméras proches, zone, météo dans le graphe
- [ ] Test : clic sur une caméra dans le graphe → fly-to + ouvrir CameraPlayer

Livrable : navigation dans le knowledge graph depuis la sidebar et le globe.

---

### Phase 3 — Stream Processing & Alertes

---

#### Phase 3a — Arroyo Pipelines

- [ ] Ajouter Arroyo au docker-compose
- [ ] Configurer Arroyo pour consommer les topics Redpanda
- [ ] Pipeline : enrichissement géographique (tag zone_id sur chaque message)
- [ ] Pipeline : détection descente rapide aircraft (> 3000 ft/min, fenêtre tumbling 10s)
- [ ] Pipeline : détection holding pattern (heading change > 270° en 5 min, fenêtre hopping)
- [ ] Pipeline : détection traffic jam soudain (speed_ratio chute > 50% en 2 min)
- [ ] Pipeline : corrélation traffic + weather (incident + visibility < 1000m, même zone, ±10 min)
- [ ] Pipeline : corrélation camera offline + incident même zone
- [ ] Pipeline : alertes composites (≥ 3 sources différentes, même zone, fenêtre 5 min)
- [ ] Output des pipelines → topic Redpanda `alerts.raw`
- [ ] Test : injecter une descente rapide simulée → événement dans alerts.raw
- [ ] Test : injecter incident trafic + mauvaise météo → corrélation détectée

Livrable : Arroyo tourne et détecte des patterns en temps réel.

---

#### Phase 3b — Crate Alertes + Backend

- [ ] Créer le crate `alerts/`
- [ ] Implémenter `alerts::detector` — consomme topic `alerts.raw`, classifie sévérité (CRITICAL / WARNING / INFO)
- [ ] Implémenter `alerts::correlator` — enrichit l'alerte avec les entités impliquées depuis SurrealDB
- [ ] Implémenter `alerts::notifier` — écrit Alert dans SurrealDB + crée relations `involves` et `located_in`
- [ ] Publier l'alerte enrichie dans topic `alerts.new`
- [ ] Consumer Axum : consomme `alerts.new` → push via WebSocket aux clients connectés
- [ ] API endpoint : GET /api/alerts?active=true → alertes actives depuis SurrealDB
- [ ] API endpoint : GET /api/alerts/:id → détail alerte + entités impliquées (graph traversal)
- [ ] API endpoint : PATCH /api/alerts/:id/dismiss → marquer comme traitée
- [ ] Test : alerte créée → visible via API en < 15s
- [ ] Test : alerte dans SurrealDB a les bonnes relations involves

Livrable : pipeline complet Arroyo → alerte enrichie → SurrealDB → API.

---

#### Phase 3c — Frontend Alertes

- [ ] Frontend : créer `alertService.ts` (WebSocket subscribe aux alertes)
- [ ] Frontend : créer `useAlerts` hook (liste alertes actives, compteur, dismiss)
- [ ] Frontend : implémenter `AlertPanel.tsx` (panneau flottant côté droit du globe)
- [ ] Frontend : implémenter `AlertCard.tsx` (sévérité, zone, entités, timestamp, actions)
- [ ] Frontend : implémenter `AlertBadge.tsx` (marqueur sur le globe à la position de l'alerte)
- [ ] Frontend : implémenter `ZoneHighlight.tsx` (polygone pulse rouge/jaune sur les zones en alerte)
- [ ] Frontend : bouton "View on globe" → fly-to + highlight entités + ouvrir GraphView centré sur l'alerte
- [ ] Frontend : bouton "Dismiss" → PATCH dismiss + retirer de la liste
- [ ] Frontend : badge compteur d'alertes actives dans l'IconRail (point rouge avec chiffre)
- [ ] Frontend : notification sonore optionnelle sur alerte CRITICAL
- [ ] Test : alerte détectée → panneau s'ouvre automatiquement en < 15s
- [ ] Test : "View on globe" → caméra fly-to + entités visibles

Livrable : alertes temps réel visibles sur le globe avec navigation.

---

### Phase 4 — Query Engine

---

#### Phase 4a — DataFusion Backend

- [ ] Créer le crate `engine/`
- [ ] Implémenter `engine::sources` — enregistrer les tables Postgres comme sources DataFusion
- [ ] Implémenter `engine::functions` — UDFs : st_distance(a, b), severity_score(), time_ago()
- [ ] Implémenter `engine::queries` — parse SQL, exécute, sérialise en JSON (avec pagination)
- [ ] Sanitization : whitelist de requêtes read-only (SELECT uniquement, pas de DDL/DML)
- [ ] API endpoint : POST /api/query `{ sql: "SELECT ..." }` → résultats paginés
- [ ] API endpoint : GET /api/search?q=... → recherche full-text combinée (Postgres tsvector + SurrealDB)
- [ ] Rate limiting sur /api/query (requêtes lourdes)
- [ ] Test : `SELECT * FROM aircraft_positions WHERE ...` → résultats corrects
- [ ] Test : requête avec UDF st_distance → calcul spatial correct
- [ ] Test : injection SQL → rejetée

Livrable : moteur de requêtes SQL cross-domain accessible via API.

---

#### Phase 4b — Frontend Query Bar

- [ ] Frontend : créer `queryService.ts`
- [ ] Frontend : implémenter `QueryBar.tsx` (input flottant en bas, style cmd+K)
- [ ] Frontend : raccourci clavier cmd+K → focus la query bar
- [ ] Frontend : `QueryParser.ts` — détecter si recherche simple ("AF1234") ou requête structurée ("type:aircraft speed:>500")
- [ ] Frontend : recherche simple → GET /api/search?q=...
- [ ] Frontend : requête structurée → construire le SQL → POST /api/query
- [ ] Frontend : implémenter `QueryResults.tsx` (dropdown résultats groupés par type d'entité)
- [ ] Frontend : clic sur un résultat → fly-to sur le globe + ouvrir GraphView
- [ ] Frontend : résultats spatiaux affichés sur le globe (points + lignes temporaires)
- [ ] Frontend : historique des requêtes récentes (localStorage, accessible via flèche haut)
- [ ] Frontend : Escape → fermer la query bar
- [ ] Test : "AF1234" → trouve l'avion et fly-to
- [ ] Test : "cameras london" → liste les caméras londoniennes
- [ ] Test : cmd+K → focus, Escape → ferme

Livrable : recherche globale fonctionnelle depuis le frontend.

---

### Phase 5 — Timeline Replay

---

#### Phase 5a — API Historique

- [ ] API endpoint : GET /api/history/aircraft?from=...&to=...&bbox=... → positions Postgres
- [ ] API endpoint : GET /api/history/traffic?from=...&to=...&bbox=... → segments historiques
- [ ] API endpoint : GET /api/history/weather?from=...&to=... → relevés historiques
- [ ] API endpoint : GET /api/history/alerts?from=...&to=... → alertes passées
- [ ] API endpoint : GET /api/history/snapshot?at=...&bbox=... → état complet à un instant T (toutes les couches)
- [ ] Downsampling automatique : si plage > 1h, réduire la résolution (1 point/min au lieu de 1/sec)
- [ ] Test : GET history/aircraft pour les 2 dernières heures → données correctes
- [ ] Test : GET history/snapshot at=yesterday 14:00 → état cohérent multi-couches

Livrable : toutes les données historiques accessibles via API.

---

#### Phase 5b — Frontend Timeline Replay

- [ ] Frontend : créer `historyService.ts`
- [ ] Frontend : créer `useReplay` hook (état : timestamp, playing, speed, mode LIVE/REPLAY)
- [ ] Frontend : implémenter `ReplayController.ts` (play/pause, vitesse x1 x2 x5 x10, scrub)
- [ ] Frontend : modifier Timeline existante — toggle mode LIVE ↔ REPLAY
- [ ] Frontend : implémenter `EventTicks.tsx` (alertes/événements passés marqués sur la timeline)
- [ ] Frontend : clic sur un event tick → fly-to + détails de l'alerte
- [ ] Frontend : mode REPLAY → WebSocket pause, toutes les couches lisent depuis REST historique
- [ ] Frontend : couche aircraft en replay → trajectoires en lignes (polylines)
- [ ] Frontend : scrub la timeline → toutes les couches se repositionnent au timestamp choisi
- [ ] Frontend : bouton "Back to LIVE" → reprend le streaming temps réel, WebSocket reconnecte
- [ ] Frontend : indicateur visuel clair du mode actuel (bandeau "REPLAY - 2026-03-01 14:32" vs "LIVE")
- [ ] Test : scrub à hier 14h → globe affiche l'état exact de 14h
- [ ] Test : play en x5 → avions bougent en accéléré
- [ ] Test : "Back to LIVE" → retour instantané au temps réel

Livrable : remonter dans le temps et rejouer n'importe quel moment sur le globe.

---

## Stack technique résumé

```
| Composant         | Techno                          | Rôle                           |
|-------------------|---------------------------------|--------------------------------|
| Message broker    | Redpanda                        | Bus de messages entre services |
| Cache temps réel  | Redis                           | Hot data pour le frontend      |
| Base historique   | PostgreSQL + TimescaleDB        | Persistance + time-series      |
| Index spatial     | PostGIS                         | Requêtes géographiques         |
| Knowledge graph   | SurrealDB                       | Entités + relations            |
| Stream processing | Arroyo                          | Détection patterns + alertes   |
| Query engine      | DataFusion                      | SQL cross-domain               |
| Backend API       | Axum + Tokio                    | REST + WebSocket + SSE         |
| Frontend          | React + Cesium/Resium           | Globe 3D + UI intelligence     |
| Serialization     | Apache Arrow (via DataFusion)   | Format columnar performant     |
```

## Principes

1. **Le live est sacré** — le hot path Redis → WebSocket ne doit jamais être bloqué
2. **Fallback gracieux** — si un composant tombe, le reste continue
3. **Zone-centric** — toute corrélation passe par les zones géographiques
4. **Chaque sous-phase est livrable** — résultat visible et fonctionnel à chaque étape
5. **Pas de big bang** — chaque a/b/c s'intègre sans casser l'existant
