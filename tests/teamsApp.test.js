/* Mini-application « Équipes » : répartition, équilibre, modes, cas impossible, mémorisation. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor } from "./helpers.js";
import {
  DEFAULT_TEAM_NAMES, TEAM_MODES, formTeams, planTeams, normalizeNames, loadTeamsSettings,
} from "../js/features/miniApps/teams/teams.js";
import { saveWheelEntries } from "../js/features/miniApps/wheel/wheel.js";
import { buildTeamsApp } from "../js/features/miniApps/teams/teamsView.js";

beforeEach(resetDatabase);

const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const mountTeams = () => mount(() => buildTeamsApp("t"), (v) => v.dataset.ready === "true");
const $ = (v, s) => v.querySelector(s);
const $$ = (v, s) => [...v.querySelectorAll(s)];
const cards = (v) => $$(v, ".teams-card").map((c) => [...c.querySelectorAll("li")].map((li) => li.textContent));
function setValue(v, value) {
  const input = $(v, ".teams-app__value-input");
  input.value = String(value);
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}

test("tous les joueurs placés une seule fois, équipes équilibrées (écart ≤ 1)", () => {
  for (let n = 2; n <= 30; n++) {
    for (let t = 2; t <= Math.min(6, n); t++) {
      const teams = formTeams(names(n), t);
      assert.equal(teams.length, t);
      assert.deepEqual(teams.flat().sort(), names(n).sort(), `${n}/${t}`);
      const sizes = teams.map((team) => team.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `${n}/${t}`);
      assert.ok(sizes.every((s) => s >= 1));
    }
  }
  const orders = new Set(Array.from({ length: 30 }, () => JSON.stringify(formTeams(names(8), 2))));
  assert.ok(orders.size > 1); // aléatoire
});

test("les deux modes de réglage et les cas impossibles", () => {
  assert.deepEqual(planTeams({ mode: TEAM_MODES.COUNT, count: 3 }, 10), { teams: 3 });
  assert.deepEqual(planTeams({ mode: TEAM_MODES.COUNT, count: 9 }, 10), { teams: 6 }); // borné à 6
  assert.deepEqual(planTeams({ mode: TEAM_MODES.SIZE, size: 3 }, 10), { teams: 4 }); // 3,3,2,2
  assert.deepEqual(planTeams({ mode: TEAM_MODES.SIZE, size: 5 }, 10), { teams: 2 });
  assert.match(planTeams({ mode: TEAM_MODES.COUNT, count: 5 }, 3).error, /5 équipes pour 3 joueurs/);
  assert.match(planTeams({ mode: TEAM_MODES.SIZE, size: 10 }, 6).error, /qu'une équipe/);
  assert.match(planTeams({ mode: TEAM_MODES.SIZE, size: 1 }, 10).error, /6 au plus/);
  assert.deepEqual(normalizeNames(["seul"]), DEFAULT_TEAM_NAMES);
  assert.equal(normalizeNames(names(40)).length, 30);
});

test("interface : former, cartes colorées, mélanger à nouveau, mode « joueurs par équipe »", async () => {
  const v = await mountTeams();
  for (let i = 0; i < 4; i++) $(v, ".teams-app__add").click(); // 8 joueurs
  $(v, ".teams-app__form").click();
  let teams = cards(v);
  assert.equal(teams.length, 2);
  assert.deepEqual(teams.flat().sort(), $$(v, ".teams-app__name").map((i) => i.value).sort());
  assert.deepEqual($$(v, ".teams-card__title").map((t) => t.textContent), ["Équipe 1", "Équipe 2"]);
  assert.ok($(v, ".teams-card--0") && $(v, ".teams-card--1"));
  assert.equal($(v, ".teams-app__reshuffle").hidden, false);
  $(v, ".teams-app__reshuffle").click();
  assert.equal(cards(v).flat().length, 8);

  $(v, `.teams-app__modes input[value="${TEAM_MODES.SIZE}"]`).click();
  setValue(v, 3);
  $(v, ".teams-app__form").click();
  teams = cards(v);
  assert.deepEqual(teams.map((t) => t.length).sort(), [2, 3, 3]);
});

test("réglage impossible : message clair, aucune carte", async () => {
  const v = await mountTeams(); // 4 joueurs
  setValue(v, 6);
  $(v, ".teams-app__form").click();
  assert.match($(v, ".teams-app__status").textContent, /6 équipes pour 4 joueurs/);
  assert.equal(cards(v).length, 0);
  assert.equal($(v, ".teams-app__reshuffle").hidden, true);
  setValue(v, 2);
  $(v, ".teams-app__form").click();
  assert.equal($(v, ".teams-app__status").textContent, "");
  assert.equal(cards(v).length, 2);
});

test("mémorisation, suppression bornée à 2, reprise des joueurs de la Roue", async () => {
  await saveWheelEntries(["Alice", "Bob", "Chloé"]);
  let v = await mountTeams();
  assert.deepEqual($$(v, ".teams-app__name").map((i) => i.value), DEFAULT_TEAM_NAMES);
  $(v, ".teams-app__from-wheel").click();
  await waitFor(() => $$(v, ".teams-app__name").length === 3);
  $$(v, ".teams-app__delete")[0].click();
  assert.ok($$(v, ".teams-app__delete").every((b) => b.disabled)); // jamais moins de 2
  $(v, `.teams-app__modes input[value="${TEAM_MODES.SIZE}"]`).click();
  setValue(v, 4);
  await waitFor(() => Number(v.dataset.saves) >= 4);
  assert.deepEqual(await loadTeamsSettings(), { names: ["Bob", "Chloé"], mode: TEAM_MODES.SIZE, count: 2, size: 4 });
  v = await mountTeams();
  assert.deepEqual($$(v, ".teams-app__name").map((i) => i.value), ["Bob", "Chloé"]);
  assert.equal($(v, ".teams-app__modes input:checked").value, TEAM_MODES.SIZE);
  assert.equal($(v, ".teams-app__value-input").value, "4");
});
