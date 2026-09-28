/*
  filtersView.js
  Écran "Filtres" : liste des tags (récupérés dynamiquement depuis les
  questions disponibles), champ de recherche pour filtrer cette liste,
  et un bouton par tag qui cycle entre neutre -> obligatoire -> exclu.

  Chaque changement est immédiatement persisté dans le store `filters`
  (via filtersRepository.js) : Main relit ces états à chaque montage et
  les applique avant d'appeler le moteur Strict/Libre.
*/

import { getAvailableQuestions } from "../../data/questionsRepository.js";
import { getTagFilterStates, setTagFilterStates } from "../../data/filtersRepository.js";
import {
  TAG_FILTER_STATES,
  extractTags,
  searchTags,
  getTagState,
  getNextTagState,
  withTagState,
  pruneUnknownTags,
  applyTagFilters,
} from "./tagFilters.js";

const STATE_LABELS = {
  [TAG_FILTER_STATES.REQUIRED]: "Obligatoire",
  [TAG_FILTER_STATES.NEUTRAL]: "Neutre",
  [TAG_FILTER_STATES.EXCLUDED]: "Exclu",
};

const STATE_SYMBOLS = {
  [TAG_FILTER_STATES.REQUIRED]: "✓",
  [TAG_FILTER_STATES.NEUTRAL]: "○",
  [TAG_FILTER_STATES.EXCLUDED]: "✕",
};

/**
 * Construit la vue Filtres (rendu synchrone, contenu chargé ensuite).
 * @returns {HTMLElement}
 */
let tagListCounter = 0;

export function createFiltersView() {
  const view = document.createElement("div");
  view.className = "view view--filters";

  const card = document.createElement("section");
  card.className = "card filters-card";

  const heading = document.createElement("h1");
  heading.textContent = "Filtres";

  const help = document.createElement("p");
  help.className = "filters-help";
  help.textContent =
    "Touchez un tag pour changer son état : neutre → obligatoire → exclu.";

  const summary = document.createElement("p");
  summary.className = "filters-summary";
  summary.setAttribute("aria-live", "polite");
  summary.textContent = "Chargement des tags…";

  const searchLabel = document.createElement("label");
  searchLabel.className = "filters-search";
  const searchText = document.createElement("span");
  searchText.className = "visually-hidden";
  searchText.textContent = "Rechercher un tag";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "filters-search__input";
  searchInput.placeholder = "Rechercher un tag…";
  searchInput.autocomplete = "off";
  searchInput.disabled = true;
  searchLabel.append(searchText, searchInput);

  const tagList = document.createElement("ul");
  tagList.className = "filters-tags";
  tagList.id = `filters-tags-${++tagListCounter}`;

  // En-tête repliable : seule la liste des tags est masquée, la recherche
  // reste visible. État non persisté (ouvert à chaque affichage).
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "filters-toggle";
  toggle.setAttribute("aria-controls", tagList.id);
  const toggleLabel = document.createElement("span");
  toggleLabel.className = "filters-toggle__label";
  toggleLabel.textContent = "Tags";
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "filters-toggle__icon";
  toggleIcon.setAttribute("aria-hidden", "true");
  toggleIcon.textContent = "▾";
  toggle.append(toggleLabel, toggleIcon);

  function setExpanded(expanded) {
    toggle.setAttribute("aria-expanded", String(expanded));
    tagList.hidden = !expanded;
    card.classList.toggle("filters-card--collapsed", !expanded);
  }
  setExpanded(true);
  toggle.addEventListener("click", () => {
    setExpanded(toggle.getAttribute("aria-expanded") !== "true");
  });
  // Taper une recherche rouvre la liste pour montrer les résultats.
  searchInput.addEventListener("input", () => setExpanded(true));

  card.append(heading, help, summary, searchLabel, toggle, tagList);
  view.append(card);

  wireFilters({ summary, searchInput, tagList, toggleLabel });
  return view;
}

async function wireFilters({ summary, searchInput, tagList, toggleLabel }) {
  let questions;
  let states;
  try {
    [questions, states] = await Promise.all([getAvailableQuestions(), getTagFilterStates()]);
  } catch (error) {
    console.error("[filtersView] Impossible de charger les filtres :", error);
    summary.textContent = "Impossible de charger les filtres pour le moment.";
    return;
  }

  const allTags = extractTags(questions);
  toggleLabel.textContent = `Tags (${allTags.length})`;
  states = pruneUnknownTags(states, allTags);
  // Écritures sérialisées : l'ordre des clics est toujours respecté.
  let saving = Promise.resolve();

  function updateSummary() {
    const count = applyTagFilters(questions, states).length;
    summary.textContent =
      count === 0
        ? "Aucune question ne correspond aux filtres actifs."
        : `${count} question(s) compatible(s) sur ${questions.length}.`;
    summary.classList.toggle("filters-summary--empty", count === 0);
  }

  function renderTags() {
    tagList.innerHTML = "";
    const visibleTags = searchTags(allTags, searchInput.value);

    if (allTags.length === 0 || visibleTags.length === 0) {
      const empty = document.createElement("li");
      empty.className = "filters-tags__empty";
      empty.textContent = allTags.length === 0 ? "Aucun tag disponible." : "Aucun tag trouvé.";
      tagList.append(empty);
      return;
    }

    for (const tag of visibleTags) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-tag";
      button.dataset.tag = tag;
      applyButtonState(button, tag, getTagState(states, tag));

      button.addEventListener("click", () => {
        const nextState = getNextTagState(getTagState(states, tag));
        states = withTagState(states, tag, nextState);
        applyButtonState(button, tag, nextState);
        updateSummary();
        const snapshot = states;
        saving = saving
          .then(() => setTagFilterStates(snapshot))
          .catch((error) =>
            console.error("[filtersView] Impossible d'enregistrer les filtres :", error)
          );
      });

      item.append(button);
      tagList.append(item);
    }
  }

  searchInput.addEventListener("input", renderTags);
  searchInput.disabled = false;
  updateSummary();
  renderTags();
}

function applyButtonState(button, tag, state) {
  button.dataset.state = state;
  button.setAttribute("aria-label", `${tag} : ${STATE_LABELS[state]}`);
  button.innerHTML = "";
  const symbol = document.createElement("span");
  symbol.className = "filter-tag__symbol";
  symbol.setAttribute("aria-hidden", "true");
  symbol.dataset.symbol = STATE_SYMBOLS[state]; // dessiné en CSS (voir .filter-tag__symbol)
  const name = document.createElement("span");
  name.className = "filter-tag__name";
  name.textContent = tag;
  button.append(symbol, name);
}
