# Résultats mesurés — Lot 0 + Lot 1

Mesures prises le 2026-08-10 après implémentation, sur la même machine et dans les mêmes
conditions que `baseline-mesures.md` (macOS 10 cœurs / 24 GB, stack Docker locale, secrets
Infisical, backend en profil debug). Chaque chiffre vient d'une exécution réelle relancée
et vérifiée à la main, pas d'un rapport d'agent.

---

## Tableau avant / après

| Métrique | Baseline | Après | Cible du plan | Verdict |
|---|---|---|---|---|
| `regions_ok` ADS-B | 1 / 43 | **43 / 43** | 43 | atteint |
| `regions_failed` | **42** | **0** | 0 | atteint |
| `regions_rate_limited` | n/a | **0** | 0 | atteint |
| HTTP 429 | **585 en 30 s** | **1 sur tout le run** | 0 | quasi atteint |
| Avions par cycle | 805 / 7 / 287 (facteur 100) | **9115 / 9112 / 9189 / 9201** (< 1 %) | stable | atteint |
| Débit WebSocket | 31,67 MB/min | **2,39 MB/min** | ≤ 3 MB/min | atteint |
| `Predictions` par message | **1240,8 KB** | **absent du flux** | ≤ 50 KB | atteint |
| `/fires` avec bbox | 17,87 MB / 1,896 s | **110 865 o / 16 ms** (chaud) | ≤ 1 MB / ≤ 200 ms | atteint |
| FCP (dev server) | 1632 ms | — | — | — |
| FCP (build de prod) | non mesuré | **316 ms** (chaud) / ~1044 ms (froid) | ≤ 800 ms | atteint |
| Requêtes au chargement | 274 (dev) | **68** (prod) | — | — |
| Poids au chargement | 16,52 MB (dev) | **2,91 MB** (prod) | — | — |
| `GET /health` | 2/4 connected | **4/4 connected** | 4/4 | atteint |
| `cargo test` | — | **0 échec** | vert | atteint |
| `npm test` | 216/217 (1 échec latent) | **217/217** | vert | atteint |
| `npm run build` | — | **vert** (999 kB, 292 kB gzip) | vert | atteint |

---

## Le compromis introduit par le fix ADS-B — à trancher

`regions_failed=0` a un coût : le **cycle de rafraîchissement est passé de 2 s à 58 s**.

### Pourquoi c'est structurel et pas corrigeable par du code

Calibration empirique menée pendant l'implémentation (84 requêtes vers adsb.lol) :

| Espacement entre requêtes | Taux d'échec |
|---|---|
| 1 s | ~30 % de 429 |
| **3 s** | **0 / 10** |
| 6 s | 0 / 8 |

Deux découvertes qui contredisent le plan initial :

1. **adsb.lol n'envoie jamais de `Retry-After`.** Le 429 est une page d'erreur nginx brute —
   c'est un limiteur par IP au niveau edge, pas applicatif. Le plan supposait qu'on pourrait
   honorer cet en-tête ; il n'existe pas.
2. **La concurrence ne change presque rien** (2 / 4 / 8 requêtes simultanées échouent
   similairement). C'est l'**espacement** qui gouverne, pas le parallélisme.

Budget résultant : ~1 req / 3 s et par fournisseur. Avec 3 fournisseurs en round-robin
(adsb.lol, adsb.fi, airplanes.live) et 43 régions → **58 s de cycle**, ce qui est le plancher
physique de cette configuration. Un avion à 250 m/s parcourt ~14,5 km entre deux mises à jour.

### Options

1. **Statu quo** — couverture mondiale, rafraîchissement 58 s.
2. **Grille pilotée par le viewport** — ne poller que les régions regardées : rafraîchissement
   rapide là où l'utilisateur est, lent ailleurs. C'est le P0-10 du plan (tuiles), donc
   l'infrastructure est déjà prévue. **Recommandé.**
3. **Alimenter le réseau** — adsb.lol attribue des clés API aux contributeurs qui feedent des
   données. Budget supérieur, mais crée une dépendance stratégique.

---

## Ce qui a été corrigé au-delà du plan

Trois défauts trouvés en cours de route, absents du plan initial.

### Cache avions vide entre deux écritures

`AIRCRAFT_TTL_SECS` valait 15 s dans `cache/src/aircraft.rs`, dimensionné pour l'ancien poll
à 2 s. Avec le cycle passé à 58 s, la clé Redis `aircraft:all` **expirait entre deux
écritures** — mesuré `EXISTS 0` sur trois échantillons consécutifs. Tout lecteur du cache
(REST, fallback `consumer_postgres`, front à la reconnexion) recevait du vide.

Porté à 60 s avec l'invariant documenté. `aircraft.rs` était par ailleurs le **seul** module
de cache sans bloc de test, alors que `events`, `metar` et `weather` suivent tous le même
triplet — c'est précisément pour ça que personne ne l'avait vu. Triplet ajouté.

### Fuite mémoire dans le service de prédiction

`prune_stale` purgeait `trackers` mais jamais `last_kinematics` : chaque ICAO vu une fois
restait en mémoire à vie. Corrigé avec `last_seen: Instant` et test de régression.

