/*
  app.js
  Point d'entrée de l'application.

  - Splash    : écran de lancement animé, affiché uniquement au lancement
                (adresse sans vue). Ce n'est pas une route : c'est une
                couche posée au-dessus de "main" (js/ui/splashIntro.js).
  - "main"    : page principale (voir js/features/questions/mainView.js) :
                affiche une question de la base, avec titre, bandeau
                d'actions, ID, tags et bouton "Suivante". La sélection
                (mode Strict/Libre, historique, épuisement) est gérée
                par js/features/questions/questionEngine.js. C'est la
                destination du bouton "Accueil".

  Les autres vues restent de simples placeholders pour ce socle
  (filtres, questions supprimées, paramètres, formulaire de
  création/modification à venir).

  Au démarrage, la couche données (IndexedDB + questions de base) est
  vérifiée via initDataLayer(), en passant uniquement par
  js/data/questionsRepository.js — jamais directement par le JSON ou
  par des transactions IndexedDB écrites ici. La vue "main" réutilise
  ensuite ce même repository pour afficher une vraie question.
*/

import { registerView, initRouter, navigateTo } from "./core/router.js";
import { registerServiceWorker, isRunningStandalone } from "./core/pwa.js";
import { initBottomNav } from "./ui/navBar.js";
import { startSplashIntro } from "./ui/splashIntro.js";
import { openDatabase } from "./data/db.js";
import { getBaseQuestions } from "./data/questionsRepository.js";
import { setSetting } from "./data/settingsRepository.js";
import { createMainView } from "./features/questions/mainView.js";
import { createFiltersView } from "./features/filters/filtersView.js";
import { createSettingsView } from "./features/settings/settingsView.js";
import { createDeletedQuestionsView } from "./features/questions/deletedQuestionsView.js";
import {
  createQuestionFormView,
  createQuestionEditView,
} from "./features/questions/questionFormView.js";
import {
  SELECTION_MODE_KEY,
  RECENT_QUESTION_COUNT_KEY,
} from "./features/questions/questionEngine.js";

/** Crée une vue placeholder simple, pour valider le socle. */
function createPlaceholderView(title, description) {
  const view = document.createElement("div");
  view.className = "view";

  const card = document.createElement("section");
  card.className = "card";

  const heading = document.createElement("h1");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = description;

  card.append(heading, text);
  view.append(card);
  return view;
}



registerView("main", {
  showBottomNav: true, // destination du bouton "Accueil" du menu
  render: createMainView,
});

registerView("filters", {
  showBottomNav: true,
  render: createFiltersView,
});

registerView("deleted-questions", {
  showBottomNav: true,
  render: createDeletedQuestionsView,
});

registerView("settings", {
  showBottomNav: true,
  render: createSettingsView,
});

// Création d'une question locale (bouton "+" de Main). La modification
// réutilisera plus tard ce même écran.
registerView("question-form", {
  showBottomNav: true,
  render: createQuestionFormView,
});

// Modification d'une question locale (bouton "Modifier" de Main) : même
// formulaire, prérempli.
registerView("question-edit", {
  showBottomNav: true,
  render: createQuestionEditView,
});

/**
 * Vérifie que la couche données est disponible au démarrage :
 * ouverture d'IndexedDB et chargement des questions de base (ce
 * dernier appel alimente aussi le cache mémoire du repository, donc
 * la vue "main" n'aura pas à recharger le JSON). Ne bloque jamais le
 * lancement de l'app : chaque échec est simplement journalisé
 * distinctement pour rester diagnosticable ; si le chargement échoue
 * ici, `mainView.js` retentera lui-même l'appel et affichera son
 * propre message d'erreur.
 */
async function initDataLayer() {
  try {
    await openDatabase();
  } catch (error) {
    console.error("[app] Échec de l'ouverture d'IndexedDB :", error);
  }

  try {
    const baseQuestions = await getBaseQuestions();
    console.info(
      `[app] ${baseQuestions.length} question(s) de base chargée(s).`
    );
  } catch (error) {
    console.error(
      "[app] Échec du chargement des questions de base :",
      error
    );
  }
}

/**
 * Aide TEMPORAIRE pour tester le mode Libre et la taille de
 * l'historique récent depuis la console du navigateur, en attendant
 * que l'écran Paramètres existe pour les régler graphiquement. Écrit
 * dans le même store `settings` que lira Paramètres plus tard — pas de
 * deuxième source de vérité. À retirer une fois Paramètres implémenté.
 *
 * Exemple dans la console :
 *   await window.__qt2.setSelectionMode("libre")
 *   await window.__qt2.setRecentQuestionCount(2)
 * Puis recharger #/main (ou y retourner via "Accueil").
 */
function exposeTemporaryDebugHelpers() {
  window.__qt2 = {
    setSelectionMode: (mode) => setSetting(SELECTION_MODE_KEY, mode),
    setRecentQuestionCount: (count) =>
      setSetting(RECENT_QUESTION_COUNT_KEY, count),
  };
}

async function bootstrap() {
  await initDataLayer();
  await registerServiceWorker();
  await initBottomNav(document.getElementById("bottom-nav"));
  exposeTemporaryDebugHelpers();

  if (isRunningStandalone()) {
    document.documentElement.dataset.standalone = "true";
  }

  // Splash : uniquement au lancement de l'application (adresse sans vue,
  // ex. start_url "./index.html"). Ce n'est plus une route : Main est rendu
  // tout de suite et le Splash est une couche posée par-dessus (voir
  // js/ui/splashIntro.js). « Accueil », le bouton retour ou un
  // rechargement sur #/main ne peuvent donc jamais le réafficher.
  const launchHash = window.location.hash.replace(/^#\/?/, "");
  const showSplash = launchHash === "" || launchHash === "splash";
  if (launchHash === "splash") {
    // Ancienne adresse du Splash : nettoyée sans créer d'entrée d'historique.
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }

  initRouter("main");
  if (showSplash) startSplashIntro();
}

bootstrap();
