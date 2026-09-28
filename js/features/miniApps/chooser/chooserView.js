/*
  chooserView.js
  Mini-application « Qui commence ? » : bouton « Commencer » qui ouvre une
  couche plein écran. Chaque doigt posé (Pointer Events, pointerId) fait
  apparaître un cercle coloré qui le suit ; dès que 2 doigts ou plus restent
  posés 3 s sans changement (anneau qui se remplit), un doigt est tiré au
  hasard. « × » ou le retour du téléphone ferment la couche.
*/

import { CHOOSER, nextColor, pickWinner } from "./chooser.js";
import { prefersReducedMotion } from "../dice/diceRollOverlay.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PLAY_SUFFIX = "/play";
const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;
const HINT_WAITING = "Posez chacun un doigt sur l'écran";
const HINT_COUNTING = "Ne bougez plus…";
const HINT_RESULT = "Levez tous les doigts pour recommencer";

/**
 * @param {string} labelledBy
 * @param {{ setTimeout?: Function, clearTimeout?: Function, random?: () => number }} [deps] - injectables (tests).
 * @returns {HTMLElement}
 */
export function buildChooserApp(labelledBy, deps = {}) {
  const root = document.createElement("div");
  root.className = "chooser-app";
  root.setAttribute("aria-labelledby", labelledBy);

  const intro = document.createElement("p");
  intro.className = "chooser-app__intro";
  intro.textContent = "Chacun pose un doigt sur l'écran : au bout de 3 secondes, l'application désigne qui commence.";
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "button chooser-app__start";
  startButton.textContent = "Commencer";
  root.append(intro, startButton);

  let game = null;
  startButton.addEventListener("click", () => {
    if (!game) game = openChooser({ ...deps, onClose: () => { game = null; startButton.focus?.(); } });
  });
  return root;
}

/**
 * Couche plein écran du jeu.
 * @returns {{ overlay: HTMLElement, close: () => void }}
 */
export function openChooser({ container = document.body, onClose = () => {}, random, ...deps } = {}) {
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
  overlay.append(layer, hint, closeButton);

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
    el.className = `chooser__circle chooser__circle--${color}`;
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
    return el;
  }

  function place(el, x, y) {
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  /** Nombre de doigts changé : l'attente recommence (ou s'arrête). */
  function restartCountdown() {
    if (timerId !== null) clearT(timerId);
    timerId = null;
    overlay.classList.remove("chooser--counting");
    if (fingers.size >= CHOOSER.minFingers) {
      void overlay.offsetWidth; // relance l'animation de l'anneau
      overlay.classList.add("chooser--counting");
      setPhase("counting", HINT_COUNTING);
      timerId = setT(choose, CHOOSER.waitMs);
    } else {
      setPhase("waiting", HINT_WAITING);
    }
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
    overlay.classList.remove("chooser--result", ...[...overlay.classList].filter((c) => c.startsWith("chooser--win-")));
    delete overlay.dataset.winner;
    delete overlay.dataset.winnerColor;
    layer.replaceChildren();
    setPhase("waiting", HINT_WAITING);
  }

  // --- Pointer Events ----------------------------------------------------------
  function onDown(event) {
    if (event.target.closest?.(".chooser__close")) return;
    event.preventDefault();
    if (phase === "result" || fingers.has(event.pointerId)) return; // attendre que tous les doigts soient levés
    const color = nextColor([...fingers.values()].map((f) => f.color));
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
  win.addEventListener("hashchange", onHashChange);
  doc.addEventListener("keydown", onKeydown);

  doc.documentElement.classList.add("chooser-active");
  container.append(overlay);
  overlay.focus?.({ preventScroll: true });
  return { overlay, close };
}
