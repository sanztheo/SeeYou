# Sources de données — catalogue P3

> Extrait de `docs/plans/seeyou-v2.md` (section P3 "Nouvelles sources de données",
> lignes 339-393) pour P0-0 (Lot 0). Le plan lui-même renvoie à ce fichier :
> « Détail complet (auth, format, rate limit, licence) : `docs/plans/sources.md`,
> créé et versionné au Lot 0 » (`seeyou-v2.md:393`) — **le Lot 7 n'est pas
> exécutable sans ce fichier**.

**Note de méthode.** Le tableau source du plan ne documente que
`Source | Portée | Crate | Effort | Licence/accès | Débloque` — **aucune colonne
URL/Auth/Format/Rate-limit n'existe dans le plan d'origine**. Ces quatre colonnes
sont complétées ici à partir de la connaissance générale de chaque service (ce
sont des services publics identifiables sans ambiguïté par leur nom). Quand une
valeur n'est pas confirmée avec un niveau de confiance élevé, elle est marquée
**« à vérifier »** plutôt qu'inventée — en particulier tout ce qui touche à la
licence et aux CGU doit être revérifié sur la source primaire avant intégration
(le point qui a justifié ce fichier : le Lot 7a doit auditer les CGU, pas les
supposer). Les colonnes `Crate` / `Effort` / `Licence` / `Débloque` sont, elles,
des citations directes du plan.

## Légende — statut

| Statut | Sens |
|---|---|
| **à intégrer** | identifiée par le plan, aucun code d'ingestion existant |
| **intégré (cassé)** | code présent mais 0 item produit, mesuré dans `baseline-mesures.md:108-111` |
| **rejeté** | écartée par le plan, raison indiquée |
| **à auditer** | existant en prod, provenance/licence non documentée — pas une nouvelle source |

---

## Priorité 1 — combler les couches à 0 et le franco-centrisme (mondial)

`seeyou-v2.md:343-352`

