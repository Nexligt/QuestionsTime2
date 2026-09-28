/*
  timerView.js
  Mini-application « Sablier » : durées rapides + réglage libre, sablier
  SVG (ou barre de progression si « Réduire les animations »), temps
  restant en grand, Démarrer / Pause-Reprendre / Réinitialiser.
  Écran maintenu allumé (Wake Lock) pendant le décompte si possible ;
  à la fin : vibration, effet visuel, bip court (réglage « Son »).
*/

import {
  TIMER_LIMITS,
  TIMER_PRESETS,
  TIMER_STATUS,
  clampDuration,
  createTimer,
  elapsedMs,
  formatTime,
  isFinished,
  loadTimerSettings,
  pauseTimer,
  remainingMs,
  resetTimer,
  resumeTimer,
  saveTimerDuration,
  saveTimerSound,
  startTimer,
} from "./timer.js";
import { prefersReducedMotion } from "../dice/diceRollOverlay.js";

const SVG_NS = "http://www.w3.org/2000/svg";
/** Verre du sablier (viewBox 0 0 100 160) : bulbe haut 20→80, bulbe bas 80→140. */
const GLASS = "M22 18 H78 C78 48 57 66 52 80 C57 94 78 112 78 142 H22 C22 112 43 94 48 80 C43 66 22 48 22 18 Z";
const TOP = { from: 22, to: 78 };
const BOTTOM = { from: 82, to: 140 };
const FLIP_MS = 600;
const TICK_MS = 200;

function presetLabel(seconds) {
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
}

