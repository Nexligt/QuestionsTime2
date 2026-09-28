/* Moteur Import / Export (js/data/exchangeRepository.js). */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, BASE_QUESTIONS } from "./helpers.js";
import { openDatabase, STORES } from "../js/data/db.js";
import {
  buildExport, buildExportText, parseAndValidateImport, applyImport,
  computeBaseFingerprint, EXPORT_FORMAT, EXPORT_VERSION,
} from "../js/data/exchangeRepository.js";
import {
  createLocalQuestion, saveBaseQuestionOverride, deleteQuestion,
  getLocalQuestions, getBaseQuestionOverrides, getAvailableQuestions, getDeletedQuestionEntries,
} from "../js/data/questionsRepository.js";
import { recordQuestionViewed, getHistory } from "../js/data/historyRepository.js";
import { setSetting } from "../js/data/settingsRepository.js";
import { setTagFilterStates } from "../js/data/filtersRepository.js";
import { APP_VERSION } from "../js/core/appVersion.js";

beforeEach(resetDatabase);

const L = (n, extra = {}) => ({ texte: `Locale ${n}`, tags: ["Perso"], author: "Léo", ...extra });
const O = (id, texte = `B-${id} modifiée`) => ({ texte, tags: ["Modif"], author: "Léo" });

async function all(store) {
  const db = await openDatabase();
  return new Promise((resolve) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
  });
}

/** État qui ne doit JAMAIS changer à l'import (réglages hors repère des id locaux). */
async function protectedState() {
  const settings = (await all(STORES.SETTINGS)).filter((s) => s.key !== "lowestLocalQuestionId");
  return {
    history: await all(STORES.HISTORY),
    filters: await all(STORES.FILTERS),
    settings,
    deleted: await all(STORES.QUESTIONS_DELETED),
    edits: await all(STORES.QUESTIONS_EDITS),
  };
}

async function seedProtectedState() {
  await recordQuestionViewed(1, "strict");
  await recordQuestionViewed(-1, "libre");
  await setSetting("selectionMode", "libre");
  await setSetting("currentQuestionId", 2);
  await setSetting("recentQuestionCount", 4);
  await setTagFilterStates({ Voyage: "excluded" });
}

/** Scénario de l'énoncé : B-10 intacte, B-11 supprimée, B-12 modifiée, B-13 modifiée + supprimée, L-1. */
async function seedScenario() {
  await createLocalQuestion(L(1)); // -1
  await saveBaseQuestionOverride(3, O(3)); // "B-12" : modifiée
  await saveBaseQuestionOverride(4, O(4)); // "B-13" : modifiée puis supprimée
  await deleteQuestion(4);
  await deleteQuestion(2); // "B-11" : supprimée sans modification
  // B-1 et B-5 : intactes
}

const importText = (data) => JSON.stringify(data);
const envelope = (sections) => ({ format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: "2026-09-28T10:00:00.000Z", app: { version: "1.0.0" }, ...sections });

/* ------------------------------- Export ------------------------------- */

test("export d'une locale : format, version, app, section locale seule", async () => {
  await createLocalQuestion(L(1));
  const data = await buildExport({ sections: "local", now: new Date("2026-09-28T10:00:00Z") });
  assert.deepEqual(data, {
    format: "questionstime2-export",
    version: 1,
    exportedAt: "2026-09-28T10:00:00.000Z",
    app: { version: APP_VERSION },
    local: { questions: [{ id: -1, ...L(1) }] },
  });
  assert.equal("base" in data, false);
});

test("export de plusieurs locales, dans l'ordre -1, -2, -3", async () => {
  for (const n of [1, 2, 3]) await createLocalQuestion(L(n));
  await deleteQuestion(-2);
  const { local } = await buildExport({ sections: "local" });
  assert.deepEqual(local.questions.map((q) => q.id), [-1, -3]);
  for (const q of local.questions) assert.deepEqual(Object.keys(q).sort(), ["author", "id", "tags", "texte"]);
});

