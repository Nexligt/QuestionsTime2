/*
  timer.js
  Mini-application « Sablier » : calcul du temps à partir de l'heure de
  départ (juste même si le téléphone met la page en veille), réglages
  mémorisés dans le store `settings` existant.
*/

import { getSetting, setSetting } from "../../../data/settingsRepository.js";

export const TIMER_LIMITS = Object.freeze({ min: 10, max: 30 * 60, default: 60 }); // secondes
export const TIMER_PRESETS = Object.freeze([30, 60, 120, 180, 300]);
export const TIMER_SETTING_KEYS = Object.freeze({ duration: "timer.duration", sound: "timer.sound" });
export const TIMER_STATUS = Object.freeze({ IDLE: "idle", RUNNING: "running", PAUSED: "paused", DONE: "done" });

/** Durée (s) ramenée entre 10 s et 30 min. */
export function clampDuration(seconds) {
  const n = typeof seconds === "string" && seconds.trim() !== "" ? Number(seconds) : seconds;
  if (!Number.isFinite(n)) return TIMER_LIMITS.default;
  return Math.min(TIMER_LIMITS.max, Math.max(TIMER_LIMITS.min, Math.round(n)));
}

/** « mm:ss » (secondes arrondies au-dessus : 00:00 seulement à la fin). */
export function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* --- État du décompte (objets immuables, heure fournie) ------------------- */

export function createTimer(durationSeconds) {
  return { durationMs: clampDuration(durationSeconds) * 1000, status: TIMER_STATUS.IDLE, startedAt: null, elapsedBefore: 0 };
}

export function startTimer(timer, now) {
  return { ...timer, status: TIMER_STATUS.RUNNING, startedAt: now, elapsedBefore: 0 };
}

export function pauseTimer(timer, now) {
  if (timer.status !== TIMER_STATUS.RUNNING) return timer;
  return { ...timer, status: TIMER_STATUS.PAUSED, elapsedBefore: timer.elapsedBefore + (now - timer.startedAt), startedAt: null };
}

export function resumeTimer(timer, now) {
  if (timer.status !== TIMER_STATUS.PAUSED) return timer;
  return { ...timer, status: TIMER_STATUS.RUNNING, startedAt: now };
}

export function resetTimer(timer, durationSeconds = timer.durationMs / 1000) {
  return createTimer(durationSeconds);
}

/** Temps écoulé (ms) : pauses déduites, jamais plus que la durée. */
export function elapsedMs(timer, now) {
  const running = timer.status === TIMER_STATUS.RUNNING ? now - timer.startedAt : 0;
  if (timer.status === TIMER_STATUS.DONE) return timer.durationMs;
  return Math.min(timer.durationMs, Math.max(0, timer.elapsedBefore + running));
}

export function remainingMs(timer, now) {
  return timer.durationMs - elapsedMs(timer, now);
}

/** Décompte terminé à l'heure `now` ? */
export function isFinished(timer, now) {
  return timer.status === TIMER_STATUS.DONE || (timer.status === TIMER_STATUS.RUNNING && remainingMs(timer, now) <= 0);
}

export async function loadTimerSettings() {
  const [duration, sound] = await Promise.all([
    getSetting(TIMER_SETTING_KEYS.duration, TIMER_LIMITS.default),
    getSetting(TIMER_SETTING_KEYS.sound, true),
  ]);
  return { duration: clampDuration(duration), sound: sound !== false };
}

export const saveTimerDuration = (seconds) => setSetting(TIMER_SETTING_KEYS.duration, clampDuration(seconds));
export const saveTimerSound = (enabled) => setSetting(TIMER_SETTING_KEYS.sound, Boolean(enabled));
