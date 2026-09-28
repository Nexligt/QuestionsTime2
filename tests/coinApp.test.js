/* Mini-application « Pile ou face » : tirage, face finale, compteur. */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { waitFor } from "./helpers.js";
import { COIN_SIDES, flipCoin, finalRotation, sideAtRotation } from "../js/features/miniApps/coin/coin.js";
import { buildCoinApp } from "../js/features/miniApps/coin/coinView.js";

beforeEach(() => { window.matchMedia = (q) => ({ matches: q.includes("reduce") }); });
afterEach(() => { delete window.HTMLElement.prototype.animate; });

const mountCoin = () => { const v = buildCoinApp("t"); document.body.replaceChildren(v); return v; };
const $ = (v, s) => v.querySelector(s);

test("tirage toujours « Pile » ou « Face »", () => {
  assert.deepEqual(COIN_SIDES, ["Pile", "Face"]);
  for (const r of [0, 0.25, 0.4999, 0.5, 0.75, 0.999999]) assert.ok(COIN_SIDES.includes(flipCoin(() => r)));
  const seen = new Set(Array.from({ length: 200 }, () => flipCoin()));
  assert.deepEqual([...seen].sort(), ["Face", "Pile"]);
});

test("face finale conforme au tirage, après plusieurs tours", () => {
  for (const side of COIN_SIDES) {
    for (const current of [0, 180, 90, 725, -45, 3600]) {
      for (const turns of [4, 5, 6]) {
        const target = finalRotation(current, side, turns);
        assert.equal(sideAtRotation(target), side);
        assert.ok(target - current >= turns * 360 && target - current < (turns + 1) * 360);
        assert.equal(((target % 180) + 180) % 180, 0); // pièce bien à plat, jamais de profil
      }
    }
  }
});

test("interface : résultat affiché = face visible ; compteur et remise à zéro", () => {
  const v = mountCoin();
  assert.equal($(v, ".coin-app__counter").textContent, "Pile : 0 · Face : 0");
  assert.equal($(v, ".coin-app__reset").disabled, true);
  const counts = { Pile: 0, Face: 0 };
  for (let n = 0; n < 20; n++) {
    (n % 2 ? $(v, ".coin-app__coin") : $(v, ".coin-app__flip")).click();
    const shown = $(v, ".coin-app__result").textContent;
    assert.ok(COIN_SIDES.includes(shown));
    assert.equal(shown, v.dataset.drawn);
    assert.equal(sideAtRotation(Number(v.dataset.rotation)), shown);
    counts[shown]++;
  }
  assert.equal($(v, ".coin-app__counter").textContent, `Pile : ${counts.Pile} · Face : ${counts.Face}`);
  $(v, ".coin-app__reset").click();
  assert.equal($(v, ".coin-app__counter").textContent, "Pile : 0 · Face : 0");
  assert.equal($(v, ".coin-app__reset").disabled, true);
});

test("animation : tirage avant, touchers ignorés pendant le lancer, face finale conforme", async () => {
  window.matchMedia = () => ({ matches: false });
  let calls = 0;
  let finish;
  window.HTMLElement.prototype.animate = function () {
    calls++;
    return { finished: new Promise((r) => { finish = r; }), cancel() {} };
  };
  const v = mountCoin();
  $(v, ".coin-app__flip").click();
  const drawn = v.dataset.drawn;
  assert.ok(COIN_SIDES.includes(drawn)); // déjà tiré
  $(v, ".coin-app__flip").click();
  $(v, ".coin-app__coin").click();
  assert.equal(calls, 1);
  assert.equal($(v, ".coin-app__result").textContent, "");
  finish();
  await waitFor(() => v.dataset.spinning === "false");
  assert.equal($(v, ".coin-app__result").textContent, drawn);
  assert.equal(sideAtRotation(Number(v.dataset.rotation)), drawn);
  assert.match($(v, ".coin-app__counter").textContent, drawn === "Pile" ? /Pile : 1/ : /Face : 1/);
});
