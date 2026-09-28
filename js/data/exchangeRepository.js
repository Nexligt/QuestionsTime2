/*
  exchangeRepository.js
  Moteur de données Import / Export (aucune interface ici). Un seul format
  JSON, identique pour un fichier et pour un texte copié/collé :

    {
      "format": "questionstime2-export",
      "version": 1,
      "exportedAt": "2026-09-28T10:00:00.000Z",
      "app": { "version": "1.0.0" },
      "local": { "questions": [ { id, texte, tags, author }, ... ] },
      "base":  { "reference": { "count", "fingerprint" },
                 "overrides": [ { id, texte, tags, author }, ... ] }
    }

  Seules les sections demandées sont présentes. On n'exporte QUE ce que
  l'utilisateur a ajouté ou modifié :
  - local.questions  : questions créées localement (id < 0) ;
  - base.overrides   : questions de base MODIFIÉES (id > 0 dans
    `questionsUser`), y compris si elles sont actuellement supprimées.
  Jamais exportés : questions de base intactes, suppressions de base
  (`questionsDeleted`), historique, filtres, réglages, currentQuestionId,
  lowestLocalQuestionId.

  Import en deux temps, sans écriture avant confirmation :
    1. parseAndValidateImport(input, options) -> rapport (lecture seule) ;
    2. applyImport(report) -> écriture en UNE transaction IndexedDB.
  L'import ne touche jamais `questionsDeleted` (il ne restaure donc jamais
  une question supprimée), ni l'historique, les filtres, le mode ou
  currentQuestionId.
*/

import { openDatabase, STORES, nextLocalQuestionId } from "./db.js";
import { getBaseQuestions, LOWEST_LOCAL_QUESTION_ID_KEY } from "./questionsRepository.js";
import { APP_VERSION } from "../core/appVersion.js";
import { validateQuestionDraft, tagKey } from "../features/questions/localQuestion.js";
import { extractTags } from "../features/filters/tagFilters.js";

export const EXPORT_FORMAT = "questionstime2-export";
export const EXPORT_VERSION = 1;
export const IMPORT_MODES = Object.freeze({ MERGE: "merge", REPLACE: "replace" });

/* ------------------------------------------------------------------ */
/* Outils                                                             */
/* ------------------------------------------------------------------ */

/** Lit tout un store (lecture seule). */
async function readAll(storeName) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Copie stricte au modèle { id, texte, tags, author } (aucun autre champ). */
function toQuestion(q) {
  return { id: q.id, texte: q.texte, tags: [...q.tags], author: q.author };
}

/**
 * Empreinte courte (FNV-1a 32 bits, hexadécimal) du fichier de base :
 * permet de détecter qu'un export vient d'une autre version de la base.
 * @param {Array<{id:number, texte:string, tags:string[], author:string}>} base
 * @returns {string}
 */
export function computeBaseFingerprint(base) {
  const canonical = JSON.stringify(
    [...base]
      .sort((a, b) => a.id - b.id)
      .map((q) => [q.id, q.texte, q.tags, q.author])
  );
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Référence { count, fingerprint } de la base actuellement chargée. */
export async function getBaseReference() {
  const base = await getBaseQuestions();
  return { count: base.length, fingerprint: computeBaseFingerprint(base) };
}

/** Clé de doublon d'une question locale : texte + auteur normalisés. */
function localDuplicateKey(q) {
  return `${tagKey(q.texte)}|${tagKey(q.author)}`;
}

/** Normalise `sections` : "local" | "base" | "both" | { local, base }. */
function normalizeSections(sections) {
  if (sections === "local") return { local: true, base: false };
  if (sections === "base") return { local: false, base: true };
  if (sections === "both" || sections === undefined) return { local: true, base: true };
  return { local: Boolean(sections?.local), base: Boolean(sections?.base) };
}

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

/**
 * Construit l'objet d'export (lecture seule).
 * @param {{ sections?: "local"|"base"|"both"|{local?:boolean, base?:boolean}, now?: Date }} [options]
 * @returns {Promise<object>}
 */
export async function buildExport({ sections = "both", now = new Date() } = {}) {
  const wanted = normalizeSections(sections);
  if (!wanted.local && !wanted.base) {
    throw new Error("[exchangeRepository] Aucune section à exporter.");
  }

  const stored = await readAll(STORES.QUESTIONS_USER);
  const data = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    app: { version: APP_VERSION },
  };

  if (wanted.local) {
    data.local = {
      // -1, -2, -3... (ordre de création)
      questions: stored.filter((q) => q.id < 0).sort((a, b) => b.id - a.id).map(toQuestion),
    };
  }

  if (wanted.base) {
    data.base = {
      reference: await getBaseReference(),
      // Overrides uniquement (supprimés ou non) ; jamais de liste "deleted".
      overrides: stored.filter((q) => q.id > 0).sort((a, b) => a.id - b.id).map(toQuestion),
    };
  }

  return data;
}

