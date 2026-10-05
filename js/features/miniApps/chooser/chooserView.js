/*
  chooserView.js
  Mini-application « Qui commence ? » : bouton « Commencer » qui ouvre une
  couche plein écran. Chaque doigt posé (Pointer Events, pointerId) fait
  apparaître un cercle coloré qui le suit ; dès que 2 doigts ou plus restent
  posés 3 s sans changement (anneau qui se remplit), un doigt est tiré au
  hasard. « × » ou le retour du téléphone ferment la couche.
  Mode « Équipes » : les doigts sont répartis en 2 à 6 équipes équilibrées
  (couleur + numéro), avec un capitaine par équipe en option.
*/

import {
  CHOOSER,
  CHOOSER_MODES,
  CHOOSER_ROULETTE,
  CHOOSER_TEAMS,
  assignFingerTeams,
  loadChooserSettings,
  minFingersFor,
  nextColor,
  pickCaptains,
  pickWinner,
  saveChooserCaptain,
  saveChooserMode,
  saveChooserTeams,
} from "./chooser.js";
import { prefersReducedMotion } from "../dice/diceRollOverlay.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PLAY_SUFFIX = "/play";
const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;
const HINT_WAITING = "Posez chacun un doigt sur l'écran";
const HINT_COUNTING = "Ne bougez plus…";
const HINT_RESULT = "Levez tous les doigts pour recommencer";
const HINT_SHUFFLING = "Répartition…";
const HINT_TEAMS_RESULT = "Levez les doigts pour rejouer";
const TEAM_COLORS = 6; // .chooser__circle--team-0 … --5 (themes.css)
const missingHint = (n) => `Encore ${n} doigt${n > 1 ? "s" : ""} au minimum`;

/** Groupe de boutons à segments (mêmes classes que les autres réglages). */
function segmented(name, labelText, choices, labelId) {
  const label = document.createElement("p");
  label.className = "settings-choice__label chooser-app__label";
  label.id = labelId;
  label.textContent = labelText;
  const group = document.createElement("div");
  group.className = "settings-choices settings-segmented";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-labelledby", labelId);
  for (const [value, text] of choices) {
    const choice = document.createElement("label");
    choice.className = "settings-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = String(value);
    input.className = "settings-choice__input";
    const span = document.createElement("span");
    span.className = "settings-choice__text";
    const strong = document.createElement("span");
    strong.className = "settings-choice__label";
    strong.textContent = text;
    span.append(strong);
    choice.append(input, span);
    group.append(choice);
  }
  return { label, group };
}

let chooserAppCounter = 0;

/**
 * @param {string} labelledBy
 * @param {{ setTimeout?: Function, clearTimeout?: Function, random?: () => number }} [deps] - injectables (tests).
 * @returns {HTMLElement}
 */
