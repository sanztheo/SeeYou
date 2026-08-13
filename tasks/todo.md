# SeeYou v2 — TODO (aligné sur le plan révisé post-revues)

Spec : `docs/plans/seeyou-v2.md`. Baseline chiffrée : `docs/plans/baseline-mesures.md`.
Barrière = commandes locales (pas de CI). Cocher au fur et à mesure.
Gates WS à deux paliers : **A** = hors `AircraftBatch` ≤ 1 MB/min ; **B** = total ≤ 3 MB/min (vue régionale ET monde).

---

## Lot 0 — Instrumentation & hygiène (bloquant, à faire en premier)

- [ ] **Committer `docker-compose.yml`** (pin `surrealdb:v3.2`) — actuellement modifié non commité, c'est le mode de défaillance qui a causé la panne graph initiale.
- [ ] Écrire `scripts/ws-capture.mjs` : client `ws` comptant octets + messages par `type` sur 45 s. Vérif : reproduit `Predictions ≈ 1240 KB`, `AircraftBatch ≈ 49,8 KB` (`baseline-mesures.md:90`).
- [ ] Écrire `scripts/rest-sizes.sh` : `curl -w '%{size_download} %{time_total}'` sur `/fires`, `/cameras`, `/satellites`. Vérif : reproduit 17,87 MB / 3,95 MB / 628 ms froid (`baseline-mesures.md:100-103`).
- [ ] Écrire `scripts/cpu-sample.sh` : échantillonne `ps -o %cpu=` du process server toutes les 2 s sur 60 s (min/moy/max) — méthode de mesure de P0-5.
- [ ] Audit heading caméras : script `jq` sur `/cameras` → distribution `view_heading_source` (Provider/Parsed/Estimated/None) sur les 11 020 caméras. Prérequis P2 (fraction cône-compatible inconnue sinon).
- [ ] Créer `docs/plans/sources.md` : par source P3 — URL, auth, format, rate limit, licence (le Lot 7 n'est pas exécutable sans).
- [ ] Confirmer que `regions_failed` est lisible dans le log `fetched aircraft from regional grid` (`services/aircraft_tracker.rs:42`). Vérif : valeur = 42 avant fix.

## Lot 1 — P0 réseau/volume (dépend du Lot 0)

### P0-1 — ADS-B (calibrer d'abord, réparer ensuite)
- [ ] **Spike calibration 30 min** : mesurer empiriquement le débit accepté par adsb.lol (rate limits dynamiques) avec sémaphore + backoff, avant de figer intervalle/permis.
- [ ] `server/config.rs:4` : `DEFAULT_POLL_INTERVAL_SECS` 2 → 12 (point de départ), puis intervalle adaptatif (allonger sur 429, resserrer sur succès).
- [ ] `services/adsb.rs:196-205` : borner `fetch_all_regions` avec `tokio::sync::Semaphore` (départ 4 permis, ajuster selon spike) + jitter par région.
- [ ] `services/adsb.rs` : ajouter `AdsbError::RateLimited` (`thiserror`), classer le 429 via `response.status()` (`:178`), honorer `Retry-After` + backoff exponentiel.
- [ ] Plan B intégré : round-robin fallback `adsb.fi`/`airplanes.live` (format ADSBX v2, ~1 req/s chacun) si adsb.lol refuse le débit. Noter la contingence API key adsb.lol (feeder) dans `sources.md`.
- [ ] **Garde-fou `consumer_graph` (même commit)** : env `GRAPH_AIRCRAFT_FILTER` (défaut `military_below_3000m`) côté consumer — la corrélation O(n×m) actuelle (`graph_links.rs:22-51`) ne doit pas recevoir 30 k avions avant le Lot 4.
- [ ] Vérif : `cargo run -p server` → `regions_failed=0` (ou valeur calibrée documentée) ; 429 sur 60 s = 0 ; nombre d'avions stable ; `cpu-sample.sh` stable ; noter le volume Redis `set_aircraft` mesuré.

### P0-10 — AircraftBatch à 30 k : tuiles + quantification (PROMU — juste après la mesure post-P0-1)
- [ ] Mesurer `AircraftBatch` post-P0-1 avec `ws-capture.mjs` (attendu ~29-34 MB/min — c'est mécanique, pas hypothétique).
- [ ] Quantification : lat/lon 5 décimales, `altitude_m`/`speed_ms`/`heading`/`vertical_rate_ms` à 1 décimale (~230 → ~155 o/avion).
- [ ] Grille fixe 15°×15° : grouper les avions par tuile, encoder chaque tuile UNE fois (`Arc<str>` de P0-5), broadcast `(tile_id, frame)`, forward par connexion selon abonnement (comparaison d'entiers).
- [ ] Nouvelle variante WS client→serveur `SetViewport { south, west, north, east }` — **miroir 3 endroits** : `ws/src/messages.rs` + les 2 unions de `frontend/src/types/ws.ts`. La boucle `handle_socket` lit déjà l'inbound (`ws/handler.rs:65+`).
- [ ] Vue monde sans `SetViewport` (ou bbox > hémisphère) : agrégat plafonné env `WORLD_VIEW_AIRCRAFT_CAP` (défaut 3 500, priorité militaire + basse altitude).
- [ ] Front : envoyer `SetViewport` sur `moveend` (debounce partagé avec P0-4) ; fusionner les tuiles dans le `Map` d'état ; purger les avions des tuiles désabonnées.
- [ ] Delta/keyframe : **différé** — uniquement si la mesure post-tuiles dépasse encore le palier B.
- [ ] Vérif : `ws-capture.mjs` étendu (SetViewport régional puis monde) ≤ 3 MB/min dans les deux modes ; `cargo test -p ws` ; `npm run build`.

### P0-2 — Predictions (miroirs : `prediction/src/trajectory.rs` + `frontend/src/types/aircraft.ts` + `AircraftPredictions.tsx`)
- [ ] `prediction/src/service.rs:11-14` : `PREDICTION_STEP_SECS` 5.0 → 15.0 (60→20 points) — **pas** dans `trajectory.rs`, qui ne fait que recevoir les valeurs (la route on-demand les prendra en paramètres de requête).
- [ ] `prediction/trajectory.rs:8-29` : arrondir lat/lon (5 déc.) + `alt_m` (entier) ; retirer `dt_secs` (dérivé de `index×step`) ; fusionner `sigma_xy_m`/`sigma_z_m` en un taux par trajectoire. Mettre à jour les 2 miroirs front.
- [ ] `services/aircraft_tracker.rs:151-158` : flag `PREDICTIONS_PATTERN_ONLY` (défaut **ON**) — ne broadcaster que `pattern.is_some()`.
- [ ] **Partage d'état pour la route on-demand** : `SharedPredictor = Arc<tokio::sync::RwLock<PredictionService>>` construit dans `main`, passé à `run_aircraft_tracker` (changement de signature — aujourd'hui `let mut predictor` local, `aircraft_tracker.rs:32`) + champ `AppState` (`server/src/app_state.rs`) + `impl FromRef<AppState>`.
- [ ] `prediction/service.rs` : `get_trajectory(&self, icao, horizon, step)` (rejoue `trajectory::generate` sur l'IMM existant) + `HashMap<icao, LastKinematics>` alimenté pour TOUS les avions (~60 o × 30 k ≈ 1,8 MB) → **cold-start ConstantVelocity pour le civil** (aucun état IMM n'existe pour lui : `service.rs:70-73` skippe, `aircraft_tracker.rs:134-136` pré-filtre). Réponse taguée `model: "imm" | "cv_coldstart"`.
- [ ] `api/src/aircraft.rs` (nouveau) + `router.rs` : `GET /aircraft/:icao/predict?horizon=&step=` (axum `:param`).
- [ ] Vérif : `cargo test -p ws -p prediction` ; `npm run build` ; `ws-capture.mjs` → `Predictions` < 50 KB (flag ON) et < 450 KB (flag OFF, test ponctuel) ; `curl` predict sur un icao militaire (imm) et civil (cv_coldstart).

### P0-3 — /fires : bbox + pagination + cache décodé
- [ ] `api/src/fires.rs` : `Query<BboxQuery>` (south/west/north/east/limit), filtre comme `api/src/cameras.rs:43-54`.
- [ ] **Cache mémoire process** de la `Vec` décodée (`tokio::sync::RwLock<Option<(Instant, Vec<…>)>>`), invalidé au rythme du refresh fires (1800 s) — sinon on re-décode ~18 MB de JSON par requête et la cible < 200 ms est intenable en debug.
- [ ] Front : passer le bbox viewport à l'appel `/fires` (state `setViewportBbox`, `useAppState.ts:126`).
- [ ] Vérif : `curl -w '%{size_download} %{time_total}' 'localhost:3001/fires?south=40&west=-5&north=52&east=10'` < 1 MB, < 200 ms **au 2ᵉ appel**.

### P0-4 — /cameras : bbox côté front (+ cas limites)
- [ ] `useAppState.ts:524-525` : remplacer `fetchCamerasChunked(undefined, …)` par le bbox de `viewer.camera.computeViewRectangle()`, refetch `moveend` debouncé (~500 ms).
- [ ] Cas limites : `computeViewRectangle()` → `undefined` (horizon visible) ⇒ garder le dernier bbox valide, sinon fetch limité ; bbox > 90° de longitude ⇒ traiter comme vue monde (fetch limité), pas un fetch monde silencieux.
- [ ] Vérif : onglet réseau `/cameras?south=…` < 500 KB ; test manuel vue inclinée/dézoomée ; `npm test`.

### P0-5 — WS encode-once (deflate RETIRÉ)
- [ ] `ws/broadcast.rs` : `Broadcaster` diffuse `Arc<str>` encodé une fois dans `send(msg: WsMessage)` (type → `broadcast::Sender<Arc<str>>` ; avec P0-10 : `(tile_id, Arc<str>)`).
- [ ] `ws/handler.rs:71-79` : consommer le frame pré-encodé (plus de `serde_json::to_string` par socket).
- [ ] ~~permessage-deflate~~ **retiré** : axum 0.7.9 n'expose aucune négociation d'extension WS (vérifié Cargo.lock) — la réduction wire vient de P0-10. Fallback si insuffisant après P0-10 : MessagePack/CBOR (décision plan, pas ici).
- [ ] Vérif : `cargo test -p ws` ; `cpu-sample.sh` avec 1 puis 3 onglets → %CPU ≈ constant (±20 %) pendant les broadcasts.

## Lot 2 — P0 front + charge 30 k (parallèle au Lot 1)

### P0-6 — bundle
- [ ] `vite.config.ts` : hook `transformIndexHtml` retirant `<script src="/cesium/Cesium.js">`.
- [ ] `App.tsx:398-504` : `React.lazy` + `Suspense` sur les **9 sections `<SidePanel>`** + `GraphView` (les ~15 `DraggablePanel` de détail : seulement si la mesure du bundle le justifie).
- [ ] Vérif : `npm run build && npm run preview` → FCP ≤ 800 ms (Lighthouse ou Playwright `first-contentful-paint`) ; `grep -c "cesium/Cesium.js" dist/index.html` = 0.

### P0-7 — rendu à la demande (ne vise PAS le FPS)
- [ ] `components/Globe/Globe.tsx:367` : `requestRenderMode` + `maximumRenderTimeChange={Infinity}`.
- [ ] `viewer.scene.requestRender()` à chaque mutation réelle (billboards aircraft/satellite/camera, flyTo, basemap) — auditer chaque callsite hors cycle Cesium.
- [ ] Throttler `scene.pick` (rAF-gate ou 80 ms) dans `Aircraft/AircraftInteractions.ts` + `Satellite/SatelliteLayer.tsx`.
- [ ] Vérif : `npm test` ; QA Playwright (carte se redessine après un tick WS) ; baisse de charge mesurée onglet arrière-plan (Chrome Task Manager).

### Test de charge rendu 30 k (nouveau — la baseline ne couvrait que 2,6 % de la charge cible)
- [ ] `scripts/ws-synth-server.mjs` : serveur WS synthétique poussant 30 k avions au format `AircraftBatch` (+ tuiles si P0-10 déjà posé) ; pointer le front dessus.
- [ ] Mesurer frame p95 + CPU onglet à 30 k. Si p95 > 33 ms : replis dans l'ordre — `PointPrimitiveCollection` sous un seuil de zoom, labels au survol seulement, diff hors React (étendre `batchAccumulator.ts`).
- [ ] Vérif : frame p95 documenté dans la Revue du lot ; replis activés si besoin.

## Lot 3 — P0 CPU/scale (parallèle)

### P0-8 — SGP4
- [ ] `satellites/tracker.rs` : cache **`HashMap<norad_id, (sgp4::Elements, sgp4::Constants)>`** invalidé au refresh TLE 6 h — pas `Constants` seul : `datetime_to_minutes_since_epoch` est une méthode d'`Elements` (`propagator.rs:59-62`) et `orbit_period_min` dérive de `elements.mean_motion` (`propagator.rs:76`).
- [ ] `satellites/propagator.rs:48-88` : signature qui prend le couple caché, n'appelle que `.propagate(minutes)`.
- [ ] `satellites/tracker.rs:50-57` : trier/tronquer à `MAX_SATELLITES` **avant** de propager ; envelopper la boucle dans `tokio::task::spawn_blocking`.
- [ ] Vérif : `cargo test -p satellites` ; timing d'un cycle loggé (attendre ≥ ×3 à froid).

### P0-9 — Postgres UNNEST
- [ ] Répliquer le patron UNNEST de `db/src/aircraft.rs:12-63` dans `db/src/{satellites,gdelt,fires,seismic,maritime,cyber,space_weather}.rs` (rend tenable le fallback bus-down à 30 k lignes/12 s).
- [ ] Vérif : `cargo test -p db`.

## Lot 4 — P1 fondations (dépend du Lot 1 ; bloque Lots 5-6)

- [ ] **P1-0 (d'abord)** : reproduire le bug d'idempotence — `consumer_graph` 2× sur la même entité, chercher « already exists » sur `located_in`.
- [ ] `graph/relations.rs:52-64` : corriger l'upsert — **`ON DUPLICATE KEY UPDATE` n'existe pas sur `RELATE`** (clause d'`INSERT`). Deux formes à valider sur SurrealDB v3.2 : `INSERT RELATION INTO <rel> { id, in, out, … } ON DUPLICATE KEY UPDATE …` **ou** `UPSERT` de l'arête à `edge_id` déterministe (`fnv1a64`, `relations.rs:126-142`).
- [ ] `graph/ontology.rs:280-287` : **deux index mono-colonne par relation** — `DEFINE INDEX <rel>_in … COLUMNS in;` + `<rel>_out … COLUMNS out;` (un composite `(in,out)` ne servirait que la branche `in` du `WHERE in = X OR out = X`, `graph/src/queries.rs:95`).
- [ ] `graph/ontology.rs` : `DEFINE INDEX <rel>_expires … COLUMNS expires_at;` sur `flies_over/monitored_by/affected_by/near/passes_over`.
- [ ] **`passes_over` devient éphémère** (`processing.rs:52-55`) : `expires_at` TTL 120-300 s (ou fin de passage SGP4), sweep comme `flies_over` — un LEO traverse une zone en ~2 min, l'upsert sans TTL graverait des survols périmés. Upsert sans TTL réservé aux vrais statiques (`located_in`, `covers`).
- [ ] `graph/ontology.rs:90` : renommer `velocity_kmh` → `velocity_km_s` sur la table satellite (le wire est en km/s) + producteur consumer.
- [ ] **Provenance de l'état** : accumulation in-memory dans `consumer_graph` — `HashMap` par domaine avec TTL de péremption par entité (avions ~36 s, caméras ~900 s) ; les R-trees se reconstruisent depuis cet état local à intervalle fixe (pas de lecture Redis, pas de snapshots bus).
- [ ] Dép `rstar` (`.workspace = true`) ; `consumer_graph/src/correlation.rs` : R-tree par domaine, `locate_within_distance` + test exact, **event-driven** (déclenché à l'arrivée d'un batch avion, pas d'horloge plus rapide que la donnée).
- [ ] **Seuils anti-bruit** (constantes nommées, env-configurables) : séisme M ≥ 4,5 ; feux FRP/confidence hauts ; `monitored_by` → admission altitude < 3 000 m + **top-K=3 caméras/avion** ; cyber fenêtre 24 h.
- [ ] Remplacer le `for … .await` séquentiel par `buffer_unordered`/`join_all` borné ; **batcher les RELATE/upserts** (chunks ~200, multi-statements).
- [ ] **Bench écriture (gate du lot, bloque le Lot 5)** : ≥ 1 000 arêtes/s soutenues, p95 d'un batch de 200 < 250 ms, consumer lag stable — sinon réduire K/cadence avant d'ajouter des relations.
- [ ] `graph/relations.rs` + producteurs : normaliser `score` en 0-1 par type (fin de `monitored_by`=distance brute / `affected_by`=visibility brute).
- [ ] Vérif : `cargo test -p graph -p consumer_graph` ; 2ᵉ run consumer = 0 « already exists » ; bench écriture publié ; `curl -w '%{time_total}'` sur `/graph/neighbors/...` < 200 ms sur graph peuplé.

## Lot 5 — P1 relations cross-domaine (dépend du Lot 4 ; #8/#9 du tier pays 7a)

- [ ] #10 `aircraft(is_military)→near→military_base` (haversine < R) dans `correlation.rs`.
- [ ] #5 `seismic_event(M≥4,5)→near→nuclear_site`/`military_base` (< 150 km).
- [ ] #7 `fire_hotspot(FRP haut)→affected_by→weather` + `near→base`.
- [ ] #6 `vessel→near→cable` / `connects_to→landing_point` — **cadré côtier** (AIS terrestre ~40-75 km des côtes ; trou hauturier documenté, pas comblé). **Toujours pas de producteur de relation.** Ce qui a changé (revue Lots 4-7a, correction ciblée) : le producteur de *données* était cassé (0 vessel en prod, cf. Lot 7a — flux digitraffic corrigé, maintenant 1235 vessels réels) ; le graphe a maintenant de la matière première (`vessel` alimenté), mais personne n'écrit encore l'arête `near→cable`/`connects_to→landing_point` elle-même.
- [ ] #8 **re-sémantisé** : `cyber_threat→hosted_in→zone` (la géoloc d'un C2 ≠ sa cible) ; `derived_from→gdelt` **uniquement sur correspondance d'entité nommée** (IOC cité dans l'article), jamais co-occurrence pays+fenêtre. Toujours bloqué : ThreatFox exige un `THREATFOX_AUTH_KEY` (inscription humaine sur auth.abuse.ch, non faisable par un agent autonome — confirmé en direct : `POST threatfox-api.abuse.ch/api/v1/` sans clé → `{"error":"Unauthorized"}`).
- [ ] #9 `gdelt_event→located_in→zone` / `involves→base` (après tier pays, 7a). **Tier pays maintenant livré** (voir Lot 7a) donc ce blocage précis est levé ; #9 reste non fait car GDELT lui-même est inatteignable depuis cet environnement (voir Lot 7a — DNS résout, TLS expire).
- [ ] **#11 Convergence par rareté + hystérésis** : baseline glissante 7 j du nombre de domaines actifs par zone (seuils anti-bruit) ; alerte sur écart significatif, S_on/S_off + durée min pour qu'elle s'éteigne → `WsMessage::ConvergenceAlert` (déjà mirroré `ws/messages.rs:181`). Pas fait cette passe (aucun producteur), le type WS reste dormant.
- [x] `api/graph_api.rs:277-365` : map statique `table→relations`, `join_all` — **déjà en place** (`relevant_relations_for_table`, `buffer_unordered` borné). **Cache snapshot court TTL — ajouté cette passe** : cache statique en mémoire par `(table, id, depth, limit)`, TTL 5 s, dans `graph_api.rs` (pas de changement `AppState`/`FromRef` — collision évitée avec le Lot 6 en cours sur les crates caméra).
- [ ] `api/graph_api.rs:199-250` : index full-text SurrealDB + filtre en SurrealQL (supprime le cap 250) — **pas fait cette passe**, `SEARCH_SCAN_LIMIT = 250` toujours en place ; trier voisins par `score` — déjà en place (`edge_score`/`edges.sort_by`).
- [x] `frontend/src/components/Graph/GraphEdge.tsx` : rendre `edge.attributes` (score normalisé + explain + timestamp) — **fait cette passe** (+ test `GraphEdge.test.tsx`).
- [ ] Vérif : `cargo test -p consumer_graph -p api` ; `npm test` ; arêtes multi-domaines dans `/graph/*` ; un `ConvergenceAlert` déclenche **et s'éteint** ; taux d'arêtes/jour par relation loggé (contrôle bruit). **Statut réel (revue Lots 4-7a) : Lot 5 est partiel, pas livré** — #6/#8/#9/#11 restent sans producteur ; ce qui a été fait cette passe (GraphEdge.tsx, cache TTL) ne les débloque pas, seul le tier pays (7a) lève un blocage pour #9.

## Lot 6 — P2 caméra↔avion (dépend Lots 4-5 + P0-2 levier 3)

- [ ] `consumer_graph/graph_links.rs:12-54` : refondre `link_aircraft_to_nearby_cameras` — lire `view_heading_deg`/`view_fov_deg` (`cameras/types.rs:16-18`), cône horizontal `|bearing−heading| ≤ fov/2`, skip `is_online=false`, pré-filtre R-tree + admission alt < 3 000 m + top-K=3.
- [ ] Géométrie : azimut géodésique, distance oblique, élévation, **critère pixel** `px = θ_deg × (resolution_h_px / hfov_deg)` — détection ≥ 2 px, reconnaissance ≥ 8 px (Johnson) ; envergure par type via tar1090-db (défaut 36 m narrowbody, pas 60) ; borne `min(horizon 3,86·√h, METAR, limite pixel)`. **Toujours le défaut 36 m** (`cameras/src/visibility.rs:56`, `DEFAULT_WINGSPAN_M`) — vérifié ce lot (revue 4-7a) : tar1090-db (contenu réel inspecté via l'API GitHub) est un registre hex→immatriculation/type, **pas** une table envergure-par-type, la prémisse du plan était fausse sur ce point précis. Pas de correctif appliqué faute d'une source envergure-par-type publique trouvée cette session ; voir `docs/plans/sources.md` Lot 7a pour le détail.
- [ ] `cameras/src/types.rs` : ajouter `height_agl_m: Option<f64>` **et `resolution_px: Option<u32>`** (défaut 640) — miroir `frontend/src/types/camera.ts` ; vfov heuristique **`hfov×3/4`** (4:3, pas 9/16), ratio par source si connu, marqué dans `explain`.
- [ ] METAR/`ceiling_ft` : **pondèrent le score de confiance** (heuristiques de surface, pas des mesures obliques) — pénalité forte si avion au-dessus de la couche, pas de coupe binaire.
- [ ] Prédiction on-demand via `/aircraft/:icao/predict` (IMM militaire / cold-start CV civil) ; projeter contre cônes + critère pixel → fenêtre entrée/sortie + `T-minus` + niveau (détection/reconnaissance), recalcul client (pas de push WS/s). Si T-minus imprécis à 12 s : activer la cadence mil découplée 5 s (P0-1 point 5).
- [ ] UX : badges « détection »/« reconnaissance » ; `CameraFocusLayer.tsx` (2 entités : cône + axe) alimenté par la portée réelle ; panneau « voit maintenant / va voir + T-minus » ; bouton flux `CameraPlayer.tsx` aligné bearing ; heading `Estimated`/`None` → proximité seule.
- [ ] Vérif : `cargo test -p prediction -p cameras -p api` ; `npm test` ; QA Playwright sur le **scénario recadré** (approche près d'une caméra Caltrans LAX/SFO → cône + T-minus ; croisière → rien, filtré en amont) ; **publier le % de caméras à cap fiable** (audit Lot 0) dans la Revue.

## Lot 7a — P3 quick wins qui débloquent P1/P2 (parallèle aux Lots 4-6)

- [ ] `gdelt` : réparer l'ingest (couche 0→réel) — prérequis #9. **Toujours cassé, cause reclassée** : vérifié ce lot — `api.gdeltproject.org` résout en DNS (`104.197.47.124`) mais le handshake TLS expire (6 s) depuis cet environnement. Blocage réseau de la sandbox, pas un bug identifiable dans `gdelt/src/api.rs` (qui dégrade déjà proprement vers `Vec::new()`). Aucun changement de code — un correctif non vérifiable n'aurait aucune valeur.
- [ ] `cyber` : **ThreatFox** — créer l'Auth-Key sur auth.abuse.ch, env `THREATFOX_AUTH_KEY`, noter le fair-use dans `sources.md`. **Confirmé bloqué** : endpoint vivant (`POST threatfox-api.abuse.ch/api/v1/` répond), clé réellement exigée (`{"error":"Unauthorized"}` sans elle). Obtenir la clé nécessite une inscription humaine (vérification e-mail) — hors de portée d'un agent autonome. `THREATFOX_AUTH_KEY` toujours non défini.
- [ ] `services` : enrichir `Aircraft` via **tar1090-db** (hex→type/registration/**envergure** — prérequis critère pixel Lot 6, ODC-BY) + **plane-alert-db** (militaire→agence). **Non fait, prémisse corrigée** : tar1090-db (vérifié : contenu réel du repo via l'API GitHub) ne contient pas d'envergure par type, et `services/adsb.rs:228-229` alimente déjà `registration`/`aircraft_type` depuis le flux ADS-B lui-même (hex→type serait redondant). plane-alert-db (licence ODbL, vérifiée) est utilisable pour l'agence militaire mais son câblage réel ajouterait un champ à `Aircraft` → miroir WS obligatoire à 3 endroits, jugé hors périmètre chirurgical de cette passe. Détail (fichiers, colonnes, licence) dans `docs/plans/sources.md`.
- [x] `maritime::ais` : **bug réel trouvé et corrigé** (pas le remplacement de flux prévu) — `retirer is_sanctioned: false codé en dur` : fait, via OFAC (voir ligne Sanctions ci-dessous). Le flux finlandais renvoyait 0 vessel en prod : `ais.rs` déclarait `Accept-Encoding: gzip` sans que `reqwest` ait la feature cargo `gzip` (`backend/Cargo.toml`), donc chaque réponse (compressée) échouait au décodage JSON silencieusement. Corrigé (`features = ["json", "gzip"]`) — mesuré en direct : 0 → 1235 vessels, 1101 avec nom (jointure sur `/api/ais/v1/vessels`). **Le remplacement AISStream.io n'a pas été fait** : ToS toujours pas vérifiables (site illisible derrière Cloudflare, inchangé depuis l'audit initial), et le flux existant fournit maintenant de vraies données — swap non prioritaire vs corriger le bug réel.
- [x] Sanctions : ~~OpenSanctions~~ → **OFAC SDN**, comme recommandé par la revue (CC-BY-NC écarté). `backend/data/sanctions/ofac_sdn_vessels.json` (1524 entrées `SDN_Type=vessel`, filtrées depuis le CSV officiel, œuvre du gouvernement US = domaine public) + `maritime::sanctions::is_sanctioned_vessel`. **Matching par call sign exact uniquement** — un fallback par nom a été essayé puis retiré : testé en direct, il a produit un faux positif confirmé (navire finlandais « LEO »/`OJTZ` matché sur le nom d'un navire sanctionné Russie/Ukraine sans rapport, `8P2467`) ; un nom d'affichage n'est pas un identifiant unique. `is_sanctioned` est réel en prod (mesuré : navires sanctionnés présents dans `/maritime` par call sign exact).
- [x] `graph/src/zones.rs` : ajouter le **tier pays** (prérequis #8/#9) — **fait**. 177 pays (Natural Earth 1:110m, CC0 — licence vérifiée) fusionnés dans `global_zones.geojson` (60 → 237 zones), ids préfixés `country-{iso3}` pour ne jamais collisionner avec les régions existantes (`australia` région vs `country-aus` pays). Test réel sur le fichier de prod (`zones::tests::real_zones_file_resolves_country_tier_alongside_region_tier`) + vérifié en base après reseed live : 718 arêtes `camera→located_in→country-*` déjà écrites par `consumer_graph` sans aucun changement de son code (`resolve_location_zone_ids` consommait déjà plusieurs zones par point).
- [ ] Seed **OurAirports** (PDDL) — géométrie piste P2. Pas fait cette passe (hors périmètre des 4 findings bloquants/majeurs assignés).
- [ ] **Audit légal des streams hardcodés existants** : `providers/generic.rs:163,173` (Wowza coréen en IP nue) — provenance + CGU par stream ; documenter ou retirer. **Décision prise et documentée dans `sources.md` : à retirer** (même politique qu'Insecam, zéro preuve de consentement opérateur). **Non exécuté dans le code** : `generic.rs` a des modifications non commitées d'un autre agent (Lot 6, providers caméra) au moment de cette revue — retirer ces deux entrées est laissé à qui possède ce fichier pour éviter un conflit d'édition.
- [ ] Vérif : `cargo test` (crates touchés) — voir vérification finale de la tâche ; `curl /maritime|/cyber|/gdelt` > 0 item — **`/maritime` : 1235** (corrigé) ; **`/cyber` et `/gdelt` : toujours 0** (bloqués côté externe, documenté ci-dessus, pas un bug de code) ; décision écrite par stream hardcodé dans `sources.md` — fait.

## Lot 7b — P3 différables (après le cœur)

- [ ] Webcams **aéroport officielles / state-DOT près des hubs** — le vrai déblocage du pitch « webcam d'aéroport » P2 (Windy écarté : embed-only ou Pro 9 990 $/an ; pas d'ingestion/proxy).
- [ ] **511 US/CA** : provider générique paramétré — effort réel élevé (inscription + format PAR État), heading via `parse_heading_from_hint`.
- [ ] **OSM aeroways + `camera:direction`** : client à écrire from scratch (aucun client Overpass n'existe — `crates/traffic` = proxy TomTom) ; passer par **extracts Geofabrik**, pas des requêtes Overpass monde.
- [ ] **GDACS** (nouveau `disasters`), **AWC** (SIGMET/G-AIRMET).
- [ ] **OpenSky** (2ᵉ source + backtest scoring P1 — licence non-commerciale), **ENTSO-E/SNCF**, **GLEIF/SIRENE/FAA registry** (graphe de propriété).
- [ ] Vérif : par source, `cargo test` + item count > 0.

## Différé (mesurer avant d'engager)

- [ ] **Delta/keyframe WS** — uniquement si `ws-capture.mjs` post-P0-10 (tuiles + quantification) dépasse encore le palier B (3 MB/min).
- [ ] MessagePack/CBOR — uniquement si le budget wire reste insuffisant après le point précédent (jamais permessage-deflate : axum 0.7 ne l'expose pas).
- [ ] Cadence militaire découplée 5 s — si la QA T-minus du Lot 6 la réclame.
- [ ] TimescaleDB : image dédiée ou job `DELETE` périodique — hors P0.
- [ ] Débris spatiaux (63 k) — **uniquement après P0-8**.
- [ ] Graphe de propriété GLEIF/SIRENE/FAA — après le cœur.

---

## Revue (à remplir en fin de lot)

- Lot 0 : … (inclure : distribution `view_heading_source`)
- Lot 1 : … (inclure : débit adsb.lol calibré ; MB/min paliers A et B)
- Lot 2 : … (inclure : frame p95 à 30 k, replis activés ou non)
- Lot 3 : …
- Lot 4 : … (inclure : bench écriture arêtes/s + p95 batch)
  - **Correction post-revue (findings bloquants/majeurs Lots 4-7a)** : `sweep_expired_relations`
    (`graph/relations.rs`) échouait à chaque tick où il supprimait une ligne — `RETURN BEFORE` renvoie
    `expires_at`/`timestamp` en `datetime` natif, que `Vec<serde_json::Value>` ne sait pas décoder
    (« Expected any, got datetime »). Corrigé (décodage `surrealdb::types::Value` +
    `into_json_value()`, même patron que `queries.rs`/`processing.rs`). Test live ajouté et exécuté
    contre SurrealDB réel : écrit une arête déjà expirée, sweep, `removed==1` et la ligne a disparu —
    passe. Avant le fix, le sweep loggait un WARN toutes les 30 s dès qu'une ligne expirait ; observé
    disparu après redémarrage de `consumer_graph` avec le correctif (aucun WARN sweep dans ~4 min de
    log après restart).
  - `/graph/neighbors` sur nœuds hub (zones région, ex. `zone:north-america`) : 500 récurrents + un
    timeout observés par la revue. Cause réelle : `client.rs::is_retryable_connection_error` ne
    reconnaissait pas « Session not found »/« Specify a namespace to use » (les erreurs que
    `graph_api.rs` documentait lui-même avoir vues sous charge) — ces erreurs remontaient donc en 500
    brut au lieu d'un retry + 503. Corrigé : liste étendue + timeout de requête (10 s) dans
    `with_retry` pour transformer un blocage de 30 s en échec rapide classifié ; `Retry-After` ajouté
    sur les 503 de `/graph/*` ; cache snapshot 5 s ajouté (`(table,id,depth,limit)`) pour réduire la
    pression sur la connexion partagée. Un vrai pool de connexions reste à faire (hors périmètre
    chirurgical de cette passe).
- Lot 5 : … (inclure : taux d'arêtes/jour par relation)
  - **Lot 5 est partiel, pas livré** — correction de la déclaration trompeuse relevée par la revue.
    Fait cette passe : `GraphEdge.tsx` rend `edge.attributes` (score/explain/timestamp, testé) ; cache
    snapshot court-TTL ajouté à `graph_api.rs`. Toujours sans producteur : #6 (`vessel→near→cable`),
    #8 (`cyber_threat→hosted_in→zone`), #9 (`gdelt_event→located_in→zone`), #11 (`ConvergenceAlert`).
    #9 avait un blocage levé (tier pays, Lot 7a) mais reste bloqué côté GDELT lui-même (réseau).
    `SEARCH_SCAN_LIMIT = 250` toujours en place, non traité cette passe.
- Lot 6 : … (inclure : % caméras à cap fiable)
  - Non retouché cette passe (hors périmètre des 4 findings assignés), sauf vérification : le défaut
    `DEFAULT_WINGSPAN_M = 36.0` (`cameras/src/visibility.rs:56`) reste actif — tar1090-db n'est pas la
    source qu'il faut pour ce champ (voir Lot 7a), aucune source envergure-par-type publique trouvée
    cette session pour le remplacer.
- Lot 7a : … Voir le détail ligne par ligne ci-dessus. Résumé : tier pays livré et vérifié en base
  (237 zones, 718 arêtes `camera→country-*` réelles) ; bug maritime réel trouvé et corrigé
  (`/maritime` 0 → 1235 vessels) ; sanctions OFAC SDN réelles (`is_sanctioned`, matching call-sign
  exact après retrait d'un fallback nom qui produisait un faux positif confirmé) ; audit Wowza décidé
  (à retirer) mais pas exécuté dans le code (collision avec un autre agent sur `generic.rs`) ; GDELT et
  ThreatFox confirmés bloqués par des causes externes (réseau sandbox / clé d'auth humaine), pas des
  bugs de code ; tar1090-db/plane-alert-db investigués et non intégrés (prémisse du plan corrigée pour
  le premier, câblage du second hors périmètre chirurgical — ripple WS).
- Lot 7b : …
