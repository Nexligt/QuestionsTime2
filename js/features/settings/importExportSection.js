/*
  importExportSection.js
  Section "Import / Export" de Paramètres > Réglages : INTERFACE uniquement.
  Toute la logique (construction du JSON, lecture, validation, écriture)
  est dans js/data/exchangeRepository.js :
    - buildExportText()         : même JSON pour « Copier » et « Télécharger » ;
    - parseAndValidateImport()  : même analyse pour un fichier et un texte collé
                                  (aucune écriture) -> aperçu ;
    - applyImport()             : écriture, uniquement après confirmation.
*/

import {
  buildExportText,
  parseAndValidateImport,
  applyImport,
  IMPORT_MODES,
} from "../../data/exchangeRepository.js";
import { formatQuestionId } from "../questions/questionId.js";

const EXPORT_CHOICES = [
  { value: "local", label: "Questions locales", short: "Locales" },
  { value: "base", label: "Questions de base modifiées", short: "Base" },
  { value: "both", label: "Les deux" },
];

const MODE_CHOICES = [
  { value: IMPORT_MODES.MERGE, label: "Fusionner", description: "Ajoute les nouvelles questions, sans rien supprimer." },
  { value: IMPORT_MODES.REPLACE, label: "Remplacer", description: "Remplace les questions locales et/ou modifications de base existantes par celles de l'import." },
];

let ioCounter = 0;