test("export base : overrides uniquement (modifiée, et modifiée + supprimée) ; intactes et simples suppressions absentes ; aucun 'deleted'", async () => {
  await seedScenario();
  const data = await buildExport({ sections: "base" });
  assert.equal("local" in data, false);
  assert.deepEqual(data.base.overrides, [
    { id: 3, ...O(3) },
    { id: 4, ...O(4) }, // exportée même si supprimée
  ]);
  const ids = data.base.overrides.map((q) => q.id);
  assert.ok(!ids.includes(1) && !ids.includes(5)); // intactes
  assert.ok(!ids.includes(2)); // simplement supprimée
  assert.equal("deleted" in data.base, false);
  assert.deepEqual(Object.keys(data.base).sort(), ["overrides", "reference"]);
  assert.deepEqual(data.base.reference, { count: BASE_QUESTIONS.length, fingerprint: computeBaseFingerprint(BASE_QUESTIONS) });
});

test("export « les deux » ; rien d'autre (historique, filtres, réglages, repère) ; texte = même JSON", async () => {
  await seedScenario();
  await seedProtectedState();
  const data = await buildExport({ sections: "both" });
  assert.deepEqual(Object.keys(data).sort(), ["app", "base", "exportedAt", "format", "local", "version"]);
  assert.deepEqual(data.local.questions.map((q) => q.id), [-1]);
  const text = await buildExportText({ sections: "both" });
  for (const forbidden of ["deleted", "history", "currentQuestionId", "lowestLocalQuestionId", "selectionMode", "tagStates"]) {
    assert.ok(!text.includes(forbidden), forbidden);
  }
  assert.deepEqual(JSON.parse(text).local, data.local);
  await assert.rejects(() => buildExport({ sections: {} }));
});

/* ------------------------------- Import ------------------------------- */

test("import local avec renumérotation, ordre conservé, anciens id jamais réutilisés", async () => {
  await createLocalQuestion(L("existante")); // -1
  await createLocalQuestion(L("supprimée")); // -2
  await deleteQuestion(-2);
  const text = importText(envelope({ local: { questions: [
    { id: -1, ...L("A") }, { id: -7, ...L("B") }, { id: -3, ...L("C") },
  ] } }));

  const report = await parseAndValidateImport(text);
  assert.equal(report.ok, true);
  assert.deepEqual(report.local.valid.map((v) => v.sourceId), [-1, -7, -3]);
  assert.deepEqual(await getLocalQuestions(), [{ id: -1, ...L("existante") }]); // validation : aucune écriture

  const result = await applyImport(report);
  assert.deepEqual(result.localAdded, [-3, -4, -5]);
  const locals = await getLocalQuestions();
  assert.deepEqual(locals.sort((a, b) => b.id - a.id).map((q) => [q.id, q.texte]), [
    [-1, "Locale existante"], [-3, "Locale A"], [-4, "Locale B"], [-5, "Locale C"],
  ]);
  assert.equal((await createLocalQuestion(L("suivante"))).id, -6);
});

test("doublon local : ignoré (existant et dans le fichier) ; importer deux fois ne duplique rien", async () => {
  await createLocalQuestion(L(1));
  const text = importText(envelope({ local: { questions: [
    { id: -1, ...L(1, { texte: "  locale 1 " }) }, // même question (casse/espaces)
    { id: -2, ...L(2) },
    { id: -3, ...L(2) }, // doublon dans le fichier
  ] } }));
  const report = await parseAndValidateImport(text);
  assert.deepEqual(report.local.duplicates.map((d) => [d.sourceId, d.reason]), [[-1, "existing"], [-3, "file"]]);
  assert.deepEqual(report.local.valid.map((v) => v.sourceId), [-2]);
  await applyImport(report);
  await applyImport(await parseAndValidateImport(text)); // second import
  assert.deepEqual((await getLocalQuestions()).map((q) => q.texte).sort(), ["Locale 1", "Locale 2"]);
});

