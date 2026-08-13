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
| **AISStream.io** | aisstream.io | probable : clé API gratuite à l'ouverture du WebSocket (à vérifier, hors plan) | JSON sur WebSocket persistant | non chiffré dans le plan | gratuit ; **ToS à vérifier avant Lot 7** (site derrière Cloudflare lors de l'audit) | mondial **côtier** (~40-75 km des côtes — AIS terrestre, trou hauturier documenté) | à intégrer — swap non fait ce lot (voir note Lot 7a ci-dessous : le flux finlandais existant a été réparé au lieu, ToS AISStream toujours pas vérifiables) | `maritime` | **medium** (client WS persistant, reconnect/backpressure — pas « low ») | couche maritime (0→réel) ; relation #6 cadrée côtier |
| **GDELT** (fix ingest) | gdeltproject.org (API : api.gdeltproject.org) | aucune (API publique) | JSON/CSV selon endpoint | non spécifié dans le plan | open | mondial | **intégré (cassé), cause reclassée** — 0 item mesuré (`baseline-mesures.md:108-111`) ; vérifié ce lot : DNS résout (`104.197.47.124`) mais le handshake TLS expire (6s) depuis cet environnement — blocage réseau de la sandbox, pas un bug de code identifiable (le code dégrade déjà proprement vers `Vec::new()` sur échec). Non modifié : aucun correctif n'est vérifiable sans accès réseau réel à l'hôte. | `gdelt` | low | relation #9 |
| **ThreatFox** (cyber IOC, abuse.ch) | threatfox.abuse.ch | **Auth-Key obligatoire** (portail abuse.ch, env `THREATFOX_AUTH_KEY`) | JSON, API REST (POST) | fair-use ; usage commercial peut exiger un abonnement | fair-use ; usage commercial peut exiger un abonnement | mondial | à intégrer — **confirmé ce lot** : `POST threatfox-api.abuse.ch/api/v1/` répond `{"error":"Unauthorized"}` sans clé (endpoint vivant, clé réellement exigée). Obtenir une clé nécessite une inscription humaine sur auth.abuse.ch (vérification e-mail) — non exécutable par un agent autonome cette session. `THREATFOX_AUTH_KEY` reste non défini. | `cyber` | low | couche cyber (0→réel) ; relation #8 re-sémantisée |
| **OpenSanctions** | opensanctions.org | à vérifier — dumps bruts vs API hébergée avec clé | JSON REST ou dumps CSV/JSON | non spécifié dans le plan | **CC-BY-NC 4.0 — non-commercial** (incohérence de diligence corrigée en revue). Acceptable tant qu'expérimental ; alternative sans restriction : parser les listes primaires (OFAC SDN, UE, ONU — domaine public) | mondial | **rejeté, remplacé par OFAC SDN** — voir note Lot 7a ci-dessous, `is_sanctioned` est maintenant réel via OFAC uniquement | `maritime`/`services` | low | `is_sanctioned` réel |
| **Mictronics / tar1090-db** | github.com/wiedehopf/tar1090-db | aucune (dump statique versionné) | fichier CSV/JSON compressé | n/a (pas d'API) | ODC-BY | mondial | **prémisse du plan corrigée ce lot** : le repo (vérifié via l'API GitHub, `db/*.js` + `aircraft.csv.gz` sur la branche `csv`) est un registre hex→immatriculation/type, **pas** une table envergure-par-type — il n'y a pas d'« envergure » à en extraire. Par ailleurs `services/adsb.rs:228-229` alimente déjà `Aircraft.registration`/`aircraft_type` directement depuis le flux ADS-B (`r`/`t`), donc le hex→type de tar1090-db serait largement redondant. Non intégré tel que prévu — voir note Lot 7a pour l'alternative envergure. | `services` | low | attributs avion + **envergure pour le critère pixel P2** |
| **plane-alert-db** (hex militaire→agence) | github.com/sdr-enthusiasts/plane-alert-db | aucune | CSV statique | n/a | **ODbL 1.0 + DbCL 1.0** (vérifié : `LICENSE` du repo) | mondial | **vérifié, non intégré** — `plane-alert-mil.csv` (1524 lignes, colonnes `$ICAO,$Registration,$Operator,$Type,$ICAO Type,...`) est accessible et correspond exactement au besoin. Non câblé ce lot : l'`Operator`/agence n'existe sur aucune struct actuelle (`services::Aircraft`), et l'ajouter dépasse une « victoire rapide » — un nouveau champ sur `Aircraft` engage le miroir WS à 3 endroits (`ws/messages.rs` + les 2 unions `frontend/src/types/ws.ts`), hors périmètre chirurgical de cette passe. | `services` | low | attribution nommée |

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
| **Flux Wowza coréens en IP nue** | `backend/crates/cameras/src/providers/generic.rs:164` (Seoul Gangnam) et `:174` (Seoul Hongdae) — vérifié dans le code : `http://210.179.218.52:1935/live/...stream/playlist.m3u8` | IP nue, aucune provenance/licence documentée — exactement le pattern rejeté pour Insecam ci-dessus. Aucune recherche de provenance/whois n'a été tentée ce lot (se connecter au flux pour "vérifier" serait le même accès sans consentement que le pattern qu'on audite). | **Décision (Lot 7a) : à retirer.** Aucune preuve de consentement opérateur trouvable depuis le code ou son historique ; par défaut on traite comme non autorisé, même politique qu'Insecam. **Non exécuté dans le code cette passe** : `generic.rs` a des modifications non commitées d'un autre agent (Lot 6, providers caméra) au moment de cette revue — retirer ces deux entrées est laissé à qui possède ce fichier pour éviter un conflit d'édition, cf. rapport de tâche. |

