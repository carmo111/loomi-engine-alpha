# Loomi Engine V2

Prototype web mobile pour construire automatiquement une tête avec la méthode Loomi.

## Fonctions

- Import immédiat d’une photo
- Détection automatique du visage avec MediaPipe Face Landmarker
- Construction Loomi automatique
- Points IA optionnels
- Poignées de correction manuelle
- Réglage de l’opacité et de l’épaisseur
- Export PNG
- Fonctionnement sur GitHub Pages

## Installation sur GitHub

1. Ouvre le dépôt `loomi-engine-alpha`.
2. Supprime ou remplace les anciens fichiers `index.html`, `styles.css` et `app.js`.
3. Téléverse les trois nouveaux fichiers situés à la racine de cette archive.
4. Valide avec **Commit changes**.
5. Attends environ 1 à 3 minutes.
6. Ouvre le site puis recharge la page.

Le fichier `index.html` utilise `?v=2.0.0` pour éviter que le navigateur conserve les anciens fichiers CSS et JavaScript en cache.

## Connexion Internet

La photo reste dans le navigateur. Une connexion Internet est toutefois nécessaire pour charger la bibliothèque MediaPipe, son moteur WebAssembly et le modèle de détection.
