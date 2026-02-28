# I Built a Spy Satellite Simulator in a Browser

**Source:** https://www.spatialintelligence.ai/p/i-built-a-spy-satellite-simulator
**Auteur:** Bilawal Sidhu
**Date:** 24 fevrier 2026
**Publication:** Map the World by Bilawal Sidhu

---

## Vue d'ensemble

WorldView est un simulateur satellite fonctionnant dans le navigateur qui integre des donnees geospatiales en temps reel avec des visualisations de grade militaire. Le projet a attire l'attention du co-fondateur de Palantir.

---

## Stack Technique (original de l'auteur)

> L'auteur utilisait Google Photorealistic 3D Tiles (payant) et ADS-B Exchange (payant).
> Notre version utilise uniquement des alternatives 100% gratuites — voir section "Stack gratuite" plus bas.

---

## Modes de rendu visuel

Plusieurs couches d'affichage imitant les systemes de renseignement classifies :

- **Night Vision (NVG)** - Simulation d'imagerie faible luminosite de grade militaire
- **FLIR thermal** - Visualisation du spectre infrarouge avec reticules de ciblage
- **CRT scan lines** - Esthetique d'affichage a tube cathodique
- **Anime cel-shading** - Rendu stylise contrastant avec la fonctionnalite de surveillance

---

## Approche de developpement

Developpement assiste par IA plutot que codage manuel traditionnel :

> "I didn't write this code by hand. I described features in voice notes and screenshots"

### Modeles IA utilises
- Gemini 3.1
- Claude 4.6
- Codex 5.3

### Methode
- **8 agents IA simultanes**, chacun gerant un sous-systeme :
  - Suivi satellite
  - Integration CCTV
  - Pipelines de shaders
- **Delai de developpement :** un weekend

---

## Concepts architecturaux cles

### Spatial Intelligence
L'IA comprenant "le monde physique de la meme maniere qu'elle comprend le texte." Cela differe de la reconnaissance d'image en se concentrant sur :
- Les relations spatiales
- Le changement temporel
- Les patterns de mouvement
- Le comportement des objets dans les scenes

### Sousveillance vs. Surveillance
Le projet demontre l'esthetique de la "sousveillance" - utilisant des flux de donnees publics avec le langage d'interface de surveillance, mais placant la capacite de surveillance entre les mains des individus plutot que sous controle institutionnel.

### "God Mode"
L'interface inclut des overlays de detection montrant :
- Chaque vehicule de rue
- Avions militaires avec callsigns/altitude
- Satellites en orbite
- Flux CCTV
- Visualisation de capacites d'observation comprehensive de type panoptique

---

## Direction future

WorldView represente la couche prototype de **SpatialOS** :
- Modele du monde physique continuellement mis a jour
- Ingestion d'imagerie satellite, flux de cameras, donnees de capteurs IoT
- Interrogeable par des agents IA en temps reel

> "This demo is to SpatialOS what Google Maps is to Google's location intelligence infrastructure."

---

## Stack technique detaille utilise par l'auteur

### Rendu 3D
| Techno | Role | Notes |
|---|---|---|
| **WebGPU** | Moteur de rendu GPU dans le navigateur | Successeur de WebGL, ~70% support navigateurs (Chrome, Edge, Firefox, Safari) |
| **Google Photorealistic 3D Tiles** | Modeles 3D photorealistes des villes | Via Map Tiles API, format OGC 3D Tiles |
| **Custom GLSL/WGSL Shaders** | Modes visuels (NVG, FLIR, CRT, cel-shading) | Shaders post-processing appliques au rendu 3D |

### Donnees temps reel
| Source | Role | Format |
|---|---|---|
| **OpenSky Network** | Positions avions civils (7000+) | REST API, JSON |
| **ADS-B Exchange** | Avions militaires + callsigns | REST API via RapidAPI |
| **CelesTrak** | Orbites satellites (180+ TLE) | TLE/3LE text, JSON, XML |
| **OpenStreetMap / Overpass** | Donnees routes/vehicules → particules | Overpass QL, JSON/XML |
| **CCTV publiques** | Flux video cameras de circulation | MJPEG/HLS streams |

### IA (developpement)
| Modele | Usage |
|---|---|
| **Claude 4.6** | Generation de code, architecture |
| **Gemini 3.1** | Generation de code |
| **Codex 5.3** | Generation de code |

