# Loomi Geometry Engine V3.1.3

Correction de l'erreur :
`Cannot read properties of null (reading 'value')`

Cause :
- le code cherchait le curseur `lift` ;
- ce curseur n'était pas présent dans le HTML réellement publié.

Corrections :
- ajout du curseur Hauteur de la boîte crânienne ;
- valeurs de secours pour tous les réglages ;
- écouteurs et remise à zéro protégés contre les éléments absents ;
- analyse V3.1.2 conservée.
