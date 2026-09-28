/*
  questionFormView.js
  Formulaire d'une question locale, en deux modes partageant exactement
  la même interface (tags repliables, recherche en direct, validations) :
  - CRÉATION     : route "question-form", bouton "+" de Main ;
  - MODIFICATION : route "question-edit", bouton "Modifier" de Main,
    formulaire prérempli avec la question telle qu'affichée ; l'id et
    donc le numéro affiché ("L-n" / "B-n") ne changent jamais.
      * question locale (id < 0) -> remplacée via updateLocalQuestion ;
      * question de base (id > 0) -> override local de même id via
        saveBaseQuestionOverride (questions.base.json jamais modifié).
  Suppression / édition des questions de base : étapes ultérieures.

  - Validation et normalisation : features/questions/localQuestion.js.
  - Enregistrement : questionsRepository.createLocalQuestion (store
    `questionsUser` existant, id négatif, { id, texte, tags, author }).
  - Après succès : retour sur Main. `currentQuestionId`, le mode, les
    filtres et l'historique ne sont pas touchés. Annuler n'écrit rien.
*/

import {
  getAvailableQuestions,
  createLocalQuestion,
  getQuestionById,
  updateLocalQuestion,
  saveBaseQuestionOverride,
} from "../../data/questionsRepository.js";
import { getSetting } from "../../data/settingsRepository.js";
import { CURRENT_QUESTION_ID_KEY } from "./questionEngine.js";
import { formatQuestionId } from "./questionId.js";
import { navigateTo } from "../../core/router.js";
import { extractTags, searchTags } from "../filters/tagFilters.js";
import { addTagsFromText, tagKey, validateQuestionDraft } from "./localQuestion.js";

let fieldCounter = 0;

/** Question locale à modifier, transmise par Main avant la navigation. */
let pendingEditId = null;

/**
 * Ouvre le formulaire de modification d'une question (locale ou de base).
 * @param {number} id - id interne.
 */
export function openQuestionEditor(id) {
  pendingEditId = id;
  navigateTo("question-edit");
}

/** Création (route "question-form"). */
export function createQuestionFormView() {
  return buildQuestionForm({ mode: "create" });
}

/**
 * Modification (route "question-edit"). Question ciblée : celle transmise
 * par `openQuestionEditor` ; à défaut (ex. rechargement de la page), la
 * question courante — lecture seule de currentQuestionId.
 */
export function createQuestionEditView() {
  const id = pendingEditId;
  pendingEditId = null;
  return buildQuestionForm({ mode: "edit", questionId: id });
}