---

## Cout des APIs et services

### Google Photorealistic 3D Tiles API
- **Lien :** https://developers.google.com/maps/documentation/tile
- **Free tier :** 1 000 requetes/mois gratuites
- **Pricing (par 1 000 requetes) :**

| Volume mensuel | Prix / 1 000 req |
|---|---|
| 0 - 1 000 | **Gratuit** |
| 1 001 - 100 000 | **$6.00** |
| 100 001 - 500 000 | **$5.10** |
| 500 001 - 1 000 000 | **$4.20** |
| 1 000 001 - 5 000 000 | **$3.30** |
| 5 000 000+ | **$2.40** |

- **Limites :** 10 000 root tileset queries/jour, sessions de 3h max, 12 000 queries/min
- **Estimation pour dev/proto :** ~gratuit si < 1 000 sessions/mois, ~$60-300/mois pour usage modere

### OpenSky Network API
- **Lien :** https://opensky-network.org/apidoc/
- **Prix : GRATUIT** (non-commercial)
- **Limites :**

| Tier | Credits/jour | Resolution | Historique |
|---|---|---|---|
| Anonyme | 400 | 10s | Temps reel uniquement |
| Inscrit | 4 000 | 5s | Jusqu'a 1h |
| Contributeur actif | 8 000 | 5s | Jusqu'a 1h |

- **Usage commercial :** Necessite autorisation speciale
- **Note :** Gratuit et largement suffisant pour un prototype

### ADS-B Exchange
- **Lien :** https://www.adsbexchange.com/
- **Plans :**

| Plan | Prix | Requetes |
|---|---|---|
| RapidAPI Personal | **$10/mois** | 10 000 req/mois |
| Enterprise | **Sur devis** | Illimite |

- **Alternative gratuite :** [adsb.lol](https://api.adsb.lol/docs) - API communautaire open-source, gratuite et sans limite

### CelesTrak (donnees orbitales TLE)
- **Lien :** https://celestrak.org/
- **Prix : ENTIEREMENT GRATUIT**
- **Organisation :** 501(c)(3) non-profit
- **Formats :** TLE/3LE, JSON, XML, CSV
- **Limites :** Aucune limite documentee, usage raisonnable attendu

### OpenStreetMap / Overpass API
- **Lien :** https://overpass-api.de/
- **Prix : GRATUIT** (serveurs publics)
- **Limites :** Rate limiting automatique (HTTP 429), timeout max 180s, memoire max 512 MiB
- **Alternative payante :** [Geofabrik](https://www.geofabrik.de/data/overpass-api.html) pour de meilleures performances

### Cameras CCTV publiques
- **Options gratuites :**
  - [Insecam](http://www.insecam.org/) - Repertoire mondial de cameras publiques
  - [TfL Traffic Cameras](https://pusher.com/blog/realtime-tfl-traffic-camera-api/) - Cameras de Londres (gratuit, API TfL)
  - DOT cameras locales - Beaucoup de villes exposent leurs cameras de trafic gratuitement
- **Options payantes :**
  - [TrafficLand](http://www.trafficland.com/api.html) - 25 000+ cameras, 200+ villes (sur devis)
  - [Vizzion](https://www.vizzion.com/API.html) - Plus grand aggregateur mondial (sur devis)
  - [INRIX](https://docs.inrix.com/traffic/trafficcameras/) - API images JPEG (sur devis)

### WebGPU
- **Prix : GRATUIT** (API navigateur native)
- **Support :** Chrome, Edge, Firefox (Windows + macOS ARM), Safari (macOS/iOS/visionOS)
- **Doc :** https://www.w3.org/TR/webgpu/

---

## Resume des couts

| Service | Cout pour prototype | Cout production |
|---|---|---|
| Google 3D Tiles | Gratuit (< 1K req/mois) | $60-300+/mois |
| OpenSky Network | **Gratuit** | Gratuit (non-commercial) |
| ADS-B Exchange | $10/mois ou gratuit via adsb.lol | $10+/mois |
| CelesTrak | **Gratuit** | Gratuit |
| OpenStreetMap | **Gratuit** | Gratuit |
| CCTV cameras | **Gratuit** (sources publiques) | Sur devis (aggregateurs) |
| WebGPU | **Gratuit** | Gratuit |
| **TOTAL prototype** | **~$0 - $10/mois** | |
