/*
  questionSearchOverlay.js
  Recherche d'une question depuis Main, dans une couche posée par-dessus
  la page (même recherche que « Questions supprimées » : texte ou ID).
  Toucher un résultat l'affiche sur Main ; la croix (ou Échap) ferme la
  recherche sans rien changer.
*/

import { searchQuestions } from "./questionSearch.js";
import { formatQuestionId } from "./questionId.js";

const CLOSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`;

/**
 * @param {{ questions: Array<{id:number, texte:string}>, onSelect: (id:number) => void,
 *           container?: HTMLElement, returnFocus?: HTMLElement }} options
 * @returns {{ overlay: HTMLElement, close: () => void }}
 */
export function openQuestionSearch({ questions, onSelect, container = document.body, returnFocus = null }) {
  const doc = container.ownerDocument;
  const overlay = doc.createElement("div");
  overlay.className = "question-search";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Rechercher une question");

  const bar = doc.createElement("div");
  bar.className = "question-search__bar";
  const label = doc.createElement("label");
  label.className = "question-search__label";
  const labelText = doc.createElement("span");
  labelText.className = "visually-hidden";
  labelText.textContent = "Rechercher une question";
  const input = doc.createElement("input");
  input.type = "search";
  input.className = "filters-search__input question-search__input";
  input.placeholder = "Rechercher (texte ou B-12)…";
  input.autocomplete = "off";
  input.enterKeyHint = "search";
  label.append(labelText, input);
  const closeButton = doc.createElement("button");
  closeButton.type = "button";
  closeButton.className = "icon-button question-search__close";
  closeButton.setAttribute("aria-label", "Fermer la recherche");
  closeButton.innerHTML = CLOSE_ICON;
  bar.append(label, closeButton);

  const status = doc.createElement("p");
  status.className = "question-search__status";
  status.setAttribute("aria-live", "polite");

  const list = doc.createElement("ul");
  list.className = "question-search__list";

  overlay.append(bar, status, list);

  function render() {
    const results = searchQuestions(questions, input.value);
    status.textContent = results.length === 0
      ? "Aucune question ne correspond à la recherche."
      : `${results.length} question${results.length > 1 ? "s" : ""}`;
    list.replaceChildren(...results.map((question) => {
      const item = doc.createElement("li");
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "question-search__item";
      button.dataset.questionId = String(question.id);
      const id = doc.createElement("span");
      id.className = "question-search__id";
      id.textContent = formatQuestionId(question.id);
      const text = doc.createElement("span");
      text.className = "question-search__text";
      text.textContent = question.texte;
      button.append(id, text);
      button.addEventListener("click", () => {
        close();
        onSelect(question.id);
      });
      item.append(button);
      return item;
    }));
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    doc.removeEventListener("keydown", onKeydown);
    overlay.remove();
    returnFocus?.focus?.({ preventScroll: true });
  }
  function onKeydown(event) {
    if (event.key === "Escape") close();
  }

  input.addEventListener("input", render);
  closeButton.addEventListener("click", close);
  doc.addEventListener("keydown", onKeydown);

  render();
  container.append(overlay);
  input.focus?.({ preventScroll: true });
  return { overlay, close };
}
