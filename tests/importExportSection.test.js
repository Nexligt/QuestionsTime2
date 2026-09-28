/* Interface Import / Export (Paramètres > Réglages), branchée sur exchangeRepository.js. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { exportFileName } from "../js/features/settings/importExportSection.js";
import {
  buildExport, parseAndValidateImport, EXPORT_FORMAT,
} from "../js/data/exchangeRepository.js";
import {
  createLocalQuestion, saveBaseQuestionOverride, deleteQuestion,
  getLocalQuestions, getBaseQuestionOverrides, getDeletedQuestionEntries,
} from "../js/data/questionsRepository.js";
import { getHistory, recordQuestionViewed } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import { getTagFilterStates, setTagFilterStates } from "../js/data/filtersRepository.js";

beforeEach(resetDatabase);

const L = (n) => ({ texte: `Locale ${n}`, tags: ["Perso"], author: "Léo" });
const mountSettings = () =>
  mount(createSettingsView, (v) => v.querySelector('[data-setting="import-export"]'));
const io = (v) => v.querySelector('[data-setting="import-export"]');
const $ = (v, s) => io(v).querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const envelope = (sections) => ({ format: EXPORT_FORMAT, version: 1, exportedAt: "2026-09-28T10:00:00.000Z", app: { version: "1.0.0" }, ...sections });

/** Presse-papiers et téléchargement simulés : on capture le texte produit. */
function captureOutputs() {
  const out = { clipboard: null, blob: null, fileName: null };
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => { out.clipboard = text; } },
  });
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const realClick = window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (blob) => { out.blob = blob; return "blob:test"; };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () { out.fileName = this.download; };
  out.restore = () => {
    URL.createObjectURL = realCreate;
    URL.revokeObjectURL = realRevoke;
    window.HTMLAnchorElement.prototype.click = realClick;
  };
  return out;
}

async function copy(v) {
  $(v, ".settings-io__copy").click();
  await waitFor(() => $(v, ".settings-io__export .settings-io__status").dataset.status);
}

async function download(v) {
  $(v, ".settings-io__download").click();
  await waitFor(() => $(v, ".settings-io__export .settings-io__status").textContent.includes("téléchargé"));
}

function chooseScope(v, value) {
  $(v, `.settings-io__scope input[value="${value}"]`).click();
}

async function paste(v, text) {
  const area = $(v, ".settings-io__paste");
  area.value = text;
  area.dispatchEvent(new window.Event("input"));
  $(v, ".settings-io__analyze").click();
  await waitFor(() => !$(v, ".settings-io__preview").hidden || $(v, ".settings-io__import .settings-io__status").textContent);
}

const line = (v, key) => $(v, `[data-line="${key}"]`)?.textContent;

async function seed() {
  await createLocalQuestion(L(1)); // -1
  await createLocalQuestion(L(2)); // -2
  await saveBaseQuestionOverride(3, { texte: "B-3 modifiée", tags: ["Modif"], author: "Léo" });
  await deleteQuestion(2); // simple suppression : jamais exportée
}

test("1. la section Import / Export est présente dans l'onglet Réglages", async () => {
  const v = await mountSettings();
  const reglages = v.querySelector('[data-panel="reglages"]');
  const section = reglages.querySelector('[data-setting="import-export"]');
  assert.ok(section);
  assert.equal(section.querySelector("h2").textContent, "Import / Export");
  assert.equal(v.querySelector('[data-panel="informations"] [data-setting="import-export"]'), null);
  assert.deepEqual([...section.querySelectorAll(".settings-io__scope .settings-choice__label")].map((e) => e.textContent),
    ["Questions locales", "Questions de base modifiées", "Les deux"]);
  assert.equal($(v, ".settings-io__scope input:checked").value, "both");
  assert.equal($(v, ".settings-io__copy").textContent, "Copier le texte");
  assert.equal($(v, ".settings-io__download").textContent, "Télécharger le fichier");
  assert.equal($(v, ".settings-io__file").accept, ".json,application/json");
});

