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

import { registerView, initRouter, navigateTo, getSubRoute } from "./core/router.js";
import { registerServiceWorker, isRunningStandalone, initInstallPrompt, initUpdates } from "./core/pwa.js";
import { showUpdateBanner } from "./ui/updateBanner.js";
import { initBottomNav } from "./ui/navBar.js";
import { startSplashIntro } from "./ui/splashIntro.js";
import { openDatabase } from "./data/db.js";
import { getBaseQuestions } from "./data/questionsRepository.js";
import { createMainView } from "./features/questions/mainView.js";
import { createFiltersView } from "./features/filters/filtersView.js";
import { createSettingsView, updateSettingsView } from "./features/settings/settingsView.js";
import { createDeletedQuestionsView } from "./features/questions/deletedQuestionsView.js";
import {
  createQuestionFormView,
  createQuestionEditView,
} from "./features/questions/questionFormView.js";

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
  render: () => createSettingsView(getSubRoute()),
  update: updateSettingsView, // #/settings/miniapps/<id> : retour du téléphone dans la page
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

// Invitation à installer : l'événement du navigateur peut arriver très tôt,
// il est donc écouté dès le chargement du module (aucune fenêtre ouverte
// d'elle-même : seul le bouton de Paramètres > Infos la déclenche).
initInstallPrompt();

async function bootstrap() {
  await initDataLayer();
  const registration = await registerServiceWorker();
  await initBottomNav(document.getElementById("bottom-nav"));

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

  // Mises à jour (vérifiées après le démarrage du Splash, pour savoir s'il
  // attend encore le premier toucher).
  initUpdates({
    registration,
    isSplashWaiting: () => ["appear", "float", "static"].includes(document.querySelector(".splash-intro")?.dataset.phase),
    showBanner: (apply) => showUpdateBanner(apply),
  });
}

bootstrap();
