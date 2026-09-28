/* Mini-application « Dés » : tirage, bornes, mémorisation, couche d'animation. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import {
  DICE_COUNT, DICE_FACES, FACE_PRESETS, clampDiceCount, parseFaces, rollDie, rollDice, loadDiceSettings,
} from "../js/features/miniApps/dice/dice.js";
import { buildDiceApp } from "../js/features/miniApps/dice/diceView.js";

beforeEach(async () => {
  await resetDatabase();
  document.querySelectorAll(".dice-roll").forEach((o) => o.remove());
  window.matchMedia = () => ({ matches: false });
});

const mountDice = () => mount(() => buildDiceApp("t"), (v) => v.dataset.ready === "true");
const $ = (v, s) => v.querySelector(s);
function change(input, value) {
  input.value = String(value);
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}
async function saved(v, n) {
  await waitFor(() => Number(v.dataset.saves) >= n);
}

test("tirage toujours compris entre 1 et le nombre de faces", () => {
  for (const faces of [2, 4, 6, 7, 20, 100]) {
    for (const r of [0, 1e-9, 0.5, 0.999999999, 1]) {
      const v = rollDie(faces, () => r);
      assert.ok(Number.isInteger(v) && v >= 1 && v <= faces, `${faces} / ${r} -> ${v}`);
    }
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = rollDie(faces);
      assert.ok(Number.isInteger(v) && v >= 1 && v <= faces);
      seen.add(v);
    }
    if (faces <= 20) assert.equal(seen.size, faces); // toutes les faces sortent
  }
  const { values, total } = rollDice(3, 6, () => 0.99);
  assert.deepEqual(values, [6, 6, 6]);
  assert.equal(total, 18);
});

test("bornes des réglages : 1 à 10 dés, 2 à 100 faces", () => {
  assert.deepEqual([0, 1, 5, 10, 11, -3, "4", "", "x", 2.5].map(clampDiceCount), [1, 1, 5, 10, 10, 1, 4, DICE_COUNT.default, DICE_COUNT.default, DICE_COUNT.default]);
  assert.deepEqual([1, 2, 37, 100, 101, "12", 7.5, "", "abc"].map(parseFaces), [null, 2, 37, 100, null, 12, null, null, null]);
  assert.deepEqual(FACE_PRESETS, [4, 6, 8, 10, 12, 20]);
  assert.equal(rollDice(25, 6).values.length, 10);
  assert.equal(rollDice(0, 6).values.length, 1);
});

test("réglages : valeurs par défaut, champ bridé, segments et « autre »", async () => {
  const v = await mountDice();
  assert.equal($(v, ".dice-app__count").value, String(DICE_COUNT.default));
  assert.equal($(v, ".dice-app__presets input:checked").value, String(DICE_FACES.default));
  assert.equal($(v, ".dice-app__animation").checked, true);
  change($(v, ".dice-app__count"), 42);
  assert.equal($(v, ".dice-app__count").value, "10");
  change($(v, ".dice-app__faces-other"), 101); // refusé
  assert.equal($(v, ".dice-app__faces-other").getAttribute("aria-invalid"), "true");
  change($(v, ".dice-app__faces-other"), 37);
  assert.equal($(v, ".dice-app__presets input:checked"), null);
  $(v, '.dice-app__presets input[value="20"]').click();
  assert.equal($(v, ".dice-app__faces-other").value, "");
});

test("mémorisation des réglages (store settings existant)", async () => {
  let v = await mountDice();
  change($(v, ".dice-app__count"), 4);
  $(v, '.dice-app__presets input[value="20"]').click();
  $(v, ".dice-app__animation").click();
  await saved(v, 3);
  assert.deepEqual(await loadDiceSettings(), { count: 4, faces: 20, animation: false });

  v = await mountDice(); // réouverture
  assert.equal($(v, ".dice-app__count").value, "4");
  assert.equal($(v, ".dice-app__presets input:checked").value, "20");
  assert.equal($(v, ".dice-app__animation").checked, false);

  change($(v, ".dice-app__faces-other"), 37);
  await saved(v, 1);
  v = await mountDice();
  assert.equal($(v, ".dice-app__faces-other").value, "37");
  assert.equal((await loadDiceSettings()).faces, 37);
});

test("animation désactivée : pas de couche, résultats et total dans l'onglet", async () => {
  const v = await mountDice();
  $(v, ".dice-app__animation").click();
  change($(v, ".dice-app__count"), 3);
  $(v, ".dice-app__roll").click();
  assert.equal(document.querySelector(".dice-roll"), null);
  const values = [...v.querySelectorAll(".dice-app__dice .die")].map((d) => Number(d.dataset.value));
  assert.equal(values.length, 3);
  assert.ok(values.every((x) => x >= 1 && x <= 6));
  assert.equal($(v, ".dice-app__total").textContent, `Total : ${values.reduce((a, b) => a + b, 0)}`);
  assert.equal(v.querySelectorAll(".dice-app__dice .die__pip").length, values.reduce((a, b) => a + b, 0)); // d6 : points
});

test("animation activée : couche au premier plan, fermée d'un toucher ; mouvement réduit : pas de couche", async () => {
  const v = await mountDice();
  $(v, '.dice-app__presets input[value="12"]').click();
  $(v, ".dice-app__roll").click();
  const overlay = document.querySelector(".dice-roll");
  assert.ok(overlay);
  assert.equal(overlay.querySelectorAll(".dice-roll__die").length, DICE_COUNT.default);
  assert.ok(!v.querySelector(".dice-app__results").hidden); // résultats déjà dans l'onglet
  assert.ok(v.querySelector(".dice-app__dice .die__value")); // autres dés : chiffre
  overlay.click();
  assert.equal(document.querySelector(".dice-roll"), null);

  window.matchMedia = (q) => ({ matches: q.includes("reduce") });
  $(v, ".dice-app__roll").click();
  assert.equal(document.querySelector(".dice-roll"), null);
});