/**
 * Même export sous forme de texte JSON (fichier ou copier/coller).
 * @param {Parameters<typeof buildExport>[0]} [options]
 * @returns {Promise<string>}
 */
export async function buildExportText(options) {
  return JSON.stringify(await buildExport(options), null, 2);
}

/* ------------------------------------------------------------------ */
/* Import : validation (AUCUNE écriture)                              */
/* ------------------------------------------------------------------ */

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Contrôle de forme strict avant les règles de validation existantes. */
function shapeErrors(q) {
  const errors = [];
  if (!isPlainObject(q)) return ["La question n'est pas un objet."];
  if (typeof q.id !== "number" || !Number.isInteger(q.id)) errors.push("id invalide.");
  if (typeof q.texte !== "string") errors.push("texte invalide.");
  if (!Array.isArray(q.tags) || q.tags.some((t) => typeof t !== "string")) errors.push("tags invalides.");
  if (typeof q.author !== "string") errors.push("author invalide.");
  return errors;
}

/**
 * Analyse et valide un import (texte JSON ou objet déjà lu). Ne modifie rien.
 * Le rapport retourné est destiné à l'interface (aperçu) puis à applyImport.
 *
 * @param {string|object} input
 * @param {{ mode?: "merge"|"replace", sections?: "local"|"base"|"both"|{local?:boolean, base?:boolean} }} [options]
 *   `sections` : sections à importer parmi celles présentes (toutes par défaut).
 * @returns {Promise<object>} rapport :
 *   { ok, mode, errors[], warnings[], meta, sections: {local, base},
 *     local: { valid[], duplicates[], invalid[] },
 *     base:  { valid[], unknownIds[], invalid[], currentlyDeleted[],
 *              referenceMismatch, reference, currentReference } }
 */
