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
| **AISStream.io** | aisstream.io | probable : clé API gratuite à l'ouverture du WebSocket (à vérifier, hors plan) | JSON sur WebSocket persistant | non chiffré dans le plan | gratuit ; **ToS non vérifiables — confirmé à nouveau Lot 7b** | mondial **côtier** (~40-75 km des côtes — AIS terrestre, trou hauturier documenté) | **rejeté (CGU non vérifiables, deux tentatives)** — Lot 7b a retenté avec deux outils différents (`curl` direct et un outil de fetch authentifié) sur `/`, `/terms`, `/terms-of-service`, `/tos`, `/legal`, `/privacy-policy`, `/documentation` : **403 sur les huit**, cohérent avec le blocage Cloudflare déjà observé au Lot 7a. Sans CGU lisibles, aucune intégration n'est défendable pour un projet visant des contrats commerciaux — écarté, pas swappé. Le flux finlandais (digitraffic) reste seul dans `maritime`, **non compté** comme une des « trois sources mondiales » de ce lot (couverture Baltique/Finlande uniquement, pas mondiale) ; GDACS le remplace dans ce rôle — voir Lot 7b. | `maritime` | **medium** (client WS persistant, reconnect/backpressure — pas « low ») | couche maritime déjà réelle via digitraffic (régional) ; relation #6 cadrée côtier reste ouverte si une source mondiale légale apparaît |
| **GDELT** (fix ingest) | data.gdeltproject.org/gdeltv2/ (fichiers CSV, pas l'API `api.gdeltproject.org`) | aucune (fichiers publics) | CSV/TSV (Event 2.0, 61 colonnes, zip) | aucun observé | open — usage commercial explicitement autorisé, **mais attribution requise** (« any use or redistribution must include a citation to the GDELT Project and a link to gdeltproject.org » — vérifié en direct 2026-08-13 sur gdeltproject.org/about.html ; à afficher dans l'UI/les crédits avant tout usage commercial) | mondial | **intégré, cause réelle diagnostiquée et corrigée** — voir Lot 7b ci-dessous : la sandbox a bien accès réseau (le diagnostic Lot 7a datait d'un incident réseau ponctuel, pas d'un blocage permanent) ; le vrai bug était que le code appelait l'API GEO 2.0 (`api.gdeltproject.org/api/v2/geo/geo?query=*`), faite pour géolocaliser des *articles* de presse correspondant à une recherche, pas pour lister "les événements du moment" — `query=*` y répond 404 (vérifié en direct). Réécrit pour consommer le vrai flux d'événements GDELT (`data.gdeltproject.org/gdeltv2/lastupdate.txt` → fichier `.export.CSV.zip`, régénéré toutes les 15 min). Mesuré en direct 2026-08-13 : 163-200 événements/cycle après filtre anti-bruit. | `gdelt` | low (diagnostic) / medium (réécriture du parsing + `zip`) | relation #9, `gdelt_event -> located_in -> zone` |
| **ThreatFox** (cyber IOC, abuse.ch) | threatfox.abuse.ch | **Auth-Key obligatoire** (portail abuse.ch, env `THREATFOX_AUTH_KEY`) | JSON, API REST (POST) | fair-use ; usage commercial peut exiger un abonnement | fair-use ; usage commercial peut exiger un abonnement | mondial | à intégrer — **confirmé ce lot** : `POST threatfox-api.abuse.ch/api/v1/` répond `{"error":"Unauthorized"}` sans clé (endpoint vivant, clé réellement exigée). Obtenir une clé nécessite une inscription humaine sur auth.abuse.ch (vérification e-mail) — non exécutable par un agent autonome cette session. `THREATFOX_AUTH_KEY` reste non défini. | `cyber` | low | couche cyber (0→réel) ; relation #8 re-sémantisée |
| **OpenSanctions** | opensanctions.org | à vérifier — dumps bruts vs API hébergée avec clé | JSON REST ou dumps CSV/JSON | non spécifié dans le plan | **CC-BY-NC 4.0 — non-commercial** (incohérence de diligence corrigée en revue). Acceptable tant qu'expérimental ; alternative sans restriction : parser les listes primaires (OFAC SDN, UE, ONU — domaine public) | mondial | **rejeté, remplacé par OFAC SDN** — voir note Lot 7a ci-dessous, `is_sanctioned` est maintenant réel via OFAC uniquement | `maritime`/`services` | low | `is_sanctioned` réel |
| **Mictronics / tar1090-db** | github.com/wiedehopf/tar1090-db | aucune (dump statique versionné) | fichier CSV/JSON compressé | n/a (pas d'API) | ODC-BY | mondial | **prémisse du plan corrigée ce lot** : le repo (vérifié via l'API GitHub, `db/*.js` + `aircraft.csv.gz` sur la branche `csv`) est un registre hex→immatriculation/type, **pas** une table envergure-par-type — il n'y a pas d'« envergure » à en extraire. Par ailleurs `services/adsb.rs:228-229` alimente déjà `Aircraft.registration`/`aircraft_type` directement depuis le flux ADS-B (`r`/`t`), donc le hex→type de tar1090-db serait largement redondant. Non intégré tel que prévu — voir note Lot 7a pour l'alternative envergure. | `services` | low | attributs avion + **envergure pour le critère pixel P2** |
| **plane-alert-db** (hex militaire→agence) | github.com/sdr-enthusiasts/plane-alert-db | aucune | CSV statique | n/a | **ODbL 1.0 + DbCL 1.0** (vérifié : `LICENSE` du repo) | mondial | **vérifié, non intégré** — `plane-alert-mil.csv` (1524 lignes, colonnes `$ICAO,$Registration,$Operator,$Type,$ICAO Type,...`) est accessible et correspond exactement au besoin. Non câblé ce lot : l'`Operator`/agence n'existe sur aucune struct actuelle (`services::Aircraft`), et l'ajouter dépasse une « victoire rapide » — un nouveau champ sur `Aircraft` engage le miroir WS à 3 endroits (`ws/messages.rs` + les 2 unions `frontend/src/types/ws.ts`), hors périmètre chirurgical de cette passe. | `services` | low | attribution nommée |