---

## Lot 7a — exécuté ce lot (audit + corrections vérifiées)

Contexte : Lot 7a était non livré (déclaration nulle) au moment de la revue Lots 4-7a. Ce qui suit a été
vérifié par exécution réelle, pas supposé.

- **Tier pays** (`graph/src/zones.rs`, `backend/data/zones/global_zones.geojson`) — **fait**. 177 polygones
  pays Natural Earth 1:110m (domaine public CC0, vérifié via le fichier `licence` du miroir
  `martynafford/natural-earth-geojson`), fusionnés dans le fichier de zones existant (60 → 237 zones).
  Ids préfixés `country-{ADM0_A3 en minuscules}` (ex. `country-fra`) pour ne jamais collisionner avec les
  ids région existants (`australia` région vs `country-aus` pays — testé). Test réel chargeant le fichier
  de production : Paris résout `city-paris` + `europe` + `country-fra` simultanément (additif, rien
  déplacé) — `graph/src/zones.rs` test `real_zones_file_resolves_country_tier_alongside_region_tier`.
  Zéro changement de code dans `consumer_graph` : `resolve_location_zone_ids` consommait déjà
  `ZoneLookup::lookup()` de façon générique (plusieurs zones par point), donc le tier pays est purement
  une donnée en plus.
- **OFAC SDN (sanctions)** — **fait**, remplace OpenSanctions comme recommandé par la revue.
  `backend/data/sanctions/ofac_sdn_vessels.json` (1524 entrées `SDN_Type=vessel`, filtrées depuis
  `sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV` — œuvre du gouvernement
  US, domaine public). `maritime::sanctions::is_sanctioned_vessel` matche exact sur le **call sign
  uniquement** — le fallback par nom a été essayé puis retiré avant livraison : testé en direct sur le
  flux réel, il a produit un faux positif confirmé (un navire finlandais nommé « LEO », call sign `OJTZ`,
  IMO 7363970, en route vers un port finlandais, matchait le nom « LEO » d'un navire sanctionné
  Russie/Ukraine sans rapport, call sign `8P2467`). Un nom d'affichage n'est pas un identifiant unique ;
  le call sign l'est. Câblé dans `maritime::ais::fetch_vessels` : `is_sanctioned`/`name` réels au lieu de
  `false`/`None` codés en dur — mesuré en direct : 1235 navires, 39 sanctionnés sur match call-sign exact
  avant le retrait du fallback nom (le chiffre après retrait est à revérifier, cf. rapport de tâche).
- **Bug maritime réel trouvé et corrigé** — le flux finlandais (digitraffic) renvoyait 0 vessel en
  production : `ais.rs` envoie `Accept-Encoding: gzip` mais `reqwest` n'avait pas la feature cargo
  `"gzip"` (`backend/Cargo.toml`), donc chaque réponse (compressée puisque le header l'annonce) échouait
  au décodage JSON et retombait sur `Ok(Vec::new())` silencieusement. Reproduit en direct (`curl` sans
  négociation gzip réelle → 406 « Use of gzip compression is required » ; avec `--compressed` → 200,
  vraies données). Corrigé en une ligne (`features = ["json", "gzip"]`).
- **ThreatFox / GDELT** — vérifiés en direct, tous les deux bloqués par des causes externes documentées
  ci-dessus (clé Auth-Key humaine requise / hôte inatteignable depuis cette sandbox). Non exécutables
  cette session, pas des bugs de code.
- **tar1090-db / plane-alert-db** — repos vérifiés en direct (contenu, licence). tar1090-db ne contient
  pas la donnée envergure attendue par le plan (prémisse corrigée ci-dessus) ; plane-alert-db est
  utilisable mais son câblage complet engage le miroir WS à 3 endroits, hors périmètre chirurgical de
  cette passe — voir le rapport de tâche pour le détail exact (fichier, colonnes, licence) prêt pour la
  prochaine passe.
- **Streams Wowza hardcodés** — audité, décision documentée ci-dessus (à retirer), non exécuté dans le
  code pour éviter un conflit avec les modifications en cours d'un autre agent sur ce fichier.

---

## Résumé

| Catégorie | Nombre de sources |
|---|---|
| Priorité 1 (mondial, couches à 0 + franco-centrisme) | 6 |
| Priorité 2 (P2 caméra↔avion) | 7 |
| Priorité 3 (cross-domaine) | 6 (dont adsb.fi/airplanes.live déjà couvert par P0-1) |
| Rejetées | 11 |
| Existant à auditer | 1 (2 flux caméra) |