export async function parseAndValidateImport(input, { mode = IMPORT_MODES.MERGE, sections } = {}) {
  const report = {
    ok: false,
    mode,
    errors: [],
    warnings: [],
    meta: null,
    sections: { local: false, base: false },
    local: { valid: [], duplicates: [], invalid: [] },
    base: {
      valid: [], unknownIds: [], invalid: [], currentlyDeleted: [],
      referenceMismatch: false, reference: null, currentReference: null,
    },
  };
  const fail = (code, message) => {
    report.errors.push({ code, message });
    return report;
  };

  if (mode !== IMPORT_MODES.MERGE && mode !== IMPORT_MODES.REPLACE) {
    return fail("invalid-mode", `Mode d'import inconnu : "${mode}".`);
  }

  // 1. Lecture du JSON (fichier ou texte collé : même traitement).
  let data = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input.replace(/^﻿/, "").trim());
    } catch {
      return fail("invalid-json", "Le texte fourni n'est pas un JSON valide.");
    }
  }
  if (!isPlainObject(data)) return fail("invalid-structure", "Le contenu importé doit être un objet JSON.");

  // 2. Format et version.
  if (data.format !== EXPORT_FORMAT) {
    return fail("invalid-format", "Ce fichier n'est pas un export QuestionsTime2.");
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    return fail("invalid-version", "Version d'export invalide.");
  }
  if (data.version > EXPORT_VERSION) {
    return fail(
      "future-version",
      `Cet export (version ${data.version}) provient d'une version plus récente de l'application ; mettez l'application à jour.`
    );
  }
  report.meta = {
    version: data.version,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : null,
    appVersion: typeof data.app?.version === "string" ? data.app.version : null,
  };

  // 3. Structure des sections.
  const hasLocal = data.local !== undefined;
  const hasBase = data.base !== undefined;
  if (hasLocal && (!isPlainObject(data.local) || !Array.isArray(data.local.questions))) {
    return fail("invalid-structure", "La section « local » doit contenir un tableau « questions ».");
  }
  if (hasBase && (!isPlainObject(data.base) || !Array.isArray(data.base.overrides))) {
    return fail("invalid-structure", "La section « base » doit contenir un tableau « overrides ».");
  }
  if (!hasLocal && !hasBase) return fail("empty", "L'export ne contient aucune section.");

  const wanted = sections === undefined ? { local: true, base: true } : normalizeSections(sections);
  report.sections = { local: hasLocal && wanted.local, base: hasBase && wanted.base };
  if (!report.sections.local && !report.sections.base) {
    return fail("nothing-selected", "Aucune des sections demandées n'est présente dans l'export.");
  }

  // Données actuelles (lecture seule).
  const [base, stored, deletedEntries] = await Promise.all([
    getBaseQuestions(),
    readAll(STORES.QUESTIONS_USER),
    readAll(STORES.QUESTIONS_DELETED),
  ]);
  const baseIds = new Set(base.map((q) => q.id));
  const deletedIds = new Set(deletedEntries.map((e) => e.id));
  const knownTags = extractTags([...base, ...stored]);

  // 4. Questions locales.
  if (report.sections.local) {
    const existingKeys = new Set(
      mode === IMPORT_MODES.MERGE ? stored.filter((q) => q.id < 0).map(localDuplicateKey) : []
    );
    const fileKeys = new Set();
    data.local.questions.forEach((raw, index) => {
      const sourceId = isPlainObject(raw) ? raw.id : undefined;
      const errors = shapeErrors(raw);
      if (errors.length === 0 && !(raw.id < 0)) errors.push("Une question locale doit avoir un id négatif.");
      if (errors.length === 0) {
        const { valid, errors: fieldErrors, question } = validateQuestionDraft(raw, knownTags);
        if (!valid) errors.push(...Object.values(fieldErrors));
        else {
          const key = localDuplicateKey(question);
          if (existingKeys.has(key) || fileKeys.has(key)) {
            report.local.duplicates.push({
              index, sourceId, question,
              reason: existingKeys.has(key) ? "existing" : "file",
            });
          } else {
            fileKeys.add(key);
            report.local.valid.push({ index, sourceId, question });
          }
          return;
        }
      }
      report.local.invalid.push({ index, sourceId, errors });
    });
  }

  // 5. Overrides de questions de base.
  if (report.sections.base) {
    const currentReference = { count: base.length, fingerprint: computeBaseFingerprint(base) };
    report.base.currentReference = currentReference;
    const ref = data.base.reference;
    if (isPlainObject(ref)) {
      report.base.reference = { count: ref.count, fingerprint: ref.fingerprint };
      report.base.referenceMismatch =
        ref.count !== currentReference.count || ref.fingerprint !== currentReference.fingerprint;
      if (report.base.referenceMismatch) {
        report.warnings.push({
          code: "base-mismatch",
          message: "Cet export provient d'une autre version de la base de questions : vérifiez les questions modifiées avant d'importer.",
        });
      }
    }
    if (data.base.deleted !== undefined) {
      report.warnings.push({ code: "deleted-ignored", message: "Les suppressions éventuelles de l'export sont ignorées." });
    }

    const seenIds = new Set();
    data.base.overrides.forEach((raw, index) => {
      const errors = shapeErrors(raw);
      if (errors.length === 0 && !(raw.id > 0)) errors.push("Une question de base doit avoir un id positif.");
      if (errors.length === 0 && seenIds.has(raw.id)) errors.push("id présent plusieurs fois dans l'export.");
      if (errors.length > 0) {
        report.base.invalid.push({ index, id: isPlainObject(raw) ? raw.id : undefined, errors });
        return;
      }
      if (!baseIds.has(raw.id)) {
        seenIds.add(raw.id);
        report.base.unknownIds.push(raw.id);
        return;
      }
      const { valid, errors: fieldErrors, question } = validateQuestionDraft(raw, knownTags);
      if (!valid) {
        report.base.invalid.push({ index, id: raw.id, errors: Object.values(fieldErrors) });
        return;
      }
      seenIds.add(raw.id); // premier exemplaire VALIDE retenu
      report.base.valid.push({ id: raw.id, ...question });
      if (deletedIds.has(raw.id)) report.base.currentlyDeleted.push(raw.id);
    });
  }

  report.ok = report.errors.length === 0;
  return report;
}

/* ------------------------------------------------------------------ */
/* Import : application (après confirmation)                          */
/* ------------------------------------------------------------------ */

