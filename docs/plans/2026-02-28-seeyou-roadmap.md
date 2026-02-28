# SeeYou — Roadmap

## Stack

| Couche | Techno | Cout |
|---|---|---|
| Frontend | React + TypeScript + Resium (CesiumJS) + TailwindCSS | Gratuit |
| Backend | Rust (Axum) + WebSocket | Gratuit |
| Cache | Redis | Gratuit (local) |
| 3D Batiments | CesiumJS + OSM Buildings | Gratuit |
| Avions civils | OpenSky Network API | Gratuit |
| Avions militaires | adsb.lol API | Gratuit |
| Satellites | CelesTrak TLE | Gratuit |
| Trafic routier | OpenStreetMap Overpass API | Gratuit |
| Cameras | Cameras publiques reelles (TfL, DOT, etc.) | Gratuit |
| Shaders | Post-processing CesiumJS (GLSL) | Gratuit |
| **TOTAL** | | **$0** |

---

## Phase 1 — Fondations

> Objectif : Globe 3D navigable avec batiments, projet structure, backend qui tourne.

### Backend
- [ ] Init projet Rust avec Cargo (workspace)
- [ ] Setup Axum avec un serveur HTTP basique (health check)
- [ ] Configurer CORS pour autoriser le frontend
- [ ] Setup WebSocket server basique (connexion/deconnexion)
- [ ] Setup Redis (connexion, test read/write)
- [ ] Structurer les modules : `api/`, `ws/`, `cache/`, `services/`

### Frontend
- [ ] Init projet React + TypeScript + Vite
- [ ] Installer et configurer Resium (wrapper CesiumJS)
- [ ] Afficher un globe CesiumJS navigable (zoom, rotation, tilt)
- [ ] Charger OSM Buildings 3D sur le globe
- [ ] Setup TailwindCSS
- [ ] Creer le layout principal : globe plein ecran + sidebar retractable
- [ ] Connexion WebSocket au backend

### Infra
- [ ] Setup monorepo (workspaces ou dossiers `frontend/` + `backend/`)
- [ ] Docker Compose pour Redis
- [ ] Scripts de dev (`dev`, `build`, `start`)
- [ ] Setup .env pour les cles API (CelesTrak, OpenSky, etc.)

---

## Phase 2 — Donnees aeriennes temps reel

> Objectif : Voir les avions civils et militaires bouger en temps reel sur le globe.

### Backend
- [ ] Service OpenSky : appeler l'API `/states/all`, parser la reponse JSON
- [ ] Service adsb.lol : appeler l'API `/v2/ladd` et `/v2/mil`, parser la reponse
- [ ] Normaliser les donnees des deux sources dans un format unifie (callsign, lat, lon, altitude, vitesse, heading, type)
- [ ] Cache Redis : stocker les positions avec TTL (ex: 15s)
- [ ] Endpoint WebSocket : streamer les positions toutes les 5 secondes
- [ ] Gerer le rate limiting OpenSky (max 4000 credits/jour)
- [ ] Differencier avions civils vs militaires dans les donnees

### Frontend
- [ ] Recevoir les positions avions via WebSocket
- [ ] Afficher chaque avion comme entite CesiumJS sur le globe (icone avion)
- [ ] Orienter l'icone selon le heading
- [ ] Interpoler les mouvements entre les updates (smooth animation)
- [ ] Couleur differente civils (bleu) vs militaires (rouge)
- [ ] Popup au clic : callsign, altitude, vitesse, type
- [ ] Filtres dans la sidebar : civils on/off, militaires on/off
- [ ] Compteur total d'avions affiches

---

## Phase 3 — Satellites en orbite

> Objectif : Voir les satellites tourner autour de la Terre en temps reel.

### Backend
- [ ] Service CelesTrak : telecharger les fichiers TLE (stations, active, starlink, etc.)
- [ ] Parser les TLE (Two-Line Element sets) en donnees orbitales
- [ ] Calculer les positions en temps reel avec propagation SGP4
- [ ] Cache Redis : stocker les TLE avec TTL long (ex: 6h, les TLE changent peu)
- [ ] Endpoint WebSocket : streamer les positions satellites
- [ ] Categoriser les satellites (communication, militaire, meteo, ISS, Starlink, etc.)

### Frontend
- [ ] Afficher les orbites comme des polylines CesiumJS (trajectoire complete)
- [ ] Afficher chaque satellite comme un point/icone sur son orbite
- [ ] Animation temps reel du satellite sur sa trajectoire
- [ ] Ligne satellite → point au sol (footprint/nadir)
- [ ] Popup au clic : nom, categorie, altitude, vitesse orbitale, NORAD ID
- [ ] Filtres par categorie dans la sidebar
- [ ] Highlight de l'ISS avec un style special
- [ ] Compteur total de satellites

---

## Phase 4 — Trafic routier (visualisation sur routes reelles)

> Objectif : Visualiser les flux de vehicules sur les routes reelles via un systeme de particules.
> Note : Les routes viennent d'OpenStreetMap (donnees reelles). Les vehicules individuels
> sont simules par des particules dont la densite et la vitesse sont estimees selon le type
> de route et l'heure locale. Ce n'est PAS du tracking individuel de vehicules.