function buildQuestionForm({ mode, questionId = null }) {
  const isEdit = mode === "edit";
  const uid = ++fieldCounter;
  const view = document.createElement("div");
  view.className = `view view--question-form${isEdit ? " view--question-edit" : ""}`;

  const form = document.createElement("form");
  form.className = "card question-form";
  form.noValidate = true; // validation gérée ici, messages en français

  const heading = document.createElement("h1");
  heading.className = "question-form__title";
  heading.textContent = isEdit ? "Modifier la question" : "Nouvelle question";

  const idLabel = document.createElement("p");
  idLabel.className = "question-form__id";
  idLabel.hidden = !isEdit;

  const summary = document.createElement("p");
  summary.className = "question-form__summary";
  summary.setAttribute("role", "alert");

  // --- Texte -------------------------------------------------------------
  const texteField = createField(`qf-texte-${uid}`, "Question", "texte");
  const texteInput = document.createElement("textarea");
  texteInput.id = `qf-texte-${uid}`;
  texteInput.name = "texte";
  texteInput.rows = 4;
  texteInput.className = "question-form__input question-form__textarea";
  texteInput.placeholder = "Saisissez la question…";
  texteField.control.append(texteInput);

  // --- Tags --------------------------------------------------------------
  const tagsField = createField(`qf-tag-${uid}`, "Tags", "tags");
  const tagRow = document.createElement("div");
  tagRow.className = "question-form__tag-row";
  const tagInput = document.createElement("input");
  tagInput.id = `qf-tag-${uid}`;
  tagInput.name = "tag";
  tagInput.type = "text";
  tagInput.className = "question-form__input";
  tagInput.placeholder = "Ex. : Jeux"; // court : jamais coupé, même à 320 px
  tagInput.autocomplete = "off";
  tagInput.enterKeyHint = "done";
  const addTagButton = document.createElement("button");
  addTagButton.type = "button";
  addTagButton.className = "button button--secondary question-form__add-tag";
  addTagButton.textContent = "Ajouter";
  tagRow.append(tagInput, addTagButton);

  const selectedTags = document.createElement("ul");
  selectedTags.className = "question-form__tags";
  selectedTags.setAttribute("aria-label", "Tags de la question");

  // Zone repliable des tags existants (même principe que Filtres) : le
  // champ d'ajout et les tags choisis restent toujours visibles.
  const suggestionsToggle = document.createElement("button");
  suggestionsToggle.type = "button";
  suggestionsToggle.className = "filters-toggle question-form__suggestions-toggle";
  const toggleLabel = document.createElement("span");
  toggleLabel.className = "filters-toggle__label";
  toggleLabel.textContent = "Tags existants";
  const toggleIcon = document.createElement("span");
  toggleIcon.className = "filters-toggle__icon";
  toggleIcon.setAttribute("aria-hidden", "true");
  toggleIcon.textContent = "▾";
  suggestionsToggle.append(toggleLabel, toggleIcon);

  const suggestionsZone = document.createElement("div");
  suggestionsZone.className = "question-form__suggestions-zone";
  suggestionsZone.id = `qf-suggestions-${uid}`;
  suggestionsToggle.setAttribute("aria-controls", suggestionsZone.id);
  const suggestionsLabel = document.createElement("p");
  suggestionsLabel.className = "question-form__hint";
  suggestionsLabel.setAttribute("aria-live", "polite");
  const suggestions = document.createElement("ul");
  suggestions.className = "question-form__suggestions";
  suggestionsZone.append(suggestionsLabel, suggestions);

  tagsField.control.append(tagRow, selectedTags, suggestionsToggle, suggestionsZone);

  // --- Auteur ------------------------------------------------------------
  const authorField = createField(`qf-author-${uid}`, "Auteur", "author");
  const authorInput = document.createElement("input");
  authorInput.id = `qf-author-${uid}`;
  authorInput.name = "author";
  authorInput.type = "text";
  authorInput.className = "question-form__input";
  authorInput.placeholder = "Votre nom";
  authorInput.autocomplete = "name";
  authorField.control.append(authorInput);

  // --- Actions -----------------------------------------------------------
  const actions = document.createElement("div");
  actions.className = "question-form__actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button--secondary question-form__cancel";
  cancelButton.textContent = "Annuler";
  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.className = "button question-form__submit";
  submitButton.textContent = isEdit ? "Enregistrer les modifications" : "Enregistrer";
  submitButton.disabled = isEdit; // réactivé une fois la question chargée
  actions.append(cancelButton, submitButton);

  form.append(heading, idLabel, summary, texteField.root, tagsField.root, authorField.root, actions);
  view.append(form);

  // --- État & comportement ----------------------------------------------
  let tags = [];
  let knownTags = [];
  let saving = false;
  let editedId = null; // id interne de la question modifiée (jamais changé)
  const fields = { texte: texteField, tags: tagsField, author: authorField };

  function renderTags() {
    selectedTags.innerHTML = "";
    for (const tag of tags) {
      const item = document.createElement("li");
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip question-form__tag";
      chip.dataset.tag = tag;
      chip.setAttribute("aria-label", `Retirer le tag ${tag}`);
      chip.textContent = `${tag} ✕`;
      chip.addEventListener("click", () => {
        tags = tags.filter((t) => t !== tag);
        renderTags();
      });
      item.append(chip);
      selectedTags.append(item);
    }
    renderSuggestions();
  }

  function setSuggestionsExpanded(expanded) {
    suggestionsToggle.setAttribute("aria-expanded", String(expanded));
    suggestionsZone.hidden = !expanded;
  }

  /** Dernier morceau saisi (plusieurs tags possibles, séparés par , ou ;). */
  function currentQuery() {
    return tagInput.value.split(/[,;]/).pop() ?? "";
  }

  /**
   * Suggestions en direct : tags existants correspondant à la saisie,
   * via `searchTags` (même recherche que Filtres), hors tags déjà choisis.
   */
  function renderSuggestions() {
    suggestions.innerHTML = "";
    const query = currentQuery();
    const chosen = new Set(tags.map(tagKey));
    const available = knownTags.filter((t) => !chosen.has(tagKey(t)));
    const matches = searchTags(available, query);
    toggleLabel.textContent = `Tags existants (${available.length})`;
    suggestionsToggle.hidden = knownTags.length === 0;

    const typed = query.trim();
    const isExisting = typed !== "" && knownTags.some((t) => tagKey(t) === tagKey(typed));
    if (typed === "") {
      suggestionsLabel.textContent = available.length ? "Touchez un tag pour l'ajouter." : "";
    } else if (isExisting) {
      suggestionsLabel.textContent = "";
    } else {
      suggestionsLabel.textContent = `« ${typed} » est un nouveau tag : touchez « Ajouter » pour le créer.`;
    }
    suggestionsLabel.dataset.newTag = typed !== "" && !isExisting ? "true" : "false";

    for (const tag of matches) {
      const item = document.createElement("li");
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "tag-chip question-form__suggestion";
      chip.dataset.tag = tag;
      chip.textContent = `+ ${tag}`;
      chip.addEventListener("click", () => {
        // Orthographe existante conservée, sans doublon ; la saisie en
        // cours est remplacée par le tag choisi.
        tags = addTagsFromText(tags, tag, knownTags);
        const parts = tagInput.value.split(/[,;]/);
        parts.pop();
        tagInput.value = parts.length ? `${parts.join(",")},` : "";
        clearError("tags");
        renderTags();
        tagInput.focus?.();
      });
      item.append(chip);
      suggestions.append(item);
    }
  }

  function commitTagInput() {
    if (tagInput.value.trim() === "") return;
    tags = addTagsFromText(tags, tagInput.value, knownTags);
    tagInput.value = "";
    clearError("tags");
    renderTags();
  }

  function setError(name, message) {
    const field = fields[name];
    field.error.textContent = message ?? "";
    field.root.classList.toggle("question-form__field--invalid", Boolean(message));
    const control = name === "tags" ? tagInput : name === "texte" ? texteInput : authorInput;
    control.setAttribute("aria-invalid", String(Boolean(message)));
  }

  function clearError(name) {
    setError(name, "");
    if (!Object.values(fields).some((f) => f.error.textContent)) summary.textContent = "";
  }

  setSuggestionsExpanded(true);
  suggestionsToggle.addEventListener("click", () => {
    setSuggestionsExpanded(suggestionsToggle.getAttribute("aria-expanded") !== "true");
  });
  tagInput.addEventListener("input", () => {
    if (currentQuery().trim() !== "") setSuggestionsExpanded(true);
    renderSuggestions();
  });

  addTagButton.addEventListener("click", () => {
    commitTagInput();
    tagInput.focus?.();
  });
  tagInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTagInput();
    }
  });
  texteInput.addEventListener("input", () => clearError("texte"));
  authorInput.addEventListener("input", () => clearError("author"));

  cancelButton.addEventListener("click", () => navigateTo("main"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || (isEdit && editedId === null)) return;
    commitTagInput(); // un tag tapé mais pas encore ajouté compte aussi

    const { valid, errors, question } = validateQuestionDraft(
      { texte: texteInput.value, tags, author: authorInput.value },
      knownTags
    );
    for (const name of Object.keys(fields)) setError(name, errors[name]);
    if (!valid) {
      summary.textContent = "Complétez les champs obligatoires pour enregistrer la question.";
      summary.dataset.status = "error";
      const firstInvalid = errors.texte ? texteInput : errors.tags ? tagInput : authorInput;
      firstInvalid.focus?.();
      return;
    }

    saving = true;
    submitButton.disabled = true;
    summary.textContent = "";
    try {
      if (isEdit) {
        if (editedId > 0) {
          await saveBaseQuestionOverride(editedId, question);
        } else {
          await updateLocalQuestion(editedId, question);
        }
      } else {
        await createLocalQuestion(question);
      }
      navigateTo("main");
    } catch (error) {
      console.error("[questionFormView] Enregistrement impossible :", error);
      summary.textContent = "Impossible d'enregistrer la question pour le moment.";
      summary.dataset.status = "error";
    } finally {
      saving = false;
      submitButton.disabled = false;
    }
  });

  (async () => {
    try {
      knownTags = extractTags(await getAvailableQuestions());
    } catch (error) {
      console.error("[questionFormView] Tags existants indisponibles :", error);
    }
    renderSuggestions();
  })();

  if (isEdit) {
    (async () => {
      let question = null;
      try {
        let id = questionId;
        if (id === null) id = await getSetting(CURRENT_QUESTION_ID_KEY, null);
        question = await getQuestionById(id);
      } catch (error) {
        console.error("[questionFormView] Question à modifier illisible :", error);
      }
      if (!question) {
        summary.textContent = "Question introuvable : elle ne peut pas être modifiée.";
        summary.dataset.status = "error";
        return;
      }
      editedId = question.id;
      idLabel.textContent = `Question ${formatQuestionId(question.id)}`;
      view.dataset.questionId = String(question.id);
      texteInput.value = question.texte;
      authorInput.value = question.author;
      tags = [...question.tags];
      renderTags();
      submitButton.disabled = false;
    })();
  }

  return view;
}

/** Champ avec libellé, zone de contrôle et message d'erreur. */
function createField(controlId, labelText, name) {
  const root = document.createElement("div");
  root.className = "question-form__field";
  root.dataset.field = name;

  const label = document.createElement("label");
  label.className = "question-form__label";
  label.htmlFor = controlId;
  label.textContent = `${labelText} *`;

  const control = document.createElement("div");
  control.className = "question-form__control";

  const error = document.createElement("p");
  error.className = "question-form__error";
  error.id = `${controlId}-error`;
  error.setAttribute("aria-live", "polite");

  root.append(label, control, error);
  return { root, control, error };
}