---

## Priorité 2 — P2 caméra↔avion & couverture caméra mondiale

`seeyou-v2.md:354-364`

| Nom | URL | Auth | Format | Rate limit | Licence | Couverture | Statut | Crate | Effort | Débloque |
|---|---|---|---|---|---|---|---|---|---|---|
| **OurAirports** (airports.csv) | davidmegginson.github.io/ourairports-data/airports.csv (miroir GitHub officiel du dump quotidien ; page canonique ourairports.com/data/) | aucune | CSV téléchargeable | n/a (fichier statique, régénéré chaque nuit côté OurAirports) | **Domaine public — vérifié en direct 2026-08-13** sur ourairports.com/data/, citation exacte : « All data is released to the Public Domain » (pas PDDL comme la prémisse du plan le supposait ; le domaine public est *plus* permissif, aucune attribution requise) | mondial | **intégré, Lot 7b** — 85 892 lignes brutes, filtrées sur `type` = `large_airport`/`medium_airport` uniquement (5 272 lignes retenues, 80 620 écartées — hélipads/small_airport/closed/seaplane_base/balloonport, cf. commentaire du code) ; converti en JSON compact embarqué (`backend/data/airports/airports.json`, 1,15 Mo) et servi par `GET /airports` (module `api::airports`, pas un nouveau crate — mêmes patrons que `military_bases.json`) ; seedé dans le graph au démarrage (`airport -> located_in -> zone`, 10 198 arêtes mesurées). Runways.csv **non intégré** (hors du besoin réel : l'ancrage de zone aéroport ne demande que le point centre, pas la géométrie de piste — pas de scope creep). | module `api::airports` (pas de nouveau crate) | low | zone aéroport pour le pré-filtre approche/décollage P2 ; `airport -> located_in -> zone` réel |
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
| **GDACS** | gdacs.org/xml/rss.xml | aucune | RSS/XML (parsé à la main, `quick-xml` event-based — aucun crate XML n'existait dans le workspace ; l'API GeoJSON du même site existe mais s'est avérée paginée/tronquée à 100 items par requête sans offrir la liste complète des événements courants, contrairement au flux RSS) | aucun observé | **Domaine public — la licence est déclarée dans le flux lui-même** (`<copyright>public domain</copyright>`, vérifié en direct 2026-08-13 — la source la plus forte possible, pas une page séparée qui pourrait diverger des données) | mondial | **intégré, Lot 7b — remplace le rôle « 3ᵉ source mondiale » que l'AIS ne pouvait pas remplir légalement**. Mesuré en direct : le flux brut fait 362 items, dont 325 (90 %) `WF` (incendie) et 4 `EQ` (séisme) — redondants avec `fires` (NASA FIRMS, 34 635 lignes) et `seismic` (USGS) déjà présents et plus fins sur ces deux aléas précisément. Filtré sur les 4 types que cette app ne couvre nulle part ailleurs (`TC` cyclone, `FL` inondation, `VO` volcan, `DR` sécheresse) + `iscurrent=true` : 20 événements retenus. | `disasters` (nouveau) | low (diagnostic du bon flux) / medium (parsing RSS à la main) | `disaster_event -> located_in -> zone` réel (35 arêtes mesurées) ; relation `near`/`triggered` cross-domaine reste à construire (hors périmètre de ce lot) |
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

## Lot 7b — exécuté ce lot (trois sources mondiales réellement ingérées)

Contexte : condition (6) du Lot 4-6 (« 3+ nouvelles sources mondiales ») restait non atteinte —
`/gdelt` et `/maritime` mesuraient 0 malgré le travail du Lot 7a. Ce qui suit a été exécuté et vérifié
en direct (serveur relancé, `consumer_graph` relancé, requêtes SurrealDB réelles), pas supposé.

### GDELT — cause réelle, différente du diagnostic Lot 7a

Le diagnostic Lot 7a (« TLS expire après 6s, blocage réseau de la sandbox ») **ne s'est pas reproduit**
ce lot : `curl` direct vers `api.gdeltproject.org` réussit (handshake TLS OK, certificat valide). La
vraie cause était dans le code : `gdelt/src/api.rs` appelait
`https://api.gdeltproject.org/api/v2/geo/geo?query=*&format=GeoJSON&maxpoints=500` — l'API **GEO 2.0**,
qui géolocalise des *articles de presse* correspondant à une recherche plein-texte, pas « les
événements que GDELT vient de publier ». Vérifié en direct : cette URL répond **404** avec `query=*`
(un joker vide n'est pas un opérateur de recherche valide pour cette API) et **404** aussi avec un
terme de recherche réel (`query=conflict`) — l'endpoint lui-même a changé/n'accepte plus ce chemin,
indépendamment du paramètre.

Le vrai flux « événements » de GDELT est ailleurs : `data.gdeltproject.org/gdeltv2/lastupdate.txt`
liste les trois fichiers courants (export/mentions/gkg), régénérés toutes les 15 minutes — exactement
ce que l'énoncé de la tâche indiquait. `gdelt/src/api.rs` a été réécrit pour consommer ce flux :
télécharger le `.export.CSV.zip` (nouvelle dépendance `zip`, aucun crate ZIP n'existait dans le
workspace), l'extraire, parser le CSV/TSV à 61 colonnes fixes (layout vérifié colonne par colonne
contre un fichier réel téléchargé le jour même, pas supposé du codebook GDELT seul).

**Anti-bruit** : `NumSources` (le seuil suggéré par la tâche) s'est avéré inutilisable en pratique —
mesuré sur un fichier réel, 1155/1198 lignes (96 %) valent exactement 1 ou 2 : ce champ compte les
documents sources *dans ce batch de 15 minutes*, pas la couverture totale, et GDELT lui-même recommande
`NumMentions` pour cet usage. Seuil retenu : `NumMentions >= 10` **et** coordonnées `ActionGeo`
valides — mesuré 192/1198 lignes (16 %) sur l'échantillon de référence, ~18 400/jour projeté (même
ordre de grandeur que `fire_hotspot`, 34 635 lignes). Mesuré en production sur plusieurs cycles réels :
163 à 200 événements/cycle de 15 minutes.

**Champs changés par la réécriture** (le format Event 2.0 n'a pas d'équivalent article/titre) :
`title` est maintenant synthétisé à partir des noms d'acteurs + la taxonomie QuadClass à 4 valeurs de
GDELT (ex. « NEW DELHI → WASHINGTON (verbal cooperation) »), pas inventé ; `image_url` est désormais
toujours `None` (aucun équivalent dans Event 2.0) ; `source_country` change de sens (pays de
l'organe de presse → pays du lieu de l'événement, code FIPS 10-4) — documenté dans le code
(`gdelt/src/types.rs`), pas silencieux. Détail complet et tests dans `gdelt/src/api.rs`.

**Panne de disponibilité observée pendant la vérification, non reproduite** : lors d'un test à
cadence artificiellement accélérée (20 s au lieu de 900 s, uniquement pour vérifier plus vite), un
run a mesuré `count=0` pendant ~20 minutes alors qu'un diagnostic indépendant (test `#[ignore]` sur
le réseau réel, `gdelt::api::tests::diagnose_live_fetch`) obtenait 176 événements au même moment sur
la même URL. Un redémarrage propre a immédiatement retrouvé un comportement sain (176 puis 168 sur
les cycles suivants), non reproduit sur un second run complet. Hypothèse la plus probable : une forme
de limitation anti-abus côté Google Cloud Storage (l'infrastructure qui sert ces fichiers) déclenchée
par une cadence de requêtes largement supérieure à l'usage réel (900 s) — à la cadence de production,
aucune requête n'est jamais répétée assez vite pour déclencher ce comportement. Conséquence retenue :
chaque point de dégradation de `gdelt::api::fetch_events` loggue maintenant un `warn!` distinct
(requête échouée / statut non-200 / corps illisible / zip illisible / zéro ligne après filtre) — avant
ce lot, tous ces cas retournaient silencieusement `Ok(vec![])`, indistinguable d'un cycle légitimement
vide. C'est précisément ce qui a coûté le temps de diagnostic ce lot ; ça ne devrait plus être le cas.

### Maritime — déjà réparé, mais pas mondial

Le flux finlandais (digitraffic) fonctionne réellement : vérifié en direct, 1239-1298 navires selon le
cycle. Licence (vérifiée en direct 2026-08-13 sur digitraffic.fi/en/terms-of-service/) : **CC BY 4.0**,
usage commercial autorisé, **attribution requise** — format recommandé par Fintraffic :
« Source: Fintraffic / digitraffic.fi, license CC 4.0 BY » (à afficher dans l'UI/les crédits, comme
l'attribution GDELT). Le correctif gzip du Lot 7a (`reqwest` avec la feature `"gzip"`) est bien présent dans
`backend/Cargo.toml` et n'a pas eu besoin d'être retouché. Ce qui manquait : le rattachement au graph
(`vessel -> located_in -> zone`) — une seule ligne dans `consumer_graph/src/processing.rs` (ajouter
`"vessel"` au même bras de correspondance que `"camera" | "traffic_segment" | "weather"`, le patron
existait déjà comme l'énoncé de la tâche l'indiquait). Mesuré : 1 725 arêtes `located_in` réelles
depuis `vessel`.

**Ce que digitraffic n'est pas** : une source mondiale. C'est le réseau AIS terrestre propre à
l'agence finlandaise des transports, couverture Baltique/Finlande uniquement (position mesurée d'un
navire réel : 59,47°N 18,75°E, au large de Stockholm) — documenté en détail dans
`maritime/src/ais.rs` (commentaire de tête du module). Les trois candidats AIS mondiaux de l'énoncé
ont été réévalués et aucun n'a passé la barre :

- **AISStream.io** — CGU non vérifiables, deux tentatives avec deux outils différents (voir table
  Priorité 1 ci-dessus pour le détail des 8 URLs testées, toutes en 403).
- **Norwegian Coastal Administration** — régional par construction (Norvège), ne résout pas le besoin
  de couverture mondiale même si son AIS ouvert est légitime.
- **Global Fishing Watch** — inscription humaine requise pour la clé API, non exécutable par un agent
  autonome cette session (même blocage que ThreatFox au Lot 4-6) ; par ailleurs centré sur les navires
  de pêche, pas l'AIS généraliste.

Aucune source AIS n'étant à la fois mondiale, sans inscription humaine et aux CGU vérifiables,
l'énoncé de la tâche autorisait explicitement le remplacement (« si aucune source n'est utilisable
légalement, dis-le et remplace ») — **GDACS occupe le rôle de 3ᵉ source mondiale**, pas le maritime.
Le flux finlandais reste intégré et alimente des relations réelles, simplement pas compté dans les
« trois ».