function svgEl(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

let timerCounter = 0;

/** Sablier SVG ; `update(fraction écoulée, en cours ?)` déplace le sable. */
function createHourglass(uid) {
  const svg = svgEl("svg", { viewBox: "0 0 100 160", class: "hourglass", "aria-hidden": "true", focusable: "false" });
  const defs = svgEl("defs", {});
  const clip = svgEl("clipPath", { id: `hourglass-glass-${uid}` });
  clip.append(svgEl("path", { d: GLASS }));
  defs.append(clip);
  const sand = svgEl("g", { "clip-path": `url(#hourglass-glass-${uid})` });
  const top = svgEl("rect", { class: "hourglass__sand", x: 0, width: 100 });
  const bottom = svgEl("rect", { class: "hourglass__sand", x: 0, width: 100 });
  const stream = svgEl("line", { class: "hourglass__stream", x1: 50, x2: 50, y1: 78, y2: 140 });
  sand.append(top, bottom, stream);
  svg.append(
    defs,
    sand,
    svgEl("path", { class: "hourglass__glass", d: GLASS }),
    svgEl("rect", { class: "hourglass__frame", x: 14, y: 10, width: 72, height: 8, rx: 3 }),
    svgEl("rect", { class: "hourglass__frame", x: 14, y: 142, width: 72, height: 8, rx: 3 }),
  );
  function update(fraction, running) {
    const f = Math.min(1, Math.max(0, fraction));
    const topY = TOP.from + f * (TOP.to - TOP.from);
    top.setAttribute("y", topY.toFixed(2));
    top.setAttribute("height", Math.max(0, 80 - topY).toFixed(2));
    const bottomHeight = f * (BOTTOM.to - BOTTOM.from);
    bottom.setAttribute("y", (BOTTOM.to - bottomHeight).toFixed(2));
    bottom.setAttribute("height", bottomHeight.toFixed(2));
    stream.setAttribute("y2", (BOTTOM.to - bottomHeight).toFixed(2));
    stream.style.visibility = running && f < 1 ? "visible" : "hidden";
  }
  return { svg, update };
}

/**
 * @param {string} labelledBy - id du titre.
 * @param {{ now?: () => number, setInterval?: Function, clearInterval?: Function }} [deps] - injectables (tests).
 * @returns {HTMLElement}
 */
export function buildTimerApp(labelledBy, deps = {}) {
  const uid = ++timerCounter;
  const win = globalThis.window;
  const now = deps.now ?? (() => Date.now());
  const setTick = deps.setInterval ?? ((fn, ms) => win.setInterval(fn, ms));
  const clearTick = deps.clearInterval ?? ((id) => win.clearInterval(id));

  const root = document.createElement("div");
  root.className = "timer-app";
  root.setAttribute("aria-labelledby", labelledBy);
  root.dataset.ready = "false";
  root.dataset.saves = "0";

  // --- Durée ---------------------------------------------------------------
  const presetsLabel = document.createElement("p");
  presetsLabel.className = "settings-choice__label";
  presetsLabel.id = `timer-presets-${uid}`;
  presetsLabel.textContent = "Durée";
  const presets = document.createElement("div");
  presets.className = "settings-choices settings-segmented timer-app__presets";
  presets.setAttribute("role", "radiogroup");
  presets.setAttribute("aria-labelledby", presetsLabel.id);
  for (const seconds of TIMER_PRESETS) {
    const label = document.createElement("label");
    label.className = "settings-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = `timer-preset-${uid}`;
    input.value = String(seconds);
    input.className = "settings-choice__input";
    const text = document.createElement("span");
    text.className = "settings-choice__text";
    const name = document.createElement("span");
    name.className = "settings-choice__label";
    name.textContent = presetLabel(seconds);
    text.append(name);
    label.append(input, text);
    presets.append(label);
  }
  const custom = document.createElement("div");
  custom.className = "timer-app__custom";
  const customLabel = document.createElement("span");
  customLabel.className = "timer-app__custom-label";
  customLabel.textContent = "Autre (10 s à 30 min)";
  const minutesInput = document.createElement("input");
  const secondsInput = document.createElement("input");
  for (const [input, label, max] of [[minutesInput, "Minutes", 30], [secondsInput, "Secondes", 59]]) {
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.max = String(max);
    input.step = "1";
    input.className = "settings-number__input timer-app__custom-input";
    input.setAttribute("aria-label", label);
  }
  minutesInput.classList.add("timer-app__minutes");
  secondsInput.classList.add("timer-app__seconds");
  const colon = document.createElement("span");
  colon.textContent = ":";
  colon.setAttribute("aria-hidden", "true");
  custom.append(customLabel, minutesInput, colon, secondsInput);

  // --- Affichage --------------------------------------------------------------
  const visual = document.createElement("div");
  visual.className = "timer-app__visual";
  const flipper = document.createElement("div");
  flipper.className = "timer-app__flipper";
  const hourglass = createHourglass(uid);
  flipper.append(hourglass.svg);
  const bar = document.createElement("div");
  bar.className = "timer-app__bar";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Temps écoulé");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  const barFill = document.createElement("div");
  barFill.className = "timer-app__bar-fill";
  bar.append(barFill);
  visual.append(flipper, bar);

  const display = document.createElement("p");
  display.className = "timer-app__time";
  display.setAttribute("role", "timer");
  display.setAttribute("aria-live", "off");
  const endMessage = document.createElement("p");
  endMessage.className = "timer-app__end";
  endMessage.setAttribute("role", "status");

  // --- Boutons ------------------------------------------------------------------
  const controls = document.createElement("div");
  controls.className = "timer-app__controls";
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "button timer-app__start";
  startButton.textContent = "Démarrer";
  const pauseButton = document.createElement("button");
  pauseButton.type = "button";
  pauseButton.className = "button button--secondary timer-app__pause";
  pauseButton.textContent = "Pause";
  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "button button--secondary timer-app__reset";
  resetButton.textContent = "Réinitialiser";
  controls.append(startButton, pauseButton, resetButton);

  const soundLabel = document.createElement("label");
  soundLabel.className = "settings-choice";
  const soundInput = document.createElement("input");
  soundInput.type = "checkbox";
  soundInput.className = "settings-choice__input timer-app__sound";
  const soundText = document.createElement("span");
  soundText.className = "settings-choice__text";
  const soundName = document.createElement("span");
  soundName.className = "settings-choice__label";
  soundName.textContent = "Son";
  const soundDescription = document.createElement("span");
  soundDescription.className = "settings-choice__description";
  soundDescription.textContent = "Bip court à la fin du décompte.";
  soundText.append(soundName, soundDescription);
  soundLabel.append(soundInput, soundText);

  root.append(visual, display, endMessage, controls, presetsLabel, presets, custom, soundLabel);

  // --- État -----------------------------------------------------------------------
  let duration = TIMER_LIMITS.default;
  let timer = createTimer(duration);
  let tickId = null;
  let runs = 0; // décomptes déjà lancés : au redémarrage, le sablier se retourne
  let flipping = false;
  let wakeLock = null;

  function track(promise) {
    promise
      .then(() => { root.dataset.saves = String(Number(root.dataset.saves) + 1); })
      .catch((error) => console.error("[timer] Réglage non enregistré :", error));
  }

  const reduced = () => prefersReducedMotion(root.ownerDocument.defaultView);

  function render() {
    const t = now();
    const fraction = timer.durationMs ? elapsedMs(timer, t) / timer.durationMs : 0;
    display.textContent = formatTime(remainingMs(timer, t));
    root.dataset.status = timer.status;
    root.dataset.remaining = String(remainingMs(timer, t));
    root.classList.toggle("timer-app--reduced", reduced());
    root.classList.toggle("timer-app--done", timer.status === TIMER_STATUS.DONE);
    if (!flipping) hourglass.update(fraction, timer.status === TIMER_STATUS.RUNNING);
    barFill.style.width = `${(fraction * 100).toFixed(2)}%`;
    bar.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));

    const busy = timer.status === TIMER_STATUS.RUNNING || timer.status === TIMER_STATUS.PAUSED || flipping;
    startButton.hidden = busy;
    pauseButton.hidden = !busy || flipping;
    pauseButton.textContent = timer.status === TIMER_STATUS.PAUSED ? "Reprendre" : "Pause";
    resetButton.disabled = timer.status === TIMER_STATUS.IDLE && !flipping;
    for (const input of [...presets.querySelectorAll("input"), minutesInput, secondsInput]) input.disabled = busy;
  }

  function renderDuration() {
    for (const input of presets.querySelectorAll("input")) input.checked = Number(input.value) === duration;
    minutesInput.value = String(Math.floor(duration / 60));
    secondsInput.value = String(duration % 60);
  }

  // --- Écran allumé (Wake Lock), sans erreur si indisponible -----------------------
  async function keepAwake() {
    try {
      const nav = win?.navigator;
      if (!wakeLock && nav?.wakeLock?.request) wakeLock = await nav.wakeLock.request("screen");
      wakeLock?.addEventListener?.("release", () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }
  function releaseWake() {
    const lock = wakeLock;
    wakeLock = null;
    lock?.release?.().catch?.(() => {});
  }
  // Le verrou est relâché quand la page passe en arrière-plan : on le reprend au retour.
  root.ownerDocument.addEventListener("visibilitychange", () => {
    if (root.ownerDocument.visibilityState === "visible" && timer.status === TIMER_STATUS.RUNNING) {
      keepAwake();
      tick();
    }
  });

  // --- Fin : vibration, effet visuel, bip ----------------------------------------------
  function beep() {
    const Ctx = win?.AudioContext ?? win?.webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      osc.onended = () => ctx.close?.();
    } catch {
      /* son indisponible : rien */
    }
  }

  function finish() {
    timer = { ...timer, status: TIMER_STATUS.DONE };
    stopTicking();
    releaseWake();
    endMessage.textContent = "Temps écoulé !";
    try { win?.navigator?.vibrate?.([200, 100, 200]); } catch { /* non pris en charge */ }
    if (soundInput.checked) beep();
    root.dataset.finished = String(Number(root.dataset.finished ?? 0) + 1);
    render();
  }

  function tick() {
    if (isFinished(timer, now())) finish();
    else render();
  }
  function startTicking() {
    if (tickId === null) tickId = setTick(tick, TICK_MS);
  }
  function stopTicking() {
    if (tickId !== null) clearTick(tickId);
    tickId = null;
  }

  // --- Actions -----------------------------------------------------------------------
  function begin() {
    timer = startTimer(resetTimer(timer, duration), now());
    runs += 1;
    endMessage.textContent = "";
    keepAwake();
    startTicking();
    render();
  }

  async function start() {
    if (timer.status === TIMER_STATUS.RUNNING || timer.status === TIMER_STATUS.PAUSED || flipping) return;
    const shouldFlip = runs > 0 && !reduced() && typeof flipper.animate === "function";
    if (!shouldFlip) { begin(); return; }
    // Redémarrage : le sablier (sable en bas) se retourne, puis le décompte part.
    flipping = true;
    hourglass.update(1, false);
    render();
    const animation = flipper.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(180deg)" }],
      { duration: FLIP_MS, easing: "ease-in-out" }
    );
    await Promise.resolve(animation.finished).catch(() => {});
    animation.cancel?.();
    flipping = false;
    hourglass.update(0, true);
    begin();
  }

  startButton.addEventListener("click", start);
  pauseButton.addEventListener("click", () => {
    if (timer.status === TIMER_STATUS.RUNNING) {
      timer = pauseTimer(timer, now());
      stopTicking();
      releaseWake();
    } else if (timer.status === TIMER_STATUS.PAUSED) {
      timer = resumeTimer(timer, now());
      keepAwake();
      startTicking();
    }
    render();
  });
  resetButton.addEventListener("click", () => {
    stopTicking();
    releaseWake();
    timer = resetTimer(timer, duration);
    endMessage.textContent = "";
    render();
  });

  function setDuration(seconds) {
    duration = clampDuration(seconds);
    timer = resetTimer(timer, duration);
    track(saveTimerDuration(duration));
    renderDuration();
    render();
  }
  presets.addEventListener("change", (event) => setDuration(Number(event.target.value)));
  for (const input of [minutesInput, secondsInput]) {
    input.addEventListener("change", () => {
      const total = (Number(minutesInput.value) || 0) * 60 + (Number(secondsInput.value) || 0);
      setDuration(total);
    });
  }
  soundInput.addEventListener("change", () => track(saveTimerSound(soundInput.checked)));

  render();
  loadTimerSettings()
    .catch((error) => {
      console.error("[timer] Réglages non lus :", error);
      return { duration: TIMER_LIMITS.default, sound: true };
    })
    .then((settings) => {
      duration = settings.duration;
      soundInput.checked = settings.sound;
      timer = createTimer(duration);
      renderDuration();
      render();
      root.dataset.ready = "true";
    });

  return root;
}
