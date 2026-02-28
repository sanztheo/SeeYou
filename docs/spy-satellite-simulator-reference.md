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

## Notre stack 100% gratuite

### Rendu 3D
| Techno | Role | Cout |
|---|---|---|
| **CesiumJS (Resium)** | Globe 3D, rendu WebGL, entites geospatiales | Gratuit (Apache 2.0) |
| **OSM Buildings** | Batiments 3D extruds depuis OpenStreetMap | Gratuit (ODbL) |
| **Post-processing GLSL** | Shaders surveillance (NVG, FLIR, CRT, cel-shading) | Gratuit (natif CesiumJS) |

### Donnees temps reel
| Source | Donnees | Type | Cout | Limites |
|---|---|---|---|---|
| **OpenSky Network** | Avions civils (7000+ positions live) | REST, JSON | Gratuit | 4 000 credits/jour (inscrit), refresh 5s |
| **adsb.lol** | Avions militaires + callsigns | REST, JSON | Gratuit | Aucune limite documentee |
| **CelesTrak** | Satellites (orbites TLE, 180+) | TLE/JSON/XML | Gratuit | Aucune (non-profit 501c3) |
| **Overpass API** | Routes reelles (OSM) → particules trafic | Overpass QL, JSON | Gratuit | Rate limit auto, timeout 180s |
| **Cameras publiques** | Flux video CCTV reels | MJPEG/HLS/JPEG | Gratuit | Depend des villes |

### Sources de cameras CCTV gratuites
| Source | Couverture | Lien |
|---|---|---|
| TfL JamCams | Londres | https://api.tfl.gov.uk |
| NYCDOT | New York | https://webcams.nyctmc.org |
| Caltrans CCTV | Californie | https://cwwp2.dot.ca.gov/vm/iframemap.htm |
| Insecam | Mondial | http://www.insecam.org |

### Backend + Frontend
| Techno | Role | Cout |
|---|---|---|
| **Rust (Axum)** | Backend API REST + WebSocket | Gratuit |
| **Redis** | Cache des donnees API externes | Gratuit (local) |
| **React + TypeScript** | Frontend UI | Gratuit |
| **Resium** | Wrapper React pour CesiumJS | Gratuit |
| **TailwindCSS** | Styling | Gratuit |

### Nature des donnees

| Couche | Donnees reelles ? | Detail |
|---|---|---|
| Avions civils | **OUI** | Positions GPS live via ADS-B |
| Avions militaires | **OUI** | Positions GPS live via ADS-B |
| Satellites | **OUI** | Orbites reelles, positions calculees par propagation SGP4 |
| Cameras CCTV | **OUI** | Vrais flux video de vraies cameras publiques |
| Trafic routier | **PARTIEL** | Routes reelles (OSM), vehicules simules par particules |

---

## Cout total : $0