### OurAirports — intégré comme prévu

Voir la table Priorité 2 ci-dessus pour le détail (licence domaine public vérifiée en direct, filtre
5 272/85 892 lignes, `GET /airports`, seed graph `airport -> located_in -> zone` à 10 198 arêtes).
Seule différence avec le plan d'origine : implémenté comme un module dans `api` (`api::airports`),
pas un nouveau crate séparé — même patron que `military_bases.json`/`nuclear_sites.json`, déjà
établi dans ce codebase pour des données de référence statiques.

### GDACS — nouvelle source, remplace le rôle maritime mondial

Voir la table Priorité 3 ci-dessus. Point d'architecture notable : **aucune écriture graph pour
`airport`/`disaster_event` ne passe par le bus Kafka**. `backend/crates/bus/` n'est pas un fichier que
cette tâche pouvait modifier (périmètre exclusif), et ajouter un nouveau topic Kafka aurait nécessité
de le toucher. À la place, les écritures graph (entités + arêtes `located_in`) se font en direct
depuis `server::main` — `airport` une fois au démarrage (à côté du seed de zones, même patron), et
`disaster_event` à chaque cycle du tracker GDACS. Vérifié empiriquement avant d'écrire le code
(`UPSERT`/`RELATE` sur une table jamais déclarée dans `graph::ontology` fonctionnent — SurrealDB
3.2.4 auto-crée les tables SCHEMALESS non-strictes) : ce n'est pas un contournement fragile, c'est un
comportement du moteur confirmé en direct. Conséquence acceptée : pas d'entrée `bus::topics` pour ces
deux domaines, donc `consumer_postgres`/`consumer_redis` ne les voient pas s'ils en dépendaient — non
constaté comme un besoin réel pour ces deux domaines (référence statique / alertes catastrophe, pas
un flux que ces deux consommateurs traitent pour les autres domaines non plus).

