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
