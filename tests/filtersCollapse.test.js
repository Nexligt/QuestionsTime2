/* Liste des tags repliable dans Filtres (recherche toujours visible). */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import { createFiltersView } from "../js/features/filters/filtersView.js";
import { getTagFilterStates } from "../js/data/filtersRepository.js";

beforeEach(resetDatabase);

const mountFilters = () =>
  mount(createFiltersView, (v) => !v.querySelector(".filters-search__input").disabled);

test("ouverture/fermeture de la liste des tags, recherche visible", async () => {
  const view = await mountFilters();
  const toggle = view.querySelector(".filters-toggle");
  const list = view.querySelector(".filters-tags");
  const search = view.querySelector(".filters-search__input");

  assert.equal(toggle.tagName, "BUTTON");
  assert.equal(toggle.getAttribute("aria-controls"), list.id);
  assert.equal(toggle.getAttribute("aria-expanded"), "true"); // ouvert par défaut
  assert.equal(list.hidden, false);
  assert.match(toggle.textContent, /Tags \(5\)/);

  toggle.click(); // fermer
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(list.hidden, true);
  assert.equal(search.hidden, false);
  assert.equal(search.closest("[hidden]"), null);
  assert.equal(search.disabled, false);

  toggle.click(); // rouvrir
  assert.equal(toggle.getAttribute("aria-expanded"), "true");
  assert.equal(list.hidden, false);
});

test("filtres inchangés : cycle des 3 états et recherche fonctionnent, repliés ou non", async () => {
  const view = await mountFilters();
  const toggle = view.querySelector(".filters-toggle");
  const button = () => view.querySelector('.filter-tag[data-tag="Voyage"]');

  toggle.click(); // replié : l'état est conservé
  toggle.click();
  button().click(); // neutre -> obligatoire
  assert.equal(button().dataset.state, "required");
  button().click(); // -> exclu
  assert.equal(button().dataset.state, "excluded");
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(await getTagFilterStates(), { Voyage: "excluded" });

  toggle.click(); // replié, puis recherche : la liste se rouvre sur les résultats
  const search = view.querySelector(".filters-search__input");
  search.value = "voy";
  search.dispatchEvent(new window.Event("input"));
  assert.equal(view.querySelector(".filters-tags").hidden, false);
  assert.deepEqual([...view.querySelectorAll(".filter-tag")].map((b) => b.dataset.tag), ["Voyage"]);
  assert.equal(button().dataset.state, "excluded");
});

test("CSS : une liste repliée est réellement masquée", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../css/components.css", import.meta.url), "utf-8");
  assert.match(css, /\.filters-tags\[hidden\]\s*\{\s*display:\s*none;/);
});
