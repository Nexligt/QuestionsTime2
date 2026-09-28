/* Splash dans l'application réelle : uniquement au lancement, jamais via « Accueil » ou retour. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { waitFor, mainIsReady } from "./helpers.js";

const root = () => document.getElementById("view-root");
const navButton = (view) => document.querySelector(`.nav-item[data-view="${view}"]`);
const overlay = () => document.querySelector(".splash-intro");

before(async () => {
  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false });
  assert.equal(window.location.hash, "");
  await import("../js/app.js");
  await waitFor(() => document.querySelectorAll(".nav-item").length === 4);
});

test("lancement (adresse sans vue) : Splash affiché au-dessus de Main déjà rendu", async () => {
  await waitFor(() => overlay());
  assert.ok(root().querySelector(".view--main")); // Main dessous, mesurable
  const mainTitle = document.getElementById("img-titre");
  assert.equal(mainTitle.style.visibility, "hidden");
  assert.equal(document.querySelectorAll("#img-titre").length, 1); // ids uniques
  assert.ok(document.getElementById("img-titre-splash"));
  assert.ok(document.documentElement.classList.contains("splash-active"));
  assert.equal(window.location.hash, ""); // aucune entrée d'historique créée
});

test("toucher : entrée dans l'application (sans Web Animations dans jsdom : entrée directe)", async () => {
  overlay().click();
  await waitFor(() => !overlay());
  assert.equal(document.getElementById("img-titre").style.visibility, "");
  assert.ok(!document.documentElement.classList.contains("splash-active"));
  await waitFor(() => mainIsReady(root()));
});

test("« Accueil » depuis une autre vue ne réaffiche jamais le Splash", async () => {
  navButton("settings").click();
  await waitFor(() => root().querySelector(".view--settings"));
  navButton("main").click();
  await waitFor(() => root().querySelector(".view--main"));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(overlay(), null);
});

test("retour à l'adresse sans vue (bouton retour) : Main, pas de Splash", async () => {
  window.location.hash = "";
  await waitFor(() => root().querySelector(".view--main"));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(overlay(), null);
  assert.equal(root().querySelector(".splash"), null);
});

test("#/splash n'est plus une vue : redirigé vers Main sans Splash", async () => {
  window.location.hash = "#/splash";
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(overlay(), null);
  assert.ok(/Vue introuvable/.test(root().textContent) || root().querySelector('#img-titre img[alt="QuestionsTime2"]'));
});
