# ST2AWD - TP 03 : WebVR avec A-Frame

Ce projet contient la solution complète et modulaire pour le **TP 03 : WebVR avec A-Frame**.

---

## 🚀 Démarrage Rapide

Pour tester l'application dans des conditions optimales (WebVR / WebXR requiert un contexte HTTP sécurisé ou local) :

1. Ouvrez un terminal dans ce dossier.
2. Démarrez le serveur HTTP local inclus :
   ```bash
   node server.js
   ```
3. Ouvrez votre navigateur sur : **[http://localhost:3000](http://localhost:3000)**

---

## 📂 Structure du Projet

```text
TP03/
├── index.html            # Hub d'accueil et portail vers tous les exercices
├── exercice1.html        # Exercice 1 : SceneVR (Géométries 3D, Lumières, Ombres, Rig Joysticks)
├── exercice2.html        # Exercice 2 : Interaction & Grabbing VR (Saisie, manipulation, gravité)
├── exercice3.html        # Exercice 3 : Arme en VR (Modèle 3D, prise en main, tir balistique physique)
├── exercice4.html        # Exercice 4 : Cibles & Particules (Spawner aléatoire, impacts, son Web Audio, score)
├── server.js             # Serveur HTTP local Node.js sans dépendances externes
├── js/
│   ├── vr-controls.js    # Composants A-Frame pour la navigation par Joysticks VR (gauche & droite)
│   ├── grabbable.js      # Composants de saisie (vr-grabbable) et physique de lâcher/lancer
│   ├── weapon.js         # Modèle 3D procédural d'arme et balistique physique des projectiles
│   └── targets-audio.js  # Audio spatialisé Web Audio API, cibles aléatoires, particules et score
└── README.md             # Documentation et guide d'évaluation
```

---

## 🎮 Commandes et Contrôles

### En Casque VR (Meta Quest / SteamVR)
- **Déplacement :** Joystick gauche (avant, arrière, pas latéraux gauche/droite selon le regard).
- **Rotation de vue :** Joystick droit (rotation fluide *smooth turn* par défaut à 90°/s centrée sur la tête du joueur, ou *snap turn* par paliers).
- **Saisie d'objets / Grabbing :** Bouton Grip ou Gâchette en approchant la main de l'objet.
- **Tir de l'arme :** Gâchette (index) lorsque l'arme est en main.

### Sur Ordinateur de Bureau (Desktop - Mode simulation)
- **Déplacement :** Touches `Z`, `Q`, `S`, `D` ou les touches fléchées.
- **Orientation du regard :** Clic gauche maintenu et glisser avec la souris.
- **Saisie / Lancer d'objets :** Clic gauche sur un objet pour le saisir, touche `E` ou `G` pour le lancer.
- **Tir de l'arme :** Clic gauche ou touche `Espace`.

---

## 📋 Récapitulatif des Exercices

### Exercice 1 : SceneVR (`exercice1.html`)
- Objets 3D simples : cube rouge, sphère cyan, cylindre vert, sol texturé.
- Lumière directionnelle (`castShadow: true`) avec ombres réalistes projetées et reçues (`pcfsoft`).
- Lumière ambiante assurant un éclairage naturel et équilibré.
- Entité `#rig` avec caméra et deux contrôleurs VR :
  - Joystick gauche : déplacement avant/arrière/strafe relatif à la caméra.
  - Joystick droit : rotation de la vue.

### Exercice 2 : Interaction avec des objets en VR (Grabbing) (`exercice2.html`)
- Objets 3D physiques (cubes, sphère, cylindre) posés sur une table.
- Détection de proximité et prise en main par les contrôleurs VR (`vr-grab-controls`) ou la souris (`desktop-grab-controls`).
- Synchronisation complète de la position et de l'orientation pendant la saisie.
- Relâchement physique : transmission du vecteur vitesse de la main (possibilité de lancer l'objet) et réaction immédiate à la gravité (`-9.8 m/s²`) avec rebonds au sol et sur la table.

### Exercice 3 : Utilisation d'une arme en VR (`exercice3.html`)
- Modèle 3D d'arme à feu procédural intégré (poignée ergonomique, culasse métallique, canon, organes de visée luminescents).
- Tenue en main ergonomique orientée vers l'avant.
- Système de tir déclenché par la gâchette VR, le clic ou la barre d'espace.
- Projectile physique doté d'une vitesse initiale et soumis à la gravité (trajectoire parabolique).
- Flash de canon (*muzzle flash*) et son de tir synthétisé via la Web Audio API.
- Sliders interactifs dans l'interface HUD pour régler en direct la vitesse initiale et la gravité.

### Exercice 4 : Cibles et effets de particules (`exercice4.html`)
- Stand de tir complet avec cibles 3D variées (cubes, cônes, cylindres, sphères).
- Spawner dynamique générant de nouvelles cibles aléatoires à intervalle paramétrable.
- Détection des impacts par balistique physique (raycasting sur trajectoire).
- Système de particules 3D dynamiques générant une explosion d'éclats colorés à l'impact.
- Synthétiseur audio spatialisé (Web Audio API) reproduisant le claquement métallique de l'impact avec atténuation calculée selon la distance au joueur.
- Tableau de score 3D dans le décor et affichage en temps réel dans le HUD.
