/* Mises à jour de l'application (service worker) : détection, application, rechargement unique. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./helpers.js";
import { initUpdates, UPDATE_CHECK_INTERVAL_MS } from "../js/core/pwa.js";
import { showUpdateBanner } from "../js/ui/updateBanner.js";

function fakeWorker(state = "installed") {
  const w = new window.EventTarget();
  w.state = state;
  w.messages = [];
  w.postMessage = (m) => w.messages.push(m);
  return w;
}

function setup({ waiting = null, installing = null, controller = {}, splash = false } = {}) {
  const container = new window.EventTarget();
  container.controller = controller;
  const registration = new window.EventTarget();
  registration.waiting = waiting;
  registration.installing = installing;
  registration.updates = 0;
  registration.update = async () => { registration.updates++; };
  const doc = new window.EventTarget();
  doc.visibilityState = "visible";
  const store = new Map();
  const win = {
    navigator: { serviceWorker: container },
    document: doc,
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    location: { reloads: 0, reload() { this.reloads++; } },
  };
  const clock = { t: 1_000_000 };
  const banners = [];
  const state = { splash };
  const updates = initUpdates({
    registration,
    isSplashWaiting: () => state.splash,
    showBanner: (apply) => banners.push(apply),
    win,
    now: () => clock.t,
  });
  return { container, registration, doc, win, clock, banners, state, updates };
}

test("version en attente pendant le Splash (non touché) : appliquée directement, sans bandeau", () => {
  const worker = fakeWorker();
  const { banners } = setup({ waiting: worker, splash: true });
  assert.deepEqual(worker.messages, [{ type: "SKIP_WAITING" }]);
  assert.equal(banners.length, 0);
});

test("version en attente hors Splash : bandeau, rien d'appliqué tant qu'on ne touche pas « Mettre à jour »", () => {
  const worker = fakeWorker();
  const { banners } = setup({ waiting: worker, splash: false });
  assert.equal(banners.length, 1);
  assert.deepEqual(worker.messages, []);
  banners[0](); // « Mettre à jour »
  assert.deepEqual(worker.messages, [{ type: "SKIP_WAITING" }]);
});

test("nouvelle version trouvée plus tard (updatefound -> installed) : détectée", () => {
  const { registration, banners } = setup();
  const worker = fakeWorker("installing");
  registration.installing = worker;
  registration.dispatchEvent(new window.Event("updatefound"));
  assert.equal(banners.length, 0);
  worker.state = "installed";
  registration.waiting = worker;
  worker.dispatchEvent(new window.Event("statechange"));
  assert.equal(banners.length, 1);
});

test("première installation (aucun contrôleur) : rien n'est proposé", () => {
  const worker = fakeWorker();
  const { banners } = setup({ waiting: worker, controller: null });
  assert.equal(banners.length, 0);
  assert.deepEqual(worker.messages, []);
});

test("rechargement unique, seulement après une mise à jour demandée", () => {
  const worker = fakeWorker();
  const { container, win, banners, clock } = setup({ waiting: worker });
  container.dispatchEvent(new window.Event("controllerchange")); // pas demandé : rien
  assert.equal(win.location.reloads, 0);
  banners[0]();
  container.dispatchEvent(new window.Event("controllerchange"));
  container.dispatchEvent(new window.Event("controllerchange"));
  assert.equal(win.location.reloads, 1);
  clock.t += 1000; // protection contre les boucles (même après un rechargement)
  const again = setup({ waiting: fakeWorker() });
  again.win.sessionStorage.setItem("qt2-sw-reload-at", String(again.clock.t - 2000));
  again.banners[0]();
  again.container.dispatchEvent(new window.Event("controllerchange"));
  assert.equal(again.win.location.reloads, 0);
});

test("vérification au lancement, puis au retour au premier plan au plus toutes les 30 min", async () => {
  const { registration, doc, clock } = setup();
  assert.equal(registration.updates, 1); // au lancement
  doc.dispatchEvent(new window.Event("visibilitychange"));
  await Promise.resolve();
  assert.equal(registration.updates, 1); // trop tôt
  clock.t += UPDATE_CHECK_INTERVAL_MS + 1;
  doc.dispatchEvent(new window.Event("visibilitychange"));
  await Promise.resolve();
  assert.equal(registration.updates, 2);
});

test("bandeau : « Mettre à jour » et fermeture ; jamais de rechargement automatique", () => {
  let applied = 0;
  const banner = showUpdateBanner(() => applied++);
  assert.match(banner.textContent, /Nouvelle version disponible/);
  banner.querySelector(".update-banner__update").click();
  assert.equal(applied, 1);
  banner.querySelector(".update-banner__close").click();
  assert.equal(document.querySelector(".update-banner"), null);
});

test("service worker : attend la page (pas de skipWaiting à l'installation), jamais servi depuis un cache", () => {
  const sw = readFileSync(new URL("../service-worker.js", import.meta.url), "utf-8");
  const install = /addEventListener\("install"[\s\S]*?\n\}\);/.exec(sw)[0];
  assert.ok(!install.includes("skipWaiting"));
  assert.match(sw, /type === "SKIP_WAITING"\) self\.skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  assert.match(sw, /name\.startsWith\(CACHE_PREFIX\) && name !== CACHE_NAME/); // seuls nos caches, jamais IndexedDB
  assert.match(sw, /endsWith\("\/service-worker\.js"\)\) return;/);
  assert.ok(!/indexedDB\s*\./.test(sw)); // aucune utilisation d'IndexedDB
  const pwa = readFileSync(new URL("../js/core/pwa.js", import.meta.url), "utf-8");
  assert.match(pwa, /updateViaCache: "none"/);
});
