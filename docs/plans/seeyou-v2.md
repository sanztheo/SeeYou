# SeeYou v2 — Spécification d'implémentation (révisée post-revues)

> Base de comparaison chiffrée : `docs/plans/baseline-mesures.md` (mesures locales réelles du 2026-08-10).
> Toute optimisation P0 se compare à ces valeurs, dans les mêmes conditions (backend debug, front dev server) tant qu'une mesure `--release` + `vite build` n'est pas refaite.
> Conventions imposées : `CLAUDE.md` du repo (protocole WS miroir à la main sur 3 endroits, suffixes d'unités, exports nommés / imports relatifs front, layers Cesium = composants à effet de bord `return null`, deps `.workspace = true`, `thiserror` aux frontières / `anyhow` dans l'ingest, tests colocalisés).
> Cette révision intègre les deux revues critiques (viabilité + avocat du diable). Les corrections sont inline ; les objections vérifiées comme fausses ou incomplètes sont en fin de document (« Objections écartées ou nuancées »).

---

## État d'avancement — Lots 0 et 1 livrés le 2026-08-10

Résultats détaillés et réserves de méthode : `docs/plans/resultats-lot0-lot1.md`.

| Métrique | Baseline | Après | Cible |
|---|---|---|---|
| `regions_ok` / `regions_failed` ADS-B | 1 / 42 | **43 / 0** | 43 / 0 |
| Avions par cycle | 805 / 7 / 287 | **~9 200 (± < 1 %)** | stable |
| Débit WebSocket | 31,67 MB/min | **2,39 MB/min** | ≤ 3 MB/min |
| `/fires` (bbox, cache chaud) | 17,87 MB / 1,896 s | **110 KB / 16 ms** | ≤ 1 MB / ≤ 200 ms |
| FCP | 1632 ms (dev server) | **316 ms** (build prod) | ≤ 800 ms |
| `GET /health` | 2/4 connected | **4/4 connected** | 4/4 |

**Frame p95 : cible abandonnée, pas atteinte.** Le baseline est 17,4 ms (§Diagnostic, point 1) — le plancher vsync d'un écran 60 Hz. La diviser par 2 est impossible par construction, et la métrique ne mesure pas ce qui gêne réellement l'utilisateur. Elle est remplacée par les métriques de volume et de chargement du tableau ci-dessus. Le re-test à 30 k entités (Lot 2) reste à faire avant de clore définitivement le sujet du rendu.

**Coût assumé du correctif ADS-B :** le cycle de rafraîchissement passe de 2 s à **58 s**. Plancher physique mesuré (1 req/3 s par fournisseur × 3 fournisseurs / 43 régions), pas un défaut d'implémentation. Arbitrage et options dans `resultats-lot0-lot1.md`.

**Reste à faire :** Lots 2, 3 (perf front et CPU), 4, 5 (moteur de corrélation), 6 (caméra↔avion), 7a, 7b (sources), puis les Lots 8-11 de `seeyou-p1-correlation-avancee.md`.

---

## Diagnostic

État réel, mesuré, pas estimé. Verdict d'abord : **le goulot n'est ni le rendu ni le FPS, c'est le volume de données servi et un ingest ADS-B cassé**. Le reste (graph, corrélation, caméra↔avion) n'existe quasiment pas — c'est du neuf à bâtir, pas de l'existant à optimiser.

**Effet domino central (issu des revues)** : réparer l'ingest ADS-B (P0-1) fait passer le volume avion de ~200-800 à ~25-30 k entités. Trois choses cassent mécaniquement à ce volume si on ne les traite pas dans le même lot : le wire WS (`AircraftBatch` seul ≈ 29-34 MB/min, calcul §P0-10), le `consumer_graph` (haversine O(n×m) sur 11 020 caméras **par message avion**, `consumer_graph/graph_links.rs:22-51`) et potentiellement le rendu front (baseline mesurée à ~2,6 % de la charge cible). Le plan traite les trois **dans les lots 1-2**, pas en différé.

### Ce qui est cassé, pas lent

1. **La cible « diviser le p95 de frame par 2 » est physiquement impossible.** `baseline-mesures.md:72-81` : FPS moyen 58,7, frame p95 **17,4 ms**. C'est le plancher vsync d'un écran 60 Hz ; `requestAnimationFrame` ne descend pas sous ~16,7 ms. La métrique FPS est un cul-de-sac. Les items « rendu » du front (requestRenderMode, throttle de `scene.pick`) sont réels mais n'améliorent PAS le frame-rate — ils réduisent la charge CPU/GPU **au repos** et **pendant l'interaction**, et le poids de bundle. **Attention (revue)** : le verdict « le FPS n'est pas un problème » est fondé sur ~800 avions ; il doit être re-testé à 30 k (cf. Lot 2, test de charge synthétique) avant d'être définitif.

2. **L'ingest ADS-B tourne à 2,3 % de sa capacité.** `baseline-mesures.md:150-177` : 43 points de grille (`services/src/adsb.rs:23`), **`regions_ok=1`, `regions_failed=42`**, **585 HTTP 429 en ~30 s**. Cause : `DEFAULT_POLL_INTERVAL_SECS = 2` (`server/src/config.rs:4`) × `fetch_all_regions` qui lance les 43 régions en `tokio::spawn` simultané (`services/src/adsb.rs:196-205`) = ~21,5 req/s en continu vers l'API gratuite adsb.lol, sans sémaphore, sans jitter, sans backoff, et un 429 est classé `AdsbError::Parse` donc invisible. Le README annonce 30 000 avions ; la mesure en voit **1 région sur 43** (`baseline-mesures.md:137`).

3. **Le graph n'a jamais tourné.** `baseline-mesures.md:39-54` : `docker-compose.yml` épinglait SurrealDB v2 alors que le SDK Rust est 3.x → tous les `/graph/*` en **503**. Corrigé (image `surrealdb/surrealdb:v3.2`, `docker-compose.yml:64`) mais **non commité** — à committer au Lot 0, c'est exactement le mode de défaillance qui a causé la panne initiale. Conséquence : **le moteur de corrélation P1 part de zéro table, zéro namespace**. Il n'y a pas d'existant P1 à optimiser.

4. **Trois couches renvoient 0 item.** `baseline-mesures.md:108-110` : `/maritime`, `/cyber`, `/gdelt` = 0. `maritime::ais` n'interroge que les eaux finlandaises et code `is_sanctioned: false` en dur.

5. **Deux routes attendues n'existent pas, deux étaient mal testées.** `/aircraft` et `/metar` sont réellement absents (push WS pur, `api/src/router.rs:13-58`). En revanche `/military` et `/nuclear` **existent** sous `/military-bases` et `/nuclear-sites` (`api/src/router.rs:34-41`) — les URL testées dans la baseline étaient les mauvaises, les données sont bien exposées.

### Ce qui est lent (volume, mesuré)

| Poste | Mesuré | Cause (fichier:ligne) |
|---|---|---|
| WS `Predictions` | **1240,8 KB/message**, 97 % du trafic WS | `services/aircraft_tracker.rs:149-158` broadcast **toutes** les trajectoires IMM à chaque tick ; `prediction/trajectory.rs:51` = 60 points × 6 `f64` par avion militaire |
| WS total | **31,67 MB/min par client** (à ~800 avions ; **29-34 MB/min de plus** dès P0-1, cf. P0-10) | re-sérialisation par connexion : `ws/handler.rs:23-25,74` fait `serde_json::to_string(msg)` dans la boucle de **chaque** socket ; `ws/broadcast.rs:11` broadcast `WsMessage` cloné par abonné ; aucune compression |
| `/fires` | **17,87 MB / 1,896 s / 89 552 items** | `api/src/fires.rs` renvoie tout le blob Redis, aucun bbox, aucune pagination ; décode ~18 MB de JSON **par requête** |
| `/cameras` | **3,95 MB / 11 020 items** | le handler supporte pourtant bbox+pagination (`api/src/cameras.rs:43-54`) mais le front passe `undefined` (`hooks/useAppState.ts:524-525`) et décode tout le blob Redis avant de filtrer (`api/src/cameras.rs:30`) |
| `/satellites` froid | **628,8 ms** | `satellites/propagator.rs:49-57` reconstruit `sgp4::Elements` **et** `sgp4::Constants` à chaque appel ; boucle de propagation synchrone inline dans la tâche async (`satellites/tracker.rs:50-53`), troncature **après** propagation (`:55-57`) |
| FCP | **1632 ms** | bundle mono-chunk + `vite-plugin-cesium` qui injecte un `<script src="/cesium/Cesium.js">` global mort (`vite.config.ts:86`) |

### Ce qui n'existe pas (P1/P2)

