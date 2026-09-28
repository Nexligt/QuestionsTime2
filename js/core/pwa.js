/*
  pwa.js
  Centralise tout ce qui concerne la couche PWA :
  - enregistrement du service worker ;
  - détection du mode "installé" (standalone).

  L'installation elle-même reste facultative et pilotée par le
  navigateur : ce module ne force rien, il informe seulement l'app.
*/

/**
 * Enregistre le service worker s'il est supporté.
 * Ne bloque jamais le démarrage de l'app en cas d'échec.
 */
export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("./service-worker.js");
  } catch (error) {
    console.warn("[pwa] Échec de l'enregistrement du service worker :", error);
  }
}

/**
 * Indique si l'application tourne actuellement en mode installé
 * (lancée depuis l'écran d'accueil, sans barre de navigateur).
 * @returns {boolean}
 */
export function isRunningStandalone() {
  const isStandaloneDisplay = window.matchMedia(
    "(display-mode: standalone)"
  ).matches;
  // Cas particulier iOS/Safari.
  const isIosStandalone = window.navigator.standalone === true;

  return isStandaloneDisplay || isIosStandalone;
}
