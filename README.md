# QuestionsTime2

Application de questions à jouer en groupe. Mobile-first, PWA, sans framework,
hébergeable sur GitHub Pages. Développée par étapes successives.

## Lancer le projet en local

L'application utilise des ES Modules et `fetch()` (icônes SVG, JSON), ce qui
nécessite un serveur HTTP local (ouvrir `index.html` directement en `file://`
ne fonctionnera pas).

Depuis VS Code :

1. Installer l'extension **Live Server** (ou équivalent), puis clic droit sur
   `index.html` → *Open with Live Server*.

   — ou —

2. Depuis un terminal, à la racine du projet :

   ```bash
   npx serve .
   ```

   ou, avec Python déjà installé :

   ```bash
   python3 -m http.server 8080
   ```

   Puis ouvrir `http://localhost:8080` (adapter le port selon l'outil utilisé).

## État actuel du socle

- Coquille HTML unique (`index.html`) + routeur JS basé sur le hash d'URL.
- 5 vues enregistrées : `splash`, `main`, `filters`, `deleted-questions`,
  `settings`. `splash` et `main` ont désormais un vrai contenu ; les 3
  autres restent des placeholders.
- **`splash`** : écran de lancement, affiché uniquement au démarrage de
  l'app (`initRouter("splash")` dans `js/app.js`). Sans menu inférieur.
  Une interaction (clic, tap, ou touche Entrée/Espace au clavier) navigue
  vers `main`. `#img-titre` est le point d'accroche prévu pour la future
  animation du titre (non implémentée à ce stade).
- **`main`** : première vraie version de la page principale, avec menu
  inférieur — voir la section "Écran Main" ci-dessous. C'est la
  destination du bouton "Accueil" du menu — jamais `splash`.
- Menu inférieur généré dynamiquement depuis `js/ui/navConfig.js` (masqué sur
  `splash`, visible sur `main` et les 3 autres vues). Aucune entrée du menu
  ne pointe vers `splash`.
- IndexedDB : base ouverte au démarrage (`js/data/db.js`) avec 6 object
  stores prévus pour les étapes futures (questions utilisateur, modifications,
  suppressions, historique, paramètres, filtres) — vides pour l'instant.
- Service worker : met en cache la coquille de l'app (stratégie
  réseau-prioritaire) pour un fonctionnement hors ligne basique.
- Manifest PWA minimal, installation facultative.

## Couche données

Trois modules, avec une séparation stricte des responsabilités :

- **`js/data/questionsBaseLoader.js`** — seul module à connaître le chemin
  `data/questions.base.json`. Charge le fichier via `fetch()`, vérifie le
  statut HTTP, parse le JSON, et valide que chaque question a bien la forme
  `{ id: number, texte: string, tags: string[], author: string }`. Lève une
  erreur explicite à la première étape qui échoue (réseau, HTTP, JSON,
  structure).
- **`js/data/db.js`** — point d'accès unique à IndexedDB : ouverture de la
  base et définition des 6 object stores (`questionsUser`, `questionsEdits`,
  `questionsDeleted`, `history`, `settings`, `filters`). Ne contient aucune
  logique de lecture/écriture métier.
- **`js/data/questionsRepository.js`** — intermédiaire unique utilisé par le
  reste de l'application. Expose :
  - `getBaseQuestions()` — questions de base (via le loader, mises en cache
    en mémoire après le premier appel) ;
  - `getLocalQuestions()` — questions créées localement (`questionsUser`) ;
  - `getLocalEdits()` — modifications locales de questions de base
    (`questionsEdits`) ;
  - `getDeletedQuestionEntries()` — questions supprimées/masquées localement
    (`questionsDeleted`).

  Aucune fusion entre ces sources n'est encore implémentée : chaque fonction
  retourne uniquement les données de sa propre source. La combinaison
  (priorités, gestion des conflits) est prévue pour une étape ultérieure.

`js/app.js` appelle `getBaseQuestions()` et `openDatabase()` au démarrage
(`initDataLayer()`) pour vérifier que la couche données est disponible (et
alimenter le cache mémoire du repository). La vue `main` (voir ci-dessous)
réutilise ensuite ce même repository pour afficher une vraie question.

## Écran Main

`js/features/questions/mainView.js` (nouveau module, importé par `js/app.js`)
construit la structure suivante, conforme au cahier des charges :