### Vérification exécutée (chiffres réels, 2026-08-13)

| Vérification | Avant | Après |
|---|---|---|
| `cargo test --workspace` | — | **0 échec**, tous crates touchés verts (`gdelt` 11, `maritime` 5, `disasters` 7, `consumer_graph` 17, `graph` 26, `api` 33) |
| `GET /gdelt` | `events: 0` | `events: 163-200` |
| `GET /maritime` | `vessels: 0` | `vessels: 1239-1298` |
| `GET /airports` (nouveau) | n/a | `5272` |
| `GET /disasters` (nouveau) | n/a | `disasters: 20` |
| `located_in` (table complète) | 20 060 (Lot 4-6, sans les 4 nouvelles sources) | **32 370**, dont `airport` 10 198, `gdelt_event` 352, `vessel` 1 725, `disaster_event` 35 |
| Nœuds `gdelt_event` / `vessel` / `airport` / `disaster_event` | 0 / (non lié au graph) / 0 / 0 | 200 / 1 298 / 5 272 / 20 |

### Ce qui reste ouvert

- Runways.csv (OurAirports) et navaids.csv non intégrés — non nécessaires au besoin réel (le pré-filtre
  approche/décollage n'a besoin que du point aéroport), à réévaluer si P2 a explicitement besoin de la
  géométrie de piste.
- Le seed `airport` au démarrage prend ~2-3 minutes (5 272 `UPSERT` séquentiels — `graph::entities`
  n'expose pas de variante batchée, seul `graph::relations::link_batch` existe, et
  `backend/crates/graph/` n'était pas dans le périmètre exclusif de cette tâche). Coût unique au
  démarrage, pas un chemin chaud — non corrigé, documenté ici pour la prochaine passe qui aurait
  légitimement accès à `graph/src/entities.rs`.
- `disaster_event`/`airport` ne passent pas par le bus (voir ci-dessus) — si un futur besoin
  (`consumer_postgres`, persistance long-terme) apparaît pour ces domaines, il faudra revisiter cette
  décision avec `backend/crates/bus/` dans le périmètre.

---

## Résumé

| Catégorie | Nombre de sources |
|---|---|
| Priorité 1 (mondial, couches à 0 + franco-centrisme) | 6 |
| Priorité 2 (P2 caméra↔avion) | 7 |
| Priorité 3 (cross-domaine) | 6 (dont adsb.fi/airplanes.live déjà couvert par P0-1) |
| Rejetées | 11 (+ AISStream.io, rejeté Lot 7b — CGU non vérifiables) |
| Existant à auditer | 1 (2 flux caméra) |

**Statut réel des trois sources mondiales visées par le Lot 7b** (`GDELT`, `OurAirports`, `GDACS` —
`maritime` reste intégré mais régional, voir la section Lot 7b) :

| Source | Statut avant | Statut après (mesuré 2026-08-13) |
|---|---|---|
| GDELT | 0 événement (mauvais endpoint) | 163-200 événements/cycle, `gdelt_event -> located_in -> zone` réel |
| OurAirports | non intégré | 5 272 aéroports, `airport -> located_in -> zone` réel (10 198 arêtes) |
| GDACS | non intégré (AIS mondial écarté à sa place) | 20 événements courants, `disaster_event -> located_in -> zone` réel (35 arêtes) |
