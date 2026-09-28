/*
  teamsView.js
  Mini-application « Équipes » : liste de noms, réglage (nombre d'équipes
  OU joueurs par équipe), répartition aléatoire et équilibrée, une carte
  colorée par équipe, « Mélanger à nouveau ».
*/

import {
  TEAMS_LIMITS,
  TEAM_MODES,
  clampTeamCount,
  clampTeamSize,
  formTeams,
  loadTeamsSettings,
  normalizeName,
  planTeams,
  saveTeamCount,
  saveTeamMode,
  saveTeamNames,
  saveTeamSize,
} from "./teams.js";
import { loadWheelSettings } from "../wheel/wheel.js";

const DELETE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;
const TEAM_COLORS = 6; // .teams-card--0 … --5 (themes.css)

let teamsCounter = 0;

/**
 * @param {string} labelledBy - id du titre.
 * @returns {HTMLElement}
 */
export function buildTeamsApp(labelledBy) {
  const uid = ++teamsCounter;
  const root = document.createElement("div");
  root.className = "teams-app";
  root.setAttribute("aria-labelledby", labelledBy);
  root.dataset.ready = "false";
  root.dataset.saves = "0";

  // --- Noms ------------------------------------------------------------------
  const listTitle = document.createElement("p");
  listTitle.className = "settings-choice__label";
  listTitle.id = `teams-list-${uid}`;
  const list = document.createElement("ul");
  list.className = "wheel-app__entries teams-app__names";
  list.setAttribute("aria-labelledby", listTitle.id);
  const listActions = document.createElement("div");
  listActions.className = "teams-app__list-actions";
  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "button button--secondary teams-app__add";
  addButton.textContent = "Ajouter un nom";
  const wheelButton = document.createElement("button");
  wheelButton.type = "button";
  wheelButton.className = "button button--secondary teams-app__from-wheel";
  wheelButton.textContent = "Reprendre les joueurs de la Roue";
  listActions.append(addButton, wheelButton);

  // --- Réglage : nombre d'équipes OU joueurs par équipe ----------------------
  const modeLabel = document.createElement("p");
  modeLabel.className = "settings-choice__label";
  modeLabel.id = `teams-mode-${uid}`;
  modeLabel.textContent = "Répartir par";
  const modes = document.createElement("div");
  modes.className = "settings-choices settings-segmented teams-app__modes";
  modes.setAttribute("role", "radiogroup");
  modes.setAttribute("aria-labelledby", modeLabel.id);
  for (const [value, text] of [[TEAM_MODES.COUNT, "Nombre d'équipes"], [TEAM_MODES.SIZE, "Joueurs par équipe"]]) {
    const label = document.createElement("label");
    label.className = "settings-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `teams-mode-${uid}`;
    input.value = value;
    input.className = "settings-choice__input";
    const span = document.createElement("span");
    span.className = "settings-choice__text";
    const name = document.createElement("span");
    name.className = "settings-choice__label";
    name.textContent = text;
    span.append(name);
    label.append(input, span);
    modes.append(label);
  }
  const valueRow = document.createElement("div");
  valueRow.className = "teams-app__value";
  const valueLabel = document.createElement("label");
  valueLabel.htmlFor = `teams-value-${uid}`;
  const valueInput = document.createElement("input");
  valueInput.id = `teams-value-${uid}`;
  valueInput.type = "number";
  valueInput.inputMode = "numeric";
  valueInput.step = "1";
  valueInput.className = "settings-number__input teams-app__value-input";
  valueRow.append(valueLabel, valueInput);

  // --- Former / résultat --------------------------------------------------------
  const formButton = document.createElement("button");
  formButton.type = "button";
  formButton.className = "button teams-app__form";
  formButton.textContent = "Former les équipes";
  const status = document.createElement("p");
  status.className = "teams-app__status";
  status.setAttribute("role", "alert");
  const results = document.createElement("div");
  results.className = "teams-app__results";
  results.setAttribute("aria-live", "polite");
  const reshuffleButton = document.createElement("button");
  reshuffleButton.type = "button";
  reshuffleButton.className = "button button--secondary teams-app__reshuffle";
  reshuffleButton.textContent = "Mélanger à nouveau";
  reshuffleButton.hidden = true;

  root.append(listTitle, list, listActions, modeLabel, modes, valueRow, formButton, status, results, reshuffleButton);

  // --- État ---------------------------------------------------------------------
  let names = [];
  let mode = TEAM_MODES.COUNT;
  let count = 2;
  let size = 2;

  function track(promise) {
    promise
      .then(() => { root.dataset.saves = String(Number(root.dataset.saves) + 1); })
      .catch((error) => console.error("[teams] Réglage non enregistré :", error));
  }

  function renderNames() {
    listTitle.textContent = `Joueurs (${names.length} sur ${TEAMS_LIMITS.maxNames} au plus)`;
    list.replaceChildren(...names.map((entry, index) => {
      const item = document.createElement("li");
      item.className = "wheel-app__entry";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "settings-number__input wheel-app__entry-input teams-app__name";
      input.value = entry;
      input.maxLength = TEAMS_LIMITS.maxLength;
      input.setAttribute("aria-label", `Joueur ${index + 1}`);
      input.addEventListener("change", () => {
        const value = normalizeName(input.value);
        if (!value) { input.value = names[index]; return; }
        names[index] = value;
        namesChanged();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "icon-button teams-app__delete";
      remove.setAttribute("aria-label", `Supprimer « ${entry} »`);
      remove.innerHTML = DELETE_ICON;
      remove.disabled = names.length <= TEAMS_LIMITS.minNames;
      remove.addEventListener("click", () => {
        if (names.length <= TEAMS_LIMITS.minNames) return;
        names.splice(index, 1);
        namesChanged();
      });
      item.append(input, remove);
      return item;
    }));
    addButton.disabled = names.length >= TEAMS_LIMITS.maxNames;
  }

  function namesChanged() {
    track(saveTeamNames(names));
    renderNames();
    clearResults();
  }

  function renderSetting() {
    for (const input of modes.querySelectorAll("input")) input.checked = input.value === mode;
    if (mode === TEAM_MODES.SIZE) {
      valueLabel.textContent = "Joueurs par équipe";
      valueInput.min = String(TEAMS_LIMITS.minSize);
      valueInput.max = String(TEAMS_LIMITS.maxNames);
      valueInput.value = String(size);
    } else {
      valueLabel.textContent = `Nombre d'équipes (${TEAMS_LIMITS.minTeams} à ${TEAMS_LIMITS.maxTeams})`;
      valueInput.min = String(TEAMS_LIMITS.minTeams);
      valueInput.max = String(TEAMS_LIMITS.maxTeams);
      valueInput.value = String(count);
    }
  }

  function clearResults() {
    results.replaceChildren();
    reshuffleButton.hidden = true;
    status.textContent = "";
    root.dataset.teams = "";
  }

  function form() {
    const plan = planTeams({ mode, count, size }, names.length);
    if (plan.error) {
      results.replaceChildren();
      reshuffleButton.hidden = true;
      status.textContent = plan.error;
      root.dataset.teams = "";
      return;
    }
    status.textContent = "";
    const teams = formTeams(names, plan.teams);
    root.dataset.teams = String(teams.length);
    results.replaceChildren(...teams.map((members, i) => {
      const card = document.createElement("section");
      card.className = `teams-card teams-card--${i % TEAM_COLORS}`;
      card.style.setProperty("--teams-card-delay", `${i * 70}ms`);
      const title = document.createElement("h3");
      title.className = "teams-card__title";
      title.textContent = `Équipe ${i + 1}`;
      const ul = document.createElement("ul");
      ul.className = "teams-card__members";
      for (const member of members) {
        const li = document.createElement("li");
        li.textContent = member;
        ul.append(li);
      }
      card.append(title, ul);
      return card;
    }));
    reshuffleButton.hidden = false;
  }

  addButton.addEventListener("click", () => {
    if (names.length >= TEAMS_LIMITS.maxNames) return;
    let n = names.length + 1;
    while (names.includes(`Joueur ${n}`)) n++;
    names.push(`Joueur ${n}`);
    namesChanged();
    list.lastElementChild?.querySelector("input")?.focus?.();
  });

  wheelButton.addEventListener("click", async () => {
    try {
      const { entries } = await loadWheelSettings();
      names = entries.slice(0, TEAMS_LIMITS.maxNames);
      namesChanged();
      status.textContent = "";
    } catch (error) {
      console.error("[teams] Joueurs de la Roue illisibles :", error);
    }
  });

  modes.addEventListener("change", (event) => {
    mode = event.target.value === TEAM_MODES.SIZE ? TEAM_MODES.SIZE : TEAM_MODES.COUNT;
    track(saveTeamMode(mode));
    renderSetting();
    clearResults();
  });

  valueInput.addEventListener("change", () => {
    if (mode === TEAM_MODES.SIZE) {
      size = clampTeamSize(valueInput.value);
      track(saveTeamSize(size));
    } else {
      count = clampTeamCount(valueInput.value);
      track(saveTeamCount(count));
    }
    renderSetting();
    clearResults();
  });

  formButton.addEventListener("click", form);
  reshuffleButton.addEventListener("click", form);

  formButton.disabled = true;
  loadTeamsSettings()
    .catch((error) => {
      console.error("[teams] Réglages non lus :", error);
      return { names: ["Joueur 1", "Joueur 2", "Joueur 3", "Joueur 4"], mode: TEAM_MODES.COUNT, count: 2, size: 2 };
    })
    .then((settings) => {
      ({ names, mode, count, size } = settings);
      names = [...names];
      renderNames();
      renderSetting();
      formButton.disabled = false;
      root.dataset.ready = "true";
    });

  return root;
}