1. titre `#img-titre` en haut (`.app-title`) ;
2. indicateur de mode (`.mode-indicator`), juste sous le titre : "Mode :
   Strict" ou "Mode : Libre" ;
3. bandeau d'actions (`.action-bar`) avec 3 boutons tactiles : créer (`+`),
   modifier, supprimer — **présence visuelle uniquement, sans fonctionnalité**
   à ce stade ;
4. carte de la question courante (`.question-card`) : texte, ID (`#N`), tags
   (`.tag-chip`) ;
5. bouton `Suivante` (`.question-next`), pleine largeur ;
6. navigation basse (déjà gérée par le routeur pour toute vue avec
   `showBottomNav: true`).

Le rendu du routeur restant synchrone, `createMainView()` retourne
immédiatement ce conteneur (avec un état "Chargement de la question…") puis
le remplit dès que `questionsRepository.getBaseQuestions()` répond — aucun
`fetch()` direct dans ce module ni dans `app.js`.

**Important : un simple montage de `main` (F5, retour via "Accueil", etc.)
ne sélectionne plus jamais une nouvelle question.** `mainView.js` appelle
`questionEngine.getCurrentQuestion(questions)` au montage (qui réaffiche la
question déjà en cours si elle existe toujours) et
`questionEngine.advanceToNextQuestion(questions)` uniquement depuis le clic
sur `Suivante` (voir section "Moteur de sélection" ci-dessous pour le
détail). `mainView.js` ne connaît ni IndexedDB, ni le mode Strict/Libre, ni
l'historique, ni `currentQuestionId` — il affiche simplement le résultat
retourné, y compris l'état "Strict épuisé" (message dédié, sans bouton
fonctionnel). Un drapeau interne (`isSelecting`), partagé entre le montage
et "Suivante", désactive ce bouton pendant qu'une sélection est en cours,
pour éviter tout double-appel/double-enregistrement.

## Moteur de sélection

Architecture en couches, inchangée depuis l'étape précédente :

```text
mainView.js
   ↓
questionEngine.js       (orchestration, seul point d'entrée pour mainView)
   ↓
questionSelection.js (pur)   +   historyRepository.js   +   settingsRepository.js
   ↓
IndexedDB (stores "history" et "settings")
```

### Question courante (`currentQuestionId`)

Un simple remontage de `main` (F5, retour via "Accueil" depuis une autre
vue, navigation Filtres/Supprimées/Paramètres puis retour) **ne doit jamais
changer la question affichée ni écrire dans l'historique** — seule une
action explicite ("Suivante", plus tard le swipe) le doit. L'id de la
question actuellement affichée est donc persisté dans le store `settings`
déjà existant, sous la clé `currentQuestionId` (uniquement l'id, jamais le
contenu de la question — pas de nouveau store).

`questionEngine.js` expose deux points d'entrée distincts, jamais
interchangeables :

- **`getCurrentQuestion(availableQuestions)`** — à appeler au montage de
  `main` :
  - *Cas A* : `currentQuestionId` correspond à une question disponible ->
    réaffichée telle quelle, **aucun appel au moteur, aucune écriture** ;
  - *Cas B* : pas de `currentQuestionId` (première ouverture réelle) ->
    une vraie nouvelle sélection est effectuée, enregistrée, et
    `currentQuestionId` sauvegardé ;
  - *Cas C* : `currentQuestionId` ne correspond plus à rien de disponible
    (utile plus tard avec filtres/suppression) -> traité comme le cas B.
- **`advanceToNextQuestion(availableQuestions)`** — à appeler uniquement
  depuis le clic sur "Suivante" : déclenche toujours une nouvelle
  sélection, l'enregistre, et met à jour `currentQuestionId`.

### Strict et Libre ne réagissent plus de la même façon à l'épuisement

C'est le changement principal de cette étape. Le moteur pur
(`selectNextQuestion`) retourne désormais l'une de ces deux formes,
explicitement distinctes dans le code (`SELECTION_STATUS`) :

- `{ status: "selected", question, recentWasReset }`
- `{ status: "strict-exhausted" }`

