# Loomi Engine IA Alpha

Première version avec détection automatique du visage dans le navigateur.

## Fonctionnalités

- Import d’une photo.
- Détection automatique du visage avec MediaPipe Face Landmarker.
- Calcul automatique de l’inclinaison des yeux.
- Construction automatique :
  - crâne ;
  - axe du visage ;
  - ligne des yeux ;
  - ligne du nez ;
  - plan latéral ;
  - mâchoire.
- Réglage de l’épaisseur et de la transparence.
- Masquage des guides.
- Export PNG.

## Mise à jour du dépôt GitHub

Dans ton dépôt `loomi-engine-alpha` :

1. Clique sur **Add file**.
2. Clique sur **Upload files**.
3. Ajoute les trois fichiers :
   - `index.html`
   - `styles.css`
   - `app.js`
4. Accepte le remplacement des anciens fichiers.
5. Clique sur **Commit changes**.
6. Attends environ une minute, puis recharge ton site GitHub Pages.

## Connexion Internet

Cette Alpha charge MediaPipe et son modèle depuis Internet. Elle fonctionne donc avec une connexion active.

## Confidentialité

La photo est analysée localement dans le navigateur. Elle n’est pas envoyée vers un serveur Loomi.