| Nom | URL | Auth | Format | Rate limit | Licence | Couverture | Statut | Crate | Effort | Débloque |
|---|---|---|---|---|---|---|---|---|---|---|
| **AISStream.io** | aisstream.io | probable : clé API gratuite à l'ouverture du WebSocket (à vérifier, hors plan) | JSON sur WebSocket persistant | non chiffré dans le plan | gratuit ; **ToS à vérifier avant Lot 7** (site derrière Cloudflare lors de l'audit) | mondial **côtier** (~40-75 km des côtes — AIS terrestre, trou hauturier documenté) | à intégrer | `maritime` | **medium** (client WS persistant, reconnect/backpressure — pas « low ») | couche maritime (0→réel) ; relation #6 cadrée côtier |
| **GDELT** (fix ingest) | gdeltproject.org (API : api.gdeltproject.org) | aucune (API publique) | JSON/CSV selon endpoint | non spécifié dans le plan | open | mondial | **intégré (cassé)** — 0 item mesuré (`baseline-mesures.md:108-111`) | `gdelt` | low | relation #9 |
| **ThreatFox** (cyber IOC, abuse.ch) | threatfox.abuse.ch | **Auth-Key obligatoire** (portail abuse.ch, env `THREATFOX_AUTH_KEY`) | JSON, API REST (POST) | fair-use ; usage commercial peut exiger un abonnement | fair-use ; usage commercial peut exiger un abonnement | mondial | à intégrer | `cyber` | low | couche cyber (0→réel) ; relation #8 re-sémantisée |
| **OpenSanctions** | opensanctions.org | à vérifier — dumps bruts vs API hébergée avec clé | JSON REST ou dumps CSV/JSON | non spécifié dans le plan | **CC-BY-NC 4.0 — non-commercial** (incohérence de diligence corrigée en revue). Acceptable tant qu'expérimental ; alternative sans restriction : parser les listes primaires (OFAC SDN, UE, ONU — domaine public) | mondial | à intégrer | `maritime`/`services` | low | `is_sanctioned` réel |
| **Mictronics / tar1090-db** | github.com/wiedehopf/tar1090-db (à vérifier — dérivé de la base Mictronics) | aucune (dump statique versionné) | fichier CSV/JSON compressé | n/a (pas d'API) | ODC-BY | mondial | à intégrer | `services` | low | attributs avion + **envergure pour le critère pixel P2** |
| **plane-alert-db** (hex militaire→agence) | github.com/sdr-enthusiasts/plane-alert-db (à vérifier) | aucune | CSV statique | n/a | open | mondial | à intégrer | `services` | low | attribution nommée |

---

## Priorité 2 — P2 caméra↔avion & couverture caméra mondiale

`seeyou-v2.md:354-364`

| Nom | URL | Auth | Format | Rate limit | Licence | Couverture | Statut | Crate | Effort | Débloque |
|---|---|---|---|---|---|---|---|---|---|---|
| **OurAirports** (runways/navaids) | ourairports.com/data/ | aucune | CSV téléchargeable | n/a | PDDL | mondial | à intégrer | seed statique | low | géométrie piste P2 |
| **OSM aeroways** | openstreetmap.org (extraction : download.geofabrik.de) | aucune pour les extracts | extraits `.osm.pbf` par région | l'usage-policy d'overpass-api.de **interdit une requête Overpass mondiale** → contournement = extracts Geofabrik par région | ODbL | mondial | à intégrer | nouveau | **high** (aucun client Overpass n'existe — `crates/traffic` est un proxy TomTom uniquement) | géométrie fine piste/taxiway |
| **Webcams aéroport officielles / state-DOT près des hubs** | variable par aéroport/État — pas de source unique | variable par source | variable (MJPEG/HLS/image-refresh, comme les autres providers `cameras`) | non spécifié — par source | par source (opendata) | régional | à intégrer | `cameras` | medium | **le scénario vitrine P2 « aéroport »** (la flotte actuelle est 100 % routière) |
| **511 US/Canada** | 511.org et équivalents par État (511ny.org, 511pa.com, …) — pas de portail fédéral unique | inscription + clé par État | variable par État (souvent XML/JSON, standard NOCoE) | par État, non chiffré dans le plan | par État | régional (US/CA) | à intégrer | `cameras` | **high** (une inscription + un format **par État** — des semaines, pas « medium ») | densité caméras US/CA |
| **OSM `camera:direction`** | openstreetmap.org (tag), extraction via download.geofabrik.de | aucune pour les extracts | extraits `.osm.pbf` | même contrainte Overpass que OSM aeroways | ODbL | mondial | à intégrer | `cameras` | **medium** (même absence de client Overpass — extracts) | vrais caps pour les caméras `Estimated` |
| **Windy Webcams** | windy.com/webcams (API : api.windy.com) | clé API pour le tier Pro ; embed public sans clé | JSON (API) ; iframe (embed) | tier gratuit : énumération plafonnée à **1 000**, URLs de flux valides **15 min** | tier gratuit = embed/link only ; Pro **9 990 $/an** | mondial | **rejeté pour ingestion/proxy** — contournerait les ToS ; écarté du chemin critique. Option non retenue : player embed (gratuit, sans ingestion) | — | — | — |
| **Copernicus DEM** | dataspace.copernicus.eu / spacedata.copernicus.eu | inscription gratuite Copernicus Data Space | GeoTIFF (COG) | non spécifié dans le plan | open | mondial | roadmap (hors MVP P2) | roadmap P2 | high | occlusion terrain |

---

## Priorité 3 — nouvelles relations cross-domaine & contexte

`seeyou-v2.md:366-375`

| Nom | URL | Auth | Format | Rate limit | Licence | Couverture | Statut | Crate | Effort | Débloque |
|---|---|---|---|---|---|---|---|---|---|---|
| **GDACS** | gdacs.org | aucune | RSS/GeoJSON/XML | non spécifié dans le plan | open | mondial | à intégrer | nouveau `disasters` | low | cyclones/inondations (`near`/`triggered`) |
| **AWC Data API** (SIGMET/G-AIRMET) | aviationweather.gov/data/api | aucune | JSON/XML REST | non spécifié dans le plan | open | mondial | à intégrer | `weather`/`services` | low | corridor aérien ↔ volcan |
| **OpenSky** (2ᵉ source ADS-B + historique) | opensky-network.org | compte gratuit (OAuth2) pour quota étendu ; anonyme limité | JSON REST | quota différent anonyme/authentifié, non chiffré dans le plan | **non-commercial** | mondial | à intégrer | `services` | medium | redondance ; backtest scoring P1 |
| **adsb.fi / airplanes.live** | adsb.fi, airplanes.live | aucune | JSON REST, format ADS-B Exchange v2 compatible | fair-use **~1 req/s chacun** | fair-use ~1 req/s | mondial | **déjà remonté en P0-1 (plan B)** — pas une nouvelle source P3 indépendante | `services` | low | fallback si adsb.lol refuse durablement le débit (P0-1) |
| **ENTSO-E / EIA / SNCF / DB** | transparency.entsoe.eu ; eia.gov/opendata ; ressources.data.sncf.com ; developers.deutschebahn.com | clé/token par source (inscription séparée) | XML (ENTSO-E) ; JSON (EIA, SNCF, DB) | par source, non détaillé dans le plan | par source | régional | à intégrer | nouveau | medium-high | énergie/rail ↔ incident |
| **GLEIF / SIRENE / FAA registry** | gleif.org/en/lei-data/gleif-api ; recherche-entreprises.api.gouv.fr ; registry.faa.gov | aucune pour GLEIF LEI API et l'API Sirene publique ; FAA = dump téléchargeable | JSON REST (GLEIF, Sirene) ; CSV (FAA releasable aircraft database) | non détaillé dans le plan | open | mondial/régional | à intégrer | nouveau `registry` | medium | graphe de propriété (après le cœur) |

---

## Sources rejetées

`seeyou-v2.md:377-391` — reprises telles que le plan les motive, sans ajout de justification.

| Nom | URL | Raison de rejet (citation du plan) |
|---|---|---|
| **Insecam & agrégateurs non autorisés** | insecam.org (cité pour mémoire — pas à visiter/intégrer) | accès sans consentement opérateur — interdit par la contrainte légale |
| **Windy Webcams (ingestion/proxy)** | windy.com/webcams | contournement de ToS (tier gratuit = embed only) — cf. table Priorité 2 |
| **LiveATC.net** | liveatc.net | CGU : « third-party use of live audio streams is prohibited » |
| **ADS-B Exchange (API)** | adsbexchange.com | payant, tier gratuit disparu, licence non-commerciale |
| **Equasis** | equasis.org | CGU interdisent API/harvest/réutilisation en masse |
| **EUROCONTROL NM B2B / EAD** | eurocontrol.int | accès réservé ANSP ; « not for operational use » |
| **Navigraph / Jeppesen / ARINC 424** | navigraph.com ; jeppesen.com | payant, licence fermée |
| **Planespotters.net** | planespotters.net | photos sans licence libre |
| **FAA ASDI** | n/a — service démantelé | démantelé (absorbé dans SWIM/TFMS) |
| **Mozilla Location Service** | n/a — service arrêté (2024) | mort (2024) |
| **OpenOwnership / OpenNav / SkyLink** | n/a — non vérifié individuellement dans le plan | fermé / pas de licence / provenance non documentée |

---

## Existant à auditer (contrainte légale — pas une nouvelle source)

`seeyou-v2.md:341` : « l'audit de provenance couvre aussi les streams hardcodés actuels ».

| Élément | Localisation | Constat | Statut |
|---|---|---|---|
| **Flux Wowza coréens en IP nue** | `backend/crates/cameras/src/providers/generic.rs:163` (Seoul Gangnam) et `:173` (Seoul Hongdae) — vérifié dans le code : `http://210.179.218.52:1935/live/...stream/playlist.m3u8` | IP nue, aucune provenance/licence documentée — exactement le pattern rejeté pour Insecam ci-dessus | **à auditer** (Lot 7a) : documenter la licence ou retirer |

---

## Résumé

| Catégorie | Nombre de sources |
|---|---|
| Priorité 1 (mondial, couches à 0 + franco-centrisme) | 6 |
| Priorité 2 (P2 caméra↔avion) | 7 |
| Priorité 3 (cross-domaine) | 6 (dont adsb.fi/airplanes.live déjà couvert par P0-1) |
| Rejetées | 11 |
| Existant à auditer | 1 (2 flux caméra) |
