/*
  settingsView.js
  Écran "Paramètres".

  Navigation interne sous le titre : 3 onglets (`SETTINGS_TABS`), un seul
  contenu visible à la fois, "Réglages" par défaut (non persisté).
  Chaque onglet regroupe des SECTIONS indépendantes (titre + fonction de
  construction) : ajouter un réglage = ajouter une entrée dans
  `SETTINGS_SECTIONS` ; ajouter une information = voir infoSection.js ;
  les mini-applications viendront dans l'onglet dédié.

  Étape actuelle : uniquement le mode de sélection (Strict / Libre).
  Aucune logique de mode ici : lecture via
  `questionEngine.getCurrentSelectionMode()` et écriture via
  `questionEngine.setSelectionMode(mode)` — la même clé
  `settings.selectionMode` que le bouton de mode de Main. Changer le mode
  ne touche ni à `currentQuestionId` ni à l'historique.
*/

import {
  getCurrentSelectionMode,
  setSelectionMode,
  resetStrictHistory,
  getRecentQuestionCount,
  setRecentQuestionCount,
  parseRecentQuestionCount,
  DEFAULT_RECENT_QUESTION_COUNT,
} from "../questions/questionEngine.js";
import { SELECTION_MODES } from "../questions/questionSelection.js";
import { buildInfoSection } from "./infoSection.js";
import { buildInstallInvite } from "./installInvite.js";
import { buildImportExportSection } from "./importExportSection.js";
import { createMiniAppsPanel } from "../miniApps/miniAppsMenu.js";
import { replaceHash } from "../../core/router.js";
import {
  NEXT_NAVIGATION,
  DEFAULT_NEXT_NAVIGATION,
  getNextNavigation,
  setNextNavigation,
} from "../questions/nextNavigation.js";

const MODE_OPTIONS = [
  {
    value: SELECTION_MODES.STRICT,
    label: "Strict",
    description: "Une question déjà vue n'est jamais reproposée.",
  },
  {
    value: SELECTION_MODES.LIBRE,
    label: "Libre",
    description: "Seules les questions vues récemment sont évitées.",
  },
];

const NEXT_NAVIGATION_OPTIONS = [
  {
    value: NEXT_NAVIGATION.BUTTON,
    label: "Bouton uniquement",
    description: "Seul le bouton « Suivante » change de question.",
  },
  {
    value: NEXT_NAVIGATION.SWIPE,
    label: "Swipe uniquement",
    description: "Glisser la question de droite à gauche pour passer à la suivante.",
  },
  {
    value: NEXT_NAVIGATION.BOTH,
    label: "Bouton + Swipe",
    description: "Les deux fonctionnent.",
  },
];

/** Sections de la page, dans l'ordre d'affichage. */
const SETTINGS_SECTIONS = [
  { id: "selection-mode", title: "Mode de sélection", build: buildSelectionModeSetting },
  {
    id: "next-navigation",
    title: "Navigation vers la question suivante",
    build: (labelledBy) =>
      buildChoiceSetting({
        labelledBy,
        name: "next-navigation",
        options: NEXT_NAVIGATION_OPTIONS,
        read: getNextNavigation,
        write: setNextNavigation,
        fallback: DEFAULT_NEXT_NAVIGATION,
      }),
  },
  {
    id: "recent-question-count",
    title: "Intervalle de répétition en mode Libre",
    hint: "Nombre de questions différentes avant qu'une question puisse réapparaître en mode Libre.",
    build: buildRecentQuestionCountSetting,
  },
  { id: "strict-history", title: "Historique Strict", build: buildStrictHistoryReset },
  { id: "import-export", title: "Import / Export", build: buildImportExportSection },
];

