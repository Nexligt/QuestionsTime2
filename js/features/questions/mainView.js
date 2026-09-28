/*
  mainView.js
  Écran "Main" : titre, indicateur de mode, bandeau d'actions, question
  courante avec ID et tags, bouton "Suivante".

  --------------------------------------------------------------------
  Sélection des questions — ne change JAMAIS sur un simple remontage
  --------------------------------------------------------------------
  Un rechargement (F5), un retour via "Accueil" depuis une autre vue,
  ou toute reconstruction de cette vue NE DOIT PAS changer la question
  affichée : `questionEngine.getCurrentQuestion(questions)` s'en charge
  (elle réaffiche `currentQuestionId` si toujours disponible, sans
  toucher à l'historique). Seul un clic sur "Suivante" (plus tard le
  swipe) déclenche une vraie nouvelle sélection, via
  `questionEngine.advanceToNextQuestion(questions)`.

  Ce module ne connaît ni IndexedDB, ni le mode courant, ni
  l'historique, ni `currentQuestionId` (cahier des charges §11/§15) :
  il appelle uniquement les deux fonctions ci-dessus et affiche le
  résultat — y compris l'état `SELECTION_STATUS.STRICT_EXHAUSTED`
  (mode Strict, toutes les questions déjà vues : aucun reset
  automatique, un message informatif est affiché à la place).

  L'accès aux questions de base passe exclusivement par
  questionsRepository.js — aucun fetch() direct ici.

  Filtres par tag : relus à chaque montage (filtersRepository.js) et
  appliqués AVANT le moteur (features/filters/tagFilters.js) : le moteur
  Strict/Libre ne reçoit que les questions compatibles. Si aucune ne
  l'est, un message dédié est affiché et le moteur n'est pas appelé.

  Les trois boutons d'action (créer / modifier / supprimer) sont pour
  l'instant sans fonctionnalité métier : seule leur présence et leur
  taille tactile sont assurées à ce stade.
*/

import { getAvailableQuestions, deleteQuestion } from "../../data/questionsRepository.js";
import { navigateTo } from "../../core/router.js";
import { formatQuestionId } from "./questionId.js";
import { openQuestionEditor } from "./questionFormView.js";
import { getTagFilterStates } from "../../data/filtersRepository.js";
import { attachLeftSwipe } from "../../ui/swipeGesture.js";
import {
  getNextNavigation,
  isButtonEnabled,
  isSwipeEnabled,
  DEFAULT_NEXT_NAVIGATION,
} from "./nextNavigation.js";
import {
  applyTagFilters,
  extractTags,
  pruneUnknownTags,
} from "../filters/tagFilters.js";
import {
  getCurrentQuestion,
  advanceToNextQuestion,
  getCurrentSelectionMode,
  toggleSelectionMode,
} from "./questionEngine.js";
import {
  NoQuestionsAvailableError,
  SELECTION_STATUS,
  SELECTION_MODES,
} from "./questionSelection.js";

/** Icônes inline (pas de fetch séparé : boutons statiques, non configurables). */
const ACTION_ICONS = {
  add: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
  delete: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6.5 7l1 12a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-12"/></svg>`,
};

const ACTIONS = [
  { key: "add", label: "Créer une question" },
  { key: "edit", label: "Modifier la question actuelle" },
  { key: "delete", label: "Supprimer la question actuelle" },
];

/**
 * Construit la vue Main.
 *
 * Le rendu du routeur (js/core/router.js) est synchrone : cette
 * fonction retourne donc immédiatement un conteneur avec un état
 * "chargement", puis le remplit dès que les questions de base sont
 * disponibles (chargement asynchrone géré à l'intérieur du module).
 * @returns {HTMLElement}
 */
