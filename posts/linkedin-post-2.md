SeeYou n'est plus juste un tracker d'avions.

Depuis le dernier post, le projet a completement change d'echelle. SeeYou est devenu une plateforme d'intelligence globale en temps reel avec plus de 20 couches de donnees superposees sur un globe 3D. Et le code est open source.

Ce qui est nouveau :
- Cables sous-marins mondiaux traces sur le fond des oceans
- 63 000 debris spatiaux en orbite, calcules par propagation SGP4
- Seismes en direct avec ondes de choc animees depuis l'epicentre (USGS)
- Incendies detectes par satellite via NASA FIRMS
- Evenements geopolitiques mondiaux via GDELT, mis a jour toutes les 15 minutes
- Bases militaires et sites nucleaires cartographies
- Navires sanctionnes suivis par AIS
- Cyberattaques animees en temps reel entre pays source et cible
- Meteo spatiale et aurores polaires via NOAA
- Alertes de convergence quand plusieurs signaux se croisent dans la meme zone
- Radar meteo, vent en particules, stations METAR aviation
- 800+ cameras CCTV publiques reparties sur 30 villes et 6 continents

Toutes les donnees sont reelles. Toutes les APIs sont gratuites. Le cout total reste a zero.

Cote performance, chaque couche graphique a ete migree de l'Entity API vers les Primitive Collections de CesiumJS. Le resultat : de 8000+ draw calls GPU a une vingtaine, et un framerate stable a 50-60 FPS avec toutes les couches actives.

Stack : React, TypeScript, CesiumJS, TailwindCSS, shaders GLSL custom en frontend. Rust avec Axum, WebSocket temps reel et Redis en backend. Plus de 20 sources de donnees integrees -- adsb.lol, CelesTrak, USGS, NASA FIRMS, GDELT, NOAA, TeleGeography, Wikidata, ThreatFox, AbuseIPDB, RainViewer, PeeringDB, Overpass API, et d'autres.

Le repo est public sur GitHub. Le projet continue d'avancer -- si vous voulez suivre la suite ou etre prevenus quand ca sort, restez dans le coin.