export function buildChooserApp(labelledBy, deps = {}) {
  const uid = ++chooserAppCounter;
  const root = document.createElement("div");
  root.className = "chooser-app";
  root.setAttribute("aria-labelledby", labelledBy);
  root.dataset.ready = "false";
  root.dataset.saves = "0";

  const modes = segmented(`chooser-mode-${uid}`, "Mode", [[CHOOSER_MODES.SINGLE, "Un joueur"], [CHOOSER_MODES.TEAMS, "Équipes"]], `chooser-mode-label-${uid}`);
  modes.group.classList.add("chooser-app__modes");

  const teamsBox = document.createElement("div");
  teamsBox.className = "chooser-app__teams";
  const teamChoices = [];
  for (let n = CHOOSER_TEAMS.min; n <= CHOOSER_TEAMS.max; n++) teamChoices.push([n, String(n)]);
  const teamCount = segmented(`chooser-teams-${uid}`, "Nombre d'équipes", teamChoices, `chooser-teams-label-${uid}`);
  teamCount.group.classList.add("chooser-app__team-count");
  const captainLabel = document.createElement("label");
  captainLabel.className = "settings-choice";
  const captainInput = document.createElement("input");
  captainInput.type = "checkbox";
  captainInput.className = "settings-choice__input chooser-app__captain";
  const captainText = document.createElement("span");
  captainText.className = "settings-choice__text";
  const captainName = document.createElement("span");
  captainName.className = "settings-choice__label";
  captainName.textContent = "Désigner un capitaine";
  const captainDescription = document.createElement("span");
  captainDescription.className = "settings-choice__description";
  captainDescription.textContent = "Dans chaque équipe, un cercle tiré au hasard grossit.";
  captainText.append(captainName, captainDescription);
  captainLabel.append(captainInput, captainText);
  teamsBox.append(teamCount.label, teamCount.group, captainLabel);

  const intro = document.createElement("p");
  intro.className = "chooser-app__intro";
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "button chooser-app__start";
  startButton.textContent = "Commencer";
  root.append(modes.label, modes.group, teamsBox, intro, startButton);

  const options = { mode: CHOOSER_MODES.SINGLE, teams: CHOOSER_TEAMS.min, captain: false };

  function track(promise) {
    promise
      .then(() => { root.dataset.saves = String(Number(root.dataset.saves) + 1); })
      .catch((error) => console.error("[chooser] Réglage non enregistré :", error));
  }

  function render() {
    for (const input of modes.group.querySelectorAll("input")) input.checked = input.value === options.mode;
    for (const input of teamCount.group.querySelectorAll("input")) input.checked = Number(input.value) === options.teams;
    captainInput.checked = options.captain;
    const teams = options.mode === CHOOSER_MODES.TEAMS;
    teamsBox.hidden = !teams;
    intro.textContent = teams
      ? `Chacun pose un doigt sur l'écran (au moins ${minFingersFor(options.mode, options.teams)}) : au bout de 3 secondes, les doigts sont répartis en ${options.teams} équipes.`
      : "Chacun pose un doigt sur l'écran : au bout de 3 secondes, l'application désigne qui commence.";
  }

  modes.group.addEventListener("change", (event) => {
    options.mode = event.target.value === CHOOSER_MODES.TEAMS ? CHOOSER_MODES.TEAMS : CHOOSER_MODES.SINGLE;
    track(saveChooserMode(options.mode));
    render();
  });
  teamCount.group.addEventListener("change", (event) => {
    options.teams = Number(event.target.value);
    track(saveChooserTeams(options.teams));
    render();
  });
  captainInput.addEventListener("change", () => {
    options.captain = captainInput.checked;
    track(saveChooserCaptain(options.captain));
  });

  render();
  loadChooserSettings()
    .then((settings) => Object.assign(options, settings))
    .catch((error) => console.error("[chooser] Réglages non lus :", error))
    .finally(() => {
      render();
      root.dataset.ready = "true";
    });

  let game = null;
  startButton.addEventListener("click", () => {
    if (game) return;
    game = openChooser({
      ...deps,
      mode: options.mode,
      teamCount: options.teams,
      captain: options.captain,
      onClose: () => { game = null; startButton.focus?.(); },
    });
  });
  return root;
}

/**
 * Couche plein écran du jeu.
 * @returns {{ overlay: HTMLElement, close: () => void }}
 */