**Strict** — une question déjà vue ne peut jamais être reproposée
(`getAllSeenQuestionIds()`, tout l'historique). Si plus aucune candidate
n'existe : **aucun reset automatique**. `SELECTION_STATUS.STRICT_EXHAUSTED`
est retourné tel quel ; `questionEngine.js` n'écrit rien (ni historique, ni
`currentQuestionId`) ; `mainView.js` affiche un message dédié (voir
ci-dessous). L'historique Strict ne sera vidé que par une action future
explicite (Paramètres → Réinitialiser l'historique — pas encore implémentée).

**Libre** — seule la fenêtre récente compte
(`getRecentlyViewedQuestionIds(recentQuestionCount)`, `recentQuestionCount`
= **3** par défaut, constante `DEFAULT_RECENT_QUESTION_COUNT`). Si elle
bloque toute sélection, elle est réinitialisée automatiquement
(`recentWasReset: true` → `clearHistory()` dans `questionEngine.js`) et une
question est quand même choisie immédiatement — comportement **inchangé**
depuis l'étape précédente, jamais traité comme une erreur.

⚠️ **Nuance à connaître** : `clearHistory()` vide l'intégralité du store
`history` (pas seulement "la fenêtre récente", qui n'est pas stockée
séparément — elle est recalculée à la volée depuis le même journal complet).
Si vous alternez manuellement entre Libre et Strict via le helper de debug,
un reset déclenché en Libre efface donc aussi la mémoire "déjà vu" du mode
Strict. Cela correspond exactement à ce qui était demandé pour Libre ; à
garder en tête si vous testez les deux modes dans la même session.

**Message d'épuisement Strict** (`mainView.js`, aucun bouton fonctionnel,
juste informatif) :

> Vous avez vu toutes les questions disponibles en mode Strict.
>
> Vous pouvez :
> - réinitialiser l'historique dans Paramètres ;
> - passer en mode Libre ;
> - modifier les filtres actifs.

**Liste réellement vide** (cas B/C au niveau du moteur, ex. JSON vide) :
`NoQuestionsAvailableError` levée **avant** tout accès à l'historique —
celui-ci n'est jamais modifié dans ce cas. `mainView.js` affiche alors
"Aucune question disponible." (message distinct du précédent).

### Modules

- **`js/features/questions/questionSelection.js`** — logique métier **pure**
  (aucun accès IndexedDB ni DOM) : `pickRandomCandidate(candidates)` (tirage
  aléatoire simple, ne modifie pas le tableau reçu), `selectNextQuestion(...)`
  (voir ci-dessus), `SELECTION_MODES`, `SELECTION_STATUS`,
  `NoQuestionsAvailableError`. Conçue pour recevoir plus tard une liste déjà
  filtrée par tags : `availableQuestions` est aujourd'hui
  `getBaseQuestions()`, sans que ce module en ait besoin de le savoir.

- **`js/features/questions/questionEngine.js`** — orchestrateur asynchrone :
  `getCurrentQuestion`, `advanceToNextQuestion` (voir ci-dessus),
  `getCurrentSelectionMode()` (pour l'indicateur affiché sur `main`, relu à
  chaque appel — jamais de valeur mise en cache en mémoire).

- **`js/data/historyRepository.js`** — inchangé. Centralise l'accès au store
  IndexedDB `history`. Modèle d'entrée minimal : `{ id (auto), questionId,
  viewedAt }` (aucune donnée de question dupliquée). Expose
  `recordQuestionViewed`, `getHistory`, `getAllSeenQuestionIds`,
  `getRecentlyViewedQuestionIds(count)`, `hasBeenViewed`, `clearHistory`.

- **`js/data/settingsRepository.js`** — inchangé, accès générique clé/valeur
  au store `settings` (`getSetting(key, defaultValue)` / `setSetting(key,
  value)`). Porte maintenant trois clés : `selectionMode`,
  `recentQuestionCount`, et la nouvelle `currentQuestionId` — aucune
  deuxième source de vérité, la future page Paramètres lira/écrira les
  mêmes clés.

### Tester le mode Libre avant l'écran Paramètres (temporaire)

Aucune interface graphique n'existe encore pour changer le mode. En
attendant, `js/app.js` expose volontairement un helper de test dans la
console du navigateur (à retirer une fois Paramètres implémenté) :

```js
await window.__qt2.setSelectionMode("libre");
await window.__qt2.setRecentQuestionCount(2); // optionnel, défaut 3
```

Puis recharger `#/main` (ou y retourner via "Accueil"). Ce helper écrit
dans le même store `settings` que lira la future page Paramètres — ce
n'est pas une deuxième source de vérité, juste un raccourci de test.

## Tests automatisés effectués (hors projet livré)

