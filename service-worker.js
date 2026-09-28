/*
  service-worker.js
  Socle minimal, stratégie réseau-prioritaire ("network-first") :
  - si le réseau répond, on sert sa réponse et on met le cache à jour
    avec cette version fraîche ;
  - si le réseau échoue (hors ligne), on sert la dernière version mise
    en cache, avec un repli sur la coquille (index.html) pour toute
    navigation sans correspondance exacte.

  Pourquoi ce choix plutôt que "cache-first" (version précédente) :
  en cache-first, une fois la coquille mise en cache à l'installation,
  un simple rechargement (F5) sert indéfiniment cette même version,
  même après modification des fichiers sur disque — seul un rechargement
  forcé (CTRL+F5), qui contourne le Service Worker, révèle les
  changements. "network-first" corrige ce problème en développement
  tout en conservant un fonctionnement hors ligne fiable, ce qui reste
  cohérent avec un hébergement GitHub Pages.
*/

const CACHE_NAME = "questionstime2-shell-v34";

// Fichiers indispensables au démarrage de l'app hors ligne.
// Chemins relatifs : compatible avec un hébergement GitHub Pages
// dans un sous-dossier (ex. /nom-du-repo/).
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/img_Titre.svg",
  "./assets/icons/app-icon.svg",
  "./assets/icons/nav-home.svg",
  "./assets/icons/nav-filters.svg",
  "./assets/icons/nav-deleted.svg",
  "./assets/icons/nav-settings.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-192.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/themes.css",
  "./js/app.js",
  "./js/core/router.js",
  "./js/core/pwa.js",
  "./js/data/db.js",
  "./js/data/questionsBaseLoader.js",
  "./js/data/questionsRepository.js",
  "./js/data/historyRepository.js",
  "./js/data/settingsRepository.js",
  "./js/data/filtersRepository.js",
  "./js/data/exchangeRepository.js",
  "./js/features/filters/tagFilters.js",
  "./js/features/filters/filtersView.js",
  "./js/features/settings/settingsView.js",
  "./js/features/questions/mainView.js",
  "./js/features/questions/questionSelection.js",
  "./js/features/questions/questionEngine.js",
  "./js/features/questions/nextNavigation.js",
  "./js/features/questions/localQuestion.js",
  "./js/features/questions/questionId.js",
  "./js/features/questions/deletedQuestionsView.js",
  "./js/features/questions/questionSearch.js",
  "./js/features/questions/questionSearchOverlay.js",
  "./js/core/textSearch.js",
  "./js/ui/pagination.js",
  "./js/ui/splashIntro.js",
  "./js/core/appVersion.js",
  "./js/features/settings/infoSection.js",
  "./js/features/settings/installInvite.js",
  "./js/features/settings/importExportSection.js",
  "./js/features/questions/questionFormView.js",
  "./js/ui/swipeGesture.js",
  "./js/features/miniApps/miniAppsRegistry.js",
  "./js/features/miniApps/miniAppsMenu.js",
  "./js/features/miniApps/dice/dice.js",
  "./js/features/miniApps/dice/dieShape.js",
  "./js/features/miniApps/dice/diceRollOverlay.js",
  "./js/features/miniApps/dice/diceView.js",
  "./js/features/miniApps/wheel/wheel.js",
  "./js/features/miniApps/wheel/wheelSvg.js",
  "./js/features/miniApps/wheel/wheelView.js",
  "./js/features/miniApps/coin/coin.js",
  "./js/features/miniApps/coin/coinView.js",
  "./js/features/miniApps/teams/teams.js",
  "./js/features/miniApps/teams/teamsView.js",
  "./js/features/miniApps/timer/timer.js",
  "./js/features/miniApps/timer/timerView.js",
  "./js/features/miniApps/chooser/chooser.js",
  "./js/features/miniApps/chooser/chooserView.js",
  "./js/ui/navBar.js",
  "./js/ui/navConfig.js",
  "./data/questions.base.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // On ne gère que les requêtes GET de même origine.
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(networkFirst(request));
});

/**
 * Essaie le réseau en priorité et rafraîchit le cache avec la réponse
 * obtenue. Ne sert le cache que si le réseau est indisponible.
 * @param {Request} request
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Repli ultime hors ligne : aucune version en cache pour cette
    // requête précise, mais une navigation peut au moins afficher
    // la coquille de l'app plutôt qu'une erreur réseau.
    if (request.mode === "navigate") {
      const shellFallback = await cache.match("./index.html");
      if (shellFallback) return shellFallback;
    }

    throw error;
  }
}