export function createMainView() {
  const view = document.createElement("div");
  view.className = "view view--main";

  const header = document.createElement("header");
  header.className = "main-header";
  const title = document.createElement("h1");
  title.id = "img-titre";
  title.className = "app-title";
  title.textContent = "QuestionsTime2";

  const modeIndicator = document.createElement("button");
  modeIndicator.type = "button";
  modeIndicator.className = "mode-indicator";
  modeIndicator.textContent = "Mode : …";
  modeIndicator.disabled = true; // réactivé une fois le mode lu

  header.append(title, modeIndicator);

  const actionBar = createActionBar();

  const questionCard = document.createElement("section");
  questionCard.className = "card question-card";
  questionCard.setAttribute("aria-live", "polite");
  questionCard.append(createStatusMessage("Chargement de la question…"));

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "button question-next";
  nextButton.textContent = "Suivante";
  nextButton.disabled = true; // réactivé une fois les questions chargées

  const deleteConfirm = createDeleteConfirm();

  // Bloc central (confirmation éventuelle, carte, « Suivante ») : centré
  // verticalement dans l'espace entre le bandeau d'actions et la barre du
  // bas ; reprend sa place en haut (et la page défile) s'il est trop haut.
  const stage = document.createElement("div");
  stage.className = "main-stage";
  stage.append(deleteConfirm.root, questionCard, nextButton);

  view.append(header, actionBar, stage);

  wireModeIndicator(modeIndicator);
  const editButton = actionBar.querySelector('[data-action="edit"]');
  editButton.addEventListener("click", () => {
    const id = Number(editButton.dataset.questionId);
    if (Number.isFinite(id) && id !== 0) openQuestionEditor(id);
  });
  const deleteButton = actionBar.querySelector('[data-action="delete"]');
  deleteButton.addEventListener("click", () => {
    const id = Number(deleteButton.dataset.questionId);
    if (Number.isFinite(id) && id !== 0) deleteConfirm.open(id);
  });
  deleteConfirm.onConfirm(async (id) => {
    await deleteQuestion(id);
    // La question affichée n'existe plus : Main est reconstruit, ce qui
    // applique la règle existante du moteur (currentQuestionId devenu
    // indisponible -> nouvelle sélection parmi les questions restantes,
    // ou message si aucune n'est disponible).
    view.replaceWith(createMainView());
  });

  wireQuestionSelection(questionCard, nextButton, (question) => {
    updateEditButton(editButton, question);
    updateEditButton(deleteButton, question);
    deleteConfirm.close();
  });

  return view;
}

/**
 * Affiche le mode courant (Strict/Libre). Relu à chaque montage de
 * Main (cahier des charges §14) : ne garde aucune valeur en mémoire
 * d'un montage précédent.
 * @param {HTMLElement} modeIndicator
 */
async function wireModeIndicator(modeIndicator) {
  function renderMode(mode) {
    const label = mode === SELECTION_MODES.LIBRE ? "Libre" : "Strict";
    modeIndicator.textContent = `Mode : ${label}`;
    modeIndicator.dataset.mode = mode === SELECTION_MODES.LIBRE ? "libre" : "strict";
    modeIndicator.setAttribute(
      "aria-label",
      `Mode ${label}. Toucher pour passer en mode ${label === "Libre" ? "Strict" : "Libre"}.`
    );
  }

  try {
    renderMode(await getCurrentSelectionMode());
  } catch (error) {
    console.error("[mainView] Impossible de lire le mode courant :", error);
    renderMode(SELECTION_MODES.STRICT); // repli sur la valeur par défaut documentée
  }

  // Bascule Strict <-> Libre : seul `settings.selectionMode` change (via
  // questionEngine.js) ; la question affichée, `currentQuestionId` et
  // l'historique restent intacts. Le prochain "Suivante" relit ce mode.
  modeIndicator.addEventListener("click", async () => {
    modeIndicator.disabled = true;
    try {
      renderMode(await toggleSelectionMode());
    } catch (error) {
      console.error("[mainView] Impossible de changer de mode :", error);
    } finally {
      modeIndicator.disabled = false;
    }
  });
  modeIndicator.disabled = false;
}

/** Bandeau d'actions : présence + taille tactile uniquement, pas de logique. */
function createActionBar() {
  const actionBar = document.createElement("div");
  actionBar.className = "action-bar";
  actionBar.setAttribute("role", "toolbar");
  actionBar.setAttribute("aria-label", "Actions sur la question");

  for (const action of ACTIONS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.dataset.action = action.key;
    button.setAttribute("aria-label", action.label);
    button.innerHTML = ACTION_ICONS[action.key];
    if (action.key === "add") {
      // "+" : écran de création d'une question locale.
      button.addEventListener("click", () => navigateTo("question-form"));
    }
    if (action.key === "edit") {
      // Activé dès qu'une question (locale ou de base) est affichée
      // (voir updateEditButton).
      button.disabled = true;
    }
    if (action.key === "delete") {
      // Actif dès qu'une question est affichée ; confirmation obligatoire.
      button.disabled = true;
    }
    actionBar.append(button);
  }

  return actionBar;
}

/**
 * Charge les questions de base, affiche la question courante au
 * montage (sans jamais en sélectionner une nouvelle), et branche
 * "Suivante" pour déclencher une vraie nouvelle sélection. Isolé de
 * createMainView() pour rester lisible.
 * @param {HTMLElement} questionCard
 * @param {HTMLButtonElement} nextButton
 */
