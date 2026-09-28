import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId,
} from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";

beforeEach(resetDatabase);

const mountMain = () =>
  mount(createMainView, (v) => mainIsReady(v) && !v.querySelector(".mode-indicator").disabled);

async function clickMode(view) {
  const button = view.querySelector(".mode-indicator");
  const before = button.textContent;
  button.click();
  await waitFor(() => !button.disabled && button.textContent !== before);
  return button;
}

async function clickNext(view) {
  const button = view.querySelector(".question-next");
  button.click();
  await waitFor(() => !button.disabled);
}

test("l'indicateur de mode est un bouton", async () => {
  const view = await mountMain();
  assert.equal(view.querySelector(".mode-indicator").tagName, "BUTTON");
});

test("clic Strict -> Libre, puis Libre -> Strict, persisté dans settings.selectionMode", async () => {
  const view = await mountMain();
  const button = view.querySelector(".mode-indicator");
  assert.equal(button.textContent, "Mode : Strict");

  await clickMode(view);
  assert.equal(button.textContent, "Mode : Libre");
  assert.equal(await getSetting(SELECTION_MODE_KEY), "libre");

  await clickMode(view);
  assert.equal(button.textContent, "Mode : Strict");
  assert.equal(await getSetting(SELECTION_MODE_KEY), "strict");
});

test("persistance : le mode choisi est relu au remontage de Main", async () => {
  let view = await mountMain();
  await clickMode(view); // -> Libre
  view = await mountMain();
  assert.equal(view.querySelector(".mode-indicator").textContent, "Mode : Libre");

  await setSetting(SELECTION_MODE_KEY, "strict"); // même clé que la future page Paramètres
  view = await mountMain();
  assert.equal(view.querySelector(".mode-indicator").textContent, "Mode : Strict");
});

test("changer de mode ne modifie ni la question, ni currentQuestionId, ni l'historique", async () => {
  const view = await mountMain();
  const shown = displayedQuestionId(view);
  const currentBefore = await getSetting(CURRENT_QUESTION_ID_KEY);
  const historyBefore = await getHistory();

  await clickMode(view);
  await clickMode(view);
  await clickMode(view);

  assert.equal(displayedQuestionId(view), shown);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), currentBefore);
  assert.deepEqual(await getHistory(), historyBefore);
});

test("le Suivante suivant utilise le nouveau mode", async () => {
  const view = await mountMain(); // 1 entrée Strict
  await clickMode(view); // -> Libre
  await clickNext(view);
  const modes = (await getHistory()).map((h) => h.mode).sort();
  assert.deepEqual(modes, ["libre", "strict"]);
});

test("filtre exclu : couleurs clairement distinctes du neutre (CSS réel)", () => {
  const css = ["base", "layout", "components", "themes"]
    .map((f) => readFileSync(new URL(`../css/${f}.css`, import.meta.url), "utf-8"))
    .join("\n");
  const vars = Object.fromEntries(
    [...css.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])
  );
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blocks = [...css.matchAll(new RegExp(`(?:^|\\n|,)\\s*${escaped}\\s*\\{([^}]*)\\}`, "g"))];
    const props = {};
    for (const [, body] of blocks) {
      for (const [, k, v] of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
        props[k] = v.trim().replace(/var\((--[\w-]+)\)/g, (_, n) => vars[n] ?? n);
      }
    }
    return props;
  };
  const neutral = rule(".filter-tag");
  const excluded = { ...neutral, ...rule('.filter-tag[data-state="excluded"]') };
  const required = { ...neutral, ...rule('.filter-tag[data-state="required"]') };

  assert.notEqual(excluded.color, neutral.color);
  assert.notEqual(excluded.background, neutral.background);
  assert.notEqual(excluded["border-color"] ?? neutral.border, neutral.border);
  // et toujours distinct de l'état obligatoire
  assert.notEqual(excluded.background, required.background);
  assert.notEqual(excluded.color, required.color);
});