### Backend
- [ ] Service Overpass : requeter les routes principales (motorway, trunk, primary) par bounding box
- [ ] Parser les donnees OSM (ways, nodes, tags)
- [ ] Cache Redis : stocker les donnees routes avec TTL long (routes changent rarement)
- [ ] Endpoint REST : servir les routes pour une bounding box donnee
- [ ] Calculer la densite de trafic estimee par type de route et heure locale

### Frontend
- [ ] Charger les routes quand l'utilisateur zoome sur une zone
- [ ] Systeme de particules : generer des particules (points) qui se deplacent le long des routes
- [ ] Vitesse des particules proportionnelle au type de route (autoroute > ville)
- [ ] Densite des particules selon l'heure locale (rush hour = plus dense)
- [ ] Couleur des particules selon la vitesse (vert = fluide, rouge = dense)
- [ ] Level of detail : afficher seulement quand zoom suffisant
- [ ] Toggle trafic on/off dans la sidebar

---

## Phase 5 — Cameras CCTV reelles

> Objectif : Voir les flux video de cameras publiques reelles, positionnees sur la carte.

### Backend
- [ ] Rechercher et cataloguer les sources de cameras publiques gratuites par pays/ville :
  - TfL (Londres) — JamCams API
  - NYCDOT (New York) — cameras de trafic
  - Caltrans (Californie) — CCTV feeds
  - Autres villes/pays avec APIs ouvertes
- [ ] Service Camera : aggreger toutes les sources, normaliser (id, lat, lon, url_flux, ville, pays)
- [ ] Endpoint REST : lister les cameras par bounding box
- [ ] Proxy CORS : relayer les flux video pour eviter les blocages navigateur
- [ ] Health check des cameras : verifier periodiquement si le flux est actif
- [ ] Marquer les cameras hors-ligne, ne pas les exposer au frontend

### Frontend
- [ ] Afficher les cameras comme des icones sur le globe (position GPS)
- [ ] Au clic : ouvrir un player video inline (MJPEG, HLS, ou image refresh)
- [ ] Mode picture-in-picture : plusieurs cameras ouvertes en meme temps
- [ ] Indicateur online/offline sur chaque icone
- [ ] Panel lateral listant les cameras visibles dans la vue courante
- [ ] Filtre par ville/pays

---

## Phase 6 — Shaders de surveillance

> Objectif : Modes visuels "intelligence militaire" applicables en un clic.

### Frontend (post-processing CesiumJS)
- [ ] Shader Night Vision (NVG) : teinte verte, grain, bloom lumineux
- [ ] Shader FLIR Thermal : palette noir-blanc-jaune, halos de chaleur sur batiments/vehicules
- [ ] Shader CRT Scanlines : lignes horizontales, courbure ecran, distorsion bords
- [ ] Shader Anime Cel-shading : contours noirs, aplats de couleur, style cartoon
- [ ] Systeme de switch : boutons dans l'UI pour changer de mode en temps reel
- [ ] Mode "Normal" par defaut (pas de shader)
- [ ] Transition smooth entre les modes (fade in/out)
- [ ] Overlay HUD par mode :
  - NVG : reticule central, coordonnees GPS en vert
  - FLIR : echelle de temperature, reticule de ciblage
  - CRT : date/heure style VHS, "REC" clignotant

---

## Phase 7 — Interface "God Mode"

> Objectif : Dashboard de surveillance complet, panels de controle, experience immersive.

### Frontend
- [ ] Barre laterale principale :
  - Stats globales (nb avions, satellites, cameras actives)
  - Filtres par couche (avions, satellites, trafic, cameras)
  - Liste des elements visibles dans la vue
- [ ] Minimap : petite carte 2D en coin montrant la zone visualisee sur le globe
- [ ] Timeline : barre de temps en bas pour naviguer dans le temps (replay des positions)
- [ ] Search bar : chercher un callsign, un satellite, une ville, une camera
- [ ] Coordonnees GPS du curseur en temps reel
- [ ] Altitude et distance de la camera
- [ ] Systeme d'alertes : notifications quand un avion militaire entre dans une zone
- [ ] Mode plein ecran sans UI (immersion totale)
- [ ] Raccourcis clavier (1-5 pour les shaders, F pour fullscreen, etc.)

---

## Phase 8 — Polish et performance

> Objectif : Rendre le tout fluide, stable, et pret a montrer.

### Performance
- [ ] Level of detail dynamique : reduire les entites affichees quand on dezoome
- [ ] Clustering des avions/satellites quand trop denses
- [ ] Web Workers pour le parsing des donnees lourdes (TLE, routes)
- [ ] Lazy loading des cameras (charger le flux seulement quand visible)
- [ ] Optimiser les requetes Overpass (cache agressif, bounding box intelligente)
- [ ] Throttle des updates WebSocket selon la charge CPU

### UX
- [ ] Loading states pour chaque couche de donnees
- [ ] Gestion des erreurs : message clair si une API est down
- [ ] Responsive : adaptation tablette (le mobile est secondaire pour ce type d'app)
- [ ] Dark theme par defaut (c'est un outil de surveillance, pas un site pastel)
- [ ] Animations d'entree/sortie des panels

### Qualite
- [ ] Tests unitaires backend (Rust) : services, parsing, cache
- [ ] Tests unitaires frontend : composants React principaux
- [ ] Tests d'integration : WebSocket end-to-end
- [ ] CI/CD pipeline basique
- [ ] Documentation API du backend