test("2-3. les trois choix d'export ; copie et fichier produisent exactement le même JSON", async () => {
  await seed();
  const out = captureOutputs();
  try {
    const v = await mountSettings();
    for (const scope of ["local", "base", "both"]) {
      chooseScope(v, scope);
      await copy(v);
      assert.match($(v, ".settings-io__export .settings-io__status").textContent, /copié/);
      await download(v);
      const fileText = await out.blob.text();
      assert.equal(out.clipboard, fileText, scope); // même JSON
      assert.equal(out.blob.type, "application/json");
      assert.match(out.fileName, /^questionstime2-export-\d{4}-\d{2}-\d{2}\.json$/);

      const data = JSON.parse(fileText);
      const expected = await buildExport({ sections: scope });
      assert.deepEqual({ ...data, exportedAt: null }, { ...expected, exportedAt: null }, scope);
      assert.equal("local" in data, scope !== "base");
      assert.equal("base" in data, scope !== "local");
      if (data.base) assert.deepEqual(data.base.overrides.map((q) => q.id), [3]);
      assert.ok(!fileText.includes("deleted"));
    }
  } finally {
    out.restore();
  }
  assert.equal(exportFileName(new Date(2026, 0, 5)), "questionstime2-export-2026-01-05.json");
});

test("copie impossible : texte affiché pour une copie manuelle", async () => {
  await seed();
  Object.defineProperty(globalThis.navigator, "clipboard", {
    configurable: true, value: { writeText: async () => { throw new Error("refusé"); } },
  });
  const v = await mountSettings();
  await copy(v);
  const fallback = $(v, ".settings-io__fallback");
  assert.equal(fallback.hidden, false);
  assert.equal(JSON.parse(fallback.value).format, EXPORT_FORMAT);
  assert.equal($(v, ".settings-io__export .settings-io__status").dataset.status, "error");
});