/** Nom de fichier d'export : questionstime2-export-YYYY-MM-DD.json (date locale). */
export function exportFileName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `questionstime2-export-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * @param {string} labelledBy - id du titre de la section.
 * @returns {HTMLElement}
 */
export function buildImportExportSection(labelledBy) {
  const uid = ++ioCounter;
  const root = document.createElement("div");
  root.className = "settings-io";
  root.setAttribute("aria-labelledby", labelledBy);

  // Texte d'export préparé, partagé par « Copier » et « Télécharger » :
  // les deux actions donnent EXACTEMENT le même JSON (même exportedAt).
  // Invalidé quand le choix d'export change ou après un import.
  const exportCache = { scope: null, text: null };
  const invalidateExport = () => {
    exportCache.scope = null;
    exportCache.text = null;
  };

  root.append(buildExportPart(uid, exportCache, invalidateExport), buildImportPart(uid, invalidateExport));
  return root;
}

/* ------------------------------ Export ------------------------------ */

function buildExportPart(uid, exportCache, invalidateExport) {
  const part = document.createElement("div");
  part.className = "settings-io__part settings-io__export";

  const title = document.createElement("h3");
  title.className = "settings-io__title";
  title.id = `io-export-title-${uid}`;
  title.textContent = "Exporter";

  const scope = createRadioGroup(`io-export-scope-${uid}`, EXPORT_CHOICES, "both", title.id, { segmented: true });
  scope.root.classList.add("settings-io__scope");

  const actions = document.createElement("div");
  actions.className = "settings-io__actions";
  const copyButton = createButton("Copier le texte", "button button--secondary settings-io__copy");
  const downloadButton = createButton("Télécharger le fichier", "button settings-io__download");
  actions.append(copyButton, downloadButton);

  const status = createStatus();
  // Repli si le presse-papiers est indisponible : texte affiché, à copier à la main.
  const fallback = document.createElement("textarea");
  fallback.className = "settings-io__textarea settings-io__fallback";
  fallback.readOnly = true;
  fallback.rows = 4;
  fallback.hidden = true;
  fallback.setAttribute("aria-label", "Texte de l'export à copier");

  part.append(title, scope.root, actions, status.el, fallback);
  scope.root.addEventListener("change", () => {
    invalidateExport();
    status.set("", "");
    fallback.hidden = true;
  });

  async function getExportText() {
    const wanted = scope.value();
    if (exportCache.scope !== wanted || exportCache.text === null) {
      exportCache.text = await buildExportText({ sections: wanted });
      exportCache.scope = wanted;
    }
    return exportCache.text;
  }

  async function run(button, action) {
    copyButton.disabled = true;
    downloadButton.disabled = true;
    try {
      await action(await getExportText());
    } catch (error) {
      console.error("[importExport] Export impossible :", error);
      status.set("Impossible de préparer l'export pour le moment.", "error");
    } finally {
      copyButton.disabled = false;
      downloadButton.disabled = false;
      button.focus?.();
    }
  }

  copyButton.addEventListener("click", () =>
    run(copyButton, async (text) => {
      fallback.hidden = true;
      try {
        await globalThis.navigator.clipboard.writeText(text);
        status.set("Texte copié dans le presse-papiers.", "success");
      } catch {
        fallback.value = text;
        fallback.hidden = false;
        fallback.select?.();
        status.set("Copie automatique impossible : sélectionnez le texte ci-dessous et copiez-le.", "error");
      }
    })
  );

  downloadButton.addEventListener("click", () =>
    run(downloadButton, async (text) => {
      const fileName = exportFileName();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.hidden = true;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.set(`Fichier « ${fileName} » téléchargé.`, "success");
    })
  );

  return part;
}

/* ------------------------------ Import ------------------------------ */

function buildImportPart(uid, invalidateExport) {
  const part = document.createElement("div");
  part.className = "settings-io__part settings-io__import";

  const title = document.createElement("h3");
  title.className = "settings-io__title";
  title.id = `io-import-title-${uid}`;
  title.textContent = "Importer";

  // Source 1 : fichier .json
  const fileLabel = document.createElement("label");
  fileLabel.className = "button button--secondary settings-io__file-label";
  fileLabel.textContent = "Choisir un fichier .json";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json";
  fileInput.className = "visually-hidden settings-io__file";
  fileLabel.append(fileInput);

  // Source 2 : texte collé
  const textarea = document.createElement("textarea");
  textarea.className = "settings-io__textarea settings-io__paste";
  textarea.rows = 4;
  textarea.placeholder = "…ou collez ici le texte JSON exporté";
  textarea.setAttribute("aria-label", "Texte JSON à importer");
  textarea.spellcheck = false;

  const analyzeButton = createButton("Analyser", "button button--secondary settings-io__analyze");

  const mode = createRadioGroup(`io-import-mode-${uid}`, MODE_CHOICES, IMPORT_MODES.MERGE, title.id, { segmented: true });
  mode.root.classList.add("settings-io__mode");
  // Description du mode choisi, affichée sous le sélecteur (les lecteurs
  // d'écran l'entendent déjà dans le libellé de chaque option).
  const modeHint = document.createElement("p");
  modeHint.className = "settings-io__mode-hint";
  modeHint.setAttribute("aria-hidden", "true");
  const updateModeHint = () => {
    modeHint.textContent = MODE_CHOICES.find((c) => c.value === mode.value())?.description ?? "";
  };
  updateModeHint();
  mode.root.addEventListener("change", updateModeHint);

  const preview = document.createElement("div");
  preview.className = "settings-io__preview";
  preview.setAttribute("aria-live", "polite");
  preview.hidden = true;

  const confirmButton = createButton("Confirmer l'import", "button settings-io__confirm");
  confirmButton.hidden = true;

  const status = createStatus();

  part.append(title, fileLabel, textarea, analyzeButton, mode.root, modeHint, preview, confirmButton, status.el);

  let report = null;
  let sourceText = "";

  function resetPreview() {
    report = null;
    preview.hidden = true;
    preview.innerHTML = "";
    confirmButton.hidden = true;
  }

  /** Analyse (lecture seule) : même moteur pour le fichier et le texte collé. */
  async function analyze(text) {
    sourceText = text;
    status.set("", "");
    resetPreview();
    if (text.trim() === "") {
      status.set("Collez un texte JSON ou choisissez un fichier.", "error");
      return;
    }
    try {
      report = await parseAndValidateImport(text, { mode: mode.value() });
    } catch (error) {
      console.error("[importExport] Analyse impossible :", error);
      status.set("Impossible d'analyser l'import pour le moment.", "error");
      return;
    }
    renderPreview(report);
    part.dataset.analyzed = "true";
  }

  function renderPreview(r) {
    preview.innerHTML = "";
    preview.hidden = false;

    const heading = document.createElement("p");
    heading.className = "settings-io__preview-title";
    heading.textContent = r.ok ? "Aperçu (rien n'est encore modifié)" : "Import impossible";
    preview.append(heading);

    if (!r.ok) {
      preview.append(createList(r.errors.map((e) => e.message), "settings-io__errors", "errors"));
      confirmButton.hidden = true;
      return;
    }

    const lines = [];
    if (r.sections.local) {
      lines.push(["local-add", `Questions locales à ajouter : ${r.local.valid.length}`]);
      lines.push(["local-duplicates", `Doublons ignorés : ${r.local.duplicates.length}`]);
      if (r.local.invalid.length) lines.push(["local-invalid", `Questions locales invalides ignorées : ${r.local.invalid.length}`]);
    }
    if (r.sections.base) {
      lines.push(["base-overrides", `Questions de base modifiées à appliquer : ${r.base.valid.length}`]);
      if (r.base.unknownIds.length) {
        lines.push(["base-unknown", `IDs de base inconnus ignorés : ${r.base.unknownIds.map(formatQuestionId).join(", ")}`]);
      }
      if (r.base.invalid.length) lines.push(["base-invalid", `Questions de base invalides ignorées : ${r.base.invalid.length}`]);
      if (r.base.currentlyDeleted.length) {
        lines.push(["base-deleted", `Actuellement supprimées (resteront supprimées) : ${r.base.currentlyDeleted.map(formatQuestionId).join(", ")}`]);
      }
    }
    if (r.mode === IMPORT_MODES.REPLACE) {
      lines.push(["replace", "Mode Remplacer : les données existantes des sections importées seront remplacées."]);
    }
    const list = document.createElement("ul");
    list.className = "settings-io__summary";
    for (const [key, text] of lines) {
      const li = document.createElement("li");
      li.dataset.line = key;
      li.textContent = text;
      list.append(li);
    }
    preview.append(list);

    const problems = [
      ...r.warnings.map((w) => w.message),
      ...r.local.invalid.map((i) => `Locale n°${i.index + 1} : ${i.errors.join(" ")}`),
      ...r.base.invalid.map((i) => `Base n°${i.index + 1} : ${i.errors.join(" ")}`),
    ];
    if (problems.length) preview.append(createList(problems, "settings-io__warnings", "warnings"));

    const hasWork =
      r.local.valid.length > 0 || r.base.valid.length > 0 || r.mode === IMPORT_MODES.REPLACE;
    confirmButton.hidden = !hasWork;
    if (!hasWork) {
      const nothing = document.createElement("p");
      nothing.className = "settings-io__nothing";
      nothing.textContent = "Rien à importer.";
      preview.append(nothing);
    }
  }

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      textarea.value = text; // même chemin que le texte collé
      await analyze(text);
    } catch (error) {
      console.error("[importExport] Lecture du fichier impossible :", error);
      status.set("Impossible de lire ce fichier.", "error");
    } finally {
      fileInput.value = "";
    }
  });

  analyzeButton.addEventListener("click", () => analyze(textarea.value));
  textarea.addEventListener("input", () => {
    if (report) resetPreview(); // aperçu périmé dès que le texte change
  });
  // Le mode influe sur l'aperçu (doublons, remplacements) : nouvelle analyse.
  mode.root.addEventListener("change", () => {
    if (sourceText.trim() !== "") analyze(sourceText);
  });

  confirmButton.addEventListener("click", async () => {
    if (!report?.ok) return;
    confirmButton.disabled = true;
    try {
      const result = await applyImport(report);
      invalidateExport(); // les données ont changé : prochain export recalculé
      const parts = [];
      if (report.sections.local) {
        parts.push(`${result.localAdded.length} question(s) locale(s) ajoutée(s)`);
        if (result.localRemoved.length) parts.push(`${result.localRemoved.length} remplacée(s)`);
      }
      if (report.sections.base) parts.push(`${result.overridesApplied.length} modification(s) de base appliquée(s)`);
      resetPreview();
      textarea.value = "";
      sourceText = "";
      status.set(`Import terminé : ${parts.join(", ")}.`, "success");
    } catch (error) {
      console.error("[importExport] Import impossible :", error);
      status.set("L'import a échoué : aucune donnée n'a été modifiée.", "error");
    } finally {
      confirmButton.disabled = false;
    }
  });

  return part;
}

/* ------------------------------ Outils ------------------------------ */

function createButton(text, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function createStatus() {
  const el = document.createElement("p");
  el.className = "settings-io__status";
  el.setAttribute("aria-live", "polite");
  return {
    el,
    set(text, kind) {
      el.textContent = text;
      el.dataset.status = kind;
    },
  };
}

function createList(items, className, key) {
  const list = document.createElement("ul");
  list.className = className;
  list.dataset.list = key;
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    list.append(li);
  }
  return list;
}

/**
 * Groupe radio (mêmes classes que les autres choix de Paramètres).
 * `segmented` : présentation en sélecteur à segments compact ; le libellé
 * complet et la description restent lus par les lecteurs d'écran, le
 * segment affiche `short` s'il existe.
 */
function createRadioGroup(name, choices, initial, labelledBy, { segmented = false } = {}) {
  const root = document.createElement("div");
  root.className = segmented ? "settings-choices settings-segmented" : "settings-choices";
  root.setAttribute("role", "radiogroup");
  root.setAttribute("aria-labelledby", labelledBy);
  for (const choice of choices) {
    const label = document.createElement("label");
    label.className = "settings-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = choice.value;
    input.className = "settings-choice__input";
    input.checked = choice.value === initial;
    const text = document.createElement("span");
    text.className = "settings-choice__text";
    const optionName = document.createElement("span");
    optionName.className = "settings-choice__label";
    optionName.textContent = choice.label;
    text.append(optionName);
    if (segmented && choice.short) {
      optionName.classList.add("visually-hidden");
      const short = document.createElement("span");
      short.className = "settings-segmented__short";
      short.setAttribute("aria-hidden", "true");
      short.textContent = choice.short;
      text.append(short);
    }
    if (choice.description) {
      const description = document.createElement("span");
      description.className = segmented
        ? "settings-choice__description visually-hidden"
        : "settings-choice__description";
      description.textContent = choice.description;
      text.append(description);
    }
    label.append(input, text);
    root.append(label);
  }
  return {
    root,
    value: () => root.querySelector("input:checked")?.value ?? initial,
  };
}
