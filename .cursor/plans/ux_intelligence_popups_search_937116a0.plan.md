---
name: UX Intelligence Popups Search
overview: Ajouter la comprehension visuelle (legende, labels), la recherche universelle sur les donnees intelligence, et des popups de detail au clic pour chaque couche intelligence (seismes, incendies, cables, bases militaires, sites nucleaires, navires, cybermenaces, GDELT, meteo spatiale).
todos:
  - id: legend
    content: Creer IntelligenceLegend.tsx - legende flottante avec pastilles couleurs pour chaque couche active
    status: completed
  - id: search
    content: Etendre SearchBar.tsx avec recherche dans bases militaires, sites nucleaires, cables, seismes, navires
    status: completed
  - id: popups
    content: Creer les 9 composants popup de detail (EarthquakePopup, FirePopup, CablePopup, MilitaryBasePopup, NuclearSitePopup, VesselPopup, CyberThreatPopup, GdeltPopup, SpaceWeatherPopup)
    status: completed
  - id: picking
    content: Ajouter ScreenSpaceEventHandler + onSelect dans les 8 layers Cesium intelligence
    status: completed
  - id: wiring
    content: Connecter tout dans useAppState.ts, App.tsx, Globe.tsx (selected states, callbacks, props, rendu popups)
    status: completed
isProject: false
---

# UX Intelligence : Comprehension, Recherche, Detail au clic

## Problemes identifies

Actuellement, les 11 nouvelles couches intelligence s'affichent sur le globe mais :

1. **Pas de legende** : impossible de savoir quelle couleur/forme correspond a quoi
2. **Pas de recherche** : le `SearchBar` (`frontend/src/components/SearchBar/SearchBar.tsx`) ne cherche que dans aircraft, satellites, cameras, et villes -- aucune donnee intelligence
3. **Pas de popup au clic** : les layers Cesium (ex: `SeismicLayer`, `MilitaryBasesLayer`) n'ont pas de `onSelect` fonctionnel ni de handler `ScreenSpaceEventHandler` pour detecter les clics, et il n'existe aucun composant popup pour ces domaines
4. **Pas de labels sur le globe** : les points sont anonymes, aucun texte a proximite

Le modele existant a suivre : `AircraftLayer` utilise `ScreenSpaceEventHandler` pour le picking, renvoie via `onSelect`, et `AircraftPopup` affiche le detail. Le `EventPopup` (`frontend/src/components/Events/EventPopup.tsx`) est un bon template compact.

---

## Plan en 3 volets

### A. Legende flottante sur le globe

Creer `frontend/src/components/HUD/IntelligenceLegend.tsx` :

- Panneau semi-transparent en bas a gauche, au-dessus de la timeline
- Affiche uniquement les couches actives (conditionne par les filters `.enabled`)
- Pour chaque couche active : pastille de couleur + icone + nom + compteur
- Exemples : cercle jaune "Seismes (40)" / losange vert "Bases mil. (35)" / triangle rouge "Navires (18k)"
- Clic sur un item = fly to extent de cette couche ou toggle off

### B. Recherche universelle etendue

Modifier `frontend/src/components/SearchBar/SearchBar.tsx` :

- Ajouter les donnees intelligence dans `localResults` :
  - **Bases militaires** : recherche par `name`, `country`, `branch`
  - **Sites nucleaires** : recherche par `name`, `country`, `type`
  - **Cables sous-marins** : recherche par `name`
  - **Seismes** : recherche par `title` (ex: "M5.2 - Near Coast of Peru")
  - **Navires** : recherche par `mmsi`, `name`
- Ajouter les props manquantes depuis `AppState` (passer via `App.tsx`)
- Nouvelles sections de resultats avec couleurs dediees (style existant `Group` / `Row`)
- Au clic : `setFlyToTarget` + selection de l'item pour ouvrir son popup

### C. Popups de detail au clic (9 composants)

Pour chaque domaine, creer un composant popup suivant le pattern `EventPopup.tsx` :


| Composant           | Fichier                              | Donnees affichees                                           |
| ------------------- | ------------------------------------ | ----------------------------------------------------------- |
| `EarthquakePopup`   | `Seismic/EarthquakePopup.tsx`        | titre, magnitude, profondeur, date, tsunami flag, lien USGS |
| `FirePopup`         | `Fires/FirePopup.tsx`                | lat/lon, FRP, confidence, satellite, date/heure, jour/nuit  |
| `CablePopup`        | `Cables/CablePopup.tsx`              | nom, longueur, proprietaires, annee                         |
| `MilitaryBasePopup` | `Military/MilitaryBasePopup.tsx`     | nom, pays, branche                                          |
| `NuclearSitePopup`  | `Nuclear/NuclearSitePopup.tsx`       | nom, pays, type, statut, capacite MW                        |
| `VesselPopup`       | `Maritime/VesselPopup.tsx`           | MMSI, type, vitesse, cap, destination, flag                 |
| `CyberThreatPopup`  | `Cyber/CyberThreatPopup.tsx`         | type, malware, IP source/dest, pays, confiance              |
| `GdeltPopup`        | `Gdelt/GdeltPopup.tsx`               | titre, tone, domaine, pays source, lien URL                 |
| `SpaceWeatherPopup` | `SpaceWeather/SpaceWeatherPopup.tsx` | Kp index, alertes actives                                   |


Chaque popup :

- Style identique a `EventPopup` (card fixe bottom-right, backdrop-blur, close button)
- S'ouvre via un state `selected`* dans `useAppState.ts` + passage en prop depuis `App.tsx`
- Rendu dans la colonne droite de `App.tsx`, a cote des popups existants

### D. Click handling dans les layers

Modifier chaque layer pour ajouter le picking Cesium :

- Stocker les donnees d'origine dans `billboard.id` / `point.id` (Cesium attache des metadata aux primitives)
- Ajouter un `ScreenSpaceEventHandler` pour `LEFT_CLICK` qui fait un `scene.pick()`, retrouve l'objet, et appelle `onSelect(item)`
- Ajouter `onSelect` dans les props de chaque layer et les passer depuis `Globe.tsx` -> `App.tsx`

---

## Fichiers modifies

- `frontend/src/components/SearchBar/SearchBar.tsx` -- ajout des groupes intelligence
- `frontend/src/hooks/useAppState.ts` -- ajout `selected`* states pour chaque domaine
- `frontend/src/App.tsx` -- passage des nouvelles props, rendu des popups
- `frontend/src/components/Globe/Globe.tsx` -- passage des `onSelect`* callbacks

## Fichiers crees

- `frontend/src/components/HUD/IntelligenceLegend.tsx`
- 9 popups : `EarthquakePopup`, `FirePopup`, `CablePopup`, `MilitaryBasePopup`, `NuclearSitePopup`, `VesselPopup`, `CyberThreatPopup`, `GdeltPopup`, `SpaceWeatherPopup`

## Fichiers modifies (layers)

- `SubmarineCableLayer.tsx`, `SeismicLayer.tsx`, `FireLayer.tsx`, `GdeltLayer.tsx`, `MilitaryBasesLayer.tsx`, `NuclearSitesLayer.tsx`, `MaritimeLayer.tsx`, `CyberThreatLayer.tsx` -- ajout `onSelect` + `ScreenSpaceEventHandler` picking

