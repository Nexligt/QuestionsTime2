/* Paramètres > Mini-apps : menu de tuiles, ouverture, retour (bouton et retour arrière). */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import { MINI_APPS } from "../js/features/miniApps/miniAppsRegistry.js";
import { createMiniAppsPanel } from "../js/features/miniApps/miniAppsMenu.js";
import { createSettingsView, updateSettingsView } from "../js/features/settings/settingsView.js";
import { registerView, initRouter, getSubRoute } from "../js/core/router.js";

beforeEach(async () => { await resetDatabase(); window.matchMedia = () => ({ matches: false }); });

const $ = (v, s) => v.querySelector(s);
const tiles = (v) => [...v.querySelectorAll(".miniapps-tile")];
const APP_SELECTORS = { dice: ".dice-app", wheel: ".wheel-app", coin: ".coin-app", teams: ".teams-app", timer: ".timer-app", chooser: ".chooser-app" };

test("une tuile par mini-application du registre, avec logo et nom", async () => {
  window.location.hash = "";
  const v = await mount(() => createSettingsView("miniapps"), (x) => x.querySelector(".miniapps-tile"));
  assert.equal(v.dataset.activeTab, "mini-apps");
  assert.deepEqual(tiles(v).map((t) => t.dataset.app), MINI_APPS.map((a) => a.id));
  assert.deepEqual(tiles(v).map((t) => t.querySelector(".miniapps-tile__name").textContent), MINI_APPS.map((a) => a.title));
  for (const tile of tiles(v)) {
    const svg = tile.querySelector(".miniapps-tile__logo svg");
    assert.equal(svg.getAttribute("stroke-width"), "1.8");
    assert.equal(svg.getAttribute("fill"), "none");
  }
});

test("registre seul : une nouvelle mini-application apparaît sans toucher au menu", () => {
  const extra = { id: "test", title: "Essai", icon: "<svg></svg>", build: () => Object.assign(document.createElement("p"), { className: "essai", textContent: "ok" }) };
  const panel = createMiniAppsPanel({ apps: [...MINI_APPS, extra] });
  document.body.replaceChildren(panel.root);
  assert.equal(tiles(panel.root).length, MINI_APPS.length + 1);
  panel.root.querySelector('[data-app="test"]').click();
  assert.ok(panel.root.querySelector(".miniapps-app .essai"));
});

test("toucher une tuile ouvre la bonne interface ; « ← Mini-apps » ramène au menu", async () => {
  window.location.hash = "";
  const v = await mount(() => createSettingsView("miniapps"), (x) => x.querySelector(".miniapps-tile"));
  for (const app of MINI_APPS) {
    $(v, `.miniapps-tile[data-app="${app.id}"]`).click();
    assert.equal($(v, ".miniapps-menu").hidden, true);
    assert.equal($(v, ".miniapps-app").hidden, false);
    assert.equal($(v, ".miniapps-app__title").textContent, app.title);
    assert.ok($(v, `.miniapps-app ${APP_SELECTORS[app.id]}`), app.id);
    assert.equal($(v, ".miniapps-app__back").textContent, "← Mini-apps");
    $(v, ".miniapps-app__back").click();
    assert.equal($(v, ".miniapps-menu").hidden, false);
    assert.equal($(v, ".miniapps-app").hidden, true);
  }
});

test("adresse #/settings/miniapps/<id> et retour arrière du téléphone, sans quitter les Paramètres", async () => {
  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  registerView("settings", { render: () => createSettingsView(getSubRoute()), update: updateSettingsView, showBottomNav: true });
  window.location.hash = "#/settings/miniapps";
  initRouter("settings");
  const root = () => document.getElementById("view-root");
  await waitFor(() => root().querySelector(".miniapps-tile"));
  const view = root().firstElementChild;
  assert.equal(view.dataset.activeTab, "mini-apps");

  $(view, '.miniapps-tile[data-app="dice"]').click();
  assert.equal(window.location.hash, "#/settings/miniapps/dice");
  assert.ok($(view, ".miniapps-app .dice-app"));

  window.history.back(); // bouton retour du téléphone
  await waitFor(() => window.location.hash === "#/settings/miniapps" && !$(view, ".miniapps-menu").hidden);
  assert.equal(root().firstElementChild, view); // toujours la même page Paramètres
  assert.equal(view.dataset.activeTab, "mini-apps");

  window.location.hash = "#/settings/miniapps/wheel"; // lien direct
  await waitFor(() => $(view, ".miniapps-app .wheel-app"));
  $(view, ".miniapps-app__back").click(); // ouverte par l'adresse : pas de retour d'historique
  await waitFor(() => window.location.hash === "#/settings/miniapps");
  assert.equal($(view, ".miniapps-menu").hidden, false);
});

test("onglet « Mini-apps » : retour au menu si déjà dessus ; sinon dernière mini-app ou menu", async () => {
  window.location.hash = "";
  const tab = (v, id) => $(v, `.settings-tab[data-tab="${id}"]`);
  const shown = (v) => ($(v, ".miniapps-app").hidden ? "menu" : $(v, ".miniapps-app__title").textContent);
  const v = await mount(() => createSettingsView("miniapps"), (x) => x.querySelector(".miniapps-tile"));

  $(v, '.miniapps-tile[data-app="dice"]').click();
  tab(v, "mini-apps").click(); // déjà sur Mini-apps : menu
  assert.equal(shown(v), "menu");
  tab(v, "mini-apps").click(); // menu : reste sur le menu
  assert.equal(shown(v), "menu");

  $(v, '.miniapps-tile[data-app="wheel"]').click();
  tab(v, "informations").click();
  assert.equal(v.dataset.activeTab, "informations");
  tab(v, "mini-apps").click(); // depuis Infos : dernière mini-app
  assert.equal(v.dataset.activeTab, "mini-apps");
  assert.equal(shown(v), "Roue");

  tab(v, "mini-apps").click(); // menu
  tab(v, "reglages").click();
  tab(v, "mini-apps").click(); // j'étais sur le menu : menu
  assert.equal(shown(v), "menu");

  $(v, '.miniapps-tile[data-app="coin"]').click();
  const again = await mount(() => createSettingsView("informations"), (x) => x.querySelector(".miniapps-tile"));
  tab(again, "mini-apps").click(); // page Paramètres reconstruite : toujours la dernière
  assert.equal(shown(again), "Pile ou face");
});