test("override base valide : appliqué avec le même id, sans id négatif", async () => {
  const text = importText(envelope({ base: { reference: { count: 5, fingerprint: computeBaseFingerprint(BASE_QUESTIONS) }, overrides: [{ id: 3, ...O(3, "Importée") }] } }));
  const report = await parseAndValidateImport(text);
  assert.equal(report.ok, true);
  assert.equal(report.base.referenceMismatch, false);
  assert.deepEqual(report.warnings, []);
  const result = await applyImport(report);
  assert.deepEqual(result.overridesApplied, [3]);
  assert.deepEqual(await getBaseQuestionOverrides(), [{ id: 3, ...O(3, "Importée") }]);
  assert.deepEqual(await getLocalQuestions(), []);
  assert.equal((await getAvailableQuestions()).find((q) => q.id === 3).texte, "Importée");
});

test("id de base inconnu : signalé et non importé", async () => {
  const text = importText(envelope({ base: { overrides: [{ id: 999, ...O(999) }, { id: 1, ...O(1) }] } }));
  const report = await parseAndValidateImport(text);
  assert.deepEqual(report.base.unknownIds, [999]);
  assert.deepEqual(report.base.valid.map((q) => q.id), [1]);
  await applyImport(report);
  assert.deepEqual((await getBaseQuestionOverrides()).map((q) => q.id), [1]);
});

test("override d'une base supprimée : modifiée mais PAS restaurée ; questionsDeleted intact", async () => {
  await deleteQuestion(2);
  const deletedBefore = await getDeletedQuestionEntries();
  const report = await parseAndValidateImport(importText(envelope({ base: { overrides: [{ id: 2, ...O(2, "Nouvelle B-2") }] } })));
  assert.deepEqual(report.base.currentlyDeleted, [2]);
  await applyImport(report);
  assert.deepEqual(await getDeletedQuestionEntries(), deletedBefore);
  assert.ok(!(await getAvailableQuestions()).some((q) => q.id === 2)); // toujours supprimée
  assert.deepEqual((await getBaseQuestionOverrides()).find((q) => q.id === 2), { id: 2, ...O(2, "Nouvelle B-2") });
});

test("empreinte de base différente : avertissement, import toujours possible", async () => {
  const report = await parseAndValidateImport(importText(envelope({ base: {
    reference: { count: 91, fingerprint: "deadbeef" }, overrides: [{ id: 1, ...O(1) }],
  } })));
  assert.equal(report.ok, true);
  assert.equal(report.base.referenceMismatch, true);
  assert.deepEqual(report.warnings.map((w) => w.code), ["base-mismatch"]);
  assert.deepEqual(report.base.currentReference, { count: 5, fingerprint: computeBaseFingerprint(BASE_QUESTIONS) });
});

test("version future refusée ; format, JSON et structure invalides refusés ; aucune écriture", async () => {
  const cases = [
    [importText({ ...envelope({ local: { questions: [] } }), version: 2 }), "future-version"],
    [importText({ ...envelope({ local: { questions: [] } }), format: "autre" }), "invalid-format"],
    ["{ pas du json", "invalid-json"],
    [importText(envelope({ local: { questions: "x" } })), "invalid-structure"],
    [importText(envelope({})), "empty"],
  ];
  for (const [text, code] of cases) {
    const report = await parseAndValidateImport(text);
    assert.equal(report.ok, false, code);
    assert.equal(report.errors[0].code, code);
    await assert.rejects(() => applyImport(report));
  }
  assert.deepEqual(await getLocalQuestions(), []);
});

test("questions invalides (règles existantes) : listées, jamais importées", async () => {
  const report = await parseAndValidateImport(importText(envelope({
    local: { questions: [{ id: -1, texte: " ", tags: ["x"], author: "A" }, { id: 4, ...L(1) }, { id: -2, texte: "Ok", tags: [], author: "A" }] },
    base: { overrides: [{ id: 1, texte: "T", tags: ["x"], author: "" }, { id: 1, ...O(1) }, "x"] },
  })));
  assert.equal(report.local.invalid.length, 3);
  assert.equal(report.base.invalid.length, 2);
  assert.deepEqual(report.base.valid.map((q) => q.id), [1]); // le 2e id 1 est valide
  await applyImport(report);
  assert.deepEqual(await getLocalQuestions(), []);
});

