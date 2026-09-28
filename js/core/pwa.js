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
export async function registerServiceWorker(nav = navigator) {
  if (!("serviceWorker" in nav)) return null;

  try {
    // updateViaCache "none" : le script du service worker n'est jamais lu
    // depuis le cache HTTP lors des vérifications de mise à jour.
    return await nav.serviceWorker.register("./service-worker.js", { updateViaCache: "none" });
  } catch (error) {
    console.warn("[pwa] Échec de l'enregistrement du service worker :", error);
    return null;
  }
}

/* ------------------------------------------------------------------
   Mises à jour
   - vérification au lancement et à chaque retour au premier plan, au
     plus toutes les 30 min (registration.update()) ;
   - nouvelle version en attente : appliquée directement tant que le
     Splash n'a pas été touché, sinon bandeau « Mettre à jour » ;
   - application : message SKIP_WAITING au service worker en attente,
     puis UN seul rechargement au changement de contrôleur.
   ------------------------------------------------------------------ */

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const RELOAD_GUARD_KEY = "qt2-sw-reload-at";
const RELOAD_GUARD_MS = 10000;

/**
 * @param {object} options
 * @param {ServiceWorkerRegistration|null} options.registration
 * @param {() => boolean} options.isSplashWaiting - Splash affiché et pas encore touché.
 * @param {(apply: () => void) => void} options.showBanner - bandeau « Nouvelle version disponible ».
 * @param {Window} [options.win]
 * @param {() => number} [options.now]
 * @returns {{ check: (force?: boolean) => Promise<void>, apply: () => void }}
 */
export function initUpdates({ registration, isSplashWaiting, showBanner, win = window, now = () => Date.now() }) {
  const container = win.navigator.serviceWorker;
  let lastCheck = -Infinity;
  let updateRequested = false;
  let reloading = false;
  let bannerShownFor = null;

  function apply(worker = registration?.waiting) {
    if (!worker) return;
    updateRequested = true;
    worker.postMessage({ type: "SKIP_WAITING" });
  }

  function handleWaiting(worker) {
    if (!worker || !container?.controller) return; // première installation : rien à proposer
    if (isSplashWaiting()) {
      apply(worker); // Splash pas encore touché : mise à jour directe, sans rien demander
    } else if (bannerShownFor !== worker) {
      bannerShownFor = worker;
      showBanner(() => apply(worker));
    }
  }

  function watchInstalling(worker) {
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state === "installed") handleWaiting(registration.waiting ?? worker);
    });
  }

  // Rechargement unique quand la nouvelle version prend le contrôle,
  // seulement si la mise à jour a été demandée (jamais tout seul).
  container?.addEventListener("controllerchange", () => {
    if (!updateRequested || reloading) return;
    let last = 0;
    try { last = Number(win.sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0; } catch { /* stockage indisponible */ }
    if (now() - last < RELOAD_GUARD_MS) return; // protection contre les boucles
    reloading = true;
    try { win.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now())); } catch { /* idem */ }
    win.location.reload();
  });

  if (registration) {
    registration.addEventListener("updatefound", () => watchInstalling(registration.installing));
    if (registration.waiting) handleWaiting(registration.waiting);
    else watchInstalling(registration.installing);
  }

  async function check(force = false) {
    if (!registration) return;
    const t = now();
    if (!force && t - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;
    lastCheck = t;
    try {
      await registration.update();
    } catch {
      /* hors ligne : on réessaiera au prochain retour */
    }
    if (registration.waiting) handleWaiting(registration.waiting);
  }

  win.document.addEventListener("visibilitychange", () => {
    if (win.document.visibilityState === "visible") check();
  });
  check(true); // au lancement

  return { check, apply };
}

/** Version du cache du service worker actif (« v35 »), ou null. */
export function getBuildVersion(win = window, timeoutMs = 1500) {
  const controller = win.navigator.serviceWorker?.controller;
  if (!controller || typeof win.MessageChannel !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new win.MessageChannel();
    const timer = win.setTimeout(() => resolve(null), timeoutMs);
    channel.port1.onmessage = (event) => {
      win.clearTimeout(timer);
      resolve(typeof event.data === "string" ? event.data : null);
    };
    controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
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
