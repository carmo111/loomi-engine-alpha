# Loomi Geometry Engine 2.0

Nouvelle base anatomique indépendante.

## Architecture
1. MediaPipe mesure le visage.
2. Le moteur calcule un repère local de tête.
3. Un modèle anatomique reconstruit la boîte crânienne.
4. La sphère Loomis est placée selon la pose.

## Mesures utilisées
- écartement des yeux ;
- largeur des tempes ;
- largeur des pommettes ;
- hauteur sourcils-menton ;
- yaw ;
- roll ;
- asymétrie de perspective.

## Réglages
- taille anatomique ;
- recul du crâne ;
- hauteur du crâne.

Le plan latéral et la mâchoire seront ajoutés après validation de cette base.
