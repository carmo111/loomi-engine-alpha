# Loomi Engine V8.2 — Geometry Core

Cette version remplace les superpositions plates par une construction géométrique cohérente.

## Moteur

- crâne : ellipsoïde orienté en 3D ;
- plan latéral : intersection réelle d’un plan avec l’ellipsoïde ;
- repères horizontaux : sections de l’ellipsoïde ;
- axe central : méridien projeté ;
- mâchoire : bloc mandibulaire avant/arrière ;
- parties arrière : pointillés optionnels ;
- même géométrie pour la photo et l’aperçu ;
- détection MediaPipe FaceMesh ;
- calibrage manuel à 8 points ;
- poignées déplaçables ;
- export PNG ;
- PWA et cache versionné.

## Installation GitHub Pages

Copier directement tous les fichiers de ce dossier à la racine du dépôt, puis valider le commit.

Après publication, effectuer un rechargement forcé dans Safari : Cmd + Shift + R.

## Limite actuelle

Le moteur utilise une projection orthographique et une tête paramétrique simplifiée. Il ne reconstruit pas encore un véritable maillage anatomique personnalisé. La géométrie est néanmoins cohérente et calculée en 3D.

## Nouveauté V8.1

- déplacement complet du Loomi par glisser-déposer sur la photo ;
- réglages séparés horizontal et vertical ;
- les poignées suivent le déplacement global ;
- cache mis à jour.

## Corrections V8.2

- ligne des sourcils relevée au-dessus des yeux ;
- ligne des yeux replacée sur les yeux ;
- ligne du nez légèrement remontée ;
- guide rouge du menton abaissé ;
- curseur du menton élargi et rendu réellement fonctionnel ;
- la mâchoire suit maintenant le réglage du menton.
