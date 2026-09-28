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
  const isStandaloneDisplay = Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches
  );
  // Cas particulier iOS/Safari.
  const isIosStandalone = window.navigator.standalone === true;

  return isStandaloneDisplay || isIosStandalone;
}

/* ------------------------------------------------------------------
   Invitation à installer (facultative, jamais automatique)
   - Android/Chrome : l'événement `beforeinstallprompt` est mis de côté
     (la mini-barre du navigateur ne s'affiche pas) ; seul le bouton de
     Paramètres > Infos ouvre la fenêtre d'installation.
   - iPhone : pas d'événement, seulement une explication (Partager →
     Sur l'écran d'accueil).
   - Déjà installée (mode installé ou `appinstalled`) : rien.
   ------------------------------------------------------------------ */

let deferredInstallPrompt = null;
let installedThisSession = false;
const installListeners = new Set();

function notifyInstallListeners() {
  for (const listener of installListeners) listener(getInstallState());
}

/** À appeler une fois, le plus tôt possible (app.js). */
export function initInstallPrompt(win = window) {
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // pas de proposition automatique
    deferredInstallPrompt = event;
    notifyInstallListeners();
  });
  win.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installedThisSession = true;
    notifyInstallListeners();
  });
}

/** iPhone / iPad (y compris iPadOS qui se présente comme un Mac). */
export function isIosDevice(nav = window.navigator) {
  const ua = nav?.userAgent ?? "";
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (nav?.maxTouchPoints ?? 0) > 1);
}

/**
 * @returns {{ installed: boolean, canPrompt: boolean, ios: boolean }}
 */
export function getInstallState() {
  const installed = installedThisSession || isRunningStandalone();
  return {
    installed,
    canPrompt: !installed && deferredInstallPrompt !== null,
    ios: !installed && isIosDevice(),
  };
}

/** Ouvre la fenêtre d'installation du navigateur (Android/Chrome). */
export async function promptInstall() {
  const event = deferredInstallPrompt;
  if (!event) return "unavailable";
  deferredInstallPrompt = null; // utilisable une seule fois
  notifyInstallListeners();
  await event.prompt();
  const choice = await event.userChoice?.catch?.(() => null);
  return choice?.outcome ?? "dismissed";
}

/** Abonnement aux changements (installation possible, installée…). */
export function onInstallStateChange(listener) {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}
