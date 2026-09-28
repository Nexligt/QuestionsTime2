/* Mini-application « Roue » : tirage, angle d'arrêt, limites, mémorisation, « Retirer l'entrée tirée ». */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import {
  WHEEL_LIMITS, WHEEL_SPIN, DEFAULT_WHEEL_ENTRIES, drawIndex, normalizeEntries, normalizeEntry,
  segmentAtRotation, stopRotation, loadWheelSettings,
} from "../js/features/miniApps/wheel/wheel.js";
import { fitLabel } from "../js/features/miniApps/wheel/wheelSvg.js";
import { buildWheelApp } from "../js/features/miniApps/wheel/wheelView.js";

const reduced = () => { window.matchMedia = (q) => ({ matches: q.includes("reduce") }); };
beforeEach(async () => { await resetDatabase(); reduced(); });
afterEach(() => { delete window.HTMLElement.prototype.animate; });

const mountWheel = () => mount(() => buildWheelApp("t"), (v) => v.dataset.ready === "true");
const $ = (v, s) => v.querySelector(s);
const $$ = (v, s) => [...v.querySelectorAll(s)];
const entryValues = (v) => $$(v, ".wheel-app__entry-input").map((i) => i.value);
function rename(v, index, value) {
  const input = $$(v, ".wheel-app__entry-input")[index];
  input.value = value;
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}

test("le tirage est toujours une entrée de la liste", async () => {
  for (const count of [2, 3, 7, 20]) {
    for (const r of [0, 0.5, 0.999999, 1]) {
      const i = drawIndex(count, () => r);
      assert.ok(Number.isInteger(i) && i >= 0 && i < count);
    }
  }
  const v = await mountWheel();
  for (let n = 0; n < 30; n++) {
    $(v, ".wheel-app__spin").click();
    assert.ok(DEFAULT_WHEEL_ENTRIES.includes($(v, ".wheel-app__result").textContent));
  }
});

test("l'angle d'arrêt amène la part tirée sous le repère, jamais sur une bordure, après plusieurs tours", () => {
  for (let count = 1; count <= WHEEL_LIMITS.max; count++) {
    const segment = 360 / count;
    for (let index = 0; index < count; index++) {
      for (const current of [0, 37.5, 359.9, 1234.5, -90]) {
        for (const offset of [0, 0.5, 1]) {
          const target = stopRotation(current, index, count, { turns: 5, offset });
          assert.equal(segmentAtRotation(target, count), index, `${count}/${index}/${current}/${offset}`);
          const angle = (((360 - target) % 360) + 360) % 360;
          const inSegment = angle - index * segment;
          assert.ok(inSegment >= segment * WHEEL_SPIN.margin - 1e-6 && inSegment <= segment * (1 - WHEEL_SPIN.margin) + 1e-6);
          assert.ok(target - current >= 5 * 360 && target - current < 6 * 360);
        }
      }
    }
  }
});

test("la roue affichée s'arrête sur l'entrée affichée comme résultat", async () => {
  const v = await mountWheel();
  for (let n = 0; n < 10; n++) {
    $(v, ".wheel-app__spin").click();
    const count = Number(v.dataset.wheelCount);
    const index = segmentAtRotation(Number(v.dataset.target), count);
    assert.equal(index, Number(v.dataset.picked));
    const labels = $$(v, ".wheel__label").map((l) => l.textContent);
    assert.equal(labels[index], $(v, ".wheel-app__result").textContent);
  }
});

test("limites : de 2 à 20 entrées, 30 caractères, texte coupé avec « … »", async () => {
  assert.equal(normalizeEntry("  a   b  "), "a b");
  assert.equal(normalizeEntry("x".repeat(40)).length, 30);
  assert.deepEqual(normalizeEntries(["seul"]), DEFAULT_WHEEL_ENTRIES);
  assert.equal(normalizeEntries(Array.from({ length: 25 }, (_, i) => `E${i}`)).length, 20);
  assert.equal(fitLabel("Un nom vraiment très long", 10), "Un nom vr…");

  const v = await mountWheel();
  assert.deepEqual(entryValues(v), DEFAULT_WHEEL_ENTRIES);
  $$(v, ".wheel-app__entry-delete")[0].click();
  assert.equal(entryValues(v).length, 2);
  assert.ok($$(v, ".wheel-app__entry-delete").every((b) => b.disabled)); // jamais moins de 2
  $$(v, ".wheel-app__entry-delete")[0].click();
  assert.equal(entryValues(v).length, 2);
  for (let i = 0; i < 25; i++) $(v, ".wheel-app__add").click();
  assert.equal(entryValues(v).length, 20);
  assert.equal($(v, ".wheel-app__add").disabled, true);
  assert.equal($$(v, ".wheel__slice").length, 20);
  assert.equal($(v, ".wheel-app__entry-input").maxLength, 30);
  rename(v, 0, "   "); // vide : refusé
  assert.equal(entryValues(v)[0], "Joueur 2");
});

test("mémorisation de la liste et de l'option (store settings existant)", async () => {
  let v = await mountWheel();
  rename(v, 0, "Alice");
  $(v, ".wheel-app__add").click();
  $$(v, ".wheel-app__entry-delete")[1].click(); // supprime « Joueur 2 »
  $(v, ".wheel-app__remove").click();
  await waitFor(() => Number(v.dataset.saves) >= 4);
  assert.deepEqual(await loadWheelSettings(), { entries: ["Alice", "Joueur 3", "Entrée 4"], removeDrawn: true });
  v = await mountWheel();
  assert.deepEqual(entryValues(v), ["Alice", "Joueur 3", "Entrée 4"]);
  assert.equal($(v, ".wheel-app__remove").checked, true);
});

test("« Retirer l'entrée tirée » puis « Réinitialiser »", async () => {
  const v = await mountWheel();
  $(v, ".wheel-app__remove").click();
  const results = [];
  for (let n = 0; n < 3; n++) {
    $(v, ".wheel-app__spin").click();
    results.push($(v, ".wheel-app__result").textContent);
  }
  assert.deepEqual([...results].sort(), [...DEFAULT_WHEEL_ENTRIES].sort()); // jamais deux fois la même
  assert.match($(v, ".wheel-app__drawn-status").textContent, /Toutes les entrées ont été tirées/);
  assert.equal($(v, ".wheel-app__spin").disabled, true);
  $(v, ".wheel-app__reset").click();
  assert.equal($(v, ".wheel-app__spin").disabled, false);
  assert.equal($$(v, ".wheel__slice").length, 3);
  $(v, ".wheel-app__spin").click();
  assert.equal(Number(v.dataset.wheelCount), 3);
});

test("animation : tirage avant, touchers ignorés pendant la rotation, résultat à la fin", async () => {
  window.matchMedia = () => ({ matches: false });
  let calls = 0;
  let finish;
  window.HTMLElement.prototype.animate = function () {
    calls++;
    return { finished: new Promise((r) => { finish = r; }), cancel() {} };
  };
  const v = await mountWheel();
  $(v, ".wheel-app__spin").click();
  assert.equal(v.dataset.spinning, "true");
  assert.ok(v.dataset.picked !== undefined); // déjà tiré
  $(v, ".wheel-app__spin").click();
  $(v, ".wheel-app__wheel").click();
  assert.equal(calls, 1);
  assert.equal($(v, ".wheel-app__result").textContent, "");
  finish();
  await waitFor(() => v.dataset.spinning === "false");
  assert.equal($(v, ".wheel-app__result").textContent, DEFAULT_WHEEL_ENTRIES[Number(v.dataset.picked)]);
});