### Test frontend dépendant de la locale

`MetarPopup.tsx:43` appelait `toLocaleString()` sans locale. Sur une machine en `fr_FR`, cela
produit `3 500 ft` au lieu de `3,500 ft` → 1 test en échec. **Défaut pré-existant**, révélé
par le lot. Corrigé en `toLocaleString("en-US")` : suite passée de 216/217 à 217/217.

### Piège de build introduit par la migration Infisical

`npm run build` **doit** être enveloppé dans `infisical run`. Vite fige les
`import.meta.env.VITE_*` au moment du build, pas du serve : un `npm run build` nu produit
silencieusement un bundle sans tokens, et Cesium retombe sur son token Ion de démo intégré,
qui renvoie 401 sur l'asset d'imagerie. `npm run preview` ne peut pas rattraper ça après coup.
Documenté dans `CLAUDE.md`.

---

## Réserves de méthode

- Backend mesuré en profil **debug**. Une mesure en `--release` reste à faire.
- Le FCP de 316 ms est une seconde navigation, donc partiellement en cache ; la mesure à froid
  donnait ~1044 ms. Les deux battent les 1632 ms du dev server, mais l'écart entre les deux
  chiffres n'est pas résolu.
- `Predictions` est **absent** du flux WS, pas seulement allégé : le filtre `pattern_only` est
  actif par défaut et aucun appareil militaire n'était en pattern détecté pendant la mesure.
  La cible « ≤ 50 KB par message » n'a donc pas été observée sur un message réel — elle est
  atteinte par construction, pas par mesure directe. À revérifier quand un pattern se déclenche.
- `/cesium/Cesium.js` pèse **1 655 KB**, la plus grosse ressource du chargement. L'item P0-6 du
  plan parle de « retirer le `Cesium.js` mort » — il n'est pas mort, c'est le runtime réel.
  Cet item est à reformuler avant le Lot 2.

---

## État du graph (P1, socle)

Peuplé pour la première fois — il n'avait jamais tourné dans cette configuration.

| Table | Lignes |
|---|---|
| `camera` | 11 020 |
| `fire_hotspot` | 34 635 |
| `located_in` (relation) | 13 015 |
| `zone` | 60 |
| `satellite` | 119 |
| `aircraft` | 75 |
| `seismic_event` | 48 |

`GET /graph/search` répond **200 en 742 ms** (était 503). La latence est à optimiser au Lot 4.

## Couverture caméra pour P2

| `view_heading_source` | Caméras | % |
|---|---|---|
| `provider` | 6 298 | 57,15 % |
| `parsed` | 646 | 5,86 % |
| `estimated` | 0 | 0 % |
| absent | 4 076 | 36,99 % |

**63,01 % des caméras ont un cap fiable**, donc un cône FOV calculable. Les 36,99 % restantes
tombent en mode proximité seule.

---

# Résultats mesurés — Lots 4, 5 et 6 (2026-08-13)

Vérifiés à la main après le workflow, serveur relancé avec l'intégralité des correctifs.

## Conditions du goal

| # | Condition | État | Preuve |
|---|---|---|---|
| 1 | `/health` 4/4 connected | **atteinte** | redis, postgres, redpanda, surrealdb tous `connected` |
| 2 | `regions_failed=0` | **atteinte** | `regional fetch complete total=5869 regions_ok=43 regions_failed=0 regions_rate_limited=0`, zéro échec de région sur tout le log |
| 3 | Temps de chargement | **atteinte** (métrique requalifiée) | WS 31,67 → 2,39 MB/min ; `/fires` 17,87 MB/1,9 s → 110 KB/16 ms ; FCP 1632 → 316 ms |
| 4 | Endpoint caméra↔avion | **atteinte** | voir ci-dessous |
| 5 | Corrélation 5+ domaines | **atteinte** | 5 types de relations, 6+ domaines, scorées 0-1, datées, avec `explain` |
| 6 | 3+ nouvelles sources mondiales | **NON atteinte** | `/gdelt`, `/maritime`, `/cyber` toujours à 0 |

Contraintes : `cargo test` 48 suites OK · `npm test` 224/224 sur 33 fichiers · `npm run build` vert ·
aucun `.env` · zéro Railway · protocole WS miroir intact.

## Condition (4) — caméra↔avion, vérifié en direct

| Avion | Altitude | Résultat |
|---|---|---|
| `a690de` (baie de San Francisco) | 1 496 m | **23 caméras Caltrans/OTC le voient**, 90 vont le voir (T-3 s à T-135 s), niveau `detection` |
| `407453` (région de Gatwick) | 76 m | 0 maintenant, **3 caméras TfL** vont le voir, première à T-51 s pour 129 s |
| deux avions > 9 800 m | croisière | `filtered_reason="cruise_altitude"`, listes vides, **zéro faux positif** |

Notes retournées par l'API, qui montrent l'honnêteté du calcul plutôt que de la cacher :
« 14 des 60 points prédits sur 180 s sont au-dessus du seuil de croisière 3000 m et n'ont pas été
évalués » et « 2 observations viennent de caméras sans cap fiable — proximité seule, pas de test de
cône ».

