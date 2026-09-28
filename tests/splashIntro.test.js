/* Splash animé (js/ui/splashIntro.js) : logique testée avec un animateur simulé. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./helpers.js";
import {
  SPLASH_TIMINGS, SPLASH_MOTION, computeFlipTransform, buildSplashTimeline, startSplashIntro,
} from "../js/ui/splashIntro.js";

const SPLASH_RECT = { left: 40, top: 380, width: 310, height: 60 };
const TARGET_RECT = { left: 110, top: 32, width: 170, height: 33 };

/** Animateur simulé : enregistre chaque appel ; `hold` retarde la fin d'une phase. */
function createFakeAnimator({ hold = () => false } = {}) {
  const calls = [];
  const pending = [];
  const animate = (element, keyframes, options) => {
    let resolve;
    const finished = new Promise((r) => { resolve = r; });
    const call = { element, keyframes, options, cancelled: false, resolve };
    calls.push(call);
    if (options.iterations === Infinity || hold(call)) pending.push(call);
    else queueMicrotask(resolve);
    return { finished, cancel() { call.cancelled = true; resolve(); }, pause() {} };
  };
  return { animate, calls, pending };
}

function setup({ reducedMotion = false, animate, targetHtml = "QuestionsTime2" } = {}) {
  document.body.innerHTML =
    `<main id="view-root"><div class="view--main"><header class="main-header"><h1 id="img-titre" class="app-title">${targetHtml}</h1></header></div></main>`;
  document.documentElement.className = "";
  const target = document.getElementById("img-titre");
  target.getBoundingClientRect = () => ({ ...TARGET_RECT });
  const controller = startSplashIntro({ animate, reducedMotion });
  controller.overlay.querySelector("#img-titre-splash").getBoundingClientRect = () => ({ ...SPLASH_RECT });
  return { controller, target };
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const moverCalls = (calls, overlay) => calls.filter((c) => c.element === overlay.querySelector(".splash-intro__title"));
const hasKey = (call, key) => call.keyframes.some((k) => key in k);

beforeEach(() => {
  document.documentElement.className = "";
});

test("réglages regroupés : durées et amplitudes du plan", () => {
  assert.deepEqual(
    { ...SPLASH_TIMINGS },
    { appear: 400, floatCycle: 3200, stop: 150, spin: 900, back: 250, flight: 650, reducedFlight: 300, hintFade: 150, readyTimeout: 1500 }
  );
  assert.equal(SPLASH_MOTION.spinDegrees, 720);
  assert.ok(SPLASH_MOTION.pressScale < 1);
});

test("computeFlipTransform : centres alignés et facteur de taille exacts", () => {
  const t = computeFlipTransform(SPLASH_RECT, TARGET_RECT);
  assert.equal(t.dx, (110 + 85) - (40 + 155));
  assert.equal(t.dy, (32 + 16.5) - (380 + 30));
  assert.equal(t.scale, 170 / 310);
  // La boîte transformée (origine au centre) coïncide avec la cible.
  const cx = 40 + 155 + t.dx;
  const w = 310 * t.scale;
  assert.ok(Math.abs(cx - w / 2 - TARGET_RECT.left) < 1e-9);
  assert.deepEqual(computeFlipTransform({ left: 0, top: 0, width: 100, height: 20 }, { left: 0, top: 0, width: 100, height: 20 }), { dx: 0, dy: 0, scale: 1 });
});

test("buildSplashTimeline : ordre des phases, version réduite courte et sans rotation", () => {
  assert.deepEqual(buildSplashTimeline().map((p) => [p.name, p.duration]), [
    ["stop", 150], ["spin", 900], ["back", 250], ["flight", 650],
  ]);
  assert.deepEqual(buildSplashTimeline({ reducedMotion: true }), [{ name: "flight", duration: 300 }]);
});

test("mise en place : couche au-dessus, vrai titre caché, défilement bloqué, flottement lancé", async () => {
  const { animate, calls } = createFakeAnimator();
  const { controller, target } = setup({ animate });
  assert.ok(document.body.contains(controller.overlay));
  assert.equal(target.style.visibility, "hidden");
  assert.ok(document.documentElement.classList.contains("splash-active"));
  assert.equal(document.activeElement, controller.overlay);
  assert.equal(controller.overlay.querySelector("#img-titre-splash").textContent, "QuestionsTime2");
  await tick(10);
  assert.equal(controller.overlay.dataset.phase, "float");
  const floats = calls.filter((c) => c.options.iterations === Infinity);
  assert.deepEqual(floats.map((c) => Object.keys(c.keyframes[0])[0]).sort(), ["rotate", "scale", "translate"]);
  assert.ok(floats.every((c) => c.options.direction === "alternate"));
  controller.skip();
});

test("séquence au toucher : arrêt -> 720° + enfoncement -> retour -> envol exact -> échange", async () => {
  const { animate, calls } = createFakeAnimator();
  const { controller, target } = setup({ animate });
  const landed = [];
  document.addEventListener("splash-intro:landed", (e) => landed.push(e.detail), { once: true });
  await tick(10);
  const phases = [];
  new window.MutationObserver(() => phases.push(controller.overlay.dataset.phase))
    .observe(controller.overlay, { attributes: true, attributeFilter: ["data-phase"] });

  controller.overlay.click();
  await controller.done;
  assert.deepEqual(phases, ["stop", "spin", "back", "flight", "done"]);

  const mover = moverCalls(calls, controller.overlay);
  assert.ok(calls.filter((c) => c.options.iterations === Infinity).every((c) => c.cancelled)); // flottement arrêté
  const spin = mover.find((c) => c.options.duration === 900);
  assert.equal(spin.keyframes.at(-1).rotate, "720deg");
  assert.equal(spin.keyframes.at(-1).scale, String(SPLASH_MOTION.pressScale));
  const flight = mover.find((c) => c.options.duration === 650);
  const { dx, dy, scale } = computeFlipTransform(SPLASH_RECT, TARGET_RECT);
  assert.equal(flight.keyframes.at(-1).translate, `${dx}px ${dy}px`);
  assert.equal(flight.keyframes.at(-1).scale, String(scale));

  // Ombre / assombrissement : seulement l'opacité ; jamais box-shadow ni filter.
  for (const call of calls) {
    for (const k of call.keyframes) {
      assert.ok(!("filter" in k) && !("boxShadow" in k) && !("transform" in k));
    }
  }
  const shadeCall = calls.find((c) => c.element.classList.contains("splash-intro__shade"));
  assert.deepEqual(Object.keys(shadeCall.keyframes[1]), ["opacity"]);

  // Échange : couche retirée, vrai titre visible et focalisé, défilement débloqué.
  assert.equal(document.querySelector(".splash-intro"), null);
  assert.equal(target.style.visibility, "");
  assert.equal(document.activeElement, target);
  assert.ok(!document.documentElement.classList.contains("splash-active"));
  assert.equal(landed.length, 1);
});

test("double toucher, Entrée et Espace : une seule séquence", async () => {
  for (const key of [null, "Enter", " "]) {
    const { animate, calls } = createFakeAnimator();
    const { controller } = setup({ animate });
    await tick(10);
    if (key) controller.overlay.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
    else controller.overlay.click();
    controller.overlay.click();
    controller.overlay.click();
    await controller.done;
    const spins = moverCalls(calls, controller.overlay).filter((c) => c.options.duration === 900);
    assert.equal(spins.length, 1, String(key));
  }
});

test("Échap pendant l'animation : fin immédiate, phases suivantes jamais jouées", async () => {
  const { animate, calls } = createFakeAnimator({ hold: (c) => c.options.duration === 900 });
  const { controller, target } = setup({ animate });
  await tick(10);
  controller.overlay.click();
  await tick(10);
  assert.equal(controller.overlay.dataset.phase, "spin");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  await controller.done;
  await tick(10);
  assert.equal(document.querySelector(".splash-intro"), null);
  assert.equal(target.style.visibility, "");
  assert.ok(!calls.some((c) => c.options.duration === 650)); // pas d'envol
  assert.ok(calls.filter((c) => c.options.duration === 900).every((c) => c.cancelled));
});

test("redimensionnement pendant l'envol : fin immédiate à la position finale", async () => {
  const { animate } = createFakeAnimator({ hold: (c) => c.options.duration === 650 });
  const { controller, target } = setup({ animate });
  await tick(10);
  controller.overlay.click();
  await waitPhase(controller, "flight");
  window.dispatchEvent(new window.Event("resize"));
  await controller.done;
  assert.equal(document.querySelector(".splash-intro"), null);
  assert.equal(target.style.visibility, "");
});

test("redimensionnement avant l'envol : sans effet, la cible est mesurée au début de l'envol", async () => {
  const { animate } = createFakeAnimator({ hold: (c) => c.options.duration === 900 });
  const { controller } = setup({ animate });
  await tick(10);
  controller.overlay.click();
  await waitPhase(controller, "spin");
  window.dispatchEvent(new window.Event("resize"));
  await tick(5);
  assert.ok(document.body.contains(controller.overlay));
  controller.skip();
});

test("mouvement réduit : pas de flottement, un seul envol court sans rotation", async () => {
  const { animate, calls } = createFakeAnimator();
  const { controller } = setup({ animate, reducedMotion: true });
  await tick(10);
  assert.ok(!calls.some((c) => c.options.iterations === Infinity));
  controller.overlay.click();
  await controller.done;
  const mover = moverCalls(calls, controller.overlay).filter((c) => hasKey(c, "translate"));
  assert.equal(mover.length, 1);
  assert.equal(mover[0].options.duration, 300);
  assert.ok(calls.every((c) => c.keyframes.every((k) => !k.rotate || k.rotate === "0deg")));
  assert.ok(!calls.some((c) => c.options.duration === 900));
});

test("animations indisponibles (animate absent) : Splash statique puis entrée directe", async () => {
  const { controller, target } = setup({ animate: () => { throw new TypeError("animate non supporté"); } });
  await tick(10);
  assert.equal(controller.overlay.dataset.phase, "static");
  controller.overlay.click();
  await controller.done;
  assert.equal(document.querySelector(".splash-intro"), null);
  assert.equal(target.style.visibility, "");
});

test("titre image (future img_Titre SVG) : cloné tel quel, décodage attendu avant le flottement", async () => {
  let decoded = false;
  const realDecode = window.HTMLImageElement.prototype.decode;
  window.HTMLImageElement.prototype.decode = () => new Promise((r) => setTimeout(() => { decoded = true; r(); }, 20));
  try {
    const { animate, calls } = createFakeAnimator();
    const { controller } = setup({ animate, targetHtml: '<img src="assets/img_Titre.svg" alt="QuestionsTime2">' });
    const img = controller.overlay.querySelector("#img-titre-splash img");
    assert.equal(img.getAttribute("src"), "assets/img_Titre.svg");
    assert.equal(img.getAttribute("alt"), "QuestionsTime2");
    await tick(5);
    assert.equal(calls.length, 0); // attend le décodage
    await tick(40);
    assert.ok(decoded);
    assert.ok(calls.some((c) => c.options.iterations === Infinity));
    controller.skip();
  } finally {
    window.HTMLImageElement.prototype.decode = realDecode;
  }
});

test("CSS : mêmes règles de mise en forme pour les deux titres, une seule ligne ; défilement bloqué", () => {
  const css = readFileSync(new URL("../css/layout.css", import.meta.url), "utf-8");
  const shared = /\.splash__title,\s*\.main-header \.app-title\s*\{([^}]*)\}/.exec(css);
  assert.ok(shared, "règle commune");
  for (const decl of ["white-space: nowrap", "font-family: var(--font-display)", "font-weight: 700", "letter-spacing: normal", "line-height: 1.15", "width: fit-content"]) {
    assert.ok(shared[1].includes(decl), decl);
  }
  assert.match(css, /html\.splash-active \.view-root\s*\{[^}]*overflow: hidden/);
  assert.match(css, /\.splash-intro\s*\{[^}]*position: fixed;[^}]*inset: 0/);
  const source = readFileSync(new URL("../js/ui/splashIntro.js", import.meta.url), "utf-8");
  assert.ok(!/boxShadow|["']?filter["']?\s*:/.test(source.replace(/filter: brightness\(0\)/g, "")));
});

test("manifest : start_url sans #/main (Splash affiché au lancement de l'app installée)", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf-8"));
  assert.ok(!manifest.start_url.includes("#"));
});

async function waitPhase(controller, name) {
  const start = Date.now();
  while (controller.overlay.dataset.phase !== name) {
    if (Date.now() - start > 2000) throw new Error(`phase ${name} jamais atteinte`);
    await tick(2);
  }
}
