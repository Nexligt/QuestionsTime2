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
 * @param {{ render: () => HTMLElement, showBottomNav?: boolean }} view
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
  root.append(view.render());

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
    currentViewName = hash || defaultView;
    renderCurrentView();
  }

  window.addEventListener("hashchange", handleHashChange);
  handleHashChange();
}
