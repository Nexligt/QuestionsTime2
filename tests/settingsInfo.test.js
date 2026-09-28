/* Paramètres > Informations : version + compteurs calculés sur les données réelles. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, BASE_QUESTIONS } from "./helpers.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { INFO_ITEMS } from "../js/features/settings/infoSection.js";
import { APP_VERSION } from "../js/core/appVersion.js";
import {
  createLocalQuestion, deleteQuestion, restoreBaseQuestion, saveBaseQuestionOverride, getQuestionCounts,
} from "../js/data/questionsRepository.js";

beforeEach(resetDatabase);

const mountSettings = () =>
  mount(createSettingsView, (v) => v.querySelector(".settings-info")?.dataset.ready === "true");
const value = (v, id) => v.querySelector(`[data-info="${id}"] .settings-info__value`).textContent;
const draft = (n) => ({ texte: `Locale ${n}`, tags: ["Perso"], author: "Léo" });

test("section Informations présente, dans l'onglet Informations", async () => {
  const v = await mountSettings();
  const infoPanel = v.querySelector('[data-panel="informations"]');
  const sections = [...infoPanel.querySelectorAll(".settings-section")].map((s) => s.dataset.setting);
  assert.deepEqual(sections, ["informations"]);
  assert.equal(v.querySelector('[data-setting="informations"] h2').textContent, "Informations");
  const labels = [...v.querySelectorAll(".settings-info__label")].map((e) => e.textContent);
  assert.deepEqual(labels, ["Version", "Build", "Questions de base disponibles", "Questions locales", "Questions supprimées"]);
});

test("version de l'application affichée depuis la constante unique", async () => {
  const v = await mountSettings();
  assert.equal(value(v, "version"), APP_VERSION);
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test("compteurs initiaux calculés sur les vraies données (aucune valeur en dur)", async () => {
  const v = await mountSettings();
  assert.equal(value(v, "base-count"), String(BASE_QUESTIONS.length));
  assert.equal(value(v, "local-count"), "0");
  assert.equal(value(v, "deleted-count"), "0");
});

test("compteurs à jour après création, modification, suppression et restauration", async () => {
  await createLocalQuestion(draft(1)); // -1
  await createLocalQuestion(draft(2)); // -2
  await createLocalQuestion(draft(3)); // -3
  await saveBaseQuestionOverride(1, { texte: "B-1 modifiée", tags: ["X"], author: "Léo" });
  await deleteQuestion(2); // base -> supprimée (restaurable)
  await deleteQuestion(4); // base -> supprimée
  await deleteQuestion(-2); // locale -> définitif, non comptée comme supprimée

  let v = await mountSettings();
  assert.equal(value(v, "base-count"), String(BASE_QUESTIONS.length - 2)); // l'override reste une base
  assert.equal(value(v, "local-count"), "2");
  assert.equal(value(v, "deleted-count"), "2");

  await restoreBaseQuestion(2);
  v = await mountSettings(); // recalculé à chaque ouverture
  assert.equal(value(v, "base-count"), String(BASE_QUESTIONS.length - 1));
  assert.equal(value(v, "deleted-count"), "1");
  assert.deepEqual(await getQuestionCounts(), {
    baseAvailable: BASE_QUESTIONS.length - 1,
    local: 2,
    deleted: 1,
  });
});

test("structure extensible : une nouvelle entrée INFO_ITEMS s'affiche sans autre changement", async () => {
  INFO_ITEMS.push({ id: "test-extra", label: "Total", read: (ctx) => ctx.counts.baseAvailable + ctx.counts.local });
  INFO_ITEMS.push({ id: "test-broken", label: "Indisponible", read: () => { throw new Error("x"); } });
  try {
    await createLocalQuestion(draft(1));
    const v = await mountSettings();
    assert.equal(value(v, "test-extra"), String(BASE_QUESTIONS.length + 1));
    assert.equal(value(v, "test-broken"), "—"); // une erreur n'empêche pas l'affichage des autres
    assert.equal(value(v, "local-count"), "1");
  } finally {
    INFO_ITEMS.splice(-2, 2);
  }
});
