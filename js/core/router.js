/*
  router.js
  Routeur minimaliste basé sur le hash de l'URL (#/vue).
  Rôle : afficher la bonne vue dans #view-root sans recharger la page,
  et prévenir les abonnés (ex. navBar) du changement de vue active.

  Volontairement simple : pas de paramètres d'URL, pas d'imbrication
  de routes pour l'instant. Cela pourra être étendu plus tard si
  le besoin apparaît réellement (ex. vue "question/:id").
*/

const views = new Map();
const listeners = new Set();

let currentViewName = null;

/**
 * Enregistre une vue.
 * @param {string} name - identifiant de la vue (ex. "home").
 * Sous-adresse (ex. #/settings/miniapps/dice) : `render` la lit avec
 * getSubRoute() ; si la vue fournit `update(element, subRoute)`, un
 * changement de sous-adresse sur la même vue l'appelle au lieu de tout
 * reconstruire (le bouton retour du téléphone reste dans la vue).
 * @param {{ render: () => HTMLElement, update?: (element: HTMLElement, subRoute: string) => void, showBottomNav?: boolean }} view
 */
export function registerView(name, view) {
  views.set(name, view);
}

/**
 * Change de vue et déclenche le rendu.
 * @param {string} name
 */
export function navigateTo(name) {
  if (!views.has(name)) {
    console.warn(`[router] Vue inconnue : "${name}"`);
    return;
  }
  window.location.hash = `#/${name}`;
}

let currentSubRoute = "";
let currentElement = null;

/**
 * Remplace l'adresse sans nouvelle entrée d'historique (ni nouveau rendu
 * si possible). Repli sur location.replace si replaceState est refusé.
 * @param {string} hash - ex. "#/settings/miniapps"
 */
export function replaceHash(hash, win = window) {
  if (win.location.hash === hash) return;
  try {
    win.history.replaceState(win.history.state, "", hash);
  } catch {
    win.location.replace(hash);
  }
}

/** Sous-adresse de la vue affichée (« miniapps/dice » pour #/settings/miniapps/dice). */
export function getSubRoute() {
  return currentSubRoute;
}

function renderCurrentView() {
  const root = document.getElementById("view-root");
  const bottomNav = document.getElementById("bottom-nav");
  const view = views.get(currentViewName);

  if (!view) {
    root.innerHTML = "";
    root.append(createNotFoundMessage(currentViewName));
    return;
  }

  root.innerHTML = "";
  currentElement = view.render();
  root.append(currentElement);

  const showNav = Boolean(view.showBottomNav);
  bottomNav.hidden = !showNav;
  document.body.classList.toggle("has-bottom-nav", showNav);

  for (const listener of listeners) {
    listener(currentViewName);
  }
}

function createNotFoundMessage(name) {
  const p = document.createElement("p");
  p.textContent = `Vue introuvable : "${name}".`;
  return p;
}

/**
 * S'abonne aux changements de vue (utilisé par la navBar pour
 * mettre à jour l'état "actif" de ses boutons).
 * @param {(viewName: string) => void} callback
 */
export function onViewChange(callback) {
  listeners.add(callback);
}

/**
 * Initialise le routeur : lit le hash courant, écoute les
 * changements, et affiche une vue par défaut si aucun hash.
 * @param {string} defaultView
 */
export function initRouter(defaultView) {
  function handleHashChange() {
    const hash = window.location.hash.replace(/^#\/?/, "");
    const [name, ...rest] = hash.split("/");
    const viewName = name || defaultView;
    const subRoute = rest.join("/");
    const view = views.get(viewName);
    // Même vue, autre sous-adresse : mise à jour sans reconstruction.
    if (viewName === currentViewName && view?.update && currentElement?.isConnected) {
      currentSubRoute = subRoute;
      view.update(currentElement, subRoute);
      return;
    }
    currentViewName = viewName;
    currentSubRoute = subRoute;
    renderCurrentView();
  }

  window.addEventListener("hashchange", handleHashChange);
  handleHashChange();
}
