/* Lot 3 : en-têtes de page communs, sélecteurs à segments (Import / Export),
   icônes de la barre du bas et nettoyage des anciennes variables. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resetDatabase, mount } from "./helpers.js";
import { createFiltersView } from "../js/features/filters/filtersView.js";
import { createDeletedQuestionsView } from "../js/features/questions/deletedQuestionsView.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { createQuestionFormView } from "../js/features/questions/questionFormView.js";

beforeEach(resetDatabase);

const css = (f) => readFileSync(new URL(`../css/${f}`, import.meta.url), "utf-8");

const VIEWS = [
  ["Filtres", createFiltersView, (v) => v.querySelector(".filter-tag")],
  ["Questions supprimées", createDeletedQuestionsView, (v) => !/Chargement/.test(v.querySelector(".deleted-card__status").textContent)],
  ["Paramètres", createSettingsView, (v) => v.querySelector('[data-setting="import-export"]')],
  ["Nouvelle question", createQuestionFormView, (v) => v.querySelector(".question-form__suggestion")],
];

for (const [title, render, ready] of VIEWS) {
  test(`en-tête commun : « ${title} » en premier, hors de toute carte`, async () => {
    const v = await mount(render, ready);
    const h1 = v.firstElementChild;
    assert.equal(h1.tagName, "H1");
    assert.ok(h1.classList.contains("page-title"));
    assert.equal(h1.textContent, title);
    assert.equal(h1.closest(".card"), null);
    assert.equal(v.querySelectorAll("h1").length, 1);
  });
}

test("création : zone de texte de 3 lignes, suggestions dépliées", async () => {
  const v = await mount(createQuestionFormView, (x) => x.querySelector(".question-form__suggestion"));
  assert.equal(v.querySelector('textarea[name="texte"]').rows, 3);
  assert.equal(v.querySelector(".question-form__suggestions-zone").hidden, false);
});

test("Import / Export : sélecteurs à segments, libellés courts, description du mode", async () => {
  const v = await mount(createSettingsView, (x) => x.querySelector('[data-setting="import-export"]'));
  const scope = v.querySelector(".settings-io__scope");
  const mode = v.querySelector(".settings-io__mode");
  assert.ok(scope.classList.contains("settings-segmented"));
  assert.ok(mode.classList.contains("settings-segmented"));
  assert.deepEqual([...scope.querySelectorAll(".settings-segmented__short")].map((e) => e.textContent), ["Locales", "Base"]);
  // Libellé complet toujours présent pour les lecteurs d'écran.
  assert.ok(scope.querySelector('input[value="local"]').closest("label").textContent.includes("Questions locales"));
  const hint = v.querySelector(".settings-io__mode-hint");
  assert.match(hint.textContent, /sans rien supprimer/);
  mode.querySelector('input[value="replace"]').click();
  assert.match(hint.textContent, /^Remplace/);
});

test("barre du bas : icônes en contour 24×24, trait 1,8 ; indicateur de l'onglet actif", () => {
  for (const name of ["home", "filters", "deleted", "settings"]) {
    const svg = readFileSync(new URL(`../assets/icons/nav-${name}.svg`, import.meta.url), "utf-8");
    assert.match(svg, /viewBox="0 0 24 24"/, name);
    assert.match(svg, /fill="none"/, name);
    assert.match(svg, /stroke-width="1.8"/, name);
  }
  const trash = readFileSync(new URL("../js/features/questions/mainView.js", import.meta.url), "utf-8");
  const deleted = readFileSync(new URL("../assets/icons/nav-deleted.svg", import.meta.url), "utf-8");
  assert.ok(!trash.includes(deleted.match(/<path d="([^"]+)"/)[1])); // différente de la poubelle
  assert.match(css("themes.css"), /\.nav-item__icon svg\s*\{\s*fill:\s*none;/);
  assert.match(css("layout.css"), /\.nav-item\[aria-current="page"\]::before\s*\{[^}]*content:\s*""/);
});

test("anciennes variables supprimées (--fs-100 et --fs-400 au lot 4)", () => {
  const all = ["base.css", "themes.css", "layout.css", "components.css"].map(css).join("\n");
  for (const name of ["--fs-100", "--fs-200", "--fs-300", "--fs-400", "--fs-500", "--font-body", "--tap-size"]) {
    assert.ok(!new RegExp(`${name}(?![-\\w])`).test(all), name);
  }
});

test("Filtres : l'aide se coupe proprement (« : » insécable, cycle des états d'un bloc)", async () => {
  const v = await mount(createFiltersView, (x) => x.querySelector(".filter-tag"));
  const help = v.querySelector(".filters-help");
  assert.equal(help.textContent, "Touchez un tag pour changer son état : neutre → obligatoire → exclu.");
  assert.equal(help.querySelector(".filters-help__cycle").textContent, "neutre → obligatoire → exclu.");
  assert.match(css("components.css"), /\.filters-help__cycle\s*\{\s*white-space:\s*nowrap;/);
});

test("lot 4 : titre de Main = image SVG avec texte alternatif et dimensions, mise en cache", async () => {
  const { createMainView, TITLE_IMAGE } = await import("../js/features/questions/mainView.js");
  const img = createMainView().querySelector("#img-titre img");
  assert.equal(img.getAttribute("src"), "assets/img_Titre.svg");
  assert.equal(img.alt, "QuestionsTime2");
  const svg = readFileSync(new URL("../assets/img_Titre.svg", import.meta.url), "utf-8");
  const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svg);
  assert.deepEqual([img.width, img.height], [Number(w), Number(h)]);
  assert.equal(TITLE_IMAGE.width, Number(w));
  assert.ok(!/<text|@font-face/.test(svg)); // lettres en tracés
  const sw = readFileSync(new URL("../service-worker.js", import.meta.url), "utf-8");
  assert.match(sw, /"\.\/assets\/img_Titre\.svg"/);
});
