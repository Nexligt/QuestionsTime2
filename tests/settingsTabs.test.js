/* Paramètres : navigation interne Réglages / Mini-applications / Informations. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId, BASE_QUESTIONS } from "./helpers.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { APP_VERSION } from "../js/core/appVersion.js";
import { getSetting } from "../js/data/settingsRepository.js";
import { getHistory, recordQuestionViewed } from "../js/data/historyRepository.js";
import { createLocalQuestion, deleteQuestion } from "../js/data/questionsRepository.js";
import {
  SELECTION_MODE_KEY, RECENT_QUESTION_COUNT_KEY, CURRENT_QUESTION_ID_KEY,
} from "../js/features/questions/questionEngine.js";
import { NEXT_NAVIGATION_KEY } from "../js/features/questions/nextNavigation.js";

beforeEach(resetDatabase);

const mountSettings = () =>
  mount(createSettingsView, (v) =>
    !v.querySelector('[data-setting="selection-mode"] input').disabled &&
    v.querySelector(".settings-info")?.dataset.ready === "true"
  );
const tab = (v, id) => v.querySelector(`.settings-tab[data-tab="${id}"]`);
const panel = (v, id) => v.querySelector(`.settings-panel[data-panel="${id}"]`);
const visiblePanels = (v) => [...v.querySelectorAll(".settings-panel")].filter((p) => !p.hidden).map((p) => p.dataset.panel);
const sectionsIn = (v, id) => [...panel(v, id).querySelectorAll(".settings-section")].map((s) => s.dataset.setting);

test("1. titre Paramètres puis menu à exactement 3 choix", async () => {
  const v = await mountSettings();
  assert.equal(v.firstElementChild.tagName, "H1");
  assert.equal(v.firstElementChild.textContent, "Paramètres");
  const tabList = v.querySelector(".settings-tabs");
  assert.equal(tabList.getAttribute("role"), "tablist");
  assert.equal(tabList.previousElementSibling, v.firstElementChild); // menu sous le titre
  const tabs = [...tabList.querySelectorAll(".settings-tab")];
  // Libellés courts affichés (sans coupure dès 320 px), noms complets pour l'accessibilité.
  assert.deepEqual(tabs.map((t) => t.textContent), ["Réglages", "Mini-apps", "Infos"]);
  assert.deepEqual(tabs.map((t) => t.getAttribute("aria-label")), ["Réglages", "Mini-applications", "Informations"]);
  for (const t of tabs) {
    assert.equal(t.tagName, "BUTTON");
    assert.equal(t.getAttribute("role"), "tab");
    assert.equal(panel(v, t.dataset.tab).id, t.getAttribute("aria-controls"));
  }
});

test("2. Réglages sélectionné par défaut", async () => {
  const v = await mountSettings();
  assert.equal(tab(v, "reglages").getAttribute("aria-selected"), "true");
  assert.equal(tab(v, "mini-apps").getAttribute("aria-selected"), "false");
  assert.equal(tab(v, "informations").getAttribute("aria-selected"), "false");
  assert.deepEqual(visiblePanels(v), ["reglages"]);
});

test("3-4. un seul contenu visible, et chaque choix affiche le bon contenu", async () => {
  const v = await mountSettings();

  tab(v, "mini-apps").click();
  assert.deepEqual(visiblePanels(v), ["mini-apps"]);
  assert.equal(tab(v, "mini-apps").getAttribute("aria-selected"), "true");
  assert.equal(tab(v, "reglages").getAttribute("aria-selected"), "false");
  assert.match(panel(v, "mini-apps").textContent, /Aucune mini-application disponible pour le moment\./);

  tab(v, "informations").click();
  assert.deepEqual(visiblePanels(v), ["informations"]);
  assert.deepEqual(sectionsIn(v, "informations"), ["informations"]);

  tab(v, "reglages").click();
  assert.deepEqual(visiblePanels(v), ["reglages"]);
  assert.deepEqual(sectionsIn(v, "reglages"), [
    "selection-mode", "next-navigation", "recent-question-count", "strict-history", "import-export",
  ]);
  // Chaque section n'apparaît que dans son onglet.
  assert.equal(v.querySelectorAll('[data-setting="informations"]').length, 1);
  assert.equal(panel(v, "reglages").querySelector(".settings-info"), null);

  // Navigation clavier (flèches).
  v.querySelector(".settings-tabs").dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  assert.deepEqual(visiblePanels(v), ["informations"]);
});

test("5. les réglages existants fonctionnent toujours depuis l'onglet Réglages", async () => {
  await recordQuestionViewed(1, "strict");
  await recordQuestionViewed(2, "libre");
  const main = await mount(createMainView, mainIsReady);
  const shown = displayedQuestionId(main);
  const v = await mountSettings();
  const reglages = panel(v, "reglages");

  reglages.querySelector('[data-setting="selection-mode"] input[value="libre"]').click();
  await waitFor(() => reglages.querySelector('[data-setting="selection-mode"] .settings-choices').dataset.mode === "libre");
  assert.equal(await getSetting(SELECTION_MODE_KEY), "libre");

  reglages.querySelector('[data-setting="next-navigation"] input[value="button"]').click();
  await waitFor(() => reglages.querySelector('[data-setting="next-navigation"] .settings-choices').dataset.value === "button");
  assert.equal(await getSetting(NEXT_NAVIGATION_KEY), "button");

  const field = reglages.querySelector(".settings-number__input");
  field.value = "7";
  field.dispatchEvent(new window.Event("change"));
  await waitFor(() => reglages.querySelector(".settings-number__status").dataset.status === "saved");
  assert.equal(await getSetting(RECENT_QUESTION_COUNT_KEY), 7);

  reglages.querySelector(".settings-reset__button").click();
  reglages.querySelector(".settings-reset__confirm-button").click();
  await waitFor(() => reglages.querySelector(".settings-reset__status").dataset.status === "done");
  const history = await getHistory();
  assert.ok(history.every((h) => h.mode === "libre")); // Strict vidé, Libre intact
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), shown);
});

test("6. la section Informations fonctionne toujours dans son onglet", async () => {
  await createLocalQuestion({ texte: "Locale", tags: ["X"], author: "Léo" });
  await deleteQuestion(2);
  const v = await mountSettings();
  tab(v, "informations").click();
  const value = (id) => panel(v, "informations").querySelector(`[data-info="${id}"] .settings-info__value`).textContent;
  assert.equal(value("version"), APP_VERSION);
  assert.equal(value("base-count"), String(BASE_QUESTIONS.length - 1));
  assert.equal(value("local-count"), "1");
  assert.equal(value("deleted-count"), "1");
});

test("CSS : panneaux masqués réellement cachés, menu compact en 3 colonnes", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../css/components.css", import.meta.url), "utf-8");
  assert.match(css, /\.settings-panel\[hidden\]\s*\{\s*display:\s*none;/);
  assert.match(css, /\.settings-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3/);
  const theme = readFileSync(new URL("../css/themes.css", import.meta.url), "utf-8");
  assert.match(theme, /\.settings-tab\[aria-selected="true"\]/);
});
