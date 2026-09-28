/*
  deletedQuestionsView.js
  Écran "Questions supprimées" (route "deleted-questions") : liste des
  questions de BASE supprimées (B-n + texte, version modifiée si un
  override existe) avec un bouton « Restaurer ». Les questions locales
  supprimées n'y figurent pas : leur suppression est définitive.
  Tout passe par questionsRepository.js ; questions.base.json n'est
  jamais modifié.

  Recherche (texte ou identifiant, dynamique) : questionSearch.js.
  Pagination (appliquée APRÈS la recherche) : ui/pagination.js, avec les
  mêmes contrôles au-dessus et en dessous de la liste.
*/

import {
  getDeletedBaseQuestions,
  restoreBaseQuestion,
} from "../../data/questionsRepository.js";
import { formatQuestionId } from "./questionId.js";
import { searchQuestions } from "./questionSearch.js";
import { paginate, createPager } from "../../ui/pagination.js";

/** Nombre maximal de questions par page. */
export const DELETED_PAGE_SIZE = 5;

export function createDeletedQuestionsView() {
  const view = document.createElement("div");
  view.className = "view view--deleted";

  const card = document.createElement("section");
  card.className = "card deleted-card";

  const heading = document.createElement("h1");
  heading.className = "page-title deleted-card__title";
  heading.textContent = "Questions supprimées";

  const help = document.createElement("p");
  help.className = "deleted-card__help";
  help.textContent =
    "Questions de base supprimées. Les questions créées localement sont supprimées définitivement.";

  const searchLabel = document.createElement("label");
  searchLabel.className = "filters-search";
  const searchText = document.createElement("span");
  searchText.className = "visually-hidden";
  searchText.textContent = "Rechercher une question supprimée";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "filters-search__input deleted-search__input";
  searchInput.placeholder = "Rechercher (texte ou B-12)…";
  searchInput.autocomplete = "off";
  searchLabel.append(searchText, searchInput);

  const status = document.createElement("p");
  status.className = "deleted-card__status";
  status.setAttribute("aria-live", "polite");
  status.textContent = "Chargement…";

  const list = document.createElement("ul");
  list.className = "deleted-list";

  const topPager = createPager(changePage, "Pagination (haut)");
  const bottomPager = createPager(changePage, "Pagination (bas)");
  topPager.root.classList.add("pager--top");
  bottomPager.root.classList.add("pager--bottom");

  card.append(help, searchLabel, status, topPager.root, list, bottomPager.root);
  view.append(heading, card);

  let allQuestions = [];
  let page = 1;
  let notice = "";

  function changePage(delta) {
    page += delta;
    notice = "";
    renderList();
  }

  searchInput.addEventListener("input", () => {
    page = 1; // toute modification de la recherche revient à la page 1
    notice = "";
    renderList();
  });

  function renderList() {
    const results = searchQuestions(allQuestions, searchInput.value);
    const current = paginate(results, page, DELETED_PAGE_SIZE);
    page = current.page; // bornes recalculées (ex. après restauration)

    let message = notice;
    if (!message && allQuestions.length === 0) message = "Aucune question supprimée.";
    else if (!message && results.length === 0) message = "Aucune question supprimée ne correspond à la recherche.";
    status.textContent = message;
    status.dataset.results = String(results.length);

    topPager.update(current.page, current.pageCount);
    bottomPager.update(current.page, current.pageCount);
    searchLabel.hidden = allQuestions.length === 0 && searchInput.value === "";

    list.innerHTML = "";
    for (const question of current.items) list.append(createItem(question));
    view.dataset.ready = "true";
  }

  function createItem(question) {
    const item = document.createElement("li");
    item.className = "deleted-item";
    item.dataset.questionId = String(question.id);

    const id = document.createElement("span");
    id.className = "deleted-item__id";
    id.textContent = formatQuestionId(question.id);

    const text = document.createElement("p");
    text.className = "deleted-item__text";
    text.textContent = question.texte;

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "button button--secondary deleted-item__restore";
    restore.textContent = "Restaurer";
    restore.setAttribute("aria-label", `Restaurer la question ${formatQuestionId(question.id)}`);
    restore.addEventListener("click", async () => {
      restore.disabled = true;
      try {
        await restoreBaseQuestion(question.id);
        await load(`Question ${formatQuestionId(question.id)} restaurée.`);
      } catch (error) {
        console.error("[deletedQuestionsView] Restauration impossible :", error);
        status.textContent = "Impossible de restaurer la question pour le moment.";
        restore.disabled = false;
      }
    });

    item.append(id, text, restore);
    return item;
  }

  /** (Re)lit les questions supprimées ; la page courante est conservée si possible. */
  async function load(message = "") {
    try {
      allQuestions = await getDeletedBaseQuestions();
    } catch (error) {
      console.error("[deletedQuestionsView] Lecture impossible :", error);
      status.textContent = "Impossible de charger les questions supprimées.";
      return;
    }
    notice = message;
    renderList();
  }

  load();
  return view;
}