/** Onglets de la page, dans l'ordre du menu. Le premier est actif par défaut. */
const SETTINGS_TABS = [
  // Réglages : cartes repliables (repliées par défaut) pour rester compact.
  { id: "reglages", label: "Réglages", shortLabel: "Réglages", sections: SETTINGS_SECTIONS, collapsible: true },
  {
    id: "mini-apps",
    label: "Mini-applications",
    shortLabel: "Mini-apps", // libellé affiché (tient sur une ligne dès 320 px)
    // Menu de tuiles, une par mini-application (js/features/miniApps/miniAppsMenu.js).
    sections: [],
    miniApps: true,
  },
  {
    id: "informations",
    label: "Informations",
    shortLabel: "Infos",
    sections: [{ id: "informations", title: "Informations", build: buildInformations }],
  },
];

let settingsViewCounter = 0;

/** Contrôleurs des vues affichées (sous-adresse #/settings/…). */
const subRouteHandlers = new WeakMap();

/**
 * Sous-adresse sur la vue déjà affichée (router : `update`) :
 * « miniapps » -> onglet Mini-apps (menu) ; « miniapps/<id> » -> application ;
 * vide -> onglet par défaut.
 */
export function updateSettingsView(element, subRoute) {
  subRouteHandlers.get(element)?.(subRoute);
}

/**
 * Construit la vue Paramètres (rendu synchrone, valeurs chargées ensuite).
 * @returns {HTMLElement}
 */
export function createSettingsView(subRoute = "") {
  const uid = ++settingsViewCounter;
  const view = document.createElement("div");
  view.className = "view view--settings";

  const heading = document.createElement("h1");
  heading.className = "page-title settings-title";
  heading.textContent = "Paramètres";

  const tabList = document.createElement("div");
  tabList.className = "settings-tabs";
  tabList.setAttribute("role", "tablist");
  tabList.setAttribute("aria-label", "Rubriques des paramètres");

  view.append(heading, tabList);

  const miniApps = createMiniAppsPanel();

  // Onglet choisi à la main : l'adresse suit sans nouvelle entrée
  // d'historique (retour du téléphone : page précédente, pas l'onglet).
  function syncHash(tabId) {
    const loc = view.ownerDocument.defaultView?.location;
    if (!loc?.hash.startsWith("#/settings")) return;
    const target = tabId === "mini-apps"
      ? `#/settings/miniapps${miniApps.current() ? `/${miniApps.current()}` : ""}`
      : `#/settings/${tabId}`;
    replaceHash(target, view.ownerDocument.defaultView);
  }

  const tabs = [];
  for (const tabDef of SETTINGS_TABS) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "settings-tab";
    tab.id = `settings-tab-${tabDef.id}-${uid}`;
    tab.dataset.tab = tabDef.id;
    tab.setAttribute("role", "tab");
    // Libellé court affiché, nom complet pour les lecteurs d'écran et l'infobulle.
    tab.textContent = tabDef.shortLabel ?? tabDef.label;
    tab.setAttribute("aria-label", tabDef.label);
    tab.title = tabDef.label;

    const panel = document.createElement("div");
    panel.className = "settings-panel";
    panel.id = `settings-panel-${tabDef.id}-${uid}`;
    panel.dataset.panel = tabDef.id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    tab.setAttribute("aria-controls", panel.id);

    for (const section of tabDef.sections) {
      panel.append(buildSection(section, { collapsible: Boolean(tabDef.collapsible) }));
    }
    if (tabDef.miniApps) panel.append(miniApps.root);

    tab.addEventListener("click", () => {
      selectTab(tabDef.id);
      syncHash(tabDef.id);
    });
    tabList.append(tab);
    view.append(panel);
    tabs.push({ id: tabDef.id, tab, panel });
  }

  function selectTab(id, focus = false) {
    for (const entry of tabs) {
      const active = entry.id === id;
      entry.tab.setAttribute("aria-selected", String(active));
      entry.tab.tabIndex = active ? 0 : -1;
      entry.panel.hidden = !active;
      if (active && focus) entry.tab.focus?.();
    }
    view.dataset.activeTab = id;
  }

  // Clavier (accessibilité) : flèches gauche/droite entre les onglets.
  tabList.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = tabs.findIndex((t) => t.id === view.dataset.activeTab);
    const delta = event.key === "ArrowRight" ? 1 : -1;
    selectTab(tabs[(index + delta + tabs.length) % tabs.length].id, true);
    event.preventDefault();
  });

  function applySubRoute(route) {
    const [section, appId] = String(route ?? "").split("/"); // « /play » éventuel ignoré (couche d'une mini-app)
    if (section === "miniapps") {
      selectTab("mini-apps");
      miniApps.show(appId || null);
    } else if (SETTINGS_TABS.some((t) => t.id === section)) {
      miniApps.show(null);
      selectTab(section); // #/settings/informations, #/settings/reglages
    } else {
      miniApps.show(null);
      selectTab(SETTINGS_TABS[0].id); // "Réglages" par défaut
    }
  }
  subRouteHandlers.set(view, applySubRoute);
  applySubRoute(subRoute);
  return view;
}

