/* Invitation à installer (Paramètres > Infos), icônes et nettoyage. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import "./helpers.js"; // environnement DOM
import { buildInstallInvite } from "../js/features/settings/installInvite.js";
import { initInstallPrompt, getInstallState, promptInstall, isIosDevice } from "../js/core/pwa.js";

const invite = (state, prompt = async () => {}) =>
  buildInstallInvite({ getState: () => state, prompt, subscribe: () => () => {} });

test("installation possible : bouton « Installer l'application » qui ouvre la fenêtre du navigateur", async () => {
  let prompted = 0;
  const el = invite({ installed: false, canPrompt: true, ios: false }, async () => { prompted++; });
  assert.equal(el.hidden, false);
  const button = el.querySelector(".settings-install__button");
  assert.equal(button.textContent, "Installer l'application");
  button.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(prompted, 1);
});

test("iPhone : explication Partager → Sur l'écran d'accueil, pas de bouton", () => {
  const el = invite({ installed: false, canPrompt: false, ios: true });
  assert.equal(el.hidden, false);
  assert.equal(el.querySelector("button"), null);
  assert.match(el.textContent, /Partager.*Sur l'écran d'accueil/);
});

test("déjà installée ou installation impossible : rien ne s'affiche", () => {
  for (const state of [{ installed: true, canPrompt: false, ios: false }, { installed: false, canPrompt: false, ios: false }]) {
    const el = invite(state);
    assert.equal(el.hidden, true);
    assert.equal(el.children.length, 0);
  }
});

test("beforeinstallprompt mis de côté (pas de fenêtre automatique), utilisé une seule fois ; appinstalled -> installée", async () => {
  const target = new window.EventTarget();
  initInstallPrompt(target);
  assert.equal(getInstallState().canPrompt, false);
  let prompts = 0;
  const event = new window.Event("beforeinstallprompt", { cancelable: true });
  event.prompt = async () => { prompts++; };
  event.userChoice = Promise.resolve({ outcome: "accepted" });
  target.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(prompts, 0);
  assert.equal(getInstallState().canPrompt, true);
  assert.equal(await promptInstall(), "accepted");
  assert.equal(prompts, 1);
  assert.equal(getInstallState().canPrompt, false);
  assert.equal(await promptInstall(), "unavailable");
  target.dispatchEvent(new window.Event("appinstalled"));
  assert.deepEqual(getInstallState(), { installed: true, canPrompt: false, ios: false });
});

test("détection iPhone / iPad", () => {
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }), true);
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14)", maxTouchPoints: 5 }), false);
});

test("icônes PNG déclarées (manifest, apple-touch-icon) et mises en cache ; nettoyage", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf-8");
  const manifest = JSON.parse(read("manifest.webmanifest"));
  const sw = read("service-worker.js");
  const pngs = manifest.icons.filter((i) => i.type === "image/png");
  assert.deepEqual(pngs.map((i) => `${i.sizes} ${i.purpose}`).sort(), ["192x192 any", "192x192 maskable", "512x512 any", "512x512 maskable"]);
  assert.match(read("index.html"), /rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon\.png"/);
  for (const icon of [...manifest.icons.map((i) => i.src), "assets/icons/apple-touch-icon.png", "assets/icons/nav-home.svg", "assets/icons/nav-filters.svg", "assets/icons/nav-deleted.svg", "assets/icons/nav-settings.svg"]) {
    assert.ok(existsSync(new URL(`../${icon}`, import.meta.url)), icon);
    assert.ok(sw.includes(`"./${icon}"`), `cache : ${icon}`);
  }
  assert.ok(!/__qt2|exposeTemporaryDebugHelpers/.test(read("js/app.js")));
  assert.ok(!/getLocalEdits/.test(read("js/data/questionsRepository.js")));
  assert.equal(existsSync(new URL("../data/questions.base_old.json", import.meta.url)), false);
});