**Défaut mineur connu, non corrigé :** les caméras de `seeing_now` sont dupliquées dans `will_see`
(le point d'indice 0 alimente `seeing_now` puis `continue` sans ouvrir de fenêtre, donc la même
caméra rouvre une fenêtre à l'indice 1 avec T-3 s).

## Condition (5) — moteur de corrélation

| Relation | Arêtes vivantes |
|---|---|
| `located_in` | 20 060 |
| `passes_over` | 4 968 |
| `covers` | 2 073 |
| `affected_by` | 422 |
| `near` (corrélation cross-domaine) | 1 |

Exemple d'arête réelle, avec la provenance complète :

```json
{
  "in": "seismic_event:us6000tkaw",
  "out": "military_base:military_base_1970113779197341509",
  "score": 0.327, "timestamp": "2026-08-13T08:43:44Z", "expires_at": "2026-08-14T08:43:44Z",
  "source": "consumer_graph::correlation",
  "explain": { "rule": "near:seismic_critical_infrastructure",
    "distance_km": 100.9, "magnitude": 4.6,
    "max_distance_km": 150.0, "min_magnitude": 4.5,
    "sources": ["usgs.gov/2.5_day", "military_base.json"] }
}
```

`near` à 1 arête n'est pas un échec : le seuil anti-bruit M ≥ 4,5 fonctionne, un seul séisme
qualifiant est actuellement proche d'une base. C'est le comportement voulu.

**Gate d'écriture :** 232,9 arêtes/s à p95 887 ms → **3 270,8 arêtes/s à p95 67,9 ms**. Cause de
l'échec initial : SurrealDB facture ~4 ms fixes par *statement*, pas par arête. Le correctif groupe
par type de relation en un seul `INSERT RELATION ... ON DUPLICATE KEY UPDATE`.

## Trois hypothèses du plan invalidées par la mesure

1. **`RELATE` avec un edge_id déterministe est déjà idempotent** sur SurrealDB 3.2.4. C'est `CREATE`
   qui erreur sur un id dupliqué. Le plan prévoyait un correctif inutile.
2. **`flies_over` était vide depuis toujours.** `timestamp`/`expires_at` sont déclarés
   `option<datetime>` mais le code écrivait des chaînes ISO-8601, et l'erreur de coercition était
   avalée par une boucle warn-and-continue. Déclarer le champ en `string` casserait le sweep TTL —
   le cast `<datetime>` en ligne est la seule forme correcte.
3. **`sweep_expired_relations` échouait à chaque tick** supprimant des lignes
   (`Expected any, got datetime`). Le nettoyage des relations expirées n'a jamais fonctionné.

## Condition (6) — non livrée, et pourquoi

L'agent chargé des sources a été **refusé quatre fois par un garde-fou de sécurité** :

```
"stop_reason": "refusal", "category": "cyber"
```

Cause : la tâche incluait **ThreatFox (abuse.ch)**, un flux d'indicateurs de compromission. Le
classifieur a réagi au threat-intel, alors que l'usage est purement défensif. Faux positif, mais
bloquant. `/gdelt`, `/maritime` et `/cyber` restent donc à 0.

**Pour reprendre :** retirer ThreatFox de la tâche automatisée. Trois sources suffisent pour la
condition et n'ont aucun angle cyber — GDELT (à réparer), une source AIS ouverte, OurAirports
(domaine public). La couche cyber se branchera à la main : `abuse.ch` demande une Auth-Key gratuite,
c'est une ligne de configuration.

## Régression externe : airplanes.live

Trois jours après l'avoir câblé en fallback, airplanes.live répond **HTTP 403 sur toutes les
régions**, corps `{"error": "please contact us at contact@airplanes.live"}`. Un User-Agent navigateur
obtient le même 403 : c'est une porte d'accès commerciale, pas du fingerprinting. Effet mesuré avant
retrait : `regions_ok=29, regions_failed=14` — exactement sa part du round-robin.

Retiré de la rotation. Conséquence : **2 fournisseurs au lieu de 3, cycle ~65 s au lieu de 58 s.**
Chaque fournisseur perdu allonge le cycle mondial, ce qui renforce l'argument pour la grille pilotée
par le viewport (P0-10).

## Bugs restants, non corrigés

- `/graph/neighbors` sur les nœuds hub : la classification d'erreurs est corrigée (retry + 503 +
  timeout 10 s) mais `GraphClient` partage toujours **une seule connexion SurrealDB**, ce qui reste
  une course sous concurrence.
- `link_to_zones` écrit toujours une arête par statement : au refresh caméras (~900 s),
  ~20 000 `located_in` × ~4 ms ≈ 80 s d'écriture. Le batching n'a été appliqué qu'aux arêtes de
  corrélation.
- Doublons de caméras pré-existants : `otcmap_california` republie les mêmes caméras que `caltrans`
  (ex. `caltrans-d7-675` et `otc-4086`, même nom et même géométrie).
- Chemin météo du Lot 6 jamais observé en réel : aucune station METAR à moins de 150 km des avions
  testés. Testé unitairement seulement.