/**
 * Carte d'une section (titre, aide éventuelle, contenu construit).
 * `collapsible` : le titre devient un bouton qui déplie/replie le contenu
 * avec une animation (repliée par défaut, état non persisté). Le contenu
 * reste construit dès l'ouverture de la page : les réglages fonctionnent
 * exactement comme avant, seul leur affichage change.
 */
function buildSection(section, { collapsible = false } = {}) {
  const card = document.createElement("section");
  card.className = "card settings-section";
  card.dataset.setting = section.id;

  const title = document.createElement("h2");
  title.className = "settings-section__title";
  title.id = `setting-${section.id}-title-${settingsViewCounter}`;

  const content = [];
  if (section.hint) {
    const hint = document.createElement("p");
    hint.className = "settings-choice__description settings-section__hint";
    hint.textContent = section.hint;
    content.push(hint);
  }
  content.push(section.build(title.id));

  if (!collapsible) {
    title.textContent = section.title;
    card.append(title, ...content);
    return card;
  }

  card.classList.add("settings-section--collapsible");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "settings-section__toggle";
  toggle.textContent = section.title; // chevron ajouté en CSS
  title.append(toggle);

  // Grille 0fr -> 1fr : hauteur animée sans connaître la taille du contenu.
  const body = document.createElement("div");
  body.className = "settings-section__body";
  body.id = `setting-${section.id}-body-${settingsViewCounter}`;
  const inner = document.createElement("div");
  inner.className = "settings-section__inner";
  inner.append(...content);
  body.append(inner);
  toggle.setAttribute("aria-controls", body.id);

  function setExpanded(expanded) {
    toggle.setAttribute("aria-expanded", String(expanded));
    card.dataset.expanded = String(expanded);
    // Contenu replié : ni focusable ni lu par les lecteurs d'écran.
    body.inert = !expanded;
    if (expanded) body.removeAttribute("inert");
    else body.setAttribute("inert", "");
  }
  setExpanded(false);
  toggle.addEventListener("click", () => setExpanded(card.dataset.expanded !== "true"));

  card.append(title, body);
  return card;
}

/** Informations + invitation (discrète) à installer l'application. */
function buildInformations(labelledBy) {
  const wrapper = document.createElement("div");
  wrapper.className = "settings-informations";
  wrapper.append(buildInfoSection(labelledBy), buildInstallInvite());
  return wrapper;
}

/**
 * Choix Strict / Libre : écrit via `questionEngine.setSelectionMode`.
 * @param {string} labelledBy - id du titre de la section.
 * @returns {HTMLElement}
 */
function buildSelectionModeSetting(labelledBy) {
  return buildChoiceSetting({
    labelledBy,
    name: "selection-mode",
    datasetKey: "mode",
    options: MODE_OPTIONS,
    read: getCurrentSelectionMode,
    write: setSelectionMode,
    fallback: SELECTION_MODES.STRICT,
  });
}