/**
 * Confirmation de suppression, intégrée à la page (pas de boîte native).
 * Texte différent pour une question locale (définitive) et de base
 * (restaurable depuis "Questions supprimées").
 */
function createDeleteConfirm() {
  const root = document.createElement("div");
  root.className = "card delete-confirm";
  root.setAttribute("role", "alertdialog");
  root.setAttribute("aria-label", "Confirmer la suppression");
  root.hidden = true;

  const message = document.createElement("p");
  message.className = "delete-confirm__message";
  const status = document.createElement("p");
  status.className = "delete-confirm__status";
  status.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "delete-confirm__actions";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "button button--danger delete-confirm__confirm";
  confirmButton.textContent = "Supprimer";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "button button--secondary delete-confirm__cancel";
  cancelButton.textContent = "Annuler";
  actions.append(confirmButton, cancelButton);
  root.append(message, actions, status);

  let targetId = null;
  let handler = async () => {};

  function close() {
    targetId = null;
    root.hidden = true;
    status.textContent = "";
  }

  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", async () => {
    if (targetId === null) return;
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    try {
      await handler(targetId);
    } catch (error) {
      console.error("[mainView] Suppression impossible :", error);
      status.textContent = "Impossible de supprimer la question pour le moment.";
    } finally {
      confirmButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  return {
    root,
    open(id) {
      targetId = id;
      const label = formatQuestionId(id);
      message.textContent =
        id < 0
          ? `Supprimer définitivement la question ${label} ? Cette action est irréversible.`
          : `Supprimer la question ${label} ? Elle pourra être restaurée depuis « Questions supprimées ».`;
      status.textContent = "";
      root.hidden = false;
    },
    close,
    onConfirm(fn) {
      handler = fn;
    },
  };
}

/**
 * Bouton "Modifier" / "Supprimer" : actif dès qu'une question est affichée.
 * @param {HTMLButtonElement} editButton
 * @param {{id:number}|null} question
 */
function updateEditButton(editButton, question) {
  const editable = Boolean(question) && typeof question.id === "number" && question.id !== 0;
  editButton.disabled = !editable;
  if (editable) editButton.dataset.questionId = String(question.id);
  else delete editButton.dataset.questionId;
}

async function wireQuestionSelection(questionCard, nextButton, onQuestionDisplayed = () => {}) {
  let questions;
  let baseQuestions;
  try {
    // Base + questions créées localement (disponibles immédiatement).
    baseQuestions = await getAvailableQuestions();
  } catch (error) {
    console.error("[mainView] Impossible de charger les questions :", error);
    questionCard.innerHTML = "";
    questionCard.append(
      createStatusMessage("Impossible de charger les questions pour le moment.")
    );
    return;
  }

  // Filtres appliqués AVANT le moteur Strict/Libre (qui reste inchangé).
  let tagStates = {};
  try {
    tagStates = await getTagFilterStates();
  } catch (error) {
    console.error("[mainView] Impossible de lire les filtres, aucun filtre appliqué :", error);
  }
  questions = applyTagFilters(
    baseQuestions,
    pruneUnknownTags(tagStates, extractTags(baseQuestions))
  );

  if (baseQuestions.length > 0 && questions.length === 0) {
    // Aucune question compatible : état normal, pas une erreur. Le
    // moteur n'est pas appelé (historique et currentQuestionId intacts).
    questionCard.innerHTML = "";
    questionCard.append(createNoMatchingQuestionMessage());
    nextButton.disabled = true;
    return;
  }

  // Anti double-clic / double-appel pendant une sélection en cours
  // (cahier des charges §15) : simple drapeau, pas d'animation.
  let isSelecting = false;

  function renderEngineResult(result) {
    questionCard.innerHTML = "";
    if (result.status === SELECTION_STATUS.STRICT_EXHAUSTED) {
      questionCard.append(createStrictExhaustedMessage());
      onQuestionDisplayed(null);
    } else {
      renderQuestion(questionCard, result.question);
      onQuestionDisplayed(result.question);
    }
  }

  /**
   * Exécute un appel au moteur (affichage initial OU "Suivante"),
   * protégé par le même drapeau anti double-appel dans les deux cas.
   * @param {() => Promise<object>} engineCall
   */
  async function runEngine(engineCall) {
    if (isSelecting) return;
    isSelecting = true;
    nextButton.disabled = true;

    try {
      const result = await engineCall();
      renderEngineResult(result);
    } catch (error) {
      if (error instanceof NoQuestionsAvailableError) {
        // Cas B : la liste de questions elle-même est vide — distinct
        // de l'épuisement Strict, qui ne lève jamais cette erreur.
        questionCard.innerHTML = "";
        questionCard.append(createStatusMessage("Aucune question disponible."));
      } else {
        console.error(
          "[mainView] Erreur lors de la sélection d'une question :",
          error
        );
        questionCard.innerHTML = "";
        questionCard.append(
          createStatusMessage(
            "Impossible de sélectionner une question pour le moment."
          )
        );
      }
    } finally {
      isSelecting = false;
      nextButton.disabled = false;
    }
  }

  // Déclencheurs de "question suivante" selon le réglage enregistré
  // (relu à chaque montage). Bouton et swipe appellent exactement la même
  // fonction : aucune seconde logique de changement de question.
  let nextNavigation = DEFAULT_NEXT_NAVIGATION;
  try {
    nextNavigation = await getNextNavigation();
  } catch (error) {
    console.error("[mainView] Impossible de lire le réglage de navigation :", error);
  }
  const goToNextQuestion = () => runEngine(() => advanceToNextQuestion(questions));

  nextButton.hidden = !isButtonEnabled(nextNavigation);
  nextButton.addEventListener("click", () => {
    if (!isButtonEnabled(nextNavigation)) return;
    goToNextQuestion();
  });

  if (isSwipeEnabled(nextNavigation)) {
    questionCard.classList.add("question-card--swipeable");
    attachLeftSwipe(questionCard, goToNextQuestion, {
      // Swipe validé : le bouton est bloqué pendant l'animation de sortie
      // (évite un double changement) ; runEngine le réactive ensuite.
      onCommit: () => {
        nextButton.disabled = true;
      },
    });
  }

  // Affichage initial : réaffiche currentQuestionId s'il est toujours
  // valide (F5, retour via "Accueil", etc.) — ne sélectionne une
  // nouvelle question que s'il n'y en a pas encore (cahier des
  // charges §3, cas A/B/C). Jamais un nouvel enregistrement
  // d'historique pour un simple remontage.
  await runEngine(() => getCurrentQuestion(questions));
}

/**
 * Affiche une question (texte, ID, tags) dans la carte fournie.
 * @param {HTMLElement} questionCard
 * @param {{id:number, texte:string, tags:string[]}} question
 */
function renderQuestion(questionCard, question) {
  questionCard.innerHTML = "";

  const text = document.createElement("p");
  text.className = "question-card__text";
  text.textContent = question.texte;

  const id = document.createElement("p");
  id.className = "question-card__id";
  id.textContent = formatQuestionId(question.id);
  id.dataset.questionId = String(question.id); // id interne, jamais modifié

  const tagList = document.createElement("ul");
  tagList.className = "question-card__tags";
  for (const tag of question.tags) {
    const item = document.createElement("li");
    item.className = "tag-chip";
    item.textContent = tag;
    tagList.append(item);
  }

  // ID au-dessus du texte, petit et discret.
  questionCard.append(id, text, tagList);
}

function createStatusMessage(message) {
  const p = document.createElement("p");
  p.className = "question-card__text";
  p.textContent = message;
  return p;
}

/**
 * Message affiché quand aucune question ne correspond aux filtres actifs.
 * @returns {DocumentFragment}
 */
function createNoMatchingQuestionMessage() {
  const fragment = document.createDocumentFragment();
  const message = createStatusMessage(
    "Aucune question ne correspond aux filtres actifs."
  );
  message.dataset.status = "no-matching-question";
  const hint = document.createElement("p");
  hint.className = "question-card__id";
  hint.textContent = "Modifiez les filtres pour élargir la sélection.";
  fragment.append(message, hint);
  return fragment;
}

/**
 * Message affiché quand le mode Strict est épuisé (cahier des charges
 * §7) : informe l'utilisateur, sans proposer de boutons/liens
 * fonctionnels puisque Paramètres/Libre/Filtres n'existent pas encore
 * en tant qu'actions déclenchables ici (§19).
 * @returns {DocumentFragment}
 */
function createStrictExhaustedMessage() {
  const fragment = document.createDocumentFragment();

  const intro = document.createElement("p");
  intro.className = "question-card__text";
  intro.textContent =
    "Vous avez vu toutes les questions disponibles en mode Strict.";

  const hintIntro = document.createElement("p");
  hintIntro.className = "question-card__text";
  hintIntro.textContent = "Vous pouvez :";

  const hintList = document.createElement("ul");
  hintList.className = "question-card__hints";
  for (const hint of [
    "réinitialiser l'historique dans Paramètres",
    "passer en mode Libre",
    "modifier les filtres actifs",
  ]) {
    const li = document.createElement("li");
    li.textContent = hint;
    hintList.append(li);
  }

  fragment.append(intro, hintIntro, hintList);
  return fragment;
}