export function openChooser({
  container = document.body,
  onClose = () => {},
  random,
  mode = CHOOSER_MODES.SINGLE,
  teamCount = CHOOSER_TEAMS.min,
  captain = false,
  ...deps
} = {}) {
  const teamsMode = mode === CHOOSER_MODES.TEAMS;
  const minFingers = minFingersFor(mode, teamCount);
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const setT = deps.setTimeout ?? ((fn, ms) => win.setTimeout(fn, ms));
  const clearT = deps.clearTimeout ?? ((id) => win.clearTimeout(id));

  const overlay = doc.createElement("div");
  overlay.className = "chooser";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Qui commence ?");
  overlay.dataset.phase = "waiting";
  overlay.dataset.mode = teamsMode ? CHOOSER_MODES.TEAMS : CHOOSER_MODES.SINGLE;
  overlay.tabIndex = -1;
  overlay.classList.toggle("chooser--reduced", prefersReducedMotion(win));

  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "icon-button chooser__close";
  closeButton.setAttribute("aria-label", "Fermer");
  closeButton.innerHTML = CLOSE_ICON;
  const hint = doc.createElement("p");
  hint.className = "chooser__hint";
  hint.textContent = HINT_WAITING;
  const layer = doc.createElement("div");
  layer.className = "chooser__layer";
  // Mode Équipes : légende (joueurs par équipe) et « Rejouer ».
  const legend = doc.createElement("p");
  legend.className = "chooser__legend";
  legend.hidden = true;
  const replayButton = doc.createElement("button");
  replayButton.type = "button";
  replayButton.className = "button chooser__replay";
  replayButton.textContent = "Rejouer";
  replayButton.hidden = true;
  overlay.append(layer, legend, hint, replayButton, closeButton);

  /** @type {Map<number, { el: HTMLElement, color: number }>} */
  const fingers = new Map();
  let timerId = null;
  let phase = "waiting"; // waiting | counting | result
  let closed = false;

  function setPhase(next, text) {
    phase = next;
    overlay.dataset.phase = next;
    hint.textContent = text;
  }

  function createCircle(color) {
    const el = doc.createElement("div");
    // Mode Équipes : cercle neutre tant que l'équipe n'est pas attribuée.
    el.className = color === null ? "chooser__circle chooser__circle--neutral" : `chooser__circle chooser__circle--${color}`;
    // Le cercle extérieur suit le doigt (transform) ; le disque intérieur
    // porte la couleur et les effets d'échelle, sans décaler la position.
    const dot = doc.createElement("div");
    dot.className = "chooser__dot";
    el.append(dot);
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("class", "chooser__ring");
    svg.setAttribute("aria-hidden", "true");
    const ring = doc.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", "50");
    ring.setAttribute("cy", "50");
    ring.setAttribute("r", "46");
    ring.setAttribute("pathLength", "100");
    svg.append(ring);
    el.append(svg);
    if (teamsMode) {
      const number = doc.createElement("span");
      number.className = "chooser__team-number";
      el.append(number);
    }
    return el;
  }

  /** Couleur et numéro d'équipe (null : neutre). */
  function setTeam(el, team) {
    for (const cls of [...el.classList]) if (cls.startsWith("chooser__circle--team-")) el.classList.remove(cls);
    el.classList.toggle("chooser__circle--neutral", team === null);
    if (team !== null) el.classList.add(`chooser__circle--team-${team % TEAM_COLORS}`);
    const number = el.querySelector(".chooser__team-number");
    if (number) number.textContent = team === null ? "" : String(team + 1);
  }

  function place(el, x, y) {
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Nombre de doigts changé : l'attente recommence (ou s'arrête). */
  function restartCountdown() {
    if (timerId !== null) clearT(timerId);
    timerId = null;
    overlay.classList.remove("chooser--counting");
    if (fingers.size >= minFingers) {
      void overlay.offsetWidth; // relance l'animation de l'anneau
      overlay.classList.add("chooser--counting");
      setPhase("counting", HINT_COUNTING);
      timerId = setT(teamsMode ? chooseTeams : choose, CHOOSER.waitMs);
    } else if (teamsMode && fingers.size > 0) {
      setPhase("waiting", missingHint(minFingers - fingers.size)); // au moins un doigt par équipe
    } else {
      setPhase("waiting", HINT_WAITING);
    }
  }

  /** Mode Équipes : courte roulette des couleurs, puis répartition finale. */
  function chooseTeams() {
    timerId = null;
    if (fingers.size < minFingers) return;
    overlay.classList.remove("chooser--counting");
    setPhase("result", HINT_SHUFFLING); // nouveaux doigts ignorés dès maintenant
    overlay.dataset.shuffling = "true";
    const rouletteSteps = prefersReducedMotion(win) ? 0 : Math.round(CHOOSER_ROULETTE.duration / CHOOSER_ROULETTE.step);
    let step = 0;
    const tick = () => {
      timerId = null;
      if (step >= rouletteSteps) { finalizeTeams(); return; }
      step += 1;
      for (const { el } of fingers.values()) setTeam(el, Math.floor(Math.random() * teamCount)); // visuel seulement
      timerId = setT(tick, CHOOSER_ROULETTE.step);
    };
    tick();
  }

  function finalizeTeams() {
    delete overlay.dataset.shuffling;
    const ids = [...fingers.keys()];
    const { teams, teamOf } = assignFingerTeams(ids, teamCount, random);
    const captains = new Set(captain ? pickCaptains(teams, random) : []);
    for (const [id, { el }] of fingers) {
      setTeam(el, teamOf.get(id));
      el.classList.toggle("chooser__circle--captain", captains.has(id));
      if (captains.has(id)) {
        const badge = doc.createElement("span");
        badge.className = "chooser__captain-label";
        badge.textContent = "Capitaine";
        el.append(badge);
      }
    }
    overlay.dataset.teams = JSON.stringify(Object.fromEntries(teamOf));
    overlay.dataset.captains = JSON.stringify([...captains]);
    legend.replaceChildren(...teams.map((members, team) => {
      const item = doc.createElement("span");
      item.className = `chooser__legend-item chooser__legend-item--team-${team % TEAM_COLORS}`;
      item.textContent = `Équipe ${team + 1} : ${members.length} joueur${members.length > 1 ? "s" : ""}`;
      return item;
    }));
    legend.hidden = false;
    replayButton.hidden = false;
    overlay.classList.add("chooser--teams-result");
    setPhase("result", HINT_TEAMS_RESULT);
    try { win?.navigator?.vibrate?.(200); } catch { /* non pris en charge */ }
  }

  function choose() {
    timerId = null;
    const ids = [...fingers.keys()];
    const winner = pickWinner(ids, random);
    if (winner === null) return;
    overlay.classList.remove("chooser--counting");
    for (const [id, finger] of fingers) {
      finger.el.classList.toggle("chooser__circle--winner", id === winner);
      finger.el.classList.toggle("chooser__circle--out", id !== winner);
    }
    const color = fingers.get(winner).color;
    overlay.dataset.winner = String(winner);
    overlay.dataset.winnerColor = String(color);
    overlay.classList.add("chooser--result", `chooser--win-${color}`);
    setPhase("result", HINT_RESULT);
    try { win?.navigator?.vibrate?.(200); } catch { /* non pris en charge */ }
  }

  function resetRound() {
    for (const { el } of fingers.values()) el.remove();
    fingers.clear();
    if (timerId !== null) clearT(timerId);
    timerId = null;
    overlay.classList.remove("chooser--result", "chooser--teams-result", "chooser--counting", ...[...overlay.classList].filter((c) => c.startsWith("chooser--win-")));
    delete overlay.dataset.winner;
    delete overlay.dataset.winnerColor;
    delete overlay.dataset.teams;
    delete overlay.dataset.captains;
    delete overlay.dataset.shuffling;
    legend.hidden = true;
    legend.replaceChildren();
    replayButton.hidden = true;
    layer.replaceChildren();
    setPhase("waiting", HINT_WAITING);
  }

  // --- Pointer Events ----------------------------------------------------------
  function onDown(event) {
    if (event.target.closest?.(".chooser__close, .chooser__replay")) return;
    event.preventDefault();
    if (phase === "result" || fingers.has(event.pointerId)) return; // attendre que tous les doigts soient levés
    const color = teamsMode ? null : nextColor([...fingers.values()].map((f) => f.color));
    const el = createCircle(color);
    el.dataset.pointerId = String(event.pointerId);
    place(el, event.clientX, event.clientY);
    layer.append(el);
    fingers.set(event.pointerId, { el, color });
    try { overlay.setPointerCapture?.(event.pointerId); } catch { /* pointeur déjà relâché */ }
    restartCountdown();
  }

  function onMove(event) {
    const finger = fingers.get(event.pointerId);
    if (!finger) return;
    event.preventDefault();
    place(finger.el, event.clientX, event.clientY);
  }

  /** Doigt levé ou annulé (pointercancel : limite de doigts du téléphone, geste système). */
  function onUp(event) {
    const finger = fingers.get(event.pointerId);
    if (!finger) return;
    if (phase === "result") {
      fingers.delete(event.pointerId);
      if (fingers.size === 0) resetRound();
      return;
    }
    finger.el.remove();
    fingers.delete(event.pointerId);
    restartCountdown();
  }

  const prevent = (event) => event.preventDefault();
  overlay.addEventListener("pointerdown", onDown);
  overlay.addEventListener("pointermove", onMove);
  overlay.addEventListener("pointerup", onUp);
  overlay.addEventListener("pointercancel", onUp);
  overlay.addEventListener("lostpointercapture", onUp);
  overlay.addEventListener("contextmenu", prevent);
  overlay.addEventListener("selectstart", prevent);
  overlay.addEventListener("touchmove", prevent, { passive: false }); // ni défilement ni zoom

  // --- Fermeture : « × » ou retour du téléphone --------------------------------------
  const hash = () => win.location.hash;
  let pushed = false;
  if (hash().startsWith("#/settings")) {
    win.location.hash = hash() + PLAY_SUFFIX; // entrée d'historique : le retour ferme la couche
    pushed = true;
  }

  function onHashChange() {
    if (!hash().endsWith(PLAY_SUFFIX)) close({ fromHistory: true });
  }
  function onKeydown(event) {
    if (event.key === "Escape") closeButton.click();
  }

  function close({ fromHistory = false } = {}) {
    if (closed) return;
    closed = true;
    if (timerId !== null) clearT(timerId);
    win.removeEventListener("hashchange", onHashChange);
    doc.removeEventListener("keydown", onKeydown);
    doc.documentElement.classList.remove("chooser-active");
    overlay.remove();
    if (pushed && !fromHistory) win.history.back();
    onClose();
  }

  closeButton.addEventListener("click", () => close());
  replayButton.addEventListener("click", () => resetRound());
  win.addEventListener("hashchange", onHashChange);
  doc.addEventListener("keydown", onKeydown);

  doc.documentElement.classList.add("chooser-active");
  container.append(overlay);
  overlay.focus?.({ preventScroll: true });
  return { overlay, close };
}
