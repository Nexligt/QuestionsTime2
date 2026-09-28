/* Mini-application « Sablier » : temps restant (pauses), fin, bornes, mémorisation. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import {
  TIMER_STATUS, clampDuration, createTimer, formatTime, isFinished, loadTimerSettings,
  pauseTimer, remainingMs, resumeTimer, startTimer,
} from "../js/features/miniApps/timer/timer.js";
import { buildTimerApp } from "../js/features/miniApps/timer/timerView.js";

beforeEach(async () => {
  await resetDatabase();
  window.matchMedia = (q) => ({ matches: q.includes("reduce") });
});

test("temps restant calculé depuis l'heure de départ, pauses déduites", () => {
  let t = createTimer(60);
  assert.equal(remainingMs(t, 1000), 60000); // pas démarré
  t = startTimer(t, 1000);
  assert.equal(remainingMs(t, 11000), 50000);
  t = pauseTimer(t, 21000);
  assert.equal(remainingMs(t, 21000), 40000);
  assert.equal(remainingMs(t, 999999), 40000); // en pause : rien ne bouge
  t = resumeTimer(t, 100000);
  assert.equal(remainingMs(t, 130000), 10000);
  assert.equal(isFinished(t, 139999), false);
  assert.equal(isFinished(t, 140000), true);
  assert.equal(remainingMs(t, 500000), 0); // jamais négatif (veille prolongée)
  assert.equal(formatTime(60000), "01:00");
  assert.equal(formatTime(59001), "01:00");
  assert.equal(formatTime(90000), "01:30");
  assert.equal(formatTime(0), "00:00");
});

test("bornes du réglage libre : 10 s à 30 min", () => {
  assert.equal(clampDuration(5), 10);
  assert.equal(clampDuration(10), 10);
  assert.equal(clampDuration(1800), 1800);
  assert.equal(clampDuration(4000), 1800);
  assert.equal(clampDuration("95"), 95);
  assert.equal(clampDuration("abc"), 60);
});

function fakeClock() {
  const clock = { t: 0, fn: null };
  clock.deps = { now: () => clock.t, setInterval: (fn) => { clock.fn = fn; return 1; }, clearInterval: () => { clock.fn = null; } };
  clock.advance = (ms) => { clock.t += ms; clock.fn?.(); };
  return clock;
}

test("fin du décompte : 00:00, vibration, état terminé ; pause et reprise dans l'interface", async () => {
  const vibrations = [];
  Object.defineProperty(window.navigator, "vibrate", { value: (p) => vibrations.push(p), configurable: true });
  const clock = fakeClock();
  const v = await mount(() => buildTimerApp("t", clock.deps), (x) => x.dataset.ready === "true");
  v.querySelector('.timer-app__presets input[value="30"]').click();
  v.querySelector(".timer-app__start").click();
  assert.equal(v.dataset.status, TIMER_STATUS.RUNNING);
  clock.advance(10000);
  assert.equal(v.querySelector(".timer-app__time").textContent, "00:20");
  v.querySelector(".timer-app__pause").click(); // pause
  assert.equal(v.querySelector(".timer-app__pause").textContent, "Reprendre");
  clock.t += 60000; // longue pause
  assert.equal(v.querySelector(".timer-app__time").textContent, "00:20");
  v.querySelector(".timer-app__pause").click(); // reprise
  clock.advance(19000);
  assert.equal(v.querySelector(".timer-app__time").textContent, "00:01");
  clock.advance(1000);
  assert.equal(v.dataset.status, TIMER_STATUS.DONE);
  assert.equal(v.querySelector(".timer-app__time").textContent, "00:00");
  assert.ok(v.classList.contains("timer-app--done"));
  assert.match(v.querySelector(".timer-app__end").textContent, /Temps écoulé/);
  assert.equal(vibrations.length, 1);
  assert.equal(v.querySelector(".timer-app__bar").getAttribute("aria-valuenow"), "100");

  v.querySelector(".timer-app__reset").click();
  assert.equal(v.dataset.status, TIMER_STATUS.IDLE);
  assert.equal(v.querySelector(".timer-app__time").textContent, "00:30");
});

test("mémorisation de la durée (rapide ou libre) et du son", async () => {
  let v = await mount(() => buildTimerApp("t"), (x) => x.dataset.ready === "true");
  v.querySelector('.timer-app__presets input[value="180"]').click();
  v.querySelector(".timer-app__sound").click();
  await waitFor(() => Number(v.dataset.saves) >= 2);
  assert.deepEqual(await loadTimerSettings(), { duration: 180, sound: false });

  const minutes = v.querySelector(".timer-app__minutes");
  minutes.value = "45"; // au-delà de 30 min : borné
  minutes.dispatchEvent(new window.Event("change", { bubbles: true }));
  await waitFor(() => Number(v.dataset.saves) >= 3);
  assert.equal((await loadTimerSettings()).duration, 1800);

  v = await mount(() => buildTimerApp("t"), (x) => x.dataset.ready === "true");
  assert.equal(v.querySelector(".timer-app__time").textContent, "30:00");
  assert.equal(v.querySelector(".timer-app__minutes").value, "30");
  assert.equal(v.querySelector(".timer-app__sound").checked, false);
  assert.equal(v.querySelector(".timer-app__presets input:checked"), null);
});