/**
 * Groupe de boutons radio générique pour un réglage à choix unique,
 * réutilisable par tout futur réglage : lit la valeur enregistrée au
 * montage, écrit immédiatement à chaque choix.
 * @param {object} config
 * @param {string} config.labelledBy - id du titre de la section.
 * @param {string} config.name - nom du groupe radio.
 * @param {Array<{value:string,label:string,description:string}>} config.options
 * @param {() => Promise<string>} config.read
 * @param {(value:string) => Promise<string>} config.write
 * @param {string} config.fallback - valeur affichée si la lecture échoue.
 * @param {string} [config.datasetKey="value"] - attribut data-* reflétant la valeur.
 * @returns {HTMLElement}
 */
function buildChoiceSetting({
  labelledBy, name, options, read, write, fallback, datasetKey = "value",
}) {
  const group = document.createElement("div");
  group.className = "settings-choices";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-labelledby", labelledBy);

  const inputs = [];
  for (const option of options) {
    const label = document.createElement("label");
    label.className = "settings-choice";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.className = "settings-choice__input";
    input.disabled = true; // réactivé une fois la valeur enregistrée lue

    const text = document.createElement("span");
    text.className = "settings-choice__text";
    const optionName = document.createElement("span");
    optionName.className = "settings-choice__label";
    optionName.textContent = option.label;
    text.append(optionName);
    if (option.description) {
      const description = document.createElement("span");
      description.className = "settings-choice__description";
      description.textContent = option.description;
      text.append(description);
    }

    label.append(input, text);
    group.append(label);
    inputs.push(input);
  }

  function render(value) {
    for (const input of inputs) input.checked = input.value === value;
    group.dataset[datasetKey] = value;
  }

  function setDisabled(disabled) {
    for (const input of inputs) input.disabled = disabled;
  }

  group.addEventListener("change", async (event) => {
    const value = event.target.value;
    setDisabled(true);
    try {
      render(await write(value));
    } catch (error) {
      console.error(`[settingsView] Impossible d'enregistrer "${name}" :`, error);
      render(await read().catch(() => fallback));
    } finally {
      setDisabled(false);
    }
  });

  (async () => {
    try {
      render(await read());
    } catch (error) {
      console.error(`[settingsView] Impossible de lire "${name}" :`, error);
      render(fallback);
    } finally {
      setDisabled(false);
    }
  })();

  return group;
}

/**
 * Bouton "Réinitialiser l'historique Strict", avec confirmation intégrée
 * à la page (pas de boîte de dialogue native) : un premier appui affiche
 * "Confirmer" / "Annuler", seule la confirmation déclenche le reset.
 * @returns {HTMLElement}
 */
function buildStrictHistoryReset() {
  const container = document.createElement("div");
  container.className = "settings-reset";

  const description = document.createElement("p");
  description.className = "settings-choice__description settings-reset__description";
  description.textContent =
    "Efface la liste des questions déjà vues en mode Strict. L'historique Libre, le mode et la question affichée ne changent pas.";

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "button button--danger settings-reset__button";
  resetButton.textContent = "Réinitialiser l'historique Strict";

  const confirmBox = document.createElement("div");
  confirmBox.className = "settings-reset__confirm";
  confirmBox.setAttribute("role", "alertdialog");
  confirmBox.setAttribute("aria-label", "Confirmer la réinitialisation");
  confirmBox.hidden = true;

  const question = document.createElement("p");
  question.className = "settings-reset__question";
  question.textContent = "Réinitialiser l'historique Strict ? Cette action est définitive.";

  const actions = document.createElement("div");
  actions.className = "settings-reset__actions";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "button button--danger settings-reset__confirm-button";
  confirmButton.textContent = "Confirmer";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button--secondary settings-reset__cancel-button";
  cancelButton.textContent = "Annuler";
  actions.append(confirmButton, cancelButton);
  confirmBox.append(question, actions);

  const status = document.createElement("p");
  status.className = "settings-reset__status";
  status.setAttribute("aria-live", "polite");

  function showConfirm(visible) {
    confirmBox.hidden = !visible;
    resetButton.hidden = visible;
  }

  resetButton.addEventListener("click", () => {
    status.textContent = "";
    showConfirm(true);
    cancelButton.focus?.();
  });

  cancelButton.addEventListener("click", () => {
    showConfirm(false);
    resetButton.focus?.();
  });

  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    try {
      await resetStrictHistory();
      status.textContent = "Historique Strict réinitialisé.";
      status.dataset.status = "done";
    } catch (error) {
      console.error("[settingsView] Impossible de réinitialiser l'historique Strict :", error);
      status.textContent = "Impossible de réinitialiser l'historique pour le moment.";
      status.dataset.status = "error";
    } finally {
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      showConfirm(false);
    }
  });

  container.append(description, resetButton, confirmBox, status);
  return container;
}