test("mode merge : ajoute les locales, ajoute/remplace les overrides, ne supprime rien", async () => {
  await createLocalQuestion(L("gardée")); // -1
  await saveBaseQuestionOverride(1, O(1, "Ancienne B-1"));
  await saveBaseQuestionOverride(5, O(5, "B-5 gardée"));
  const report = await parseAndValidateImport(importText(envelope({
    local: { questions: [{ id: -1, ...L("nouvelle") }] },
    base: { overrides: [{ id: 1, ...O(1, "Nouvelle B-1") }, { id: 3, ...O(3) }] },
  })), { mode: "merge" });
  const result = await applyImport(report);
  assert.deepEqual(result.localRemoved, []);
  assert.deepEqual(result.overridesRemoved, []);
  assert.deepEqual((await getLocalQuestions()).map((q) => q.texte).sort(), ["Locale gardée", "Locale nouvelle"]);
  assert.deepEqual((await getBaseQuestionOverrides()).map((q) => [q.id, q.texte]), [
    [1, "Nouvelle B-1"], [3, "B-3 modifiée"], [5, "B-5 gardée"],
  ]);
});

test("mode replace : locales et overrides remplacés, id jamais réutilisés, suppressions intactes", async () => {
  await createLocalQuestion(L("ancienne 1")); // -1
  await createLocalQuestion(L("ancienne 2")); // -2
  await saveBaseQuestionOverride(5, O(5));
  await deleteQuestion(4);
  const deletedBefore = await getDeletedQuestionEntries();

  const report = await parseAndValidateImport(importText(envelope({
    local: { questions: [{ id: -1, ...L("ancienne 1") }, { id: -2, ...L("fichier") }] },
    base: { overrides: [{ id: 2, ...O(2) }] },
  })), { mode: "replace" });
  assert.deepEqual(report.local.duplicates, []); // les existantes vont être remplacées
  const result = await applyImport(report);

  assert.deepEqual(result.localRemoved.sort((a, b) => b - a), [-1, -2]);
  assert.deepEqual(result.localAdded, [-3, -4]);
  assert.deepEqual((await getLocalQuestions()).sort((a, b) => b.id - a.id).map((q) => [q.id, q.texte]), [
    [-3, "Locale ancienne 1"], [-4, "Locale fichier"],
  ]);
  assert.deepEqual(result.overridesRemoved, [5]);
  assert.deepEqual((await getBaseQuestionOverrides()).map((q) => q.id), [2]);
  assert.deepEqual(await getDeletedQuestionEntries(), deletedBefore);
  assert.equal((await createLocalQuestion(L("après"))).id, -5);
});

test("import partiel : seule la section choisie est appliquée, l'autre n'est pas touchée", async () => {
  await createLocalQuestion(L("gardée"));
  await saveBaseQuestionOverride(5, O(5));
  const text = importText(envelope({
    local: { questions: [{ id: -1, ...L("x") }] },
    base: { overrides: [{ id: 1, ...O(1) }] },
  }));
  const baseOnly = await parseAndValidateImport(text, { mode: "replace", sections: "base" });
  assert.deepEqual(baseOnly.sections, { local: false, base: true });
  await applyImport(baseOnly);
  assert.deepEqual((await getLocalQuestions()).map((q) => q.texte), ["Locale gardée"]);
  assert.deepEqual((await getBaseQuestionOverrides()).map((q) => q.id), [1]);

  const none = await parseAndValidateImport(importText(envelope({ base: { overrides: [] } })), { sections: "local" });
  assert.equal(none.errors[0].code, "nothing-selected");
});

test("historique, filtres, réglages, currentQuestionId et questionsDeleted inchangés (merge et replace)", async () => {
  await seedScenario();
  await seedProtectedState();
  const before = await protectedState();
  const text = await buildExportText({ sections: "both" });

  for (const mode of ["merge", "replace"]) {
    await applyImport(await parseAndValidateImport(text, { mode }));
    assert.deepEqual(await protectedState(), before, mode);
  }
  // Aller-retour : l'export réimporté redonne les mêmes overrides.
  assert.deepEqual((await getBaseQuestionOverrides()).map((q) => q.id), [3, 4]);
  assert.deepEqual((await getHistory()).length, 2);
});
