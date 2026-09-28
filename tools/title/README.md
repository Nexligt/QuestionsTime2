# tools/title : génération du titre SVG

Ce dossier sert au développement. L'application ne le charge jamais : il n'apparaît ni dans `index.html`, ni dans le cache du service worker.

- **Sortie :** `assets/img_Titre.svg`. Le titre « QuestionsTime2 » est converti en tracés, donc l'application n'a aucune police à charger.
- **Police :** Fraunces, sous licence SIL OFL 1.1 (voir `fonts/OFL.txt`). Source : https://github.com/google/fonts/tree/main/ofl/fraunces
- **Réglages :** dans `TITLE`, en haut de `generate_title.py`. On y règle la taille et la place du « 2 », les axes de la police et les couleurs.

## Icônes PNG

`generate_icons.py` produit les icônes de l'application dans `assets/icons/` : « Q2 » ambre sur le fond de l'app, dans le style du titre. Il génère `icon-192.png`, `icon-512.png`, leurs versions « maskable » et `apple-touch-icon.png` (180 px). Il faut en plus `pip install cairosvg`.

## Régénérer

```
pip install fonttools uharfbuzz
python tools/title/generate_title.py
python tools/title/generate_icons.py   # icônes PNG
```

Ensuite, reporter `width` et `height` du SVG dans `js/features/questions/mainView.js` (`TITLE_IMAGE`), puis incrémenter la version du service worker.
