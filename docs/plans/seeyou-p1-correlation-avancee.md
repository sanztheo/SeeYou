# SeeYou — Corrélation avancée (au-dessus du socle P1)

> Cette spec vient **au-dessus** du socle P1 de `docs/plans/seeyou-v2.md:177-270`
> (relations par paires, proximité, seuils anti-bruit, convergence par rareté). Elle ne le
> remplace pas : elle suppose les Lots 0-7 tels quels et ajoute les Lots 8-11.
> Toute affirmation chiffrée ici vient soit d'une lecture de code (`fichier:ligne`), soit
> d'une mesure exécutée en direct le 2026-08-10 sur l'instance SurrealDB 3.2.4 locale
> (ns=seeyou db=graph) et l'API :3001, soit d'une URL vérifiée ce même jour. Les ordres de
> grandeur non mesurés sont explicitement marqués « estimation, à mesurer ».
>
> **Révision 2 (2026-08-10)** : intègre la revue avocat du diable (25 constats F1-F25).
> Chaque fait réseau contesté a été re-mesuré avant intégration : dump tar1090-db
> re-téléchargé et compté ligne à ligne, licences re-interrogées via l'API GitHub, tailles
> HTTP re-mesurées. Une seule critique est partiellement réfutée (F13, section
> « Objections écartées ») ; les 24 autres sont intégrées — cardinalités recalculées,
> règles re-spécifiées, chemin commercial re-sourcé (tar1090-db sorti, VRS standing-data
> CC0 entré), chiffrage ajouté, sous-ensemble 80/20 défini (Lots 8A/9A).

---

## 1. Positionnement

Un globe qui affiche 30 000 avions est un affichage de données. Un outil de renseignement
répond à quatre questions qu'aucune couche visuelle ne sait poser :

1. **Qui ?** — relier un objet observé (hex ICAO24, MMSI) à une entité du monde réel
   (opérateur, propriétaire, régime de sanctions). C'est l'étage 1, et tout le reste en dépend :
   sans lui, le graphe ne contient que des choses, jamais des acteurs.
2. **Quoi d'autre ?** — naviguer les liens à plusieurs sauts (« avions dont l'opérateur est
   sanctionné »). Étage 2.
3. **Dans quel ordre ?** — distinguer une séquence temporelle (signal) d'une co-occurrence
   (bruit permanent). Étage 3.
4. **Qu'est-ce qui manque ?** — détecter l'absence d'un signal attendu (transpondeur coupé,
   zone silencieuse). Étage 4.

L'état mesuré du graphe confirme que rien de tout cela n'existe : 34 tables, ~13,4 k arêtes
dont la quasi-totalité sont des `located_in` **sans aucun attribut** (mesuré :
`SELECT * FROM located_in LIMIT 3` → seulement `id/in/out` ; cause : `attributes=None` à
`consumer_graph/src/processing.rs:35,42,53`), zéro table organisation/personne (grep exhaustif
sur les 26 crates : 0 occurrence de `struct Organization|Company|Person|Operator`), et 8 des
14 types de relation sans producteur (comptage live : `near`, `observes`, `involves`,
`connects_to`, `reports`, `targets`, `derived_from`, `triggered` = 0 ligne).

Ce qui vend cet outil sur le marché visé n'est pas le nombre de couches : c'est la capacité
de chaque arête à répondre « pourquoi existes-tu » (section 7) et le refus assumé de créer
une arête douteuse (sections 2 et 6). Une corrélation fausse dans un outil de renseignement
coûte plus cher qu'une corrélation absente — c'est le principe de conception de tout ce
document.

---

## 2. Étage 1 — Résolution d'entité

### 2.1 Le problème concret, tel que mesuré

- L'identité graphe d'un avion est le hex ICAO24 seul : `resolve_entity_id`
  (`consumer_graph/src/payload.rs:136-172`) prend `icao` comme candidat d'id et hash le JSON
  complet sinon.
- Le nœud réel porte déjà plus que l'ontologie ne déclare — mesuré live :
  `SELECT * FROM aircraft LIMIT 1` → `{"aircraft_type":"A359", …, "registration":"SU-GGH", …}`
  (champs présents via `services/src/aircraft.rs:10-26`, non déclarés dans
  `graph/src/ontology.rs:51-58`). **La résolution n'a donc pas besoin d'ajouter
  registration/type : ils arrivent déjà par l'ADS-B.**
- En revanche **aucun champ opérateur/compagnie n'existe nulle part** (grep négatif sur les
  26 crates), aucune table `organization`/`person` n'existe (les 20 `ENTITY_TABLES` de
  `ontology.rs:3-24` + `INFO FOR DB` live = 34 tables exactement), et le seul artefact
  pseudo-organisationnel de toute la base est `cable.owners`, un `array<string>` de texte
  libre relié à rien (`ontology.rs:108`).

Conséquence : un clic sur un avion ne mène jamais à un acteur. C'est la différence exacte
entre l'existant et l'ambition déclarée.

### 2.2 Le modèle à ajouter (style `ontology.rs` exact)

Deux tables entité, trois tables relation. Pas de table `person`, mais pour la bonne raison
(corrigé par la revue, F10) : des producteurs de personnes physiques **existent** — le
registrant FAA est un particulier dans une large fraction des cas — et c'est précisément
pourquoi ils sont **filtrés à l'ingestion** (`TYPE REGISTRANT = individual` exclu, cf. 2.3) :
un produit commercial vendu depuis la France ne stocke pas de noms de particuliers sans base
RGPD (section 9). Les individus sanctionnés vivent dans `sanction` avec
`entity_type="person"` (une entrée de liste de sanctions est un acte public, régime
différent). « Entité juridique » et « personne morale » sont le même objet : `organization`.

Ajouts à `ENTITY_TABLES` (`graph/src/ontology.rs:3-24`) : `"organization"`, `"sanction"`.
Ajouts à `RELATION_TABLES` (`ontology.rs:26-41`) : `"operated_by"`, `"owned_by"`,
`"subject_to"`.

Ajouts à `FIELD_DEFINITIONS` (même forme littérale ; `migrate()` transforme en `option<…>`
automatiquement, `ontology.rs:258-268`) :

```rust
// -- organization : entité juridique / personne morale --
"DEFINE FIELD id ON TABLE organization TYPE string;",
"DEFINE FIELD name ON TABLE organization TYPE string;",
"DEFINE FIELD name_normalized ON TABLE organization TYPE string;",
"DEFINE FIELD country ON TABLE organization TYPE string;",
"DEFINE FIELD org_type ON TABLE organization TYPE string;",      // airline|operator|owner|trustee|agency|manufacturer
"DEFINE FIELD lei ON TABLE organization TYPE string;",
"DEFINE FIELD company_number ON TABLE organization TYPE string;",
"DEFINE FIELD register ON TABLE organization TYPE string;",      // vrs|faa|plane_alert|gleif|companies_house|sirene
"DEFINE FIELD first_seen ON TABLE organization TYPE datetime;",
"DEFINE FIELD last_seen ON TABLE organization TYPE datetime;",
// -- sanction : une entrée de liste, pas un jugement --
"DEFINE FIELD id ON TABLE sanction TYPE string;",                 // <liste>-<ref>, clé naturelle stable
"DEFINE FIELD list ON TABLE sanction TYPE string;",               // ofac_sdn|un_consolidated|uk_sanctions
"DEFINE FIELD list_ref ON TABLE sanction TYPE string;",
"DEFINE FIELD name ON TABLE sanction TYPE string;",
"DEFINE FIELD name_normalized ON TABLE sanction TYPE string;",
"DEFINE FIELD entity_type ON TABLE sanction TYPE string;",        // person|organization|vessel|aircraft
"DEFINE FIELD programs ON TABLE sanction TYPE array;",
"DEFINE FIELD registration ON TABLE sanction TYPE string;",       // immat avion si cible aéronef
"DEFINE FIELD imo ON TABLE sanction TYPE string;",                // si cible navire
"DEFINE FIELD country ON TABLE sanction TYPE string;",
"DEFINE FIELD source_url ON TABLE sanction TYPE string;",
"DEFINE FIELD retrieved_at ON TABLE sanction TYPE datetime;",
// -- relations d'identité (durables, pas de TTL) --
"DEFINE FIELD source ON TABLE operated_by TYPE string;",
"DEFINE FIELD score ON TABLE operated_by TYPE number;",
"DEFINE FIELD timestamp ON TABLE operated_by TYPE datetime;",
"DEFINE FIELD rule ON TABLE operated_by TYPE string;",
"DEFINE FIELD rule_version ON TABLE operated_by TYPE number;",
"DEFINE FIELD match_method ON TABLE operated_by TYPE string;",    // exact_id|blocked_fuzzy|analyst
"DEFINE FIELD match_score ON TABLE operated_by TYPE number;",
"DEFINE FIELD explain ON TABLE operated_by TYPE object;",
// owned_by : mêmes 8 champs que operated_by
// subject_to : mêmes 8 champs + "DEFINE FIELD list_ref ON TABLE subject_to TYPE string;"
// -- triggered (arête de séquence, étage 3) : la règle d'hygiène s'applique aussi à nos
// propres tables (F25 — source/score/timestamp existent déjà, ontology.rs:199-201) --
"DEFINE FIELD rule ON TABLE triggered TYPE string;",
"DEFINE FIELD rule_version ON TABLE triggered TYPE number;",
"DEFINE FIELD lag_s ON TABLE triggered TYPE number;",
"DEFINE FIELD window_s ON TABLE triggered TYPE number;",
"DEFINE FIELD explain ON TABLE triggered TYPE object;",
```

Piège documenté à ne pas reproduire : 5 des 20 tables existantes déclarent des noms de champ
que le producteur n'écrit jamais (`zone.type` vs `zone_type` réel, `aircraft.altitude` vs
`altitude_m`, `vessel.sog_knots` vs `speed_knots`, `military_base.category` vs `branch`,
`nuclear_site.site_type` vs `type` — tous vérifiés live). Règle pour les nouvelles tables :
**les `DEFINE FIELD` se copient depuis le struct Rust producteur, jamais l'inverse**, et un
test colocalisé dans le crate producteur compare les noms sérialisés aux déclarations.

Directions : `aircraft→operated_by→organization`, `aircraft→owned_by→organization`,
`{aircraft|vessel|organization}→subject_to→sanction`. Le niveau 2 GLEIF
(`organization→owned_by→organization`, qui possède qui) est **différé** : la donnée existe
(Golden Copy niveau 2, vérifié), mais aucune requête produit ne l'exige tant que l'étage 2
n'est pas navigable.

**Ce qui ne va PAS dans le graphe** : les référentiels eux-mêmes. GLEIF ≈ millions d'entités,
FAA ≈ centaines de milliers d'immatriculations (ordres de grandeur de référence, à mesurer au
premier téléchargement). Le graphe ne matérialise une `organization` que si elle est reliée à
au moins un objet observé — et, même règle étendue (conséquence de F15) : une entrée
`sanction` n'est matérialisée que si au moins une arête `subject_to` la vise. La table
`sanction` du graphe reste ainsi à 10⁰-10² lignes, ce qui rend la requête produit de
l'étage 2 scannable depuis ce côté-là (3.2.2) ; les listes complètes vivent dans `registry`
et Postgres. Les référentiels restent des index de consultation dans le crate `registry`
(2.6). Sans cette règle, on crée des millions de nœuds morts.

