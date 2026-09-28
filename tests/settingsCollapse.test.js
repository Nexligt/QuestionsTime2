/* Paramètres > Réglages : cartes repliables (effet de dépliement). */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { getSetting } from "../js/data/settingsRepository.js";
import { SELECTION_MODE_KEY } from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const REGLAGES = ["selection-mode", "next-navigation", "recent-question-count", "strict-history", "import-export"];
const mountSettings = () =>
  mount(createSettingsView, (v) => !v.querySelector('[data-setting="selection-mode"] input').disabled);
const card = (v, id) => v.querySelector(`[data-panel="reglages"] [data-setting="${id}"]`);
const toggle = (v, id) => card(v, id).querySelector(".settings-section__toggle");
const body = (v, id) => card(v, id).querySelector(".settings-section__body");

test("toutes les cartes de Réglages sont repliées par défaut, titre cliquable", async () => {
  const v = await mountSettings();
  for (const id of REGLAGES) {
    const t = toggle(v, id);
    assert.equal(t.tagName, "BUTTON", id);
    assert.equal(t.parentElement.tagName, "H2");
    assert.equal(t.getAttribute("aria-expanded"), "false", id);
    assert.equal(t.getAttribute("aria-controls"), body(v, id).id);
    assert.equal(card(v, id).dataset.expanded, "false");
    assert.ok(body(v, id).hasAttribute("inert"), id);
  }
  assert.equal(card(v, "import-export").querySelector("h2").textContent, "Import / Export");
});

test("déplier / replier une carte, indépendamment des autres", async () => {
  const v = await mountSettings();
  toggle(v, "selection-mode").click();
  assert.equal(toggle(v, "selection-mode").getAttribute("aria-expanded"), "true");
  assert.equal(card(v, "selection-mode").dataset.expanded, "true");
  assert.equal(body(v, "selection-mode").hasAttribute("inert"), false);
  assert.equal(card(v, "next-navigation").dataset.expanded, "false");

  toggle(v, "import-export").click();
  assert.equal(card(v, "selection-mode").dataset.expanded, "true"); // plusieurs ouvertes possible

  toggle(v, "selection-mode").click();
  assert.equal(card(v, "selection-mode").dataset.expanded, "false");
  assert.ok(body(v, "selection-mode").hasAttribute("inert"));
});

test("les réglages fonctionnent toujours une fois la carte dépliée", async () => {
  const v = await mountSettings();
  toggle(v, "selection-mode").click();
  body(v, "selection-mode").querySelector('input[value="libre"]').click();
  await waitFor(() => card(v, "selection-mode").querySelector(".settings-choices").dataset.mode === "libre");
  assert.equal(await getSetting(SELECTION_MODE_KEY), "libre");
});

test("Informations et Mini-applications ne sont pas repliables", async () => {
  const v = await mountSettings();
  for (const id of ["informations", "mini-apps"]) {
    const section = v.querySelector(`[data-setting="${id}"]`);
    assert.equal(section.querySelector(".settings-section__toggle"), null, id);
    assert.equal(section.classList.contains("settings-section--collapsible"), false);
  }
});

test("CSS : animation de hauteur (0fr -> 1fr), chevron, mouvement réduit respecté", () => {
  const css = readFileSync(new URL("../css/components.css", import.meta.url), "utf-8");
  assert.match(css, /\.settings-section__body\s*\{[^}]*grid-template-rows:\s*0fr/);
  assert.match(css, /\[data-expanded="true"\] \.settings-section__body\s*\{[^}]*grid-template-rows:\s*1fr/);
  assert.match(css, /transition:\s*\n?\s*grid-template-rows/);
  assert.match(css, /\.settings-section__toggle::after/);
  assert.match(css, /prefers-reduced-motion[\s\S]*\.settings-section__body/);
});