- **Corrélation** : `consumer_graph/processing.rs:29-60` ne pose d'arêtes que pour **5 tables sur 20** (aircraft, camera, traffic_segment, weather, satellite). 8 des 14 types de relation définis (`graph/ontology.rs:26-41`) — `triggered, observes, involves, connects_to, reports, near, targets, derived_from` — n'ont **aucun producteur**. `ConvergenceAlert` a un type WS (`ws/messages.rs:181`) et un renderer front mais **zéro producteur backend**.
- **Idempotence des arêtes cassée (à vérifier en premier).** `graph/relations.rs:52-64` fait `RELATE …:⟨edge_id⟩… CONTENT …` sans clause d'upsert. `located_in/covers/passes_over` n'ont pas d'`expires_at` (`graph/ontology.rs:184-186`) donc sont recréées à chaque tick → probable erreur « already exists » à chaque mise à jour. Confiance : probable, à confirmer expérimentalement avant tout le reste de P1.
- **Index SurrealDB** : un seul dans tout le schéma, `zone_name_idx` (`graph/ontology.rs:282`). Aucun index sur `in`/`out`, `expires_at`, lat/lon.
- **O(n×m) sans index spatial** : `consumer_graph/graph_links.rs:22-51` charge **toute** la table camera et fait un haversine par avion, avec un `RELATE` séquentiel par paire sous 2 km (`consumer_graph/constants.rs:5`). C'est le vrai bloqueur de mise à l'échelle de P1 **et** P2 — et il explose dès P0-1 (30 k × 11 k par tick) : garde-fou obligatoire au Lot 1.
- **API voisinage non scalable** : `api/graph_api.rs:277-365` = BFS qui, par nœud du front, interroge séquentiellement les **14** tables de relation puis fait un `get_entity` par voisin. À profondeur 2 avec 50 voisins : ~714 aller-retours SurrealDB séquentiels par clic.
- **Caméra↔avion géométrique** : `cameras/src/types.rs:4-23` n'a **ni hauteur de mât, ni résolution, ni tilt** ; `view_heading_deg`/`view_fov_deg` existent mais ne sont jamais relus par la corrélation. Aucune notion de portée, d'élévation, d'occlusion, de prédiction de passage. **La couverture réelle du cap (`view_heading_source` Provider/Parsed vs Estimated/None) n'est pas connue** — à auditer au Lot 0, c'est un prérequis P2.
- **Offre caméra 100 % routière/urbaine** : les providers réels (`cameras/src/providers/` : caltrans, nycdot, tfl, otcmap, mcp_camera, generic + streams hardcodés) ne contiennent **aucune webcam d'aéroport**. Le scénario vitrine P2 doit être cadré en conséquence (cf. P2 § Offre de caméras).

---

## P0 — Performance

Ordonné par ratio gain/effort décroissant. Chaque lot cite la preuve, le correctif, le gain chiffré attendu (cible = `baseline-mesures.md:211-220` amendée ci-dessous), l'effort, le risque de régression, **la méthode de mesure** et la vérification exacte. **Prérequis transverse : le lot P0-0 d'instrumentation doit être fait avant/après chaque item** — sans ça on ne prouve rien.

