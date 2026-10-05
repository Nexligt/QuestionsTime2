/*
  miniAppsMenu.js
  Onglet « Mini-apps » des Paramètres : menu de tuiles (logo + nom), une
  par mini-application du registre. Toucher une tuile affiche l'application
  à la place du menu, avec un bouton « ← Mini-apps ». L'adresse suit
  (#/settings/miniapps/<id>) : le bouton retour du téléphone ramène au menu.
  Chaque application est construite à sa première ouverture puis gardée
  (réglages et fonctionnement inchangés).
*/

import { MINI_APPS } from "./miniAppsRegistry.js";
import { replaceHash } from "../../core/router.js";

export const MINI_APPS_ROUTE = "settings/miniapps";

let menuCounter = 0;

/**
 * @param {{ apps?: typeof MINI_APPS, onChange?: (id: string|null) => void }} [options] -
 *   registre (injectable pour les tests) ; `onChange` : application affichée (null = menu).
 * @returns {{ root: HTMLElement, show: Function, current: () => string|null, backToMenu: () => void }}
 */
export function createMiniAppsPanel({ apps = MINI_APPS, onChange = () => {} } = {}) {
  const uid = ++menuCounter;
  const root = document.createElement("div");
  root.className = "miniapps";

  const menu = document.createElement("ul");
  menu.className = "miniapps-menu";
  menu.setAttribute("aria-label", "Mini-applications");

  const appView = document.createElement("div");
  appView.className = "miniapps-app";
  appView.hidden = true;
  const header = document.createElement("div");
  header.className = "miniapps-app__header";
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "button button--secondary miniapps-app__back";
  backButton.textContent = "← Mini-apps";
  const title = document.createElement("h2");
  title.className = "miniapps-app__title";
  title.id = `miniapps-title-${uid}`;
  header.append(backButton, title);
  const body = document.createElement("section");
  body.className = "card miniapps-app__body";
  body.setAttribute("aria-labelledby", title.id);
  appView.append(header, body);

  root.append(menu, appView);

  if (apps.length === 0) {
    const empty = document.createElement("p");
    empty.className = "settings-choice__description settings-empty";
    empty.textContent = "Aucune mini-application disponible pour le moment.";
    root.prepend(empty);
  }

  const tiles = new Map();
  const built = new Map(); // id -> élément de l'application (construit une fois)
  let currentId = null;
  let pushedHash = false; // ouverture depuis le menu : « ← » revient en arrière dans l'historique

  const win = () => root.ownerDocument.defaultView;
  const inRouter = () => (win()?.location.hash ?? "").startsWith(`#/${MINI_APPS_ROUTE.split("/")[0]}`);

  for (const app of apps) {
    const item = document.createElement("li");
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "miniapps-tile";
    tile.dataset.app = app.id;
    const logo = document.createElement("span");
    logo.className = "miniapps-tile__logo";
    logo.innerHTML = app.icon ?? "";
    const name = document.createElement("span");
    name.className = "miniapps-tile__name";
    name.textContent = app.title;
    tile.append(logo, name);
    tile.addEventListener("click", () => open(app.id));
    item.append(tile);
    menu.append(item);
    tiles.set(app.id, tile);
  }

  /** Affiche l'application `id`, ou le menu (null / id inconnu). */
  function show(id, { focus = true } = {}) {
    const app = apps.find((a) => a.id === id) ?? null;
    if ((app?.id ?? null) === currentId) return;
    const previous = currentId;
    currentId = app?.id ?? null;
    menu.hidden = currentId !== null;
    appView.hidden = currentId === null;
    root.dataset.app = currentId ?? "";
    if (app) {
      if (!built.has(app.id)) built.set(app.id, app.build(title.id));
      title.textContent = app.title;
      body.dataset.setting = `mini-app-${app.id}`;
      body.replaceChildren(built.get(app.id));
      if (focus) backButton.focus?.({ preventScroll: true });
    } else {
      body.replaceChildren();
      pushedHash = false;
      if (previous && focus) tiles.get(previous)?.focus?.({ preventScroll: true });
    }
    onChange(currentId);
  }

  function open(id) {
    if (inRouter()) {
      const target = `#/${MINI_APPS_ROUTE}/${id}`;
      if (win().location.hash !== target) {
        win().location.hash = target; // entrée d'historique : retour = menu
        pushedHash = true;
      }
    }
    show(id);
  }

  /** Retour au menu (bouton « ← Mini-apps » ou onglet « Mini-apps » touché à nouveau). */
  function backToMenu({ focus = true } = {}) {
    const wasPushed = pushedHash;
    show(null, { focus });
    if (!inRouter()) return;
    if (wasPushed) win().history.back();
    else replaceHash(`#/${MINI_APPS_ROUTE}`, win());
  }

  backButton.addEventListener("click", () => backToMenu());

  return { root, show, current: () => currentId, backToMenu };
}