/**
 * Intervalle de répétition Libre : saisie libre d'un entier positif.
 * Enregistré via `questionEngine.setRecentQuestionCount` à la validation
 * du champ (Entrée / sortie du champ). Une saisie vide ou invalide n'est
 * jamais enregistrée : le champ reprend la dernière valeur valide.
 * "Réinitialiser" remet et enregistre la valeur par défaut (3).
 * @param {string} labelledBy - id du titre de la section.
 * @returns {HTMLElement}
 */
function buildRecentQuestionCountSetting(labelledBy) {
  const container = document.createElement("div");
  container.className = "settings-number";

  const row = document.createElement("div");
  row.className = "settings-number__row";

  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "1";
  input.step = "1";
  input.className = "settings-number__input";
  input.setAttribute("aria-labelledby", labelledBy);
  input.disabled = true; // réactivé une fois la valeur enregistrée lue

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "button button--secondary settings-number__reset";
  resetButton.textContent = "Réinitialiser";
  resetButton.setAttribute("aria-label", `Réinitialiser à ${DEFAULT_RECENT_QUESTION_COUNT}`);

  const status = document.createElement("p");
  status.className = "settings-number__status";
  status.setAttribute("aria-live", "polite");

  row.append(input, resetButton);
  container.append(row, status);

  let lastValid = DEFAULT_RECENT_QUESTION_COUNT;

  function showStatus(message, kind) {
    status.textContent = message;
    status.dataset.status = kind;
    input.setAttribute("aria-invalid", String(kind === "error"));
  }

  async function save(count) {
    input.disabled = true;
    resetButton.disabled = true;
    try {
      lastValid = await setRecentQuestionCount(count);
      input.value = String(lastValid);
      showStatus(`Enregistré : ${lastValid}.`, "saved");
    } catch (error) {
      console.error("[settingsView] Impossible d'enregistrer l'intervalle :", error);
      input.value = String(lastValid);
      showStatus("Impossible d'enregistrer pour le moment.", "error");
    } finally {
      input.disabled = false;
      resetButton.disabled = false;
    }
  }

  input.addEventListener("change", () => {
    const count = parseRecentQuestionCount(input.value);
    if (count === null) {
      input.value = String(lastValid);
      showStatus(`Entrez un nombre entier supérieur ou égal à 1. Valeur conservée : ${lastValid}.`, "error");
      return;
    }
    if (count === lastValid) {
      input.value = String(lastValid);
      return;
    }
    save(count);
  });

  resetButton.addEventListener("click", () => save(DEFAULT_RECENT_QUESTION_COUNT));

  (async () => {
    try {
      lastValid = await getRecentQuestionCount();
    } catch (error) {
      console.error("[settingsView] Impossible de lire l'intervalle :", error);
    } finally {
      input.value = String(lastValid);
      input.disabled = false;
    }
  })();

  return container;
}
