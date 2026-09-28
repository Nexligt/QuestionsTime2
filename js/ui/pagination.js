/*
  pagination.js
  Pagination générique et réutilisable :
  - `paginate(items, page, pageSize)` : découpage PUR d'une liste ;
  - `createPager(onChange)` : barre "Précédent · Page x / y · Suivant",
    instanciable plusieurs fois (ex. au-dessus ET en dessous d'une liste).
*/

/**
 * @template T
 * @param {T[]} items
 * @param {number} page - page demandée (1-based), ramenée dans les bornes.
 * @param {number} pageSize - > 0.
 * @returns {{ items: T[], page: number, pageCount: number, total: number }}
 */
export function paginate(items, page, pageSize) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(Number(page) || 1)), pageCount);
  const start = (current - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: current, pageCount, total };
}

/**
 * Barre de pagination. `onChange(delta)` reçoit -1 (Précédent) ou +1 (Suivant).
 * @param {(delta:number) => void} onChange
 * @param {string} [label] - libellé accessible de la navigation.
 * @returns {{ root: HTMLElement, update: (page:number, pageCount:number) => void }}
 */
export function createPager(onChange, label = "Pagination") {
  const root = document.createElement("nav");
  root.className = "pager";
  root.setAttribute("aria-label", label);

  const prev = document.createElement("button");
  prev.type = "button";
  prev.className = "button button--secondary pager__prev";
  prev.textContent = "Précédent";

  const info = document.createElement("span");
  info.className = "pager__info";
  info.setAttribute("aria-live", "polite");

  const next = document.createElement("button");
  next.type = "button";
  next.className = "button button--secondary pager__next";
  next.textContent = "Suivant";

  prev.addEventListener("click", () => onChange(-1));
  next.addEventListener("click", () => onChange(1));
  root.append(prev, info, next);

  return {
    root,
    update(page, pageCount) {
      info.textContent = `Page ${page} / ${pageCount}`;
      prev.disabled = page <= 1;
      next.disabled = page >= pageCount;
      // Une seule page : barre masquée pour éviter un encombrement inutile.
      root.hidden = pageCount <= 1;
    },
  };
}