test("4-6. JSON collé : aperçu affiché, rien n'est modifié avant confirmation", async () => {
  await createLocalQuestion(L(1));
  await deleteQuestion(4);
  const text = JSON.stringify(envelope({
    local: { questions: [{ id: -1, ...L(1) }, { id: -2, ...L(2) }, { id: -3, ...L(3) }] },
    base: { reference: { count: 91, fingerprint: "deadbeef" }, overrides: [
      { id: 4, texte: "B-4 importée", tags: ["X"], author: "Léo" },
      { id: 999, texte: "Inconnue", tags: ["X"], author: "Léo" },
    ] },
  }));
  const v = await mountSettings();
  await paste(v, text);

  assert.equal($(v, ".settings-io__preview").hidden, false);
  assert.match($(v, ".settings-io__preview-title").textContent, /rien n'est encore modifié/);
  assert.equal(line(v, "local-add"), "Questions locales à ajouter : 2");
  assert.equal(line(v, "local-duplicates"), "Doublons ignorés : 1");
  assert.equal(line(v, "base-overrides"), "Questions de base modifiées à appliquer : 1");
  assert.equal(line(v, "base-unknown"), "IDs de base inconnus ignorés : B-999");
  assert.match(line(v, "base-deleted"), /B-4/);
  assert.match($(v, '[data-list="warnings"]').textContent, /autre version de la base/);
  assert.equal($(v, ".settings-io__confirm").hidden, false);

  // Aucune écriture tant que l'import n'est pas confirmé.
  await sleep(30);
  assert.deepEqual((await getLocalQuestions()).map((q) => q.texte), ["Locale 1"]);
  assert.deepEqual(await getBaseQuestionOverrides(), []);

  $(v, ".settings-io__confirm").click();
  await waitFor(() => $(v, ".settings-io__import .settings-io__status").dataset.status === "success");
  assert.match($(v, ".settings-io__import .settings-io__status").textContent,
    /Import terminé : 2 question\(s\) locale\(s\) ajoutée\(s\), 1 modification\(s\) de base appliquée\(s\)\./);
  assert.equal($(v, ".settings-io__preview").hidden, true);
  assert.deepEqual((await getLocalQuestions()).map((q) => q.texte).sort(), ["Locale 1", "Locale 2", "Locale 3"]);
  assert.deepEqual((await getBaseQuestionOverrides()).map((q) => q.id), [4]);
  assert.deepEqual(await getDeletedQuestionEntries(), [{ id: 4 }]); // jamais restaurée
});

test("import depuis un fichier .json : même moteur que le texte collé", async () => {
  const text = JSON.stringify(envelope({ local: { questions: [{ id: -1, ...L(9) }] } }));
  const v = await mountSettings();
  const input = $(v, ".settings-io__file");
  Object.defineProperty(input, "files", { configurable: true, value: [{ text: async () => text }] });
  input.dispatchEvent(new window.Event("change"));
  await waitFor(() => !$(v, ".settings-io__preview").hidden);
  assert.equal($(v, ".settings-io__paste").value, text);
  assert.equal(line(v, "local-add"), "Questions locales à ajouter : 1");
  const engine = await parseAndValidateImport(text);
  assert.equal(engine.local.valid.length, 1);
  assert.deepEqual(await getLocalQuestions(), []);
});

test("7. erreurs de validation affichées, aucune confirmation possible", async () => {
  const v = await mountSettings();
  const cases = [
    ["{ pas du json", /pas un JSON valide/],
    [JSON.stringify({ ...envelope({ local: { questions: [] } }), version: 9 }), /version plus récente/],
    [JSON.stringify({ format: "autre", version: 1 }), /pas un export QuestionsTime2/],
  ];
  for (const [text, message] of cases) {
    await paste(v, text);
    assert.equal($(v, ".settings-io__preview-title").textContent, "Import impossible");
    assert.match($(v, '[data-list="errors"]').textContent, message);
    assert.equal($(v, ".settings-io__confirm").hidden, true);
  }
  await paste(v, JSON.stringify(envelope({ local: { questions: [{ id: -1, texte: " ", tags: [], author: "" }] } })));
  assert.equal(line(v, "local-invalid"), "Questions locales invalides ignorées : 1");
  assert.match($(v, '[data-list="warnings"]').textContent, /obligatoire/);
  assert.equal($(v, ".settings-io__confirm").hidden, true); // rien à importer
  assert.deepEqual(await getLocalQuestions(), []);
});

test("8. modes Fusionner / Remplacer proposés et appliqués ; données protégées intactes", async () => {
  await createLocalQuestion(L("ancienne")); // -1
  await saveBaseQuestionOverride(5, { texte: "B-5 gardée ?", tags: ["X"], author: "Léo" });
  await deleteQuestion(1);
  await recordQuestionViewed(3, "strict");
  await setSetting("selectionMode", "libre");
  await setSetting("currentQuestionId", 3);
  await setTagFilterStates({ Voyage: "excluded" });
  const protectedBefore = {
    history: await getHistory(), filters: await getTagFilterStates(),
    mode: await getSetting("selectionMode"), current: await getSetting("currentQuestionId"),
    deleted: await getDeletedQuestionEntries(),
  };

  const text = JSON.stringify(envelope({
    local: { questions: [{ id: -1, ...L("ancienne") }, { id: -2, ...L("nouvelle") }] },
    base: { overrides: [{ id: 3, texte: "B-3 importée", tags: ["X"], author: "Léo" }] },
  }));
  const v = await mountSettings();
  const labels = [...$(v, ".settings-io__mode").querySelectorAll(".settings-choice__label")].map((e) => e.textContent);
  assert.deepEqual(labels, ["Fusionner", "Remplacer"]);
  assert.equal($(v, ".settings-io__mode input:checked").value, "merge");

  await paste(v, text);
  assert.equal(line(v, "local-duplicates"), "Doublons ignorés : 1"); // fusion
  $(v, '.settings-io__mode input[value="replace"]').click(); // nouvel aperçu
  await waitFor(() => line(v, "replace"));
  assert.equal(line(v, "local-duplicates"), "Doublons ignorés : 0");
  assert.deepEqual((await getLocalQuestions()).map((q) => q.id), [-1]); // toujours rien d'écrit

  $(v, ".settings-io__confirm").click();
  await waitFor(() => $(v, ".settings-io__import .settings-io__status").dataset.status === "success");
  assert.match($(v, ".settings-io__import .settings-io__status").textContent, /1 remplacée/);
  assert.deepEqual((await getLocalQuestions()).sort((a, b) => b.id - a.id).map((q) => [q.id, q.texte]),
    [[-2, "Locale ancienne"], [-3, "Locale nouvelle"]]);
  assert.deepEqual((await getBaseQuestionOverrides()).map((q) => q.id), [3]); // B-5 remplacée
  assert.deepEqual({
    history: await getHistory(), filters: await getTagFilterStates(),
    mode: await getSetting("selectionMode"), current: await getSetting("currentQuestionId"),
    deleted: await getDeletedQuestionEntries(),
  }, protectedBefore);
});

test("9. la vue n'utilise que exchangeRepository.js (aucune logique d'import/export ni accès IndexedDB)", () => {
  const source = readFileSync(new URL("../js/features/settings/importExportSection.js", import.meta.url), "utf-8");
  assert.match(source, /from "..\/..\/data\/exchangeRepository.js"/);
  for (const fn of ["buildExportText", "parseAndValidateImport", "applyImport"]) assert.ok(source.includes(fn), fn);
  for (const forbidden of ["openDatabase", "indexedDB", "JSON.parse", "JSON.stringify", "questionsRepository", "objectStore"]) {
    assert.ok(!source.includes(forbidden), forbidden);
  }
});