### 2.3 La chaîne de résolution, maillon par maillon

Chaque maillon liste la source retenue, sa licence, et son état de vérification (tout vérifié
le 2026-08-10 sauf mention contraire).

| # | Maillon | Source retenue | Licence | Vérification |
|---|---|---|---|---|
| 1 | **préfixe callsign (3 lettres) → compagnie exploitante (désignateur OACI)** — le maillon standard qui manquait à la v1 (F6) : il résout l'opérateur **effectif** du vol commercial, là où un registre ne donne que le propriétaire déclaré | **VRS standing-data** `airlines/schema-01/airlines.csv` (github.com/vradarserver/standing-data) | **CC0-1.0** (fichier LICENSE présent, confirmé via l'API GitHub ce jour) | re-mesuré ce jour : **5 965 compagnies** ; `AFL→Aeroflot` et `IRM→Mahan Air` présents — exactement les flottes que la requête vitrine doit voir ; miroir `adsblol/vrs-standing-data` (CC0) rafraîchi toutes les heures |
| 2 | hex → pays d'immatriculation | **VRS standing-data** `code-blocks` (même repo, même licence) — remplace la table à coder en dur | CC0-1.0 | présent, vérifié ce jour ; plus rien à coder à la main |
| 3 | hex → avion d'intérêt (militaire/gouvernement/police) | **plane-alert-db** (github.com/sdr-enthusiasts/plane-alert-db) | **ODbL 1.0 (base) + DbCL 1.0 (contenu)** — attribution obligatoire ; share-alike : durcissement F14 en §9 | vivant, ~17 081 aéronefs / 54 catégories ; déjà Lot 7a (`seeyou-v2.md:352`) |
| 4 | registration → propriétaire déclaré | **FAA Releasable Aircraft DB** (registry.faa.gov) pour les N-, avec **filtre `TYPE REGISTRANT ≠ individual` à l'ingestion** et **étiquetage `org_type="trustee"`** des trustees connus (Bank of Utah, Wells Fargo, TVPX, Aircraft Guaranty…) — F10 ; **UK G-INFO** pour les G- (différé en Lot 8B) | domaine public US ; licence G-INFO à confirmer | FAA : fichier confirmé >10 MB ; champ TYPE REGISTRANT présent dans MASTER.txt (doc FAA). Le registrant FAA est un **propriétaire déclaré** — jamais présenté comme opérateur ni bénéficiaire effectif (§9) |
| 5 | nom opérateur/propriétaire → entité juridique (id structuré) | **GLEIF Golden Copy** (LEI, quotidien, niveaux 1-2) ; **UK Companies House** (OGL v3.0 confirmé) ; **INSEE SIRENE** (Licence Ouverte probable, à re-vérifier) ; **SEC EDGAR** — **tout différé en Phase B (Lot 8B)** | GLEIF ouvert (texte complet à relire) ; OGL v3.0 = commercial permis ; Etalab 2.0 probable ; EDGAR sans restriction | les 4 pages/API confirmées vivantes ce jour |
| 6 | entité/avion/navire → sanctions | **OFAC SDN** (treasury.gov, CSV — redirection S3 datée 2026-08-07) ; **UK Sanctions List** (sanctionslist.fcdo.gov.uk — **remplace l'OFSI Consolidated List fermée le 28/01/2026**) ; **ONU liste consolidée** (redirection Azure Blob à jeton SAS ~1 h — suivre la redirection à chaque appel, jamais d'URL codée en dur) | domaine public US ; OGL v3.0 ; ONU sans restriction connue | vivantes ce jour ; **tailles re-mesurées (F12) : UK CSV = 49,6 MB (49 629 114 octets), XML = 21,8 MB — « quelques Mo » était faux, le loader UK streame** |
| — | **UE (FSD)** | **différé** : SPA Angular à jeton de session, pas d'URL fixe (3 tentatives échouées : 404, boucle de redirection, page JS vide) | ouverte au final, mais non scriptable simplement | trou produit face à un client européen — **décision chiffrée au Lot 8B (F12)** : temps d'ingénierie dédié vs **OpenSanctions Screening License payante** (flat-rate, redistribution OEM possible : couvrirait l'UE + remplacerait les 4 parseurs) — **pas** le tier gratuit CC-BY-NC |
| ✗ | ~~hex → registration/type/opérateur via **tar1090-db**~~ | **SORTI DU CHEMIN COMMERCIAL (F11)** : `license: None` via l'API GitHub (re-vérifié ce jour), **aucun fichier LICENSE** (racine du repo listée), base amont Mictronics/readsb en `NOASSERTION` — pas de licence = tous droits réservés par défaut, chaîne de droits amont non établie. « ODC-BY probable — relire le LICENSE » (v1) était une illusion : il n'y a rien à relire | **aucune** (vérifié) | dump re-mesuré ce jour pour calibrage : 614 215 lignes ; `ownop` rempli à **82,1 % sur hex US mais 11,3 % hors US** ; « Air France »=1, « Ryanair »=0, « Aeroflot »=0 — même licencié, ce champ ne résoudrait pas la flotte commerciale mondiale (F6). Action : demande écrite à wiedehopf/Mictronics ; usage dev local uniquement en attendant |

Écarté malgré l'évidence apparente : **OpenSanctions** (CC-BY-NC 4.0 confirmé — incompatible
avec la cible commerciale ; les listes primaires ci-dessus sont la parade, déjà actée
`seeyou-v2.md:350`), **OpenCorporates** (403 sur 3 URL testées, modèle payant),
**OpenSky** (non-commercial, `sources.md:71`). Correction à reporter dans `sources.md:94` :
**OpenOwnership n'est pas « fermé »** — vivant, il standardise BODS et pointe vers les
registres nationaux ; la bonne action est d'intégrer UK PSC directement (OGL v3.0 confirmé)
et d'auditer les autres pays via leur carte. **France : aucun dump du registre DGAC trouvé**
(0 résultat sur data.gouv.fr, deux requêtes + recherche d'organisation) — la couverture F-
passe par le maillon 2 en attendant une vérification humaine ; ne pas coder d'URL supposée.
**Deux lignes de plus à reporter dans `sources.md`** : tar1090-db (aucune licence — hors
chemin commercial, ci-dessus) et adsb.lol (historique ODbL explicite, standing-data CC0,
**flux live sans conditions écrites** — cf. §9 et « Objections écartées »).

### 2.4 Le point dur : rapprochement par nom

Position : **une résolution fausse est pire qu'une absence de résolution.** Un lien
`operated_by` erroné vers une entité sanctionnée est exactement le genre d'erreur qui tue la
crédibilité du produit sur ce marché. Le pipeline est donc asymétrique : précision maximale
sur les liens automatiques, le doute part en file de révision, jamais dans le graphe.

Pipeline, dans l'ordre, court-circuit au premier succès :

1. **Identifiant structuré exact d'abord** — LEI, company number, SIREN, CIK, IMO,
   registration. Précision ~100 % quand disponible, couverture partielle à mesurer.
   `match_method="exact_id"`.
2. **Normalisation** (préalable obligatoire au fuzzy) : majuscules, suppression
   diacritiques/ponctuation, suppression des suffixes de forme juridique via constante nommée
   (`SA, SAS, SARL, GmbH, AG, Ltd, Limited, Inc, Corp, PLC, LLC, BV, SpA, Oy, AB, AS, …`).
   Sans cette étape, « Air France » vs « Société Air France SA » ne matche jamais.
3. **Blocking** : jamais de N×M. Candidats restreints à (pays identique OU inconnu) ∧ (premier
   token significatif identique). Même philosophie d'admission que l'anti-bruit P1
   (`seeyou-v2.md:198-208`), appliquée au matching.
4. **Scoring** : Jaro-Winkler (crate **strsim**, MIT, vivant sous l'org rapidfuzz — confirmé)
   combiné à un Sørensen-Dice sur tokens. Crate **rapidfuzz-rs** (MIT/Apache-2.0, confirmé
   vivant) en alternative si le débit l'exige. **`fuzzy-matcher` est interdit** : archivé en
   lecture seule le 22/01/2026 (confirmé), et conçu pour la recherche interactive, pas le
   record linkage.
5. **Seuils** : score ≥ 0,95 **et** marge ≥ 0,05 sur le deuxième candidat → lien automatique
   (`match_method="blocked_fuzzy"`, `match_score` posé) — **pour `operated_by`/`owned_by`
   uniquement**. **`subject_to` n'est jamais créé par fuzzy (F8, cédé en entier)** : les
   listes de sanctions sont le pire terrain du name-matching (translittérations, noms
   génériques, pays inconnu qui ouvre le blocking), et une arête `subject_to` fausse affirme
   à tort un rattachement sanctions — l'erreur la plus chère du produit. Automatique =
   identifiant exact cité dans la désignation (registration, IMO, LEI) seulement ; **tout
   match par nom part en file, sans exception** — coût nul au volume attendu (10⁰-10²,
   l'analyste valide les quelques paires compagnie↔désignation en minutes).
   0,85-0,95 ou marge insuffisante → **file de révision, pas d'arête**. < 0,85 → rejet
   silencieux. Les alias des listes élargissent les candidats mais n'abaissent jamais le
   seuil.
6. **Zone de doute = non-résolu.** Table Postgres `resolution_candidate`
   (`subject_kind, subject_id, candidate_org, score, method, status pending|accepted|rejected,
   created_at, decided_at`), **cap d'admission 50 items/jour triés par intérêt**
   (mil/plane-alert/adjacence sanctions d'abord — une file que personne ne peut vider n'est
   pas un contrôle qualité, F4). Un analyste qui accepte crée l'arête avec
   `match_method="analyst"` — c'est le germe du write-back analyste de l'ambition produit.
7. **Mémoire négative (F7)** : table Postgres `resolution_suppression`
   (`subject_kind, subject_id, org_id, reason, decided_by, decided_at`), alimentée par les
   rejets de file **et** par la révocation d'un lien automatique par un analyste. Le matcher
   la consulte **avant toute écriture automatique** : sans elle, la re-résolution au refresh
   du registry (2.7) recréerait éternellement le lien faux qu'un analyste vient de
   supprimer — l'outil qui ré-affirme une erreur corrigée est le pire scénario pour ce
   marché.

Précision réaliste attendue (littérature record-linkage, explicitement **pas** un benchmark
exécuté ici) : ~85-95 % de précision / 70-85 % de rappel avec blocking + normalisation
soignés ; ~50-70 % en fuzzy brut sans blocking — le trou à éviter. Avec la règle
seuil 0,95 + marge, on sacrifie du rappel (plus d'items en file) pour viser
**≥ 95 % de précision mesurée sur les liens automatiques** — c'est le gate du Lot 8B : audit
manuel de **300 liens auto-créés, stratifiés par `match_method` × registre** (100 ne prouvent
rien, F9 : à 95/100 corrects, l'intervalle de confiance de Wilson à 95 % est ≈ [89 %, 98 %] ;
à 285/300 la borne basse remonte à ≈ 92 %) ; < 95 % observé → on relève le seuil, pas le
volume. Il n'existe **aucun équivalent Rust de Splink/dedupe** (constat de recherche, absence
non définitivement prouvée) : blocking + scoring s'écrivent à la main (~200 lignes + tests),
à budgéter comme un composant, pas une dépendance.

### 2.5 Écriture des arêtes : les deux pièges SurrealDB mesurés

- `RELATE … CONTENT` rejoué sur le même edge_id **remplace intégralement** le record — testé :
  un 3ᵉ appel avec `{score:0.9}` seul a fait disparaître le champ `source`. Combiné aux
  `if let Some(…)` de `relation_attributes()` (`graph/src/relations.rs:81-92`), c'est une mine.
  Règle : **tout writer d'arête écrit le jeu d'attributs complet, à chaque fois.**
- Le débit : N statements RELATE dans une requête multi-statements plafonnent à ~145 arêtes/s
  quel que soit le batch (mesuré : 50→371,8 ms, 1000→6827 ms). La forme qui tient :
  `INSERT RELATION INTO <rel> [ {...}, … ] ON DUPLICATE KEY UPDATE …` en un seul statement —
  mesuré 4 514/s (200 lignes en 44,3 ms), upsert répété p95 ≈ 86 ms sur 200. Toutes les
  écritures des étages 1/3 passent par cette forme, chunks de 200 (correctif de formulation
  déjà nécessaire au Lot 4, cf. section 8).

### 2.6 Implantation dans le code

- **Crate `backend/crates/registry`** (nom déjà réservé par le plan, `seeyou-v2.md:375`) :
  `loaders.rs` (un loader par source : vrs_standing_data (airlines + code-blocks), faa,
  plane_alert, sanctions ; téléchargement + parse + index mémoire), `normalize.rs`
  (normalisation + suffixes), `matcher.rs` (blocking + scoring + seuils + consultation
  de la suppression), `types.rs`. Logique pure, zéro dépendance bus/graph — testable
  colocalisé (`#[cfg(test)]` inline), comme `batchAccumulator.ts` côté front. Erreurs :
  `thiserror` (frontière de lib), `anyhow` dans les jobs de rafraîchissement.
- **`consumer_graph`** : nouveau module `identity.rs` (sur le modèle de `graph_links.rs`),
  appelé depuis le bras `aircraft` du match de `processing.rs` (`:29-60` chemin bus,
  `:87-114` chemin on-demand) après l'upsert du nœud. Il fait : filtre d'admission
  (ci-dessous) → lookup registry (HashMap, O(1) ; callsign-préfixe d'abord, puis
  registration) → consultation `resolution_suppression` (2.4) → si nouvel opérateur :
  upsert `organization` → batch `INSERT RELATION operated_by/owned_by/subject_to`. Le handle registry est chargé au
  démarrage du consumer et rafraîchi par tâche de fond (même patron que le rechargement de
  zones, `graph/src/zones.rs`).
- **Filtre d'admission des sujets (F4)** : les hex non-ICAO sont rejetés avant toute
  résolution — adsb.lol sert aussi des cibles TIS-B/MLAT à hex synthétiques (préfixe `~`
  côté readsb) que rien ne filtrait dans la v1. Le backfill de l'étage 1 est restreint aux
  catégories qui portent la valeur produit : militaire (`dbFlags`), correspondance
  plane-alert-db, commercial (préfixe callsign résolu), FAA `registrant ≠ individual`.
  Le reste (GA anonyme, particuliers) n'est ni résolu, ni mis en file, ni matérialisé.
- **Phase A (= Lot 8A, chemin démo) / Phase B (= Lot 8B)** : Phase A = VRS airlines
  (callsign→compagnie, mapping exact, zéro fuzzy) + VRS code-blocks (hex→pays) +
  plane-alert-db + FAA filtré + OFAC/UK en identifiant exact ; le rapprochement par nom
  org↔sanction part intégralement en file (2.4). Phase B = ONU + G-INFO + scorer fuzzy
  complet (blocking + Jaro-Winkler + marge) + enrichissement LEI par lot hors ligne depuis
  le Golden Copy filtré aux orgs existantes — pas de chargement des millions de LEI dans le
  consumer.
- **API** : deux routes dans `api/src/router.rs` (axum 0.7, syntaxe `:param`) :
  `GET /resolution/pending`, `POST /resolution/:id/decide` (accept/reject) → Postgres
  (`AppState` a déjà Postgres en `Option`, dégradation gracieuse : sans Postgres, pas de file,
  le matching sous le seuil est simplement loggé).

### 2.7 Cardinalité et coût

Cardinalités **recalculées après revue (F4)** — la v1 confondait volume concurrent (25-30 k
avions en l'air) et volume distinct (les liners tournent chaque jour, la GA fait tourner le
parc) :

| Poste | Volume | Rafraîchissement |
|---|---|---|
| VRS standing-data (airlines + code-blocks) | mesuré ce jour : `airlines.csv` = 5 965 lignes ; code-blocks = quelques centaines | quotidien (repo git ; miroir adsblol horaire) |
| plane-alert-db | ~17 081 lignes | hebdomadaire |
| FAA Releasable | > 10 Mo zip (prouvé), ~3×10⁵ immatriculations (référence), **individuals exclus à l'ingestion (F10)** | mensuel |
| Listes sanctions (OFAC+UK+ONU) | ~10⁴ entrées cumulées ; **UK re-mesurée : CSV 49,6 MB + XML 21,8 MB (F12)** — loader en streaming, pas « quelques Mo » | quotidien |
| Hex distincts vus/jour | **~0,5-1×10⁵/j estimés** (recalcul F4 — à mesurer au premier jour de run pleine couverture) | — |
| Nouveaux hex/jour | **décroît de ~10⁵ (jour 1) vers 10²-10³/j après plusieurs mois** — jamais les 10¹-10² de la v1 ; le stock croît pendant des mois | — |
| Nœuds `organization` | **avec le filtre d'admission (2.6) : ~2-6 k** (≈1-2 k compagnies réellement vues en vol sur les 5 965 VRS + gov/mil + corporates FAA non-individuels effectivement vus). **Sans filtre : dizaines de milliers, majoritairement particuliers/LLC/trusts — le scénario interdit (F4/F10)** ; alerte d'exploitation si la table dépasse ~20 k (signe que le filtre a sauté) | continu (à l'apparition) |
| Arêtes `operated_by`/`owned_by` | ≤ 1-2 par avion **admis**, durables, sans TTL, upsert idempotent — pic initial borné par le périmètre admis, puis goutte-à-goutte 10²-10³/j pendant la rampe | à l'apparition + re-résolution au refresh registry, **sous `resolution_suppression` (2.4)** |
| File `resolution_candidate` | **cap 50/j trié par intérêt** — sans cap : 10²-10³ items/j pendant des semaines = file morte pour un analyste (F4) | quotidien |
| Arêtes `subject_to` | ordre 10⁰-10² (id exact seulement en auto — les cibles ouvertes des listes émettent peu en couverture ADS-B occidentale ; la valeur montera avec l'AIS, désignations navires par IMO dans le SDN) | quotidien |

Aucune de ces écritures n'est cadencée par les ticks de position : la résolution est un
lookup mémoire par avion nouveau, pas un calcul par message. Impact bus/WS : **zéro nouvelle
variante WS** (navigation en REST `/graph/*`, décision déjà actée `seeyou-v2.md:261`).

---

## 3. Étage 2 — Chemins multi-sauts

### 3.1 Ce que SurrealDB 3.2.4 sait faire (validé en direct, pas supposé)

- **Syntaxe de traversée** : `SELECT ->located_in->zone<-located_in<-camera FROM camera:⟨id⟩;`
  — chaîne de flèches, testée sur les ~13 k arêtes réelles + 3 200 synthétiques.
- **Pas de déduplication automatique** : une caméra dans 3 zones remonte 11 372 résultats
  bruts vs 10 110 après `array::distinct()` (mesuré) — un nœud apparaît une fois par chemin.
  Tout comptage de convergence doit dédupliquer.
- **Temps mesurés** : 1 saut 18-25 ms wall (0,25-1,2 ms moteur) ; 2 sauts avec fan-in sur une
  zone hub de 10 133 caméras : 35-37 ms ; 3 sauts : 65-70 ms wall / 36,6 ms moteur
  (`EXPLAIN FULL`). L'écart wall/moteur est du HTTP/JSON, pas le moteur.
- **`EXPLAIN`/`EXPLAIN FULL` existent** et montrent le plan (`IndexScan` vs `TableScan`),
  mais les `GraphEdgeScan` imbriqués rapportent `elapsed_ns:0` — profilage par saut
  impossible, vérification du plan possible.
- **Index sur `in`/`out` d'une table relation** : `DEFINE INDEX IF NOT EXISTS` idempotent
  (1ᵉʳ run 304 ms sur 3 200 lignes, 2ᵉ run < 10 ms), bascule `TableScan→IndexScan` confirmée
  par `EXPLAIN FULL`. Aujourd'hui **aucune table de relation n'a le moindre index** (mesuré :
  `INFO FOR TABLE located_in` → `"indexes": {}`) — le plan d'index du Lot 4
  (`seeyou-v2.md:244-246`) est confirmé nécessaire et suffisant.
- **Pas de plus court chemin natif** : `graph::shortest_path()` et variantes → erreur de
  parsing (3 formes testées) ; feature request GitHub #6607 ouverte. À faire côté app.
- **`PARALLEL` ne parallélise pas** (issue #5171 ouverte) — ne pas compter dessus pour le
  fan-out ; la concurrence se fait côté Rust (`join_all` borné).

Et le point de comparaison qui justifie la refonte : l'API actuelle
(`api/src/graph_api.rs:277-365`, fan-out séquentiel sur les 14 tables par nœud de frontière)
mesurée **aujourd'hui, graphe quasi vide** : depth=1 → 0,57 s ; depth=2 → 2,75 s,
`truncated=true` à 50 nœuds. Ce n'est pas un risque futur, c'est un défaut présent.

### 3.2 Requêtes cibles

1. **Voisinage profondeur N** (refonte de `get_neighbors_graph`) : map statique
   `table → relations pertinentes` (déjà actée `seeyou-v2.md:254`) + une requête de traversée
   fléchée par type de relation pertinent, `join_all` borné (8-16 en vol), dédup côté app
   (`HashSet<RecordId>`). Profondeur max **3** (aujourd'hui 2).
2. **La requête produit de l'étage 1** (« avions dont l'opérateur est sanctionné ») —
   chemin typé connu, une seule traversée, **écrite dans le bon sens (F15)**. La forme v1,
   `SELECT <-operated_by<-aircraft FROM organization WHERE ->subject_to->sanction`, scanne
   TOUTES les organizations avec une traversée par ligne — or notre propre mesure (4.2)
   donne ~1-2 ms de dispatch par ligne externe : à 2-6 k orgs, c'est 2-12 s, pas 50 ms
   (l'extrapolation v1 depuis les mesures 3-sauts était invalide : elles partaient d'UN
   nœud, pas d'un scan de table). Forme retenue — partir du petit côté :
   `SELECT array::distinct(<-subject_to<-organization<-operated_by<-aircraft) FROM sanction`
   — la table `sanction` matérialisée ne contient que les entrées reliées (10⁰-10², règle
   2.2), le scan est trivial. Gate Lot 9A : **cette forme**, < 200 ms, mesurée **pendant**
   ingest + sweep (F16).
3. **Plus court chemin entre deux entités** : BFS bidirectionnel en Rust dans `api`
   (nouveau module `graph_path.rs`), frontière par `get_incident_relations`
   (`graph/src/queries.rs:69-115`) une fois les index `in`/`out` posés. Pondération par type :
   les relations d'identité (`operated_by`, `subject_to`, `connects_to`) coûtent 1, les
   relations de proximité coûtent 2, et **`located_in` vers une zone de tier `region` est
   exclu par défaut** — un chemin « A est en Amérique du Nord et B aussi » est du bruit, pas
   un lien (la zone `north-america` connecte 10 133 caméras, mesuré).
4. **Sous-graphe autour d'une entité** : le snapshot existant paramétré par
   `relations=` (filtre de types) — même moteur que 1.

### 3.3 API et UX

- `GET /graph/neighbors/:type/:id?depth=1..3&relations=a,b` — contrat de réponse inchangé
  (snapshot nodes/edges/truncated), implémentation remplacée.
- `GET /graph/path?from=<table:id>&to=<table:id>&max_cost=6` — nouveau ; renvoie la chaîne
  nœuds+arêtes avec attributs complets (provenance, section 7), ou `404` si aucun chemin
  admissible sous le budget. Routes enregistrées dans `api/src/router.rs` (central, axum 0.7).
- `search_graph` : réécrire sur l'index full-text — **la syntaxe 3.2.4 validée est
  `DEFINE INDEX … FULLTEXT ANALYZER <a> BM25 HIGHLIGHTS` + `@@`/`@1@` + `search::score(1)`**
  (testée de bout en bout ; `SEARCH ANALYZER`, la syntaxe des docs génériques, échoue en
  parse error sur cette version). Piège validé : la définition d'index réussit même si
  l'analyzer n'existe pas — l'erreur n'apparaît qu'à l'écriture ; définir l'analyzer d'abord,
  vérifier par `EXPLAIN FULL` ensuite.
- UX : expansion au clic (réutilise `GraphView.tsx`/`useGraphNavigation.ts`), épinglage de
  deux nœuds → affichage du chemin, badge par type de relation, tri par `score` — et le
  panneau relation (câblé par `cad13fb`) affiche la provenance (section 7). Zéro variante WS.

### 3.4 Garde-fous (tous obligatoires, valeurs par défaut)

| Garde-fou | Valeur | Justification mesurée |
|---|---|---|
| Profondeur max voisinage | 3 | fan-in hub 10 k résultats dès 2 sauts (mesuré) |
| Coût max chemin (pondéré) | 6 | BFS bidirectionnel ≈ 2×3 sauts |
| Cap nœuds par réponse | 50 défaut, `?limit=` ≤ 200 | flag `truncated` existant conservé |
| Cap de degré par nœud traversé | 1 000 | zone `north-america` = 10 133 arêtes (mesuré) : hub sauté avec mention `explain` |
| Timeout serveur par requête de traversée | 500 ms (`tokio::time::timeout`) | 3 sauts = 65-70 ms mesurés ; 500 ms = marge ×7 |
| Dédup | `array::distinct()` + `HashSet` app | 11 372 vs 10 110 mesuré |

Note de communication (F17) : la profondeur produit est **3 sauts** (voisinage) et coût 6
(chemin, ≈ 2×3 par BFS bidirectionnel). Tout pitch « 3-5 sauts » au commanditaire est à
corriger explicitement — 4-5 sauts non pondérés sur un graphe à hubs est précisément ce que
les mesures ci-dessus interdisent. Et les temps mesurés en 3.1 l'ont été sur graphe
**statique** : le gate du Lot 9A re-mesure sous churn réel (écritures re-upsertées toutes les
12 s + sweep DELETE — le régime que #5324 décrit comme dégradant les scans, F16).

---

## 4. Étage 3 — Corrélation temporelle (séquences)

### 4.1 Co-occurrence vs séquence

La co-occurrence est banale par construction : avec 89 552 feux affichés, 40-60 séismes
M2.5+/jour et ~100 k événements GDELT/jour, toute zone urbaine contient en permanence
plusieurs domaines actifs — c'est exactement pourquoi le socle P1 score la convergence par
rareté et non par comptage (`seeyou-v2.md:225`). Une **séquence** ajoute trois contraintes :
ordre temporel (A strictement avant B), fenêtre bornée, et lien spatial — et sa valeur de
signal vient du produit des probabilités de base, pas de la présence simultanée. Une séquence
admissible est rare par conception ; si elle ne l'est pas, c'est la règle qui est fausse
(section 6).

### 4.2 Le modèle d'exécution — mesuré, donc tranché

SurrealQL sait exprimer « A puis B dans N minutes » par sous-requête corrélée `$parent`
(validée sur jeu contrôlé : 3 cas dans-fenêtre/hors-fenêtre/ordre-inverse tous corrects,
et 701/701 matches exacts sur 2 000 lignes). **Mais** le coût est un dispatch fixe ~1-2 ms
par ligne externe : 1 000 lignes A → 2,09 s, et l'index composé `(zone,type,ts)` rend le scan
interne 13× plus rapide (1,83→0,14 ms) **sans changer le total** (1,94 s). Verdict : ce
pattern est un outil d'audit ponctuel, **pas** le moteur. La détection tourne côté Rust, dans
le module `correlation.rs` que le socle P1 crée déjà (`seeyou-v2.md:240`) : buffers en
mémoire par domaine (ring buffer par cellule géographique ~1°), déclenchement event-driven à
l'arrivée d'un événement B — on regarde en arrière dans la fenêtre, jamais de polling plus
rapide que la donnée (`seeyou-v2.md:470`).

Deux préalables de données, découverts en mesurant :

- **Timestamps en string** : `seismic_event.time` est une string pure
  (`type::is_datetime()`→false mesuré) et `time::floor()` retourne NULL **silencieusement**
  dessus. Correctif : le consumer caste en datetime natif à l'écriture
  (`payload.rs`, normalisation) ; toute requête de bucketing existante caste `<datetime>`.
- **`fire_hotspot` n'a pas d'identité** : le struct (`fires/src/types.rs:4-14`) n'a aucun
  champ id → hash du JSON complet → croissance non bornée **observée en direct**
  (34 635 → 80 145 lignes en quelques heures, aucune purge d'entités n'existant nulle part).
  Sans clé naturelle (lat/lon arrondis + acq_date + acq_time + satellite), toute règle
  « feu » compte le même foyer plusieurs fois. Idem le bug des nœuds fantômes
  (`payload.rs:16-27` : enveloppe entière upsertée quand le tableau est vide — vessel=4,
  cyber_threat=3, gdelt_event=3 lignes fantômes mesurées). Les deux correctifs sont remis au
  socle (section 8, amendements Lot 4).

### 4.3 Stockage : arêtes, événements, ou alertes ? Les trois, à des niveaux différents

1. **Arête** entre les deux nœuds concrets : la table `triggered` existe, déclarée avec
   `source/score/timestamp` (`ontology.rs:199-201`) et **zéro producteur** (0 ligne mesurée)
   — elle devient l'arête de séquence, **entre nœuds SurrealDB existants uniquement (F24)** :
   `seismic_event→triggered→fire_hotspot`, `seismic_event→triggered→camera`. La v1 écrivait
   `fire→triggered→camera_offline_event` : ce nœud n'existe pas et n'existera pas — une
   arête SurrealDB ne pointe pas une ligne Postgres. La transition offline est référencée
   dans `explain.transition` (`last_online_at`, `offline_at`), jamais comme nœud cible.
   Durable (pas de TTL : une séquence détectée est un fait historique), attributs complets
   (section 7, champs déclarés en 2.2) + `lag_s`, `window_s`. **Agrégation par événement
   déclencheur (F1)** : l'unité de sortie est l'événement déclencheur — arêtes bornées par
   événement, jamais le produit cartésien (détail par règle en 4.4).
2. **Événement durable** : table **Postgres** `correlation_event`
   (`id, kind sequence|absence, rule, rule_version, a_ref, b_ref, zone_id, cell, lag_s,
   score, detected_at, explain jsonb`) — insérée en batch UNNEST (patron `db/src/aircraft.rs`
   répliqué, P0-9). C'est la réponse au trou structurel mesuré : la baseline glissante 7 j de
   la convergence (#11) n'a **aucune source durable** puisque le sweep TTL efface les arêtes
   éphémères (par design du socle) et que `fire_hotspot.acq_date` ne couvre que 2 jours
   aujourd'hui (mesuré : 2026-08-09 : 63 350, 2026-08-10 : 15 701). Postgres plutôt qu'une
   table SurrealDB : le stack l'a déjà (Option dans AppState), le patron batch existe, et ça
   évite d'aggraver les deux pathologies RocksDB ouvertes (#7424 RSS, #5324 ghost records
   après DELETE) sur la base graphe. `consumer_graph` gagne une dépendance `db`
   (`.workspace = true`) en `Option` — sans Postgres, les règles à baseline passent en mode
   ombre (log, pas d'arête).
3. **Alerte** : uniquement au-dessus d'un seuil de sévérité par règle — ligne dans la table
   `alert` existante (`ontology.rs:99-104`, 0 ligne aujourd'hui) + réutilisation du
   `WsMessage::ConvergenceAlert` existant si et seulement si le format convient ; **aucune
   nouvelle variante WS dans ces lots** (sinon : miroir 3 endroits, CLAUDE.md).

### 4.4 Catalogue des séquences (chacune : seuil d'admission + cardinalité estimée/jour)

Base rates rappelés : 40-60 séismes M2.5+/j (M4.5+ ≈ 15/j, M5.5+ ≈ 1-3/j), table feux ~90 k
(instantané), ~100 k GDELT/j. **Leçon de revue (F1) : les moyennes de jours calmes ne
dimensionnent rien — c'est le jour de queue qui casse.** Un seul M5.5 en Californie ou au
Chili en saison des feux co-localise des dizaines de hotspots admis (le top 5 % FRP est
dominé par les gros feux) : comptées par paire, les arêtes explosent (20-100 pour UN
événement) et un coupe-circuit compté en arêtes tuerait la règle précisément pendant
l'événement d'intérêt. Deux règles transversales en découlent : **(a) agrégation par
événement déclencheur** — l'unité de sortie est l'événement (1 `correlation_event` +
arêtes bornées par événement), jamais le produit cartésien ; **(b) le coupe-circuit compte
des événements déclencheurs distincts par jour, pas des arêtes** (section 6).

| Règle | Définition | Admission | Sorties/j (est.) | Dépendances |
|---|---|---|---|---|
| SEQ-1 séisme→feux | hotspot admis < 50 km ET < 6 h après séisme, **ignition seulement** : aucun hotspot < ~1 km dans les 24 h précédentes (un feu qui brûlait déjà re-détecte à chaque passage satellite — sans cette clause, tout feu en cours « répond » au séisme) | séisme **M ≥ 5,5** (1-3/j) ; feu FRP top ~5 % + confidence haute ; hotspots groupés en **clusters 10 km** (même clustering que SEQ-5) → **1 arête par cluster, ≤ 3 clusters/séisme**, le reste dans `explain.cluster` | **0-2 événements, ≤ 6 arêtes** — borné par conception le jour de queue, plus par la chance (F1) | id stable feux ; timestamps datetime |
| SEQ-2 séisme→caméra HS | caméras `is_online` true→false < R(M) ET < 30 min après séisme ; **R fonction de la magnitude : M4,5→30 km, M5,5→100 km, M6,5+→300 km** (100 km fixes pour un M4,5 = MMI III-IV, aucun dégât attendu — F2) | séisme **M ≥ 4,5** (≈15/j) ; **test de Poisson contre le flap attendu (F2)** : λ = caméras online dans R × taux de flap 30 min médian 7 j (baseline flap de §5.2, branchée ici) ; émission si k ≥ 3 **et** P(X ≥ k \| Poisson(λ)) < 10⁻³ — un « ≥ 3 » absolu serait atteint par hasard dans tout parc dense : 1 500-3 000 caméras < 100 km de LA × 0,5-2 %/30 min de flap = 8-60 transitions fortuites | **0-1 événement, ≤ 5 arêtes** (les 5 caméras les plus proches, le reste dans `explain.count`) | historique de statut caméra (4.5) + baseline flap 7 j |
| SEQ-3 détresse→disparition | même avion : squawk 7700/7600/7500 puis perte de signal < 30 min | squawk réel (champ mesuré présent sur le nœud), dédup par vol | **< 1** (échelle 30 k avions ; ~0 au volume actuel) | P0-1 (ingest réparé) |
| SEQ-4 burst GDELT→aviation militaire | burst presse zone puis **présence militaire elle-même anormale** < 6 h — la conjonction v1 « un `is_military` dans la bbox < 6 h » était presque toujours vraie (200-600 militaires en vol permanent, F3) : elle mesurait le volume de presse, pas une corrélation | burst = comptage de **domaines distincts** (dédup URL→domaine — la syndication fait qu'une dépêche = des dizaines d'URLs : « min 5 articles » ≈ min 1 histoire, F3) > 3× médiane 7 j, min 5 domaines, thèmes conflit/manif ; **ET** nb d'appareils `is_military` **distincts** dans la bbox > 3× **sa propre médiane 7 j** — double anomalie obligatoire, deux baselines en mode ombre pendant le warm-up | **0-1** | fix ingest GDELT (Lot 7a — 0 item réel mesuré) ; tier pays (7a) ; deux baselines 7 j |
| SEQ-5 cluster feux→caméra HS | ≥ 5 hotspots admis dans 10 km/6 h, puis caméra offline < 5 km du **centroïde du cluster** | cluster sur feux admis seulement (FRP top 5 %) ; si plusieurs caméras : même test de Poisson que SEQ-2 | **0-2 événements, ≤ 5 arêtes** (compté par cluster distinct, pas par paire feu×caméra) | id stable feux ; historique statut caméra |

**Rejetées explicitement** (séduisantes, bruit garanti) : toute séquence
« satellite passe après X » — les orbites sont déterministes (TLE), un passage n'est pas une
réponse et le tasking est invisible ; toute règle sur le tone GDELT (volume 100 k/j, tone =
sentiment d'articles, pas un événement) ; séismes M < 4,5 (40-60/j × n'importe quoi = spam).

### 4.5 Historique de statut caméra (donnée manquante à créer)

SEQ-2/SEQ-5 exigent la **transition** online→offline ; aujourd'hui `is_online` est écrasé par
upsert (`entities.rs:6-34`), l'historique n'existe pas. Correctif minimal : `consumer_graph`
compare l'état précédent dans son accumulateur mémoire (socle P1) et n'émet une ligne
`correlation_event(kind=camera_status)` que sur transition. Pas de nouvelle table SurrealDB,
pas de nouveau topic bus.

---

## 5. Étage 4 — Détection d'absence

### 5.1 Principe et le piège frontal

Détecter ce qui manque suppose de savoir ce qui aurait dû être là : chaque règle d'absence
est une **baseline de présence + un déclencheur de disparition**. Le piège, assumé dès la
conception : **une absence de donnée est le plus souvent une panne de collecte.** La preuve
est dans notre propre baseline : l'ingest ADS-B a tourné avec `regions_failed=42/43`
(`baseline-mesures.md:150-177`) — une règle d'absence naïve aurait hurlé sur le monde entier.
Trois garde-fous transversaux, dans cet ordre, avant toute émission :

1. **Santé de la source — au niveau RÉGION de fetch, pas domaine (F18)** : le mode de
   défaillance mesuré est régional (`regions_failed=42/43`, `baseline-mesures.md:150-177`),
   et 3 régions sur 43 qui échouent un tick passeraient un gate domaine tout en faisant
   « disparaître » ensemble tous les avions de ces régions — rafale de FP garantie.
   Correctif mécanique : mapper chaque cellule ~1° sur son point de grille de fetch (la
   grille des 43 points est connue, `services/src/adsb.rs:23`) et **suspendre l'évaluation
   dans les cellules des régions en échec ou dégradées**. Le signal existe déjà dans les
   logs (`aircraft_tracker.rs:42-45`) ; il est promu en état interrogeable du consumer,
   **par région**.
2. **Baseline de taux de disparition, pas de simple présence (F19)** : un masque de
   présence déclare « couvertes » les cellules frontière de couverture (sorties océaniques,
   montagne) — denses en présence ET en disparitions : chaque vol transatlantique sort de la
   couverture à 200-400 km des côtes, en croisière, sans descente, loin des 20 zones
   airport — le candidat ABS-1 parfait, par centaines chaque jour. La baseline par cellule
   ~1° (construite depuis `correlation_event`, 7 j) mesure donc la **fraction des
   trajectoires traversantes qui se terminent dans la cellule** : une perte n'est évaluable
   que là où les pertes sont **historiquement rares** (taux < ~2 %). Warm-up 7 jours
   obligatoire.
3. **Budget d'émission** : cap dur par règle et par jour (section 6) ; au-delà, la règle se
   coupe et logge — un monde qui « disparaît » 100 fois par jour est un capteur cassé.

Stockage : une absence a un seul sujet, pas deux — donc **pas une arête** : ligne
`correlation_event(kind=absence)` + ligne `alert` si sévérité atteinte. Cohérent avec 4.3.

### 5.2 Les cas, un par un

| Cas | Implémentation réelle | Données manquantes aujourd'hui | Faux positifs attendus |
|---|---|---|---|
| **Transpondeur qui s'éteint en vol** (ABS-1) | dans l'accumulateur avion du socle : dernier état `on_ground=false`, `altitude_m > 1 500`, pas de descente marquée (`vertical_rate_ms`), > 30 km d'une des 20 zones airport, puis aucun update pendant > 3× la **cadence effective observée de sa région** (P0-1 rend l'intervalle adaptatif sur 429 — jamais la constante « ≈ 36 s », F21) **et** gates 1+2 verts | baseline de taux de disparition par cellule (à construire, 7 j de warm-up) ; seulement 20 zones airport (le filtre « proche aéroport » est partiel — les atterrissages hors de ces 20 zones déclencheront) | **dominants sans la baseline de disparition** (sortie de couverture = cause n°1, structurelle : des centaines/j sur les seules sorties océaniques, F19) ; le cap ≤ 20 événements/j est servi par un **score de tri spécifié (F19)** : `rareté de la cellule (1 − taux de disparition normalisé) × facteur type (mil/plane-alert ×3, squawk urgence ×5) × écart de cadence` — top-20 par score, pas 20 tirages arbitraires ; FP encore majoritaires au début — l'événement est présenté comme « perte de signal », jamais « transpondeur coupé volontairement » |
| **Navire visible sans AIS** | **dépendance vision par ordinateur (caméras portuaires) — noté, non spécifié ici.** Le squelette état-machine d'ABS-1 s'appliquera au MMSI (perte d'émission en zone couverte) une fois AISStream branché (P3 prio 1) | l'ingest AIS lui-même (0 navire réel aujourd'hui, mesuré : 4 lignes fantômes) ; nota : le message AIS Type 5 apporte l'IMO gratuitement dans le flux — le chaînon dur restera IMO→bénéficiaire | frontière de couverture côtière (40-75 km) = FP structurels ; hors périmètre tant que la couche vaut 0 |
| **Avion sans plan de vol** | **infaisable en donnée ouverte** — aucun flux de plans de vol libre (SWIM sous accord, EUROCONTROL rejeté `sources.md:89`). Proxy honnête : drapeau d'enrichissement « hex hors référentiels + sans callsign » (étage 1), présenté comme anomalie d'identité, **pas** une absence de plan de vol | les plans de vol eux-mêmes — dire au commanditaire que cette case Gotham n'existe pas en open data | n/a (drapeau, pas alerte) |
| **Caméra hors ligne pendant un événement** (ABS-2) | c'est SEQ-2/SEQ-5 (section 4) — implémenté une fois, côté séquences ; l'absence seule (caméra offline sans événement corrélé) n'émet **rien** | historique de statut (4.5) ; taux de flap par caméra (baseline 7 j) pour ignorer les caméras chroniquement instables | les flaps réseau sont routiniers sur des flux publics — c'est la corrélation à un événement admis qui rend le signal exploitable, jamais l'offline seul |
| **Zone qui devient silencieuse** (ABS-3) | baseline horaire par zone (comptage avions/heure, même heure de la semaine, 7 j, depuis `correlation_event`) ; déclenche si activité < 10 % de la médiane **et** cellules ~1° adjacentes normales (couronne autour de la zone — « zones voisines » n'existe dans aucune structure : les 60 zones sont des polygones épars, la plus proche peut être à 2 000 km, F20) **et** gate source vert | la baseline (warm-up 7 j) ; tier pays des zones (7a) pour des zones significatives — avec 60 zones aujourd'hui la portée est réduite | couvre-feux/NOTAM inconnus du système → le profil horaire absorbe le cycle jour/nuit, pas les fermetures exceptionnelles ; estimé 0-2 alertes/j, dont une fraction réelle inconnue avant mesure |

---

## 6. Anti-bruit — le garde-fou transversal

Volumes de référence (contrainte de mission) : 40-60 séismes M2.5+/jour, 89 552 feux
(instantané REST mesuré — et table graphe **non bornée** tant que le correctif id n'est pas
posé : 34 635→80 145 mesuré en quelques heures), ~100 k événements GDELT/jour (0 ingéré
réellement aujourd'hui).

Récapitulatif de toutes les règles nouvelles des quatre étages :

| Étage | Règle | Seuil d'admission | Cardinalité estimée/jour | Durable ? |
|---|---|---|---|---|
| 1 | `operated_by`/`owned_by` | périmètre admis (2.6) ; id exact OU fuzzy ≥ 0,95 + marge 0,05 ; sous `resolution_suppression` | pic initial borné par le périmètre, puis 10²-10³/j pendant la rampe (recalcul F4), 10¹-10² en régime établi | oui, sans TTL |
| 1 | `subject_to` | **id exact (registration/IMO/LEI) uniquement en auto (F8)** ; tout match par nom → file | ~10⁰-10¹ | oui |
| 1 | file `resolution_candidate` | 0,85 ≤ score < 0,95 OU match nom↔sanction | **cap 50/j trié par intérêt (F4)** | Postgres, hors graphe |
| 3 | SEQ-1 séisme→feux | M ≥ 5,5 ; FRP top 5 % ; ignition ; clusters 10 km | 0-2 événements, ≤ 6 arêtes | arête `triggered` + event |
| 3 | SEQ-2 séisme→caméras HS | M ≥ 4,5 ; R(M) ; Poisson vs flap, k ≥ 3 | 0-1 événement, ≤ 5 arêtes | idem |
| 3 | SEQ-3 détresse→perte signal | squawk 7700/7600/7500 réel | < 1 | idem |
| 3 | SEQ-4 GDELT→mil | domaines distincts > 3× médiane **ET** mil distincts > 3× médiane | 0-1 | idem |
| 3 | SEQ-5 cluster feux→caméra HS | ≥ 5 hotspots admis / 10 km / 6 h ; Poisson caméras | 0-2 événements, ≤ 5 arêtes | idem |
| 4 | ABS-1 perte transpondeur | gates région + taux de disparition ; top-20 par score | ≤ 20 événements | event + alerte |
| 4 | ABS-3 zone silencieuse | < 10 % médiane horaire 7 j + cellules adjacentes normales | 0-2 | event + alerte |

**Deux budgets, pas un (F5 — le « ≤ ~40/j total » de la v1 était contredit par la ligne
étage 1 du même tableau)** :

- **Budget corrélation (étages 3-4)** : **≤ ~40 événements/arêtes durables par jour** en
  régime permanent (les relations éphémères du socle — `near`, `monitored_by`, `flies_over`
  — gardent leur TTL+sweep et ne sont pas comptées ici).
- **Budget identité (étage 1)** : pas un budget par jour — il est borné par le **périmètre
  d'admission** (2.6) et surveillé en **stock** : cap de file 50/j, alerte d'exploitation si
  `organization` dépasse ~20 k nœuds (le signe que le filtre d'admission a sauté).

Conséquences :

- **Stockage** : ~40/j ≈ 15 k/an. Négligeable devant le débit d'écriture mesuré
  (`INSERT RELATION` en littéral tableau : 1 362-14 309 arêtes/s selon le mode). Le risque
  n'est pas le débit, c'est la **crédibilité** : chaque alerte de plus divise l'attention de
  l'analyste.
- **Requête** : à cette cardinalité, les index `in`/`out` (Lot 4) suffisent ; aucune
  pagination nouvelle nécessaire sur `/graph/*`.
- **Coupe-circuit obligatoire — compté en événements déclencheurs distincts, jamais en
  arêtes (F1)** : compteur par règle et par jour dans `correlation.rs` ; au-delà de
  **10× l'estimation d'événements** du tableau, la règle s'auto-désactive jusqu'au tick
  suivant de sa source et logge en `warn`. Compté en arêtes (v1), le coupe-circuit se
  déclencherait précisément le seul jour où la règle sert — un vrai M5.5 en saison des feux.
  Compté en événements, 1 séisme = 1 événement quel que soit le nombre de hotspots ; une
  règle qui voit 10× plus d'événements déclencheurs que la réalité géophysique (1-3 M5.5+/j)
  est cassée par définition — le monde n'a pas changé, c'est le seuil qui est faux.
- **Warm-up** : toute règle à baseline (SEQ-4, ABS-1, ABS-3, flap caméras) tourne 7 jours en
  mode ombre (log + `correlation_event`, zéro arête, zéro alerte) avant d'émettre.
- **Exploitation SurrealDB** : le profil 24/7 écriture continue + sweep DELETE est exactement
  celui des deux issues ouvertes sur la 3.2 : #7424 (RSS ~9× la taille disque sous ingest
  soutenu, restart récupère 89 %) et #5324 (ghost records scannés après DELETE, RocksDB).
  Runbook requis avant tout déploiement long : monitoring RSS du process SurrealDB +
  redémarrage planifié tant que #7424 est ouvert. C'est une contrainte d'exploitation, pas un
  bloqueur de conception.

---

## 7. Provenance et explicabilité

Chaque arête produite par les étages 1-4 doit répondre « pourquoi existes-tu » sans contexte
extérieur. C'est l'argument d'auditabilité central pour le marché visé — et aujourd'hui
l'écart est total : **13 780 arêtes sur ~13 780 n'ont aucun attribut** (mesuré,
`located_in`+`covers`+`passes_over`, cause `processing.rs:35,42,53`), et aucun champ
`explain` n'existe dans le code (grep négatif exhaustif). Le socle P1 définit déjà le modèle
(`seeyou-v2.md:183-196`) ; cette section le rend exact et obligatoire pour toute nouvelle
arête.

### 7.1 Format (champs plats + `explain` objet, sur chaque arête nouvelle)

```json
{
  "source": "consumer_graph/identity",          // crate/module producteur
  "rule": "owned_by.faa",                        // id de règle, stable
  "rule_version": 1,                             // bump à chaque changement de seuil
  "score": 0.97,                                 // 0-1 normalisé (exigence socle)
  "timestamp": "2026-08-10T14:00:00Z",           // datetime NATIF (jamais string, cf. 4.2)
  "expires_at": null,                            // posé seulement si éphémère
  "match_method": "blocked_fuzzy",               // étage 1 uniquement
  "match_score": 0.97,
  "explain": {
    "inputs":     { "a": "aircraft:a1b2c3", "b": "organization:acme-aviation-llc" },
    "thresholds": { "jaro_winkler": { "value": 0.97, "threshold": 0.95, "passed": true },
                    "margin":       { "value": 0.08, "threshold": 0.05, "passed": true } },
    "datasets":   [ { "name": "faa-releasable", "url": "registry.faa.gov",
                       "licence": "domaine public US", "retrieved_at": "2026-08-10" } ]
  }
}
```

Budget : `explain` ≤ 1 Ko. Pour les séquences : `thresholds` porte fenêtre/lag/magnitude ;
pour les absences : l'état des gates santé/couverture au moment de l'émission (prouver que
la règle n'a pas tiré pendant une panne de collecte fait partie de l'audit).

### 7.2 Contraintes d'écriture (découlent des mesures)

- Écriture par `INSERT RELATION … ON DUPLICATE KEY UPDATE` (sémantique de fusion testée) ;
  si un writer passe par `RELATE … CONTENT`, il doit poser le **jeu complet** — le
  remplacement intégral silencieux est mesuré (champ `source` effacé par un rejeu partiel),
  et `relation_attributes()` (`relations.rs:81-92`) saute les `None` : la combinaison efface
  des champs sans erreur.
- `timestamp`/`expires_at` en datetime natif — `time::floor()` sur string retourne NULL
  silencieusement (mesuré).
- Une arête `subject_to` n'affirme jamais « sanctionné » : elle cite `list`, `list_ref`,
  `source_url`, `retrieved_at`. L'UI reprend cette formulation (entrée de liste datée, pas
  un verdict).

### 7.3 Rendu UI

Le panneau relation existe (`feat(graph): add relation panel wiring in the app`, commit
`cad13fb`) et `GraphEdge.tsx` n'affiche aujourd'hui aucun attribut (`seeyou-v2.md:268`).
À câbler : bloc « Pourquoi ce lien » = règle + version, tableau seuils (valeur vs seuil,
passé/échoué), sources avec licence et date de récupération, horodatages, et pour l'étage 1
le `match_method` (un lien `analyst` s'affiche différemment d'un lien `exact_id`). Lecture
pure des attributs REST — zéro changement de protocole WS.

---

## 8. Séquencement

### 8.0 Amendements au socle existant (à intégrer aux lots déjà planifiés, pas de nouveaux lots)

Trois découvertes de mesure corrigent le socle **avant** que les Lots 8+ ne s'y posent :

1. **Lot 4 (reformulation)** : « batcher les RELATE en une requête multi-statements »
   (`seeyou-v2.md:236`) est mesuré à ~145 arêtes/s — il échoue son propre gate (≥ 1 000/s)
   par 7×. La forme validée : `INSERT RELATION INTO <rel> [ … ] ON DUPLICATE KEY UPDATE`,
   4 514-14 309/s mesurés, p95 batch 200 ≈ 86 ms. P1-0 est par ailleurs tranché par la
   mesure : `RELATE` ne lève **jamais** « already exists » (écrasement silencieux, issue
   #3889) — c'est `INSERT RELATION` sans ODKU qui le lève.
2. **Lot 4 (ajout)** : identité stable `fire_hotspot` (clé naturelle lat/lon
   arrondis+acq_date+acq_time+satellite) + purge d'entités périmées (aucune n'existe :
   croissance 34 635→80 145 mesurée) + correctif nœuds fantômes (`payload.rs:16-27`) +
   cast datetime à l'écriture. Sans le premier, toute règle feu des Lots 5 et 10 double-compte.
3. **Lot 5 (précision)** : la réécriture de `search_graph` utilise la syntaxe
   `FULLTEXT ANALYZER` (validée 3.2.4), pas `SEARCH ANALYZER` (parse error mesurée).

### Chiffrage et chemin 80/20 (F22, F23 — à faire arbitrer AVANT d'écrire une ligne de code)

La v1 ne portait aucune durée. Estimations (un dev, incertitude ±30 %) :

| Lot | Contenu | Durée dev | Attente incompressible |
|---|---|---|---|
| 8A | identité chemin démo (VRS + plane-alert + FAA filtré + OFAC/UK exact, file + suppression, backfill restreint) | ~2 sem | — |
| 8B | ONU (XML à jeton SAS) + G-INFO + scorer fuzzy + GLEIF Phase B + audit 300 liens | ~1,5 sem | — |
| 9A | traversées typées + requête produit inversée + garde-fous + provenance UI | ~1 sem | — |
| 9B | BFS chemin + UI chemin | ~1 sem | — |
| 10 | `correlation_event` + transitions caméra + baselines flap + SEQ-1/2/3 (+4/5 gatées) | ~2 sem | 7 j de run (gate) |
| 11 | santé par région + baseline disparition + ABS-1/ABS-3 + chaos | ~1-1,5 sem | 7 j de warm-up (chevauchable avec le run du Lot 10) |

Total étages 1-4 complets : **+7 à 9,5 semaines dev, +2-3 semaines calendaires de gates**,
au-dessus des 10-13 semaines du socle (`seeyou-v2.md`) → **~18-22 semaines projet**. À
annoncer tel quel au commanditaire — pas de plan sans durée.

**Chemin 80/20 (recommandé, F23)** : 80 % de l'effet démonstratif = « clic avion →
opérateur → entrée de liste de sanctions, avec panneau Pourquoi ce lien ». C'est
**Lot 8A + Lot 9A + section 7** (panneau déjà câblé par `cad13fb`) = **3-4 semaines**.
Les Lots 10-11 sont de la valeur d'exploitation, pas de démo : warm-ups de 7 jours, FP
majoritaires assumés au début (ABS-1), et des règles muettes la plupart des jours (SEQ-1 =
0 la plupart des jours — une démo n'attend pas un M5.5). Les différer ne coûte rien à la
démo. **GO/NO-GO explicite après 9A** : soit +5-6 semaines pour 8B/9B/10/11, soit on
s'arrête à la démo et on itère sur l'usage réel.

### Lot 8A — Identité, chemin démo (dépend : Lot 4 ; consomme plane-alert-db du Lot 7a) — effort M (~2 sem)

Ontologie (2.2, champs `triggered` inclus) → crate `registry` (loaders VRS standing-data
airlines + code-blocks, FAA filtré individuals, plane-alert-db, OFAC + UK ; normalisation ;
matching exact) → `identity.rs` dans `consumer_graph` (filtre hex ICAO, périmètre 2.6,
consultation `resolution_suppression`) + bras `aircraft` de `processing.rs` → tables
`resolution_candidate` + `resolution_suppression` Postgres + 2 routes API → backfill
restreint au périmètre.
**Vérif** : `cargo test -p registry -p consumer_graph -p api` ; % d'avions live résolus
vers un opérateur **mesuré et publié par catégorie** (commercial via callsign, mil,
plane-alert, FAA) ; **gate de viabilité démo (F6)** : si la part des avions commerciaux
visibles résolus vers une compagnie est sous le seuil de démo (~80 %), le maillon callsign
est cassé — corriger avant 9A (le pivot hors tar1090-db est déjà fait, F11) ; zéro arête
`subject_to` issue d'un match par nom (test unitaire) ; rejouer le backfill = zéro doublon
(idempotence `INSERT RELATION`) ; **supprimer un lien auto puis rejouer la résolution → le
lien ne réapparaît pas** (test `resolution_suppression`, F7).

### Lot 8B — Identité, complétude (dépend : 8A) — effort M (~1,5 sem)

ONU (redirection à jeton SAS) + UK G-INFO + scorer fuzzy (blocking + Jaro-Winkler + marge)
+ Phase B GLEIF hors ligne + décision chiffrée UE/OpenSanctions Screening License (F12).
**Vérif** : audit manuel de **300 liens auto stratifiés par `match_method` × registre
(F9)** : ≥ 95 % observés (borne basse Wilson ≥ 92 %), sinon relever le seuil, pas le
volume ; zéro arête sous le seuil (test matcher) ; le loader UK streame les 49,6 MB sans
les charger en mémoire.

### Lot 9A — Multi-sauts, requêtes produit (dépend : Lot 4 pour les index ; 8A pour que les chemins signifient quelque chose) — effort S-M (~1 sem)

Refonte `get_neighbors_graph` (map statique + traversées fléchées + `join_all` + dédup) →
requête produit **inversée** (3.2.2) → garde-fous (3.4) → provenance UI (section 7).
**Vérif** : `cargo test -p api -p graph` ; `npm test` ; **bench sous churn (F16)** :
`curl -w '%{time_total}'` depth=2, **p95 < 300 ms** (baseline mesurée : 2,75 s) et requête
« avions d'opérateur sanctionné » (forme inversée) **< 200 ms**, mesurés **pendant** que
l'ingest re-upserte (~30 k `flies_over` + 12-21 k `monitored_by` / 12 s) et que le sweep
DELETE tourne — un bench sur graphe statique ne prouve rien (#5324, ghost records après
DELETE) ; test du timeout sur zone hub (10 k arêtes) ; `truncated` honoré.

### Lot 9B — Plus court chemin (dépend : 9A) — effort S-M (~1 sem)

`GET /graph/path` (BFS bidirectionnel pondéré, exclusions hub) → UI chemin (épinglage de
2 nœuds).
**Vérif** : `cargo test -p api` ; chemin A→B connu retrouvé ; `404` sous budget ; le
discours produit dit **« jusqu'à 3 sauts » (voisinage) / coût 6 (chemin)** — tout pitch
« 3-5 sauts » est corrigé auprès du commanditaire (F17).

### Lot 10 — Séquences + socle durable (dépend : Lots 4-5 + amendement feux ; Postgres dispo) — effort M (~2 sem + 7 j de gate)

Tables Postgres `correlation_event` (+ rollup horaire) en UNNEST → transitions statut caméra
+ baseline de flap 7 j → SEQ-1/2/3 (données déjà réelles) → SEQ-4/5 gatés par leurs
dépendances (GDELT 7a, feux) → compteurs + coupe-circuit (en événements) + mode ombre.
**Vérif** : `cargo test -p consumer_graph -p db` ; 7 jours de run : cardinalité par règle
publiée **en événements déclencheurs ET en arêtes**, ≤ 2× l'estimation de la section 6 ;
**test du coupe-circuit en événements (F1)** : rejouer un M5.5 synthétique co-localisé avec
100 hotspots admis → 1 événement, ≤ 3 clusters d'arêtes, règle **non** désactivée ; les
arêtes `triggered` portent l'`explain` complet ; warm-up vérifié (zéro alerte à baseline
vide) ; timestamps natifs (`type::is_datetime()` = true sur les nouvelles écritures).

### Lot 11 — Absence (dépend : Lot 10 pour les baselines ; P0-1 pour un flux stable) — effort M (~1-1,5 sem + warm-up 7 j chevauchable)

État de santé des sources interrogeable **par région de fetch** (F18) → baseline de taux de
disparition par cellule (7 j, F19) → ABS-1 (score de tri) → ABS-3 (cellules adjacentes) →
caps + alertes.
**Vérif** : `cargo test -p consumer_graph` ; **tests de chaos obligatoires (F18)** :
(a) couper l'ingest ADS-B 10 minutes → **zéro** événement d'absence émis ; (b) couper
**3 régions de fetch sur 43** — le mode de panne réellement mesuré (`regions_failed=42/43`
dans la baseline du repo) — → zéro événement dans les cellules de ces régions, évaluation
maintenue ailleurs (couper tout l'ingest, seul test de la v1, ne testait pas ce mode) ;
score de tri vérifié (le top-20 du jour = les 20 plus hauts scores, pas les 20 premiers
arrivés) ; échantillon ABS-1 audité à la main, taux de FP documenté (pas de cible
inventée : la mesure décide si la règle reste, se resserre, ou se coupe) ; cap journalier
démontré.

Graphe : Lot 4 (amendé) → 8A → 9A (**= fin du chemin 80/20, démo complète**) → GO/NO-GO →
8B ∥ 9B ; Lots 4-5 → 10 → 11 (warm-up du 11 chevauchable avec le run de gate du 10).
Lot 7a alimente 8A (plane-alert) et 10 (GDELT, tier pays). Aucun lot existant renuméroté.

---

## 9. Ce qui ne marchera pas

**Ce que la donnée ouverte ne donnera jamais (le dire au commanditaire, pas le contourner) :**

- **Plans de vol** : aucun flux libre (SWIM sous accord, EUROCONTROL « not for operational
  use », `sources.md:89`). La case « avion sans plan de vol » de Gotham n'existe pas en open
  data — le proxy est un drapeau d'identité, pas une détection.
- **Bénéficiaires effectifs hors UK** : seul le PSC britannique est ouvert (OGL v3.0,
  confirmé). Le registre français équivalent est à accès restreint depuis la jurisprudence
  européenne de 2022 (connaissance de référence, à re-vérifier avant d'en parler à un
  client). `IMO → propriétaire effectif` reste un problème ouvert (Global Fishing Watch le
  couvre en partie, licence commerciale non confirmée ce jour). **Même limite côté aviation,
  désormais dite explicitement (F10)** : le registrant FAA est un propriétaire déclaré —
  souvent un trust (Bank of Utah, Wells Fargo, TVPX, Aircraft Guaranty…), le pattern n°1
  d'obfuscation sur les avions intéressants. Les trustees connus sont étiquetés
  `org_type="trustee"` et l'UI affiche « propriétaire déclaré ≠ bénéficiaire effectif »,
  pour la FAA comme pour l'IMO.
- **Tasking satellite** : un TLE dit où est le satellite, jamais pourquoi. Toute inférence
  d'intention orbitale serait de l'invention.
- **AIS hauturier** : couverture terrestre 40-75 km des côtes (déjà documenté
  `seeyou-v2.md:347`) ; le grand large exige de l'AIS satellitaire payant.
- **Couverture opérateur aviation générale/privée** : désormais **mesurée, plus estimée**
  (re-mesure de revue, ce jour) : le champ `ownop` communautaire est rempli à 82,1 % sur les
  hex US (mais c'est du *registrant* propriétaire, pas un opérateur) et **11,3 % hors US** —
  les compagnies mondiales en sont quasi absentes (Air France=1, Ryanair=0, Aeroflot=0).
  L'opérateur commercial passe donc par le préfixe callsign (maillon 1, 2.3) ; la GA privée
  hors périmètre d'admission n'est pas résolue, par choix (F4/F10).

**Licences — état re-vérifié le 2026-08-10 après revue** :

- **À ne pas toucher vu l'objectif commercial** : OpenSanctions tier gratuit (CC-BY-NC 4.0
  reconfirmé — mais la **Screening License payante** est une décision à chiffrer au Lot 8B,
  F12 : flat-rate, redistribution OEM possible, elle couvrirait d'un coup l'UE FSD différée
  et remplacerait la maintenance de 4 parseurs ; différer la liste UE face à une cible
  cliente européenne est un trou produit au premier rendez-vous), OpenSky (non-commercial),
  OpenCorporates (verrouillé, 403 mesurés), ADS-B Exchange (payant), Equasis (CGU
  anti-harvest), Windy (embed-only).
- **tar1090-db : hors chemin commercial (F11, vérifié ce jour)** — GitHub API
  `license: None`, aucun fichier LICENSE dans la racine du repo, base amont Mictronics/readsb
  en `NOASSERTION` : pas de licence = tous droits réservés par défaut, chaîne de droits
  amont non établie. Le « ODC-BY probable — relire le LICENSE » de la v1 était une
  illusion : il n'y a rien à relire. Actions : demande écrite à wiedehopf/Mictronics ;
  substitution actée en 2.3 (VRS standing-data CC0 + FAA + plane-alert-db) ; le besoin
  « envergure par type » du Lot 6/P2 (`seeyou-v2.md:287`) migre de même (FAA + VRS
  `model-type`) tant qu'aucune réponse écrite n'existe.
- **adsb.lol — la matière première de l'étage 1, enfin auditée (F13, partiellement
  réfutée, cf. « Objections écartées »)** : l'organisation publie ses données historiques
  sous **ODbL-1.0 explicite** (repos `globe_history_2023→2026`), ses standing-data sous
  **CC0**, le code de l'API sous BSD-3-Clause. Ce qui manque réellement : des **conditions
  écrites pour le flux live** (le README annonce de futures API keys réservées aux
  feeders). Le risque est continuité + conditions commerciales du live, pas « aucune
  licence nulle part ». Actions : ligne à ajouter dans `sources.md` ; conditions écrites de
  l'opérateur avant tout contrat client ; fallback adsb.fi/airplanes.live déjà acté
  (P0-1 plan B).
- **ODbL plane-alert-db, durci (F14)** : importer ~17 k lignes en bloc constitue
  vraisemblablement une base dérivée — « utiliser des faits extraits » ne suffit pas comme
  doctrine face à une extraction substantielle. Mitigations actées : le référentiel reste un
  index de consultation dans `registry` (seules les correspondances aux avions réellement
  vus se matérialisent dans le graphe) ; **aucun endpoint n'expose la base enrichie en
  masse** ; attribution visible (UI + doc) ; avis juridique avant le premier contrat — le
  périmètre exact du share-alike sur base dérivée se tranche par un juriste, pas par cette
  spec.
- **RGPD (F10 — absent de la v1, inacceptable pour un produit vendu depuis la France)** :
  les registrants FAA `TYPE REGISTRANT = individual` sont **exclus à l'ingestion** — aucun
  nom de particulier en base hors listes de sanctions (qui sont des actes publics au régime
  distinct) ; revue DPO avant mise sur le marché (registre des traitements, base légale des
  données sanctions).

**Corrélations séduisantes qui produiraient du bruit** (refusées ci-dessus, liste consolidée) :
co-occurrence zonale sans rareté (toute zone urbaine « converge » en permanence — déjà la
position du socle) ; GDELT au volume ou au tone (~100 k/j) ; « satellite réagit à X »
(déterministe) ; séismes M < 4,5 (40-60/j) ; caméra offline isolée (flap réseau routinier) ;
matching des `cable.owners` en texte libre sans pays de blocking fiable — admissible plus
tard **uniquement** via la file de révision, jamais en automatique.

**Limites SurrealDB à respecter (mesurées ou documentées sur la version exacte)** :
pas de contrôle d'accès par lignes/champs via `$auth` (issue #7416 : 320× plus lent, OOM à
3 421 lignes — l'ACL de l'ambition défense se fait au niveau API, pas dans SurrealDB) ; pas
de plus court chemin natif (#6607) ; `PARALLEL` inopérant (#5171) ; `count()` = scan complet
(#4164) ; fenêtres `OVER` absentes (parse error mesurée) — les baselines se calculent côté
app/Postgres. Et le runbook RSS/restart (#7424, #5324) est une condition d'exploitation
24/7, pas une option.

---

## Objections écartées (revue avocat du diable, contre-vérifiée le 2026-08-10)

Méthode : chaque constat réseau de la revue a été **re-mesuré indépendamment** avant
intégration — dump tar1090-db re-téléchargé et compté ligne à ligne, API GitHub
re-interrogée, tailles HTTP re-mesurées (`Content-Length`), repos VRS/adsblol inspectés.
Résultat : **24 constats sur 25 tiennent et sont intégrés** (mapping ci-dessous). Un seul
est partiellement faux — il est réfuté ici, et ce qui en reste vrai est intégré quand même :

**F13 « adsb.lol n'a AUCUNE entrée licence nulle part — ni le site ni le repo `adsblol/api`
ne publient de conditions » — partiellement réfuté, preuves du jour :** le repo
`adsblol/api` contient un fichier `LICENSE` (BSD-3-Clause, confirmé par l'API GitHub et le
listing racine) ; les repos `adsblol/globe_history_2023→2026` publient l'historique complet
sous **ODbL-1.0 explicite** (README : « This database is made available under the Open
Database License », description « Openly licensed ») ; `adsblol/vrs-standing-data` et
`aircraft-data-links-*` sont en CC0. L'organisation a donc une pratique de licence ouverte
documentée — l'affirmation « aucune entrée licence nulle part » est fausse. **Ce qui reste
vrai et est intégré (§9, `sources.md`)** : le **flux live** de l'API n'a pas de conditions
écrites (BSD-3 couvre le code, pas la donnée servie) et le README annonce de futures API
keys — risque continuité/conditions commerciales réel, conditions écrites à obtenir avant
contrat, fallback P0-1 prêt.

**Nuance factuelle sur F6** (sans effet sur la conclusion) : dans le dump re-téléchargé ce
jour, l'unique occurrence « Air France » est `39BDA9`/F-HPNJ, un A220-300 immatriculé en
France — pas « un trust US » comme l'écrit la revue. Tous les autres chiffres de F6 sont
reproduits à l'identique (614 215 lignes ; `ownop` 82,1 % US / 11,3 % hors US ;
Ryanair = 0 ; Aeroflot = 0) : le maillon opérateur mondial était bien cassé, la
substitution 2.3 s'imposait.

**Découverte de contre-vérification (au-delà de la revue)** : `vradarserver/standing-data`
(CC0-1.0, LICENSE présent) fournit non seulement `airlines.csv` (5 965 compagnies,
`AFL→Aeroflot` et `IRM→Mahan Air` vérifiés présents ce jour) mais aussi `code-blocks`
(hex→pays, remplace la table à coder en dur du maillon 2 v1) et `registration-prefixes` —
trois maillons sous une seule licence commercial-safe, miroir adsblol rafraîchi toutes les
heures.

| Constat | Verdict | Intégré à |
|---|---|---|
| F1 cardinalités de jour de queue + coupe-circuit auto-tué | juste | 4.3, 4.4, 6 (agrégation + comptage en événements) |
| F2 seuil « ≥ 3 caméras » absolu | juste | 4.4 (Poisson vs flap, rayon R(M)) |
| F3 SEQ-4 = détecteur de burst presse | juste | 4.4 (double anomalie, domaines distincts) |
| F4 goutte-à-goutte sous-estimé ×10-100, TIS-B non filtré | juste (recalculé) | 2.6, 2.7, 6 (périmètre, cap file, hex ICAO) |
| F5 budget unique auto-contradictoire | juste | 6 (deux budgets) |
| F6 ownop 11,3 % hors US, requête vitrine → ~0 | juste (reproduit à l'identique) | 2.3 (callsign VRS CC0), 8A (gate pivot) |
| F7 lien auto faux immortel | juste | 2.4 (`resolution_suppression`), 8A (test) |
| F8 `subject_to` fuzzy auto | juste (cédé en entier) | 2.4, 6 (id exact only, reste en file) |
| F9 audit de 100 non probant | juste (Wilson recalculé : [89 %, 98 %]) | 2.4, 8B (300 stratifiés) |
| F10 trusts/personnes physiques/RGPD | juste | 2.2, 2.3, 9 (filtre individual, trustees, DPO) |
| F11 tar1090-db sans licence | juste (re-vérifié : `license: None`) | 2.3 (sorti), 9 |
| F12 OpenSanctions payant à chiffrer + UK 49,6 MB | juste (49 629 114 octets mesurés) | 2.3, 2.7, 8B, 9 |
| F13 adsb.lol « aucune licence nulle part » | **partiellement réfuté** (ODbL/CC0/BSD-3 publiés ; le trou = conditions du live) | 9, `sources.md` |
| F14 ODbL extraction substantielle | juste | 9 (mitigations + avis juridique) |
| F15 requête produit dans le sens condamné | juste | 2.2 (matérialisation sanction), 3.2 (forme inversée) |
| F16 bench sur graphe statique seulement | juste | 3.4, 8 (Lot 9A : bench sous churn) |
| F17 pitch « 3-5 sauts » | juste | 3.4, 9B |
| F18 gate santé domaine vs panne région (42/43) | juste | 5.1, Lot 11 (chaos 3/43 régions) |
| F19 masque de présence vs taux de disparition | juste | 5.1, 5.2 (baseline disparition + score de tri) |
| F20 « zones voisines » sans structure de voisinage | juste | 5.2 (cellules adjacentes) |
| F21 cadence constante 36 s vs intervalle adaptatif | juste | 5.2 (cadence effective par région) |
| F22 zéro durée dans la spec | juste | 8 (chiffrage, 18-22 semaines projet) |
| F23 80/20 non identifié | juste | 8 (8A+9A = 3-4 sem, GO/NO-GO) |
| F24 arête vers un nœud inexistant (`camera_offline_event`) | juste | 4.3 (`→triggered→camera`, transition dans `explain`) |
| F25 champs `triggered` hors FIELD_DEFINITIONS | juste | 2.2 (DEFINE FIELD ajoutés) |

---

## Résumé (décisions structurantes, lots, risques)

1. Quatre étages au-dessus du socle P1, sans le modifier : résolution d'entité,
   multi-sauts, séquences, absence. Zéro nouvelle variante WS ; navigation en REST.
   **Chemin 80/20 d'abord : Lots 8A+9A (3-4 semaines) = la démo complète « avion →
   opérateur → sanction + panneau Pourquoi ce lien » ; GO/NO-GO ensuite pour 8B/9B/10/11
   (étages complets : +7-9,5 semaines dev, +2-3 calendaires — total projet ~18-22 sem).**
2. Étage 1 re-sourcé après revue : **tar1090-db sorti du chemin commercial (aucune licence,
   vérifié)** ; l'opérateur commercial vient du **préfixe callsign → VRS standing-data
   `airlines.csv` (CC0, 5 965 compagnies, AFL/IRM vérifiés)**, le pays du hex de
   `code-blocks` (CC0) ; FAA filtré `individual` (RGPD) + trustees étiquetés ; OFAC/UK/ONU
   inchangés (UK = 49,6 MB, loader en streaming) ; UE = décision chiffrée OpenSanctions
   Screening License vs 4 parseurs.
3. Matching : id exact d'abord ; fuzzy 0,95 + marge 0,05 pour `operated_by`/`owned_by`
   seulement ; **`subject_to` jamais automatique par nom** ; file cap 50/j triée par
   intérêt ; **`resolution_suppression` = mémoire négative consultée avant toute écriture
   auto** ; gate : 300 liens stratifiés, ≥ 95 % (borne Wilson ≥ 92 %).
4. Écriture graphe : `INSERT RELATION … ON DUPLICATE KEY UPDATE` en littéral tableau
   (4 514-14 309/s mesurés) — jamais N RELATE multi-statements (145/s mesuré).
5. Étage 2 : requête produit **inversée** (départ `sanction`, matérialisée seulement si
   reliée) ; bench Lot 9A **sous churn** ingest+sweep ; profondeur produit = 3 sauts /
   coût 6, dit tel quel au commanditaire.
6. Étage 3 en Rust, **agrégé par événement déclencheur** (1 séisme = 1 événement, arêtes
   bornées ; coupe-circuit compté en événements, pas en arêtes) ; SEQ-1 exige l'ignition ;
   SEQ-2 teste Poisson contre le flap attendu avec rayon fonction de la magnitude ; SEQ-4
   exige la double anomalie (domaines distincts ET militaires vs leur propre baseline) ;
   stockage triple inchangé (arête `triggered` + `correlation_event` Postgres + alerte).
7. Étage 4 : gate santé **par région de fetch** (le mode de panne mesuré : 42/43),
   baseline de **taux de disparition** par cellule (pas de simple présence), cadence
   effective par région, score de tri spécifié ; chaos tests : ingest coupé ET 3 régions/43
   coupées.
8. Anti-bruit : **deux budgets** — corrélation ≤ ~40 durables/j ; identité bornée par le
   périmètre d'admission (hex ICAO valides ; mil/plane-alert/commercial/FAA
   non-individuels) + stock surveillé.
9. Risque n°1 : conditions écrites du **flux live** adsb.lol (historique ODbL, live sans
   conditions) — à obtenir avant contrat, fallback P0-1 prêt. Risque n°2 : précision réelle
   du maillon callsign→compagnie — mesurée au gate 8A, pivot documenté si < seuil démo.
   Risque n°3 : exploitation SurrealDB 3.2.4 en écriture continue (#7424/#5324) — runbook
   RSS + restarts, bench sous churn au 9A. Risques juridiques suivis : ODbL plane-alert-db
   (avis juriste avant contrat) ; RGPD couvert par le filtre individuals + revue DPO.