/**
 * Applique un rapport issu de parseAndValidateImport, en UNE transaction
 * sur `questionsUser` (+ repère des id locaux dans `settings`). Rien n'est
 * écrit si la transaction échoue. `questionsDeleted`, l'historique, les
 * filtres, le mode et currentQuestionId ne sont jamais modifiés.
 *
 * - merge   : ajoute les locales (nouveaux id, doublons ignorés) et
 *             ajoute/remplace les overrides correspondants.
 * - replace : section locale -> supprime les locales existantes puis ajoute
 *             celles du fichier (numérotation qui continue, jamais de
 *             réutilisation) ; section base -> supprime les overrides
 *             existants puis applique ceux du fichier.
 * Une section absente/non sélectionnée n'est jamais touchée.
 *
 * @param {object} report
 * @returns {Promise<{ localAdded:number[], localSkipped:number, localRemoved:number[],
 *                     overridesApplied:number[], overridesRemoved:number[] }>}
 */
export async function applyImport(report) {
  if (!report?.ok) {
    throw new Error("[exchangeRepository] Import invalide : rien n'a été appliqué.");
  }
  const { mode } = report;
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.QUESTIONS_USER, STORES.QUESTIONS_DELETED, STORES.SETTINGS],
      "readwrite"
    );
    const userStore = tx.objectStore(STORES.QUESTIONS_USER);
    const settingsStore = tx.objectStore(STORES.SETTINGS);
    const summary = {
      localAdded: [], localSkipped: 0, localRemoved: [], overridesApplied: [], overridesRemoved: [],
    };

    // Lectures dans la transaction (état réel au moment de l'écriture).
    // `questionsDeleted` n'est que LU (id locaux déjà attribués) : jamais modifié.
    let pending = 3;
    let stored = [];
    let deletedKeys = [];
    let marker = null;
    const done = () => {
      pending -= 1;
      if (pending === 0) write();
    };
    const r1 = userStore.getAll();
    r1.onsuccess = () => { stored = r1.result; done(); };
    const r2 = tx.objectStore(STORES.QUESTIONS_DELETED).getAllKeys();
    r2.onsuccess = () => { deletedKeys = r2.result; done(); };
    const r3 = settingsStore.get(LOWEST_LOCAL_QUESTION_ID_KEY);
    r3.onsuccess = () => { marker = r3.result?.value ?? null; done(); };

    function write() {
      if (report.sections.local) {
        const existingLocals = stored.filter((q) => q.id < 0);
        // Tous les id locaux déjà attribués, y compris ceux supprimés ensuite.
        const usedIds = [...existingLocals.map((q) => q.id), ...deletedKeys];
        if (typeof marker === "number") usedIds.push(marker);

        const keys = new Set();
        if (mode === IMPORT_MODES.REPLACE) {
          for (const q of existingLocals) {
            userStore.delete(q.id);
            summary.localRemoved.push(q.id);
          }
        } else {
          for (const q of existingLocals) keys.add(localDuplicateKey(q));
        }

        for (const { question } of report.local.valid) {
          const key = localDuplicateKey(question);
          if (keys.has(key)) {
            summary.localSkipped += 1; // doublon apparu depuis la validation
            continue;
          }
          keys.add(key);
          const id = nextLocalQuestionId(usedIds);
          usedIds.push(id);
          userStore.add({ id, texte: question.texte, tags: [...question.tags], author: question.author });
          summary.localAdded.push(id);
        }
        summary.localSkipped += report.local.duplicates.length;

        const lowest = nextLocalQuestionId(usedIds) + 1; // plus petit id attribué
        if (lowest < 0 && (typeof marker !== "number" || lowest < marker)) {
          settingsStore.put({ key: LOWEST_LOCAL_QUESTION_ID_KEY, value: lowest });
        }
      }

      if (report.sections.base) {
        if (mode === IMPORT_MODES.REPLACE) {
          for (const q of stored.filter((x) => x.id > 0)) {
            userStore.delete(q.id);
            summary.overridesRemoved.push(q.id);
          }
        }
        for (const override of report.base.valid) {
          userStore.put(toQuestion(override)); // même id positif : ajout ou remplacement
          summary.overridesApplied.push(override.id);
        }
      }
    }

    tx.oncomplete = () => resolve(summary);
    tx.onerror = () =>
      reject(new Error(`[exchangeRepository] Import impossible : ${tx.error?.message ?? tx.error}`));
    tx.onabort = () =>
      reject(new Error(`[exchangeRepository] Import annulé : ${tx.error?.message ?? "transaction interrompue"}`));
  });
}
