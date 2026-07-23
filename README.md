# Loomi Engine Alpha

Prototype web mobile prêt pour **GitHub Pages**.

## Fonctionnalités

- Import d’une photo depuis Android, iPhone ou ordinateur.
- Analyse guidée avec 6 points :
  1. œil gauche ;
  2. œil droit ;
  3. base du nez ;
  4. menton ;
  5. tempe gauche ;
  6. tempe droite.
- Calcul automatique de l’inclinaison.
- Construction du crâne, de l’axe, du plan latéral et de la mâchoire.
- Ajustement tactile des principaux repères.
- Réglage de l’épaisseur et de la transparence.
- Export PNG.

## Mise en ligne avec GitHub Pages

1. Crée un nouveau dépôt GitHub, par exemple `loomi-engine-alpha`.
2. Décompresse ce dossier.
3. Ajoute à la racine du dépôt :
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
4. Dans GitHub, ouvre **Settings**.
5. Dans le menu de gauche, ouvre **Pages**.
6. Dans **Build and deployment**, choisis :
   - Source : `Deploy from a branch`
   - Branch : `main`
   - Folder : `/ (root)`
7. Enregistre.
8. GitHub affichera ensuite l’adresse publique du prototype.

## Important

Cette Alpha n’utilise pas encore une détection automatique par intelligence artificielle.
Les 6 points sont posés manuellement afin de valider le moteur de construction et l’expérience tactile.

## Structure

```text
loomi-engine-alpha/
├── index.html
├── styles.css
├── app.js
└── README.md
```

## Confidentialité

Les photos sont traitées directement dans le navigateur et ne sont pas envoyées vers un serveur par ce prototype.
