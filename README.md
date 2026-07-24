# Loomi Engine 1.0.3

Base modulaire et testable de l’application.

## Inclus
- import photo ;
- MediaPipe FaceMesh ;
- calibrage manuel à 8 points ;
- crâne 3D simplifié ;
- plan latéral ;
- mâchoire ;
- axe central ;
- lignes sourcils, yeux, nez, bouche et menton ;
- déplacement global ;
- poignées ;
- étapes pédagogiques ;
- mode apprentissage ;
- export PNG ;
- PWA.

## Installation
Copie tous les fichiers à la racine du dépôt GitHub Pages, puis recharge Safari avec Cmd + Shift + R.

## Correctif 1.0.1
- bouton d’importation Safari fiabilisé ;
- gestion claire des erreurs JPEG/PNG/WebP/HEIC ;
- cache renouvelé.

## Correctif 1.0.2

- le vrai champ de sélection de fichier couvre désormais tout le bouton ;
- aucun clic JavaScript n’est requis pour ouvrir Photos/Fichiers ;
- compatibilité Safari renforcée ;
- un seul événement de chargement de photo ;
- cache entièrement renouvelé.

## Correctif 1.0.3

- l'importation de la photo fonctionne avant même le chargement du moteur Loomi ;
- la photo est affichée avec un script classique intégré à la page ;
- les anciens Service Workers et caches Loomi sont supprimés automatiquement ;
- la version n'utilise temporairement aucun cache hors ligne ;
- le moteur principal récupère ensuite la photo déjà ouverte.