En plus des vérifications syntaxiques habituelles, le moteur a été testé par
des scripts Node.js temporaires (non inclus dans ce zip), utilisant
`fake-indexeddb` pour simuler IndexedDB et `jsdom` pour simuler le DOM, en
important **directement les fichiers réels du projet**.

**Niveau moteur (29 tests, correspond aux tests A-I demandés) :**
- Strict épuisé (5/5 vues) → `strict-exhausted`, historique **inchangé** à 5
  entrées (pas de reset) ;
- Libre épuisé (fenêtre récente = toute la collection) → reset automatique,
  sélection garantie dès le 4e appel ;
- `currentQuestionId` déjà défini → question réaffichée telle quelle, **zéro**
  nouvelle entrée d'historique ;
- première ouverture (pas de `currentQuestionId`) → sélection + 1 entrée
  d'historique + `currentQuestionId` sauvegardé ;
- "Suivante" → nouvelle question + historique +1 + `currentQuestionId` mis à
  jour ;
- remontage simulé (F5) avec `currentQuestionId` déjà défini → même
  question, historique inchangé ;
- indicateur de mode → reflète bien `selectionMode` après changement, y
  compris un second changement (pas de valeur mise en cache) ;
- régressions : cas B (liste vide) toujours sans effet de bord ; cas C
  (`currentQuestionId` obsolète) sélectionne bien une nouvelle question
  compatible.

**Niveau DOM (11 tests, `mainView.js` monté réellement via jsdom) :**
- montage initial → ID affiché, indicateur "Mode : Strict", 1 entrée
  d'historique ;
- remontage simulé (F5) → **même question**, historique toujours à 1 entrée ;
- clic "Suivante" → nouvelle question, historique à 2 entrées ;
- remontage après "Suivante" → conserve la **nouvelle** question (pas
  l'ancienne) ;
- changement de mode → indicateur mis à jour vers "Mode : Libre" ;
- épuisement Strict via 5 clics "Suivante" successifs → message
  d'épuisement affiché avec ses 3 indications, historique **non vidé** (5
  entrées conservées).

Résultat : **40/40 tests réussis** après l'implémentation des changements de
cette étape.

## Filtres

- `js/features/filters/tagFilters.js` (pur) : tags extraits dynamiquement des
  questions, recherche (casse/accents ignorés), 3 états par tag
  (neutre → obligatoire → exclu → neutre), obligatoires cumulés en ET, exclus
  tous interdits.
- `js/data/filtersRepository.js` : persistance dans le store `filters` existant,
  clé `tagStates` (`{ [tag]: "required" | "excluded" }`, les tags neutres ne
  sont pas stockés). Aucun nouveau store.
- `js/features/filters/filtersView.js` : vue Filtres (recherche + un bouton par tag).
- `mainView.js` relit les filtres à chaque montage et passe au moteur
  Strict/Libre **uniquement** les questions compatibles (moteur inchangé).
  Aucune question compatible → message "Aucune question ne correspond aux
  filtres actifs.", bouton "Suivante" désactivé, rien n'est écrit.

## Paramètres

`js/features/settings/settingsView.js` (route `settings`, menu existant).
Chaque réglage est une section déclarée dans `SETTINGS_SECTIONS`. Pour
l'instant : **Mode de sélection** (Strict / Libre), lu via
`getCurrentSelectionMode()` et écrit via `questionEngine.setSelectionMode(mode)`
— même clé `settings.selectionMode` que le bouton de mode de Main. Aucun
effet sur `currentQuestionId` ni sur l'historique.

## Tests automatisés

```bash
npm install
npm test
```

Node ≥ 22, `fake-indexeddb` + `jsdom`, fichiers réels du projet importés
(`tests/`).

## Identifiants des questions

Convention inchangée depuis le socle initial (reprise telle quelle, sans
`source` ni autre champ technique). Le modèle de données suit le cahier des
charges (`id`, `texte`, `tags`, `author`).

- **Questions de base** (`data/questions.base.json`) : `id` numérique positif,
  fourni tel quel par le fichier JSON.
- **Questions créées localement** : `id` numérique **négatif et séquentiel**
  (`-1`, `-2`, `-3`…) = plus petit id local déjà attribué − 1
  (`nextLocalQuestionId`, `js/data/db.js`). Un numéro n'est jamais réutilisé,
  même après suppression (id supprimés + repère `settings.lowestLocalQuestionId`
  pris en compte).