**Cibles WS amendées (correction de revue — l'ancienne cible unique « ≤ 3 MB/min » était inatteignable par la propre arithmétique du plan une fois P0-1 posé)** :

| Palier | Métrique | Cible |
|---|---|---|
| Palier A (fin Lot 1, avant P0-10) | WS total **hors** `AircraftBatch` | ≤ 1 MB/min (dont `Predictions` ≤ 50 KB/msg, flag pattern-only ON) |
| Palier B (fin P0-10, même lot) | WS total **avec** `AircraftBatch`, vue régionale (bbox ≤ ~2 000 km) **et** vue monde (cap échantillonné) | ≤ 3 MB/min |

### P0-0 — Instrumentation (garde-fou, avant tout)

- **Committer l'infra corrigée** : `docker-compose.yml` (pin `surrealdb:v3.2`) est modifié **non commité** — le committer d'abord (avec `.infisical.json` si voulu). C'est le bug d'origine du graph, ne pas le reproduire.
- **Script de capture WS** : `scripts/ws-capture.mjs`, client Node/`ws` qui compte octets et messages par `type` sur 45 s (reproduit `baseline-mesures.md:83-94`).
- **Script REST** : `curl -w '%{size_download} %{time_total}'` sur `/fires`, `/cameras`, `/satellites` — reproduit `baseline-mesures.md:98-111`.
- **Script CPU** : `scripts/cpu-sample.sh` — échantillonne `ps -o %cpu= -p $(pgrep -f 'target/.*/server')` toutes les 2 s sur 60 s et sort min/moy/max. C'est la méthode de mesure du critère « CPU serveur stable » de P0-5 (absente du plan initial, relevée en revue).
- **Log ADS-B** : `regions_failed` est déjà loggé (`services/aircraft_tracker.rs:42-45`) — s'en servir comme métrique.
- **Audit couverture heading caméras** (prérequis P2, relevé en revue) : script `jq` sur `/cameras` → distribution de `view_heading_source` (Provider / Parsed / Estimated / None) sur les 11 020 caméras. Sans ce chiffre, la couverture réelle du test de cône P2 est inconnue.
- **Versionner les sources** : créer `docs/plans/sources.md` avec, par source P3 : URL, auth, format, rate limit, licence (le plan y renvoie ; aujourd'hui ce bloc n'est versionné nulle part — le Lot 7 n'est pas exécutable sans).
- Vérif : les trois mesures reproduisent les baselines à ±10 % ; `git log` montre le commit docker-compose ; `docs/plans/sources.md` existe.

### P0-1 — Réparer l'ingest ADS-B (S→M) — ratio le plus haut : débloque le cœur de l'app

- **Preuve** : `baseline-mesures.md:150-177` ; `services/adsb.rs:23,196-205` ; `server/config.rs:4`.
- **Correctif** :
  0. **Spike de calibration 30 min d'abord** (revue : adsb.lol applique des rate limits *dynamiques* ; `regions_ok=1` sous hammering suggère un budget effectif ~0,5-1 req/s, et 43 régions/12 s ≈ 3,6 req/s reste un pari non calibré). Mesurer empiriquement le débit accepté avec sémaphore + backoff avant de figer intervalle et permis.
  1. `DEFAULT_POLL_INTERVAL_SECS` 2 → **12** comme point de départ (`server/config.rs:4`), puis **intervalle adaptatif** : allonger sur 429, resserrer prudemment sur succès. L'endpoint `/v2/mil` reste fiable et global (déjà exploité `aircraft_tracker.rs:52-60`).
  2. Dans `fetch_all_regions`, borner la concurrence avec un `tokio::sync::Semaphore` (démarrer à 4, ajuster selon le spike) + jitter aléatoire par région (`services/adsb.rs:196-205`).
  3. Distinguer le 429 : lire `response.status()` (déjà à `adsb.rs:178`), retourner un `AdsbError::RateLimited` dédié (variante `thiserror` — frontière de lib) et honorer `Retry-After` avec backoff exponentiel.
  4. **Plan B intégré (remonté de P3, revue)** : round-robin de fallback sur `adsb.fi` / `airplanes.live` (format ADSBX v2 compatible, ~1 req/s chacun) si adsb.lol refuse durablement le débit nécessaire.
  5. **Cadence militaire découplée si besoin** : `/v2/mil` est UNE requête — si la qualité IMM/T-minus se dégrade à 12 s (mesures 6× plus espacées, détection de pattern tous les 5 updates ≈ 60 s), extraire le poll militaire dans sa propre boucle à 5 s (0,2 req/s, négligeable). Décision après mesure au Lot 6.
  6. **Garde-fou `consumer_graph` (obligatoire, revue)** : au même commit, brancher un filtre d'admission côté consumer (env `GRAPH_AIRCRAFT_FILTER`, défaut `military_below_3000m`) pour que la corrélation O(n×m) actuelle ne reçoive pas 30 k avions × 11 k caméras par tick avant la refonte du Lot 4.
- **Gain attendu** : `regions_failed` 42 → **0** *si la calibration le confirme* (sinon : max de régions servies dans le budget mesuré, fallback multi-fournisseurs) ; nombre d'avions stable au lieu d'osciller 805/7/287 ; suppression des 585 × 429.
- **Effets de volume induits (chiffrés, revue)** : `AircraftBatch` ≈ 25-30 k × ~230 o ≈ 5,8-6,9 MB/broadcast → **traité par P0-10 dans le même lot** ; `cache::aircraft::set_aircraft` (blob Redis ~7 MB/12 s — acceptable, à mesurer) ; fallback Postgres `insert_positions` 30 k lignes/12 s **uniquement si bus down** (`aircraft_tracker.rs:107-130` : gaté par `!published` ; P0-9 UNNEST le rend tenable) ; bus Redpanda 60 chunks de 500/12 s (nominal) ; mémoire `PredictionService` inchangée (militaire seulement).
- **Risque produit (revue)** : adsb.lol annonce une future API key obtenue en *feedant* le réseau — dépendance stratégique. Contingence : fallback multi-fournisseurs (point 4) + décision feeder/clé à acter hors implémentation.
- **Vérif** : `cargo run -p server` puis `regions_failed=0` (ou valeur calibrée documentée) dans le log `fetched aircraft from regional grid` ; compter les 429 sur 60 s (attendu 0) ; `scripts/cpu-sample.sh` stable.

### P0-2 — Dégonfler `Predictions` (M) — 97 % du trafic WS actuel

- **Preuve** : `baseline-mesures.md:90-94` (1240,8 KB/msg ≈ ~180 trajectoires × ~6,8 KB) ; `services/aircraft_tracker.rs:149-158` (broadcast intégral chaque tick) ; `prediction/trajectory.rs:23-77` (60 pts × 6 `f64`, `pattern`, `model_probabilities[4]`).
- **Correctif** (trois leviers) :
  1. **Réduire le payload par trajectoire** (mécanique, certain) : passer le pas de 5 s à 15 s (60→20 points) — constantes `PREDICTION_HORIZON_SECS`/`PREDICTION_STEP_SECS` dans **`prediction/src/service.rs:11-14`** (correction de revue : `trajectory::generate` ne fait que les recevoir en paramètres) ; arrondir lat/lon à 5 décimales et `alt_m` à l'entier ; retirer `dt_secs` (dérivable de `index × step`) et fusionner `sigma_xy_m`/`sigma_z_m` en un taux de croissance par trajectoire. **Miroirs à éditer ensemble** : `prediction/src/trajectory.rs:8-29` (structs) + `frontend/src/types/aircraft.ts` + `components/Aircraft/AircraftPredictions.tsx`.
  2. **Ne diffuser que les trajectoires « pattern »** : filtrer sur `pattern.is_some()` avant `broadcaster.send` (`aircraft_tracker.rs:151-158`). **Décision produit tranchée avant implémentation (revue)** : flag `PREDICTIONS_PATTERN_ONLY`, **défaut ON**. La gate reflète les deux états du flag (voir Gain).
  3. **Prédiction pleine résolution à la demande** — route `GET /aircraft/:icao/predict?horizon=&step=` (les deux paramètres passent à `trajectory::generate`, qui les prend déjà en arguments). **Spécification du partage d'état (manquait, revue)** :
     - `PredictionService` est aujourd'hui une **variable locale** de la tâche tracker (`let mut predictor`, `aircraft_tracker.rs:32`) — inatteignable depuis un handler axum.
     - Créer `SharedPredictor = Arc<tokio::sync::RwLock<PredictionService>>`, construit dans `main`, passé au tracker (changement de signature de `run_aircraft_tracker`) **et** ajouté à `AppState` (`server/src/app_state.rs:5-12`) avec `impl FromRef<AppState> for SharedPredictor`. Le tracker prend le write-lock le temps de `process_batch` (~ms), le handler un read-lock.
     - Ajouter `PredictionService::get_trajectory(&self, icao, horizon, step) -> Option<PredictedTrajectory>` (rejoue `trajectory::generate` sur l'état IMM existant).
     - **Stratégie civile explicite (manquait, revue)** : `process_batch` skippe tout non-militaire (`prediction/service.rs:70-73`) et le tracker pré-filtre `is_military` (`aircraft_tracker.rs:134-136`) → il n'existe AUCUN état IMM pour un avion civil. Décision : **cold-start ConstantVelocity** — le service maintient un `HashMap<icao, LastKinematics>` (lat, lon, alt, speed, heading, vertical_rate, ts) alimenté à chaque batch pour *tous* les avions (léger : ~60 o × 30 k ≈ 1,8 MB), et la route projette en ligne droite + taux vertical pour un civil. Latence nulle, honnêteté affichée (`model: "cv_coldstart"` dans la réponse vs `"imm"`).
- **Gain (gate à deux niveaux, revue)** : 1240,8 KB → **≤ 450 KB** avec le levier 1 seul (flag OFF) ; **≤ 50 KB** avec pattern-only ON (défaut). La cible Palier A « WS hors AircraftBatch ≤ 1 MB/min » suppose le défaut ON. *(L'ancienne promesse « ≤ 3 MB/min une fois combiné à P0-5 » est retirée : elle reposait sur un deflate indisponible et sur le volume avion cassé.)*
- **Risque** : pattern-only change le layer prédictions militaires — réversible via le flag ; la route on-demand compense (trajectoire du clic toujours disponible).
- **Vérif** : `cargo test -p ws -p prediction` ; script WS P0-0 → `Predictions` < 50 KB (flag ON) puis < 450 KB (flag OFF, test ponctuel) ; `curl /aircraft/<icao_mil>/predict` renvoie l'IMM, `<icao_civil>` renvoie le cold-start ; `npm run build`.

### P0-3 — `/fires` : bbox + pagination + cache décodé (S) — 17,87 MB → ≤ 1 MB

- **Preuve** : `baseline-mesures.md:100` ; `api/src/fires.rs:1-22` (renvoie tout, aucun filtre, décode le blob par requête).
- **Correctif** : ajouter `Query<BboxQuery>` (south/west/north/east/limit) à `get_fires`, filtrer côté handler comme `/cameras` (`api/src/cameras.rs:43-54`). **Correction de revue** : copier le motif `/cameras` tel quel ferait décoder ~18 MB de JSON par requête (déjà 212 ms pour le blob 8× plus petit de `/cameras`) — ajouter un **cache mémoire process de la `Vec` décodée** (`tokio::sync::RwLock<Option<(Instant, Vec<Fire>)>>`), invalidé au rythme du refresh fires (1800 s, `server/config.rs`). Le coût par requête devient filtre + sérialisation du sous-ensemble. Le même levier reste ouvert pour `/cameras` si besoin.
- **Gain** : 17,87 MB → ≤ 1 MB ; 1,896 s → **≤ 200 ms sur cache chaud** (cible mesurée à chaud ; le décodage froid n'arrive qu'une fois par refresh).
- **Risque** : faible ; un feu hors viewport n'est pas affiché de toute façon.
- **Vérif** : `curl -s -w '%{size_download} %{time_total}' 'localhost:3001/fires?south=40&west=-5&north=52&east=10'` < 1 MB, < 200 ms au 2ᵉ appel.

### P0-4 — `/cameras` : le front envoie enfin le bbox (S) — 3,95 MB → ≤ 500 KB

- **Preuve** : `hooks/useAppState.ts:524-525` (`fetchCamerasChunked(undefined, …)`) ; backend prêt (`api/src/cameras.rs:43-54`).
- **Correctif** : dériver le bbox depuis `viewer.camera.computeViewRectangle()`, refetch sur `moveend` (debounce ~500 ms), passer le bbox à `fetchCamerasChunked`. **Cas limites spécifiés (manquaient, revue)** :
  - `computeViewRectangle()` renvoie `undefined` quand l'horizon est visible (vue inclinée/dézoomée) → **fallback : conserver le dernier bbox valide** ; si aucun n'existe encore, fetch avec `limit` seul (comportement actuel borné).
  - **Clamp de surface** : bbox de largeur > 90° de longitude = « vue monde » → même traitement que `undefined` (fetch limité), sinon le bbox « optimisé » redevient un fetch monde.
- **Gain** : 3,95 MB → ≤ 500 KB (cible `:217`).
- **Risque** : refetch trop fréquent au drag → debounce + cache client.
- **Vérif** : onglet réseau, `/cameras?south=…` < 500 KB ; test manuel vue globe inclinée (pas de fetch monde répété) ; `npm test` (cameraService).

### P0-5 — WS : sérialiser une fois, diffuser un `Arc<str>` (M) — deflate retiré

- **Preuve** : `ws/handler.rs:23-25,74` (re-`to_string` par socket) ; `ws/broadcast.rs:11,30-34` (clone `WsMessage` par abonné).
- **Correctif** : `Broadcaster` diffuse un `Arc<str>` (ou `bytes::Bytes`) **encodé une seule fois** dans `send()` ; le type devient `broadcast::Sender<Arc<str>>` ; `handler.rs` fait `Message::Text((*frame).to_string())` — un clone de `String` par client au lieu d'une re-sérialisation serde complète. Le protocole reste JSON (aucun impact miroir).
- **Décision tranchée (revue — l'ancien levier « évaluer permessage-deflate » est retiré)** : vérifié dans `Cargo.lock` — axum est en **0.7.9** (la couche WS d'axum 0.7 n'expose que `max_frame_size`/`max_message_size`/`accept_unmasked_frames`, aucune négociation d'extension) et la pile tungstenite liée n'embarque pas permessage-deflate. **Le facteur ~5× wire n'existe pas sans changer de stack WS.** La réduction wire est reportée sur P0-10 (tuiles + quantification). Si, après P0-10, le budget wire reste insuffisant : alternative actée = MessagePack/CBOR (schema-free, miroir front = décodeur binaire, pas de codegen) — pas deflate.
- **Gain** : coût CPU de fanout O(1) au lieu de O(clients). Gain **CPU**, pas wire — annoncé honnêtement.
- **Méthode de mesure (manquait, revue)** : `scripts/cpu-sample.sh` avec 1 puis 3 onglets connectés, avant/après ; le %CPU ne doit plus croître ~linéairement avec les clients pendant les broadcasts.
- **Vérif** : `cargo test -p ws` ; cpu-sample 3 onglets ≈ 1 onglet (±20 %) ; le script WS confirme un wire inchangé (ce levier n'y touche pas).

### P0-6 — Bundle : retirer le `Cesium.js` mort + `React.lazy` sur les panneaux (S)

- **Preuve** : `vite.config.ts:86` (`cesium()` injecte `<script src="/cesium/Cesium.js">`, 5,5 MB / 1,69 MB gzip, zéro référence à `window.Cesium`) ; FCP 1632 ms (`baseline-mesures.md:123`).
- **Correctif** : hook `transformIndexHtml` minimal retirant le tag global ; `React.lazy` + `Suspense` sur les **9 sections `<SidePanel>`** (`App.tsx:398-504` — correction de revue : il n'y a pas « 10 panneaux ») + `GraphView`, et, si la mesure du bundle le justifie, les `DraggablePanel` de détail.
- **Gain** : FCP → ≤ 800 ms (cible `:218`), JS initial réduit. **Méthode de mesure** : `npm run build && npm run preview` + FCP via Lighthouse ou Playwright (`performance.getEntriesByName('first-contentful-paint')`) — jamais sur le dev server.
- **Risque** : nul si les imports ESM Cesium restent.
- **Vérif** : `grep -c "cesium/Cesium.js" dist/index.html` = 0 ; FCP mesuré ≤ 800 ms.

### P0-7 — Rendu à la demande + throttle du pick (M) — **repos/interaction, PAS le FPS**

- **Preuve** : aucune prop `requestRenderMode` sur `<ResiumViewer>` (`components/Globe/Globe.tsx:367-379`) ; `scene.pick` sans throttle sur `pointermove` (`Aircraft/AircraftInteractions.ts`, `Satellite/SatelliteLayer.tsx`).
- **Correctif** : `requestRenderMode` + `maximumRenderTimeChange={Infinity}`, avec `viewer.scene.requestRender()` explicite à chaque mutation réelle (batch billboards, flyTo, basemap). Throttler les deux handlers `scene.pick` à ~1 pick/frame (rAF-gate), comme `useViewerCallbacks.ts` throttle déjà à 80 ms.
- **Gain** : CPU/GPU au repos et en arrière-plan réduits ; jank de survol supprimé. **N'améliore pas le p95** (plancher vsync) — annoncé honnêtement. **Méthode de mesure** : Chrome Task Manager / `performance.now()` sur onglet en arrière-plan avant/après.
- **Risque** : oublier un `requestRender()` → carte figée. Auditer chaque callsite qui pousse des positions hors cycle Cesium.
- **Vérif** : `npm test` ; QA Playwright (la carte bouge après un tick WS) ; baisse de charge mesurée onglet arrière-plan.

### P0-8 — SGP4 : cacher `(Elements, Constants)`, propager en `spawn_blocking`, trier avant (M)

- **Preuve** : `satellites/propagator.rs:48-88` (re-init complète par appel) ; `satellites/tracker.rs:50-57` (boucle sync inline, troncature après). `/satellites` froid 628,8 ms (`baseline-mesures.md:103`).
- **Correctif (précisé, revue)** : cacher **`(Elements, Constants)` par `norad_id`** — pas `Constants` seul : `datetime_to_minutes_since_epoch` est une méthode d'`Elements` (`propagator.rs:59-62`) et `orbit_period_min` dérive d'`elements.mean_motion` (`propagator.rs:76`). Un `struct CachedSat { elements, constants }` (ou tuple) invalidé au refresh TLE 6 h (`tracker.rs:38`) ; n'appeler que `.propagate(minutes)` par tick ; envelopper la propagation dans `tokio::task::spawn_blocking` ; trier/tronquer **avant** de propager (`tracker.rs:55-57`).
- **Gain** : plus de reconstruction SGP4 par tick ; runtime Tokio non gelé toutes les 60 s. **Prérequis obligatoire avant les débris (63 000 objets, P3).** **Méthode de mesure** : log `tracing` du timing d'un cycle de propagation avant/après.
- **Risque** : invalidation du cache au refresh TLE.
- **Vérif** : `cargo test -p satellites` ; timing de cycle loggé divisé (attendre ≥ ×3 froid).

### P0-9 — Postgres : UNNEST batch sur les 7 tables N+1 (S)

- **Preuve** : `db/src/satellites.rs:12-35` (INSERT par ligne en boucle), idem `gdelt, fires, seismic, maritime, cyber, space_weather` ; bon patron déjà présent `db/src/aircraft.rs:12-63` (UNNEST, chunks de 1000).
- **Correctif** : répliquer le patron UNNEST d'`aircraft.rs` dans les 7 fichiers. Mécanique.
- **Gain** : des centaines d'aller-retours séquentiels → 1 appel batché. Compte en fallback bus-down (30 k lignes/12 s post-P0-1 : c'est ce qui le rend tenable) et pour `consumer_postgres`.
- **Vérif** : `cargo test -p db`.

### P0-10 — `AircraftBatch` à 30 k : abonnement par tuiles + quantification (L) — **PROMU AU LOT 1** (correction majeure de revue)

- **Preuve arithmétique** : post-P0-1, 25-30 k avions × ~230 o JSON/avion (`AircraftPosition`, `ws/messages.rs:83-95` : 11 champs, cohérent avec la baseline ~230 o/avion) = 5,8-6,9 MB par broadcast toutes les 12 s ≈ **29-34 MB/min** pour `AircraftBatch` seul — 10× la cible. *L'ancien plan gatait ce correctif sur « seulement si la mesure dépasse la cible » alors qu'elle la dépassera mécaniquement : il est donc intégré au Lot 1, pas différé.*
- **Correctif** (v1 sans delta — le full-state par tuile fait office de keyframe permanent, zéro risque de désync) :
  1. **Quantification** : lat/lon arrondis à 5 décimales (~1,1 m), `altitude_m`/`speed_ms`/`heading`/`vertical_rate_ms` à 1 décimale → ~230 → ~150-160 o/avion. Nécessaire mais pas suffisant (30 k × 155 o ≈ 22 MB/min).
  2. **Tuiles fixes partagées** : grille 15°×15° (288 tuiles, ~60 actives). Le serveur groupe les avions par tuile et **encode chaque tuile une seule fois** (`Arc<str>` de P0-5) ; le canal broadcast porte `(tile_id, frame)` et chaque connexion ne forwarde que ses tuiles abonnées (comparaison d'entier — le fanout reste O(1) sérialisation). *Choix « tuiles fixes » plutôt que bbox par client : un filtre par client imposerait une re-sérialisation par client et détruirait P0-5 (cf. Objections nuancées §2).*
  3. **Nouveau message client→serveur `SetViewport { south, west, north, east }`** — la boucle `handle_socket` lit déjà les frames entrants (`ws/handler.rs:65+`). Miroir 3 endroits obligatoire (CLAUDE.md). À l'abonnement d'une tuile, le prochain tick la sert entière (keyframe implicite).
  4. **Vue monde = cap échantillonné** : sans `SetViewport` (ou bbox > hémisphère), le serveur sert un agrégat plafonné (env `WORLD_VIEW_AIRCRAFT_CAP`, défaut 3 500, priorité militaire + basse altitude) ≈ 3 500 × 155 o × 5/min ≈ 2,7 MB/min.
  5. Front : envoyer `SetViewport` sur `moveend` (même debounce que P0-4) ; fusionner les tuiles reçues dans le `Map` d'état existant ; purger les avions des tuiles désabonnées.
- **Gain** : vue régionale ≈ volume ∝ avions visibles (grande métropole ~2-3 k avions ≈ 1,9-2,8 MB/min) ; vue monde ≤ ~2,7 MB/min. **Palier B tenu : ≤ 3 MB/min dans les deux modes.**
- **Risque** : complexité protocole (1 variante WS + état d'abonnement par connexion) ; purge front incorrecte → avions fantômes hors viewport (couvert par TTL client existant). Delta/keyframe classique reste **différé** : ne l'engager que si la mesure post-tuiles dépasse encore le palier B.
- **Vérif** : `ws-capture.mjs` étendu (envoie un `SetViewport` régional puis monde) → ≤ 3 MB/min dans les deux modes ; `cargo test -p ws` (roundtrip `SetViewport`) ; `npm run build`.

---

## P1 — Moteur de corrélation (tracker de liens)

Pièce maîtresse après la perf. Aujourd'hui bâti à ~15 % et non scalable. On repart d'un graph **vide** (`baseline-mesures.md:53-54`).

### Modèle de relation

Une arête = `from —relation→ to` avec attributs standardisés (le builder existe déjà, `graph/relations.rs:69-95`) :

| Attribut | Type | Règle |
|---|---|---|
| `relation` | enum (14 types, `ontology.rs:26-41`) | direction portée par le type (voir catalogue) |
| `score` | `f64` **normalisé 0-1** | **à corriger** : aujourd'hui `monitored_by`=distance_km brute, `affected_by`=visibility_m brute (`graph_links.rs:33,88`), unités incomparables. Normaliser par type. |
| `timestamp` | ISO-8601 string | instant de calcul |
| `expires_at` | ISO-8601 string | fenêtre de validité ; **à généraliser** aux relations éphémères aujourd'hui sans TTL |
| `source` | string | crate/règle productrice (traçabilité) |
| `explain` | objet | pourquoi (distances, seuils franchis) — rendu dans l'UI |

**Direction & sémantique** : `aircraft→monitored_by→camera`, `subject→affected_by→weather`, `entity→located_in/flies_over→zone`, `satellite→passes_over→zone` (éphémère, voir plus bas), `seismic→near→nuclear_site`, `vessel→connects_to→landing_point`, `cyber→hosted_in→zone` (re-sémantisé, voir catalogue #8), `cyber→derived_from→gdelt_event`.

**Correction préalable obligatoire (P1-0, à vérifier en premier)** : idempotence des `RELATE`. `graph/relations.rs:52-64` n'a pas de clause d'upsert. **Reproduire** : lancer `consumer_graph` deux fois sur la même entité et vérifier dans les logs l'erreur « already exists » sur `located_in` (sans `expires_at`, `ontology.rs:184-186`). Correctif — deux formes candidates à valider expérimentalement (**correction de revue : `ON DUPLICATE KEY UPDATE` n'existe pas sur le statement `RELATE`, c'est une clause d'`INSERT`**) : (a) `INSERT RELATION INTO <rel> { id, in, out, … } ON DUPLICATE KEY UPDATE …` ; (b) `UPSERT` de l'arête à `edge_id` déterministe (le `fnv1a64` de `relations.rs:126-142` est déjà conçu pour ça). Valider la forme retenue sur SurrealDB v3.2 avant d'écrire une seule nouvelle relation.

### Anti-bruit : seuils de sévérité et base rates (nouveau — exigé par revue)

Sans modèle de sévérité, le graphe devient une machine à bruit (USGS M2.5+ ≈ 40-60 séismes/jour ; 89 552 feux ; toute zone urbaine « converge » en permanence). Seuils par domaine, constantes nommées dans `consumer_graph`, configurables par env :

| Domaine | Seuil d'admission corrélation |
|---|---|
| Séisme | **M ≥ 4,5** (sous ce seuil : nœud seul, pas d'arête `near`) |
| Feux | confidence haute **et** FRP ≥ seuil (top ~5 % énergie) |
| Avion (near base / monitored_by) | `is_military` pour `near→military_base` ; **altitude < 3 000 m** pour `monitored_by` (un avion en croisière n'est visible par aucune caméra — élimine ~90 % des 30 k du pré-filtre) |
| Météo | `visibility_m < 1000` (existant, conservé) |
| Cyber | IOC actifs récents uniquement (fenêtre 24 h) |

### Catalogue des relations calculables (domaine par domaine)

| # | Relation | Règle de calcul | Fenêtre | Statut |
|---|---|---|---|---|
| 1 | `aircraft→flies_over→zone` | point-in-polygon zone | TTL 180 s | existe (`processing.rs:31`) |
| 2 | `aircraft→monitored_by→camera` | **P2** (cône FOV + critère pixel, cf. P2), remplace le haversine 2 km ; **top-K=3 caméras/avion** (les mieux placées), admission alt < 3 000 m | TTL 180 s | à refondre |
| 3 | `aircraft/traffic→affected_by→weather` | visibility_m < 1000 & même zone | TTL 180 s | existe (`graph_links.rs:56-159`) |
| 4 | `camera/traffic/weather→located_in→zone`, `weather→covers→zone` | zone lookup | quasi-statique → **upsert sans TTL** | existe (`processing.rs:34-46`) |
| 4b | `satellite→passes_over→zone` | zone lookup | **éphémère** (correction de revue : un LEO traverse une zone en ~2 min ; l'upserter sans TTL graverait « l'ISS passe au-dessus de Paris » pour toujours) → `expires_at` = TTL 120-300 s (ou fin de passage dérivée SGP4), sweep comme `flies_over` | à corriger (`processing.rs:52-55`) |
| 5 | `seismic_event(M≥4,5)→near→nuclear_site` / `military_base` | haversine < 150 km | TTL long | **neuf** |
| 6 | `vessel→near→cable` / `connects_to→landing_point` | distance point↔géométrie câble ; proximité landing_point. **Cadré côtier** (revue : AISStream = AIS terrestre, couverture ~40-75 km des côtes ; le hauturier exigerait de l'AIS satellitaire payant — trou documenté, pas comblé) | TTL moyen | **neuf** |
| 7 | `fire_hotspot(FRP haut)→affected_by→weather` ; `→near→military_base/nuclear_site` | patron low-vis + haversine | TTL moyen | **neuf** |
| 8 | `cyber_threat→hosted_in→zone` (tier pays) ; `cyber_threat→derived_from→gdelt_event` | **re-sémantisé (revue)** : la géoloc d'un C2 dit où il est **hébergé**, pas ce qu'il cible → `hosted_in`, pas `targets`. `derived_from` **uniquement sur correspondance d'entité nommée** (IOC/domaine cité dans l'article GDELT) — la co-occurrence pays+fenêtre sur ~100 k événements GDELT/jour garantirait la corrélation fallacieuse | TTL moyen | **neuf** |
| 9 | `gdelt_event→located_in→zone` ; `gdelt→involves→military_base/nuclear_site` | zone + haversine | TTL moyen | **neuf** |
| 10 | `aircraft(is_military)→near→military_base` | haversine < R | TTL 180 s | **neuf** |
| 11 | **ConvergenceAlert** | **scoring par rareté, pas comptage brut (revue)** : par zone, baseline glissante 7 j du nombre de domaines actifs (seuils §anti-bruit) ; alerte si écart significatif (ex. ≥ 3 domaines actifs vs médiane 0-1) avec **hystérésis** (S_on/S_off + durée min) pour que l'alarme s'éteigne → `WsMessage::ConvergenceAlert` | périodique | **neuf, 0 % bâti** |

Priorité d'implémentation : #10, #5, #7 (haversine simple), #4b (correction TTL), #6 (côtier), puis #8/#9 (après tier pays des zones, Lot 7a), puis #11 (au-dessus des autres).

### Architecture d'exécution (le point critique de scalabilité)

Le pipeline actuel est **le bloqueur** : `consumer_graph` traite chaque entité séquentiellement et recharge/clone toute la table candidate par message (`graph_links.rs:22`, cache TTL 2 s qui ne limite que la fréquence de requête, pas le clone/scan). Refonte :

1. **Provenance de l'état (spécifié — manquait, revue)** : le consumer reçoit des messages bus **par entité**, pas des snapshots. Décision : **accumulation in-memory dans `consumer_graph`** — un `HashMap` par domaine corrélable avec TTL de péremption par entité (aligné sur la cadence du domaine : avions ~36 s = 3 ticks, caméras ~900 s), depuis lequel les R-trees sont reconstruits à intervalle fixe. Pas de lecture des blobs Redis (couplage nouveau évité), pas de snapshots bus (protocole inchangé).
2. **Index spatial en mémoire** : un `rstar` R-tree (MIT/Apache) par domaine, reconstruit à la cadence du domaine. Requête `locate_within_distance` (grossier) puis test exact. Bench rstar publié : NN sur 100 k points ≈ 1,3 µs ; 30 k avions × requête rayon ≈ ~30 ms/passe — **à re-mesurer localement au Lot 4** (gate ci-dessous). Le FOV caméra n'étant pas un cercle, filtrage grossier R-tree sur le point puis test de cône exact (P2).
3. **Corrélation event-driven, pas d'horloge plus rapide que la donnée (revue)** : la passe aircraft↔camera se déclenche **à l'arrivée d'un batch avion** (12 s post-P0-1) — corréler toutes les 2-5 s recalculerait 2-6× sur données identiques. Domaines lents : 30-60 s.
4. **Budget d'écriture borné (nouveau — exigé par revue)** : admission alt < 3 000 m + top-K=3 caméras par avion (les plus proches dans le cône) ⇒ cardinalité max ~3 arêtes/avion basse altitude. **Batcher les `RELATE`/upserts** en une requête multi-statements par passe (chunks de ~200).
5. **Gate de bench écriture (bloque le Lot 5)** : sur SurrealDB v3.2 local, mesurer le débit d'arêtes soutenu. Cibles provisoires : **≥ 1 000 arêtes/s soutenues, p95 d'un batch de 200 < 250 ms, consumer lag stable**. Si la cible n'est pas tenue, réduire K/cadence avant d'ajouter des relations.
6. **Concurrence bornée** : `buffer_unordered`/`join_all` au lieu du `for … .await` séquentiel.

Placement : un module `consumer_graph/src/correlation.rs` (le crate a déjà tout le contexte bus + client graph). Pas de nouveau crate.

### Schéma SurrealDB & index

- Tables déjà définies (`ontology.rs`). **Ajouts d'index** (dans `migrate()`, patron `DEFINE INDEX IF NOT EXISTS`, `ontology.rs:282`) — **correction de revue : deux index mono-colonne par relation, pas un composite `(in, out)`** : `get_incident_relations` filtre `WHERE in = X OR out = X` (`graph/src/queries.rs:95`) et un composite ne servirait que la branche `in` :
  - `DEFINE INDEX <rel>_in ON TABLE <rel> COLUMNS in;` **et** `DEFINE INDEX <rel>_out ON TABLE <rel> COLUMNS out;` pour chaque relation.
  - `DEFINE INDEX <rel>_expires ON TABLE flies_over|monitored_by|affected_by|near|passes_over COLUMNS expires_at;` (accélère `sweep_expired_relations`, `relations.rs:97-124`).
- **`expires_at` généralisé** : TTL+sweep pour les éphémères (proximité, survol, **passes_over**) ; upsert sans TTL réservé aux vrais statiques (`camera→located_in→zone`).
- **Incohérence d'unité dormante (revue)** : l'ontologie définit `velocity_kmh` sur la table satellite (`ontology.rs:90`) alors que tout le wire est en `velocity_km_s` — corriger en touchant le schéma au Lot 4 (renommer le champ, mettre à jour le producteur consumer).
- Tier **pays** dans les zones (Lot 7a, `graph/src/zones.rs`) pour ancrer cyber/gdelt/military — **état réel corrigé (revue)** : `backend/data/zones/global_zones.geojson` contient `airport`(20)/`city`(32)/`region`(8), **zéro zone pays** (et aucun « continent » contrairement à ce que disait le plan initial). Actif utile : les 20 zones aéroport polygonales existantes servent de pré-filtre approche/décollage pour P2 avant même le seed OurAirports.

### Endpoints API

- Conserver les 4 routes `/graph/*` (`router.rs:42-54`).
- **Optimiser `get_neighbors_graph`** (`graph_api.rs:277-365`) : (a) map statique `table → relations pertinentes` au lieu du fan-out sur les 14 tables ; (b) `join_all` sur les requêtes restantes ; (c) cache snapshot court TTL par `(table,id,depth)`.
- **Corriger `search_graph`** (`graph_api.rs:199-250`) : index full-text SurrealDB + filtre poussé en SurrealQL (supprime le cap 250 lignes).
- Trier les voisins par `score` décroissant.
- **Méthode de mesure** : `curl -w '%{time_total}'` sur `/graph/neighbors/...` avec graph peuplé (cible < 200 ms) ; compter les requêtes SurrealDB par clic via log debug (cible : ≤ 1 + relations pertinentes, vs ~714).

### Protocole WS (miroir à la main — 3 endroits)

**Décision : P1 n'ajoute AUCUNE nouvelle variante de broadcast.** `ConvergenceAlert` existe déjà (`ws/messages.rs:181` + `frontend/src/types/ws.ts`) — il ne manque que le producteur backend (#11). Les relations se naviguent en REST `/graph/*`. *(La seule variante WS nouvelle du plan est `SetViewport` de P0-10, client→serveur, Lot 1.)*

> Rappel miroir (CLAUDE.md) : éditer **les 3** : `backend/crates/ws/src/messages.rs` + les deux unions de `frontend/src/types/ws.ts`. Champs `snake_case`, variantes `PascalCase`, pas de `rename_all`.

### UX de navigation

- Existant réutilisable : `RelationLines.tsx`, `GraphView.tsx`, `useGraphNavigation.ts`.
- **À câbler** : `GraphEdge.tsx` ne rend jamais `edge.attributes` — afficher `score` normalisé + `explain` + `timestamp`. Trier par score.

---

## P2 — Caméra ↔ avion

Objectif : cliquer un avion et savoir quelle(s) caméra(s) le voi(en)t ou vont le voir. **Réécrit en version honnête après revue** : la promesse est reformulée en deux niveaux optiques distincts — **détection** (un point mobile identifiable comme avion par son mouvement) et **reconnaissance** (une forme d'avion) — avec un critère pixel explicite par caméra. La fenêtre utile est plus étroite que la v1 du plan ne l'annonçait.

### La chaîne géométrique (4 étages, chacun peut bloquer)

Soit caméra `C(lat_c, lon_c, h_c)` et avion `A(lat_a, lon_a, alt_a)`.

1. **Géodésie.** Azimut initial C→A (`bearing_deg`) ; distance horizontale `d_h` (haversine, `consumer_graph/geo.rs`) ; distance oblique `d_slant = sqrt(d_h² + (alt_a − h_c)²)` ; élévation `elev = atan2(alt_a − h_c, d_h)` corrigée de la chute d'horizon.
2. **Appartenance au cône FOV.**
   - **Horizontal** : `|bearing_deg − view_heading_deg| ≤ view_fov_deg/2`. Les deux champs existent (`cameras/types.rs:16-18`) et ne sont pas relus aujourd'hui (`graph_links.rs`) — câblage.
   - **Vertical** : nécessite vfov et tilt, absents du modèle. Heuristique **corrigée (revue)** : `vfov ≈ hfov × 3/4` pour les caméras de trafic 4:3 (l'ancien `9/16` sous-estimait de ~25-33 % la membership verticale) ; ratio par source si connu. Tilt supposé 0-10°. **Marqué heuristique** dans `explain`.
3. **Critère pixel (remplace la « taille angulaire » qualitative — exigé par revue).**
   - `px = taille_angulaire_deg × (resolution_h_px / hfov_deg)`, avec `taille_angulaire_deg = envergure / d_slant × 180/π`.
   - **Seuils (critères de Johnson)** : détection ≥ **2 px**, reconnaissance ≥ **8 px**.
   - **Envergure par type d'appareil** via tar1090-db (Lot 7a — synergie déjà planifiée), défaut conservateur 36 m (narrowbody) si type inconnu — pas 60 m : le widebody est l'exception, pas la règle.
   - **Nouveau champ modèle** : `resolution_px: Option<u32>` sur la caméra (`cameras/src/types.rs` + miroir front), défaut conservateur 640. Sans lui, la limite pixel n'est pas calculable par caméra.
   - Chiffres de référence (640 px / 60° = 10,7 px/°) : A320 (36 m) à 3 km → 7,3 px (limite reconnaissance) ; à 8 km → 2,8 px (point) ; à 10 km → 2,2 px (limite détection). Widebody (60 m) à 5 km → 7,3 px.
4. **Borne de portée visuelle** = `min(` horizon optique `d ≈ 3,86·√(h_c[m])` km avec réfraction, visibilité METAR (heuristique, voir plus bas), limite pixel `)`.

**Fenêtre honnête (remplace « ~5-10 km pour un appareil reconnaissable », faux pour un narrowbody)** :
- **Reconnaissance d'une forme d'avion** : ≤ ~3-4 km oblique pour un narrowbody, ≤ ~5-6 km pour un widebody (à 640 px/60°).
- **Détection d'un point mobile** : ≤ ~10-12 km, bornée par horizon/METAR.
- La croisière (alt > ~3 km) reste hors fenêtre dans tous les cas → filtre d'admission P1 (§anti-bruit).

### Offre de caméras — réalité assumée (nouveau — exigé par revue)

- La flotte actuelle est **100 % routière/urbaine** (providers vérifiés : Caltrans, NYC DOT, TfL, OpenTrafficCamMap, Paris opendata, mcp.camera, streams hardcodés). **Aucune webcam d'aéroport.**
- **Pitch vitrine recadré en conséquence** : « autoroutes sous les axes d'approche » — Caltrans près de LAX/SFO fonctionne aujourd'hui, c'est démontrable dès le Lot 6. Les 20 zones `airport` du geojson servent de pré-filtre approche/décollage.
- **Avant toute démo « webcam d'aéroport »** : sourcer des webcams orientées aviation (Lot 7b : webcams officielles d'aéroports en opendata, state-DOT près des hubs). Windy est écarté du chemin critique (ToS/prix, cf. P3).
- **Métrique de sortie du Lot 6 (revue)** : « % de caméras avec cap fiable (Provider/Parsed) » — mesuré par l'audit du Lot 0, publié dans la Revue du lot. Le test de cône ne s'applique qu'à cette fraction ; les autres tombent en mode proximité.

### Influences externes

- **METAR** (`ws/messages.rs:109-122`) : la borne `visibility_m` est la visibilité **horizontale de surface à la station** — la visibilité oblique vers un objet en altitude diffère (brouillard mince ≠ couche de brume). Idem `ceiling_ft`, mesuré à la station. **Documentées comme heuristiques** (revue) : elles **pondèrent le score de confiance** plutôt que de couper binairement quand elles sont le facteur limitant ; `ceiling_ft` bas avec avion au-dessus de la couche → forte pénalité (quasi-bloquant), affiché dans `explain`.
- **Jour/nuit** : de nuit, seuls feux de navigation/strobe → drapeau « fiabilité réduite ».
- **Occlusion terrain** : nécessite un DEM côté serveur. Hors MVP ; roadmap Copernicus DEM (P3).

### Prédiction de passage

- Réutiliser le crate `prediction` (IMM-EKF) via la route `GET /aircraft/:icao/predict` (P0-2 levier 3) : IMM pour le militaire suivi, **cold-start ConstantVelocity** pour le civil (spécifié en P0-2 — plus de contradiction avec le filtre `is_military`).
- Projeter les points prédits, tester chacun contre le cône + critère pixel de chaque caméra candidate (pré-filtre R-tree par portée), déterminer la **fenêtre entrée/sortie** → `T-minus` et durée de passage, avec niveau (détection vs reconnaissance).
- Qualité : à cadence ADS-B 12 s, l'incertitude IMM croît — si le T-minus est trop imprécis en QA, activer la cadence militaire découplée 5 s (P0-1 point 5).
- Rafraîchissement : recalcul client à chaque nouvelle position WS — pas de push WS par seconde.

### UX

Clic avion → panneau latéral :
- **Caméras qui le voient maintenant** : arêtes `monitored_by` triées par score, badge « détection » / « reconnaissance » selon le critère pixel.
- **Caméras qui vont le voir** : liste prédite avec `T-minus`, durée, niveau optique.
- **Cône de vue sur le globe** : `CameraFocusLayer.tsx` existe (**2 entités : cône + axe, une caméra à la fois** — correction de revue) — l'alimenter avec la portée réelle calculée.
- **Ouverture du flux** : `CameraPlayer.tsx` existe (1 flux actif) — bouton « voir » aligné sur le bearing prédit.

### Limites — dites explicitement

| Cas | Marche ? |
|---|---|
| Avion en approche/décollage, alt < 1 500 m, caméra < 4 km avec cap Provider/Parsed | **Oui — reconnaissance** (forme) |
| Même config, 4-10 km | **Détection seulement** (point mobile + T-minus) |
| Avion en croisière (alt > ~3 km), n'importe quelle caméra | **Non** (critère pixel) — filtré en amont |
| Caméra à heading `Estimated`/`None` (fraction mesurée au Lot 0) | **Pas de cône** → proximité seule |
| Vertical FOV / tilt / `resolution_px` absent | **Heuristique** (défauts conservateurs, marqué dans `explain`) |
| Occlusion bâtiments/relief | **Non modélisée** en MVP |
| Nuit | **Fiabilité réduite** (drapeau) |

---

## P3 — Nouvelles sources de données

Priorisé par (valeur P1/P2 × faible effort). **Contrainte légale appliquée aux nouvelles sources ET à l'existant** (revue) : l'audit de provenance couvre aussi les streams hardcodés actuels — `providers/generic.rs:163,173` embarque des flux Wowza coréens en IP nue sans provenance documentée, exactement le pattern rejeté pour Insecam → documenter la licence ou retirer (Lot 7a).

### Priorité 1 — comble les couches à 0 et le franco-centrisme (mondial)

| Source | Portée | Crate | Effort | Licence/accès | Débloque |
|---|---|---|---|---|---|
| **AISStream.io** (WebSocket AIS gratuit) | mondial **côtier** (~40-75 km des côtes — AIS terrestre, trou hauturier documenté) | `maritime` | **medium** (client WS persistant, reconnect/backpressure — pas « low ») | gratuit ; **ToS à vérifier avant Lot 7** (site derrière Cloudflare lors de l'audit) | couche maritime (0→réel) ; #6 cadré côtier |
| **Fix ingest GDELT** (déjà intégré, 0 item) | mondial | `gdelt` | low | open | #9 |
| **ThreatFox** (cyber IOC) | mondial | `cyber` | low | **Auth-Key obligatoire** (portail abuse.ch, env `THREATFOX_AUTH_KEY`) ; fair-use, usage commercial peut exiger un abonnement | couche cyber (0→réel) ; #8 re-sémantisé |
| **OpenSanctions** | mondial | `maritime`/`services` | low | **CC-BY-NC 4.0 — non-commercial** (revue : incohérence de diligence corrigée). Acceptable tant que le projet est expérimental ; alternative sans restriction : parser les listes primaires (OFAC SDN, UE, ONU — domaine public) | `is_sanctioned` réel |
| **Mictronics / tar1090-db** (hex→registration/type/envergure, ODC-BY) | mondial | `services` | low | ODC-BY | attributs avion + **envergure pour le critère pixel P2** |
| **plane-alert-db** (hex militaire→agence) | mondial | `services` | low | open | attribution nommée |

### Priorité 2 — P2 caméra↔avion & couverture caméra mondiale

| Source | Portée | Crate | Effort | Licence/accès | Débloque |
|---|---|---|---|---|---|
| **OurAirports** (runways/navaids, PDDL) | mondial | seed statique | low | PDDL | géométrie piste P2 |
| **OSM aeroways** | mondial | nouveau | **high** (correction de revue : **aucun client Overpass n'existe** — `crates/traffic` = proxy TomTom uniquement ; et l'usage policy d'overpass-api.de interdit le monde entier → **extracts Geofabrik** par région plutôt que requêtes Overpass globales) | ODbL | géométrie fine piste/taxiway |
| **Webcams aéroport officielles / state-DOT près des hubs** | régional | `cameras` | medium | par source (opendata) | **le scénario vitrine P2 « aéroport »** (la flotte actuelle est 100 % routière) |
| **511 US/Canada** | régional (US/CA) | `cameras` | **high** (revue : une inscription + un format **par État** — des semaines, pas « medium ») | par État | densité caméras US/CA |
| **OSM `camera:direction`** | mondial | `cameras` | **medium** (même absence de client Overpass ; extracts) | ODbL | vrais caps pour `Estimated` |
| **Windy Webcams** | mondial | — | — | **écarté du plan** (revue) : tier gratuit = embed/link only, URLs 15 min, énumération plafonnée à 1 000, Pro 9 990 $/an. La « boucle de refresh dédiée » du plan v1 contournait les ToS — retirée. Options honnêtes si besoin un jour : player embed (gratuit, sans ingestion ni proxy) ou tier Pro | — |
| **Copernicus DEM** | mondial | roadmap P2 | high | open | occlusion terrain |

### Priorité 3 — nouvelles relations cross-domaine & contexte

| Source | Portée | Crate | Effort | Licence/accès | Débloque |
|---|---|---|---|---|---|
| **GDACS** | mondial | nouveau `disasters` | low | open | cyclones/inondations (`near`/`triggered`) |
| **AWC Data API** (SIGMET/G-AIRMET) | mondial | `weather`/`services` | low | open | corridor aérien ↔ volcan |
| **OpenSky** (2ᵉ source ADS-B + historique) | mondial | `services` | medium | **non-commercial** | redondance ; backtest scoring P1 |
| **adsb.fi / airplanes.live** | mondial | `services` | low | fair-use ~1 req/s | **déjà remonté en P0-1 (plan B)** |
| **ENTSO-E / EIA / SNCF/DB** | régional | nouveau | medium-high | par source | énergie/rail ↔ incident |
| **GLEIF / SIRENE / FAA registry** | mondial/régional | nouveau `registry` | medium | open | graphe de propriété (après le cœur) |

### Sources rejetées (extrait — raison)

| Source | Raison de rejet |
|---|---|
| **Insecam & agrégateurs non autorisés** | accès sans consentement opérateur — interdit par la contrainte légale |
| **Windy Webcams (ingestion/proxy)** | contournement de ToS (tier gratuit = embed only) — voir Priorité 2 |
| **LiveATC.net** | CGU : « third-party use of live audio streams is prohibited » |
| **ADS-B Exchange (API)** | payant, tier gratuit disparu, licence non-commerciale |
| **Equasis** | CGU interdisent API/harvest/réutilisation en masse |
| **EUROCONTROL NM B2B / EAD** | accès réservé ANSP ; « not for operational use » |
| **Navigraph / Jeppesen / ARINC 424** | payant, licence fermée |
| **Planespotters.net** | photos sans licence libre |
| **FAA ASDI** | démantelé (absorbé dans SWIM/TFMS) |
| **Mozilla Location Service** | mort (2024) |
| **OpenOwnership / OpenNav / SkyLink** | fermé / pas de licence / provenance non documentée |

Détail complet (auth, format, rate limit, licence) : **`docs/plans/sources.md`, créé et versionné au Lot 0** (correction de revue : ce bloc n'était versionné nulle part, le Lot 7 n'était pas exécutable ni auditable).

---

## Plan d'exécution

Le repo n'a **pas de CI** : les commandes locales sont la seule barrière (`CLAUDE.md`). Chaque lot liste sa commande de vérification exacte. **Charge réaliste solo estimée ~10-13 semaines full-time** (revue) ; le Lot 7 est scindé 7a/7b pour ne pas bloquer P1/P2. **Sous-ensemble 80/20 si le temps manque** : Lots 0-4 complets + relations #10/#5 + convergence-lite + P2-lite (cône + prédiction on-demand, fallback proximité) + 7a.

### Lot 0 — Instrumentation & hygiène (bloquant, séquentiel)
`P0-0` : commit docker-compose, scripts ws-capture/rest/cpu-sample, audit heading caméras, `docs/plans/sources.md`.
Vérif : les 3 mesures reproduisent `baseline-mesures.md` à ±10 % ; distribution `view_heading_source` publiée ; commit infra visible.

### Lot 1 — P0 réseau/volume (dépend du Lot 0)
`P0-1` ADS-B (avec spike calibration + garde-fou consumer_graph) → mesure `AircraftBatch` réel → `P0-10` tuiles+quantification (**promu — plus un différé**) → `P0-2` Predictions → `P0-3` /fires → `P0-4` /cameras → `P0-5` WS encode-once.
- Vérif lot (gates à deux paliers) : `cargo test -p ws -p prediction -p services -p api` ; `regions_failed` = valeur calibrée (cible 0) ; **Palier A** : WS hors AircraftBatch ≤ 1 MB/min, `Predictions` < 50 KB ; **Palier B** : WS total ≤ 3 MB/min en vue régionale et monde (`ws-capture.mjs` avec `SetViewport`) ; `curl` /fires < 1 MB & < 200 ms chaud ; /cameras < 500 KB ; cpu-sample 3 onglets ≈ 1.

### Lot 2 — P0 front + test de charge 30 k (parallèle au Lot 1, dépend du Lot 0)
`P0-6` bundle/lazy → `P0-7` render-on-demand + pick throttle → **test de charge rendu (nouveau, revue)** : serveur WS synthétique (`scripts/ws-synth-server.mjs`, réutilise le format `AircraftBatch`) poussant 30 k avions, mesurer frame p95 et CPU onglet.
- Budget de repli connu si le test échoue : `PointPrimitiveCollection` sous un seuil de zoom, labels au survol uniquement, diff hors React (étendre `batchAccumulator.ts`, déjà extrait).
- Vérif : `npm run build && npm run preview` FCP ≤ 800 ms ; `grep -c cesium/Cesium.js dist/index.html` = 0 ; `npm test` ; QA Playwright ; **test 30 k : frame p95 documenté, replis activés si > 33 ms**.

### Lot 3 — P0 CPU/scale (parallèle, dépend du Lot 0)
`P0-8` SGP4 cache `(Elements, Constants)` → `P0-9` UNNEST 7 tables.
- Vérif : `cargo test -p satellites -p db` ; timing cycle propagation loggé.

### Lot 4 — P1 fondations (dépend du Lot 1 ; bloque Lot 5/6-corrélation)
`P1-0` idempotence (reproduire, puis `INSERT RELATION … ON DUPLICATE KEY UPDATE` **ou** `UPSERT` — valider sur v3.2) → index `in`/`out` mono-colonne + `expires_at` → fix `passes_over` éphémère + `velocity_kmh→velocity_km_s` → accumulation d'état in-memory + R-tree + `correlation.rs` (event-driven) → score normalisé 0-1 → seuils anti-bruit → **bench écriture (gate : ≥ 1 000 arêtes/s, p95 batch 200 < 250 ms)**.
- Vérif : `cargo test -p graph -p consumer_graph` ; 2ᵉ run consumer = zéro « already exists » ; bench écriture publié ; `/graph/neighbors/...` < 200 ms sur graph peuplé (curl -w).

### Lot 5 — P1 relations cross-domaine (dépend du Lot 4 ; #8/#9 dépendent du tier pays de 7a)
#10, #5, #7 (seuils anti-bruit) → #6 côtier → #8 (`hosted_in`, `derived_from` par entité nommée)/#9 → **#11 Convergence (rareté + hystérésis)** → API `get_neighbors` optimisée + `search_graph` indexée + tri par score → câblage `GraphEdge.tsx`.
- Vérif : `cargo test -p consumer_graph -p api` ; `npm test` ; `/graph/*` renvoie des arêtes multi-domaines ; un `ConvergenceAlert` déclenche ET s'éteint (hystérésis testée) ; taux d'arêtes/jour par relation loggé (contrôle bruit).

### Lot 6 — P2 caméra↔avion (dépend des Lots 4-5 et de P0-2 levier 3)
Câbler cône FOV (`view_heading_deg`/`view_fov_deg`) → géométrie 4 étages + **critère pixel** (`resolution_px`, envergure tar1090-db, défauts conservateurs) → route predict civil (cold-start CV) → fenêtre de passage + `T-minus` (+ décision cadence mil 5 s si imprécis) → UX (badges détection/reconnaissance, `CameraFocusLayer` portée réelle, proximité seule si heading non fiable).
- Vérif : `cargo test -p prediction -p cameras -p api` ; `npm test` ; QA Playwright sur le scénario recadré (avion d'approche près d'une caméra Caltrans LAX/SFO → cône + T-minus ; croisière → rien, filtré) ; **métrique publiée : % caméras à cap fiable**.

### Lot 7a — P3 quick wins qui débloquent P1/P2 (parallèle aux Lots 4-6)
Fix GDELT → ThreatFox (Auth-Key) → tar1090-db + plane-alert-db (envergure/attribution) → AISStream (**après vérif ToS**) → OurAirports → tier pays zones → **audit légal des streams hardcodés existants** (`generic.rs:163,173` : documenter ou retirer).
- Vérif : `cargo test` (crates touchés) ; `curl /maritime|/cyber|/gdelt` > 0 item ; décision écrite par stream hardcodé.

### Lot 7b — P3 différables (après le cœur)
511 US/CA (par État), webcams aéroport officielles, OSM aeroways/`camera:direction` (extracts Geofabrik), GDACS, AWC, OpenSky (backtest), ENTSO-E/SNCF, GLEIF/SIRENE.
- Vérif : par source, `cargo test` + item count > 0.

### Graphe de dépendances (résumé)
- Lot 0 → tout.
- Lot 1 ∥ Lot 2 ∥ Lot 3. Le test 30 k du Lot 2 valide définitivement P0-1+P0-10 côté rendu.
- Lot 1 → Lot 4 → Lot 5 → Lot 6.
- P0-2 (levier 3) → Lot 6 (prédiction). Lot 7a ∥ Lots 4-6 ; tier pays (7a) → #8/#9 (Lot 5) ; envergures tar1090-db (7a) → critère pixel (Lot 6).
- Delta/keyframe WS : **différé** derrière la mesure post-P0-10 uniquement.

---

## Risques et arbitrages

**Ce qu'il faut faire :**
- Remplacer la cible FPS par les métriques de volume (gates à deux paliers ci-dessus). La cible « p95 ÷ 2 » est intenable (vsync) — le dire au commanditaire.
- Traiter `P0-1` comme une correction de bug — mais **jamais sans P0-10 dans le même lot** : réparé seul, l'ingest fait exploser le wire.

**Paris techniques (confiance affichée) :**
- *Calibration adsb.lol* (incertain) : rate limits dynamiques, budget réel inconnu avant le spike ; fallback multi-fournisseurs intégré, contingence API key notée.
- *Idempotence RELATE* (probable) : à confirmer expérimentalement en tout premier (P1-0) ; syntaxe d'upsert à valider sur v3.2.
- *R-tree + job event-driven* (certain sur le principe) : bench local au Lot 4 avant d'empiler les relations ; budget d'écriture borné (top-K, seuils).
- *Pattern-only ON par défaut* (décision produit actée) : réversible via flag, gate double 50/450 KB.
- *Géométrie P2* (heuristiques assumées) : vfov 3/4, tilt, METAR oblique, résolution par défaut — tous marqués dans `explain`, pondèrent la confiance au lieu de couper.
- *Rendu 30 k* (à valider au Lot 2) : le « FPS non-problème » de la baseline était mesuré à 2,6 % de la charge cible ; replis chiffrés prêts.

**Ce qu'il ne faut PAS faire :**
- **Pas de permessage-deflate sur la stack actuelle** : axum 0.7 ne l'expose pas — c'était un faux levier ; le retirer a été acté (P0-5). Si le wire reste insuffisant post-P0-10 : MessagePack/CBOR, pas un changement de stack WS pour deflate.
- **Pas de Protobuf/FlatBuffers sur le WS** : casse la règle « wire hand-mirrored sans codegen » (`CLAUDE.md`).
- **Pas de filtre viewport par client (re-sérialisation par socket)** : détruit P0-5 — les tuiles partagées donnent le même résultat en gardant l'encode-once.
- **Pas de couche de rendu WebGPU custom** : Cesium est WebGL2 ; refonte lourde pour un problème non prouvé (à re-tester au Lot 2 d'abord).
- **Pas de pool SurrealDB pour l'instant** : batching des RELATE + bench d'écriture (Lot 4) d'abord ; mesurer avant d'ajouter de la complexité.
- **Ne pas promettre la reconnaissance d'un avion au-delà de ~4 km (narrowbody)** ni quoi que ce soit en croisière : critère pixel. La promesse à deux niveaux (détection/reconnaissance) est la version vraie.
- **Ne pas ingérer/proxyfier Windy** : embed-only ou rien (ToS).
- **Ne pas ajouter les débris spatiaux (63 k) avant P0-8.**
- **Ne pas corréler plus vite que la donnée n'arrive** (event-driven, pas d'horloge 2-5 s sur des positions à 12 s).
- **TimescaleDB** : les migrations rétention/compression sont des no-op sur l'image réelle `pgvector/pgvector:pg17` (`docker-compose.yml:44`). Job `DELETE` applicatif si besoin — hors P0.

---

## Objections écartées ou nuancées

Toutes les critiques bloquantes/majeures des deux revues ont été **vérifiées dans le code et confirmées** (notamment : `PredictionService` local au tracker `aircraft_tracker.rs:32` + absent d'`AppState` ; skip non-militaire `prediction/service.rs:70-73` ; zéro deflate dans `Cargo.lock` avec axum 0.7.9 ; `WHERE in = X OR out = X` `graph/src/queries.rs:95` ; `crates/traffic` sans client Overpass ; constantes de pas dans `prediction/src/service.rs:11-14` ; 9 `<SidePanel>` `App.tsx:398-504` ; 2 entités `CameraFocusLayer.tsx:150-168` ; zones airport/city/region sans tier pays ; `/military-bases`/`/nuclear-sites` présents `router.rs:34-41` ; streams hardcodés `generic.rs:163,173` ; `velocity_kmh` `ontology.rs:90` ; fallback Postgres gaté par `!published` `aircraft_tracker.rs:107`). Aucune critique n'a été rejetée comme fausse. Trois points sont intégrés **avec nuance** :

1. **« Abonnement viewport côté WS » (avocat du diable, option a)** — retenu dans son principe mais **pas dans sa forme naïve** : un bbox par client implique un filtrage et une sérialisation par client, ce qui détruit l'encode-once de P0-5 (le CPU redevient O(clients × n)). La forme retenue (P0-10) est l'abonnement par **tuiles fixes partagées** : chaque tuile est sérialisée une fois, le fanout par connexion est une comparaison d'entiers. Même bénéfice wire, sans régression CPU.
2. **« tokio-tungstenite 0.24 » (revue viabilité)** — précision : `Cargo.lock` contient aussi `tokio-tungstenite 0.28.0` (tirée par une autre dépendance), mais celle liée à axum 0.7.9 est bien la 0.24 et la conclusion est inchangée : la couche `WebSocketUpgrade` d'axum 0.7 n'expose aucune négociation permessage-deflate — le levier est retiré quoi qu'il en soit.
3. **« Cible `/fires` < 200 ms très optimiste en debug » (revue viabilité)** — juste pour le correctif copié tel quel (re-décodage de ~18 MB par requête), mais la cible est **maintenue à chaud** grâce au cache mémoire de la `Vec` décodée intégré à P0-3 : le coût par requête devient filtre (~10-20 ms sur 89 k items) + sérialisation du sous-ensemble ≤ 1 MB. La cible est conditionnée au cache et mesurée au 2ᵉ appel ; le décodage froid n'arrive qu'une fois par refresh (1 800 s).