- **Affichage** : `B-1` pour la base, `L-1` pour une question locale
  (`js/features/questions/questionId.js`) — jamais stocké en base.

Les deux espaces d'identifiants sont donc disjoints par construction, sans
registre ni compteur partagé à maintenir. Le champ `author` reste la source
d'information sur l'origine éditoriale d'une question ("base" ou autre) ; il
n'est pas utilisé pour l'unicité technique de l'`id`.

## Tests à effectuer dans le navigateur

### Navigation

1. Lancer le projet via un serveur local (voir ci-dessus), sans hash dans
   l'URL : l'écran de lancement (`splash`) doit s'afficher, **sans** menu
   inférieur.
2. Cliquer/toucher n'importe où sur le splash (ou le sélectionner au clavier
   puis appuyer sur Entrée/Espace) : vérifier l'arrivée sur `main`
   (`#/main`), **avec** menu inférieur visible et bouton "Accueil" actif.
3. Depuis `main`, cliquer sur "Filtres" puis sur "Accueil" : vérifier le
   retour sur `main`, jamais sur le splash.
4. Modifier l'URL en `#/filters` directement : la vue Filtres doit
   s'afficher avec le menu. Cliquer sur "Accueil" : vérifier l'arrivée sur
   `#/main`, jamais un retour au splash.
5. Répéter le point précédent depuis "Questions supprimées" puis depuis
   "Paramètres" : dans les deux cas, "Accueil" doit ramener sur `#/main`.
6. Confirmer qu'aucun bouton du menu inférieur ne mène jamais à `splash`.

### Écran Main — affichage

7. Sur `main`, vérifier qu'une vraie question de `data/questions.base.json`
   s'affiche (pas de texte "Chargement…" persistant).
8. Vérifier que le texte affiché correspond à l'une des 5 questions de
   `data/questions.base.json` (la sélection étant aléatoire, ce n'est plus
   nécessairement la première).
9. Vérifier que l'ID (`#N`) est affiché.
10. Vérifier que les tags de cette question sont affichés sous forme de
    petites pastilles.
11. Vérifier la présence des 3 boutons d'action (créer / modifier /
    supprimer) — cliquer dessus ne doit rien faire pour l'instant (attendu).
12. Vérifier que la navigation basse reste visible sur `main`.

### Persistance de la question courante (F5 ne doit RIEN changer)

13. Première arrivée sur `main` : une question apparaît, avec un ID et des
    tags.
14. F5 : **exactement la même question** doit rester affichée (même texte,
    même ID).
15. F5 plusieurs fois de suite : toujours la même question.
16. `main` → "Filtres" → "Accueil" : la même question doit être affichée
    (pas une nouvelle sélection).
17. `main` → "Paramètres" → "Accueil" : même vérification.
18. Cliquer sur "Suivante" : une **nouvelle** question apparaît (aléatoire).
19. F5 juste après ce clic : cette nouvelle question doit rester affichée
    (pas de retour à l'ancienne, pas d'une 3e question).

### Indicateur de mode

20. Vérifier que "Mode : Strict" est visible sous le titre sur `main` (mode
    par défaut).
21. Dans la console : `await window.__qt2.setSelectionMode("libre")`, puis
    revenir sur `main` (ou F5) : l'indicateur doit afficher "Mode : Libre".
22. Remettre le mode Strict si besoin :
    `await window.__qt2.setSelectionMode("strict")`.

### Épuisement — mode Strict (ne doit PLUS se réinitialiser automatiquement)

23. En mode Strict, cliquer sur "Suivante" jusqu'à épuiser les 5 questions
    (4 clics après la question du montage).
24. Cliquer une fois de plus : le message *"Vous avez vu toutes les
    questions disponibles en mode Strict."* doit apparaître, avec ses 3
    indications (Paramètres / mode Libre / filtres) — aucune de ces
    indications n'est cliquable/fonctionnelle, c'est normal à ce stade.
25. Dans DevTools → Application → IndexedDB → `history` : vérifier que les
    **5 entrées précédentes sont toujours là** (l'historique n'a **pas**
    été vidé).
26. F5 après ce message : vérifier qu'aucune erreur ne survient (voir
    "Choix architecturaux importants" pour le comportement exact attendu
    ici — la dernière question valide affichée avant l'épuisement peut
    réapparaître, ce qui est le comportement par défaut de cette étape).

### Épuisement — mode Libre (doit continuer à se réinitialiser automatiquement)

27. `await window.__qt2.setSelectionMode("libre")` puis
    `await window.__qt2.setRecentQuestionCount(3)` (ou une valeur ≥ au
    nombre de questions). Revenir sur `main`.
28. Cliquer sur "Suivante" plusieurs fois : une question doit **toujours**
    être proposée (jamais de blocage, jamais de message d'épuisement) même
    quand toutes les questions sont récemment passées.
29. Remettre le mode Strict : `await window.__qt2.setSelectionMode("strict")`
    et `await window.__qt2.setRecentQuestionCount(3)`.

### Rechargement des autres routes

30. `#/filters` → F5 → reste sur `#/filters`.
31. `#/deleted-questions` → F5 → reste sur `#/deleted-questions`.
32. `#/settings` → F5 → reste sur `#/settings`.

### Responsive

33. Réduire la largeur de la fenêtre (ou utiliser le mode appareil des
    DevTools) à une largeur de smartphone (ex. 360–400px) et tester
    plusieurs hauteurs : pas de débordement horizontal, question et message
    d'épuisement lisibles, boutons facilement touchables, navigation basse
    toujours accessible.

### Données / console

34. Vérifier dans la console qu'au chargement un message
    `[app] 5 question(s) de base chargée(s).` apparaît, et qu'aucune erreur
    n'est journalisée en visitant `main`, y compris pendant l'épuisement
    Strict (c'est un état fonctionnel normal, pas une erreur).
35. (Optionnel) renommer temporairement `data/questions.base.json` puis
    recharger sur `#/main` : message d'erreur en console + "Impossible de
    charger les questions pour le moment." affiché, sans plantage. Remettre
    le fichier en place ensuite.
36. Ouvrir DevTools → Application → IndexedDB → `questionstime2` →
    `settings` : vérifier la présence d'une entrée `currentQuestionId` dont
    la valeur correspond à l'ID actuellement affiché sur `main`.

## Points restant à vérifier / limites connues de ce socle

- Le service worker met en cache une liste de fichiers codée en dur
  (`APP_SHELL`). Il faudra la faire évoluer avec soin à chaque nouvelle étape
  qui ajoute des fichiers nécessaires au fonctionnement hors ligne.
- Le service worker utilise désormais une stratégie **réseau-prioritaire**
  (`network-first`, voir commentaire en tête de `service-worker.js`) : en
  développement, un rechargement normal (F5) affiche toujours la dernière
  version des fichiers ; le cache n'est utilisé que si le réseau est
  indisponible. Après ce changement, un premier rechargement est nécessaire
  pour que le nouveau service worker (`questionstime2-shell-v2`) prenne le
  relais de l'ancien (`v1`) — un rechargement normal suffit, `CTRL+F5` n'est
  plus requis pour les rechargements suivants.
- Les 3 boutons d'action (créer / modifier / supprimer) sur `main` sont
  purement visuels pour l'instant : aucune fonctionnalité métier n'est
  branchée dessus (création/modification/suppression réelles = étapes
  ultérieures).
- **Résolu depuis l'étape précédente** : un F5 (ou tout remontage de `main`)
  ne sélectionne plus une nouvelle question ni n'écrit dans l'historique —
  voir "Question courante (`currentQuestionId`)" dans "Moteur de sélection".
- **Choix architectural à connaître** : après un épuisement Strict (message
  affiché), un F5 réaffiche la dernière question valide vue avant
  l'épuisement plutôt que de faire persister le message lui-même — ce
  dernier ne réapparaît qu'en recliquant sur "Suivante". Comportement par
  défaut de cette étape, à signaler si un autre comportement est souhaité.
- Les filtres par tags sont branchés : voir la section "Filtres".
- Le reset automatique du mode Libre vide l'intégralité du store `history`
  (voir la nuance détaillée dans "Moteur de sélection") : en cas
  d'alternance manuelle Strict/Libre pendant les tests, la mémoire "déjà vu"
  de Strict peut donc être affectée par un reset déclenché en Libre.
- La base IndexedDB est passée en version 2 (ajout du store `filters`). Si
  une base v1 existait déjà dans le navigateur depuis les étapes
  précédentes, la mise à niveau (`onupgradeneeded`) s'exécute automatiquement
  à la prochaine ouverture — aucune action manuelle n'est nécessaire.
- Les icônes SVG utilisent `currentColor` via `stroke`/`fill` : à vérifier
  visuellement une fois le menu affiché dans le navigateur.
