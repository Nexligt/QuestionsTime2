/* Mini-application « Qui commence ? » : événements pointer simulés. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { waitFor, resetDatabase, mount } from "./helpers.js";
import { CHOOSER, CHOOSER_MODES, pickWinner, assignFingerTeams, minFingersFor, loadChooserSettings } from "../js/features/miniApps/chooser/chooser.js";
import { buildChooserApp, openChooser } from "../js/features/miniApps/chooser/chooserView.js";

function fakeTimers() {
  const timers = { pending: new Map(), next: 1, cleared: 0, scheduled: 0 };
  timers.deps = {
    setTimeout: (fn, ms) => { const id = timers.next++; timers.pending.set(id, { fn, ms }); timers.scheduled++; return id; },
    clearTimeout: (id) => { if (timers.pending.delete(id)) timers.cleared++; },
  };
  timers.fire = () => { for (const [id, t] of [...timers.pending]) { timers.pending.delete(id); t.fn(); } };
  return timers;
}

function pointer(target, type, id, x = 100, y = 100) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, { pointerId: { value: id }, clientX: { value: x }, clientY: { value: y } });
  target.dispatchEvent(event);
  return event;
}

let timers;
function open() {
  timers = fakeTimers();
  const app = buildChooserApp("t", timers.deps);
  document.body.replaceChildren(app);
  app.querySelector(".chooser-app__start").click();
  return document.querySelector(".chooser");
}
const circles = (o) => [...o.querySelectorAll(".chooser__circle")];

beforeEach(() => {
  window.location.hash = "";
  window.matchMedia = () => ({ matches: false });
});

test("« Commencer » ouvre la couche plein écran ; « × » la ferme", () => {
  const o = open();
  assert.ok(o);
  assert.equal(o.querySelector(".chooser__hint").textContent, "Posez chacun un doigt sur l'écran");
  assert.ok(document.documentElement.classList.contains("chooser-active"));
  o.querySelector(".chooser__close").click();
  assert.equal(document.querySelector(".chooser"), null);
  assert.ok(!document.documentElement.classList.contains("chooser-active"));
});

test("un cercle par doigt, qui suit le doigt et disparaît quand il est levé ; couleurs différentes", () => {
  const o = open();
  const down = pointer(o, "pointerdown", 1, 50, 60);
  assert.equal(down.defaultPrevented, true);
  pointer(o, "pointerdown", 2, 200, 300);
  pointer(o, "pointerdown", 3, 150, 400);
  assert.equal(circles(o).length, 3);
  const colors = circles(o).map((c) => [...c.classList].find((k) => /--\d$/.test(k)));
  assert.equal(new Set(colors).size, 3);
  pointer(o, "pointermove", 2, 210, 320);
  assert.equal(o.querySelector('[data-pointer-id="2"]').style.transform, "translate(210px, 320px)");
  pointer(o, "pointerup", 2);
  assert.equal(circles(o).length, 2);
  pointer(o, "pointercancel", 3); // limite de doigts du téléphone
  assert.equal(circles(o).length, 1);
});

test("pas de tirage avec un seul doigt", () => {
  const o = open();
  pointer(o, "pointerdown", 1);
  assert.equal(timers.pending.size, 0);
  timers.fire();
  assert.equal(o.dataset.phase, "waiting");
  assert.equal(o.dataset.winner, undefined);
});

test("l'attente de 3 s recommence si le nombre de doigts change ; gagnant parmi les doigts posés", () => {
  const o = open();
  pointer(o, "pointerdown", 1);
  pointer(o, "pointerdown", 2);
  assert.equal(timers.pending.size, 1);
  assert.equal([...timers.pending.values()][0].ms, CHOOSER.waitMs);
  assert.ok(o.classList.contains("chooser--counting"));
  pointer(o, "pointerdown", 3); // ajout : attente relancée
  assert.equal(timers.cleared, 1);
  assert.equal(timers.pending.size, 1);
  pointer(o, "pointerup", 1); // retrait : relancée aussi
  assert.equal(timers.cleared, 2);
  assert.equal(timers.pending.size, 1);
  timers.fire();
  assert.equal(o.dataset.phase, "result");
  assert.ok(["2", "3"].includes(o.dataset.winner));
  const winner = o.querySelector(".chooser__circle--winner");
  assert.equal(winner.dataset.pointerId, o.dataset.winner);
  assert.equal(o.querySelectorAll(".chooser__circle--out").length, 1);
  assert.ok(o.classList.contains(`chooser--win-${o.dataset.winnerColor}`));

  pointer(o, "pointerdown", 9); // pendant le résultat : ignoré
  assert.equal(circles(o).length, 2);
  pointer(o, "pointerup", 2);
  pointer(o, "pointerup", 3); // tous levés : on peut recommencer
  assert.equal(o.dataset.phase, "waiting");
  assert.equal(circles(o).length, 0);
  assert.ok(!o.classList.contains("chooser--result"));
});

test("tirage : toujours l'un des doigts posés", () => {
  for (const r of [0, 0.3, 0.5, 0.99, 1]) assert.ok([4, 7, 9].includes(pickWinner([4, 7, 9], () => r)));
  assert.equal(pickWinner([]), null);
});

test("le bouton retour du téléphone ferme la couche", async () => {
  window.location.hash = "#/settings/miniapps/chooser";
  const o = open();
  assert.equal(window.location.hash, "#/settings/miniapps/chooser/play");
  pointer(o, "pointerdown", 1);
  pointer(o, "pointerdown", 2);
  window.history.back();
  await waitFor(() => document.querySelector(".chooser") === null);
  assert.equal(window.location.hash, "#/settings/miniapps/chooser");
  assert.equal(timers.pending.size, 0); // attente annulée
});

/* --- Mode « Équipes » ----------------------------------------------------- */

function openTeams(teamCount, captain = false) {
  timers = fakeTimers();
  document.body.replaceChildren();
  return openChooser({ ...timers.deps, mode: CHOOSER_MODES.TEAMS, teamCount, captain }).overlay;
}
const fireAll = () => { for (let i = 0; i < 50 && timers.pending.size; i++) timers.fire(); };

test("Équipes : répartition équilibrée, chaque doigt dans une seule équipe", () => {
  for (let n = 2; n <= 10; n++) {
    for (let t = 2; t <= Math.min(6, n); t++) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      const { teams, teamOf } = assignFingerTeams(ids, t);
      assert.deepEqual(teams.flat().sort((a, b) => a - b), ids);
      assert.equal(teamOf.size, n);
      const sizes = teams.map((m) => m.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    }
  }
  assert.equal(minFingersFor(CHOOSER_MODES.TEAMS, 4), 4);
  assert.equal(minFingersFor(CHOOSER_MODES.SINGLE, 4), 2);
});

test("Équipes : cercles neutres, au moins un doigt par équipe avant l'attente", () => {
  const o = openTeams(3);
  pointer(o, "pointerdown", 1);
  pointer(o, "pointerdown", 2);
  assert.ok(circles(o).every((c) => c.classList.contains("chooser__circle--neutral")));
  assert.equal(timers.pending.size, 0);
  assert.equal(o.querySelector(".chooser__hint").textContent, "Encore 1 doigt au minimum");
  pointer(o, "pointerdown", 3);
  assert.equal(timers.pending.size, 1);
  assert.ok(o.classList.contains("chooser--counting"));
});

test("Équipes : roulette puis équipes finales (couleur, numéro, légende), sans capitaine", () => {
  const o = openTeams(2);
  for (const id of [1, 2, 3, 4, 5]) pointer(o, "pointerdown", id, id * 40, 300);
  fireAll();
  assert.equal(o.dataset.phase, "result");
  const teamOf = JSON.parse(o.dataset.teams);
  assert.deepEqual(Object.keys(teamOf).sort(), ["1", "2", "3", "4", "5"]);
  const counts = [0, 0];
  for (const c of circles(o)) {
    const team = teamOf[c.dataset.pointerId];
    counts[team]++;
    assert.ok(c.classList.contains(`chooser__circle--team-${team}`));
    assert.equal(c.querySelector(".chooser__team-number").textContent, String(team + 1));
  }
  assert.deepEqual(counts.sort(), [2, 3]);
  assert.equal(o.querySelectorAll(".chooser__legend-item").length, 2);
  assert.deepEqual(JSON.parse(o.dataset.captains), []);
  assert.equal(o.querySelector(".chooser__captain-label"), null);
  assert.equal(o.querySelector(".chooser__replay").hidden, false);
  pointer(o, "pointerdown", 9); // pendant le résultat : ignoré
  assert.equal(circles(o).length, 5);
  o.querySelector(".chooser__replay").click(); // « Rejouer »
  assert.equal(circles(o).length, 0);
  assert.equal(o.dataset.phase, "waiting");
  assert.equal(o.querySelector(".chooser__legend").hidden, true);
});

test("Équipes : un capitaine par équipe, choisi parmi ses membres", () => {
  const o = openTeams(3, true);
  for (const id of [1, 2, 3, 4, 5, 6, 7]) pointer(o, "pointerdown", id);
  fireAll();
  const teamOf = JSON.parse(o.dataset.teams);
  const captains = JSON.parse(o.dataset.captains);
  assert.equal(captains.length, 3);
  assert.deepEqual(captains.map((id) => teamOf[id]).sort(), [0, 1, 2]);
  assert.equal(o.querySelectorAll(".chooser__circle--captain").length, 3);
  assert.equal(o.querySelectorAll(".chooser__captain-label").length, 3);
});

test("Équipes avec « Réduire les animations » : pas de roulette", () => {
  window.matchMedia = (q) => ({ matches: q.includes("reduce") });
  const o = openTeams(2);
  pointer(o, "pointerdown", 1);
  pointer(o, "pointerdown", 2);
  timers.fire(); // fin de l'attente : résultat immédiat
  assert.ok(o.dataset.teams);
  assert.equal(timers.pending.size, 0);
});

test("réglages de la mini-app (mode, nombre d'équipes, capitaine) mémorisés", async () => {
  await resetDatabase();
  let v = await mount(() => buildChooserApp("t"), (x) => x.dataset.ready === "true");
  assert.equal(v.querySelector(".chooser-app__teams").hidden, true);
  v.querySelector(`.chooser-app__modes input[value="${CHOOSER_MODES.TEAMS}"]`).click();
  assert.equal(v.querySelector(".chooser-app__teams").hidden, false);
  v.querySelector('.chooser-app__team-count input[value="4"]').click();
  v.querySelector(".chooser-app__captain").click();
  await waitFor(() => Number(v.dataset.saves) >= 3);
  assert.deepEqual(await loadChooserSettings(), { mode: CHOOSER_MODES.TEAMS, teams: 4, captain: true });
  v = await mount(() => buildChooserApp("t"), (x) => x.dataset.ready === "true");
  assert.equal(v.querySelector(".chooser-app__team-count input:checked").value, "4");
  assert.equal(v.querySelector(".chooser-app__captain").checked, true);
  v.querySelector(".chooser-app__start").click();
  assert.equal(document.querySelector(".chooser").dataset.mode, CHOOSER_MODES.TEAMS);
  document.querySelector(".chooser__close").click();
});

test("Équipes : doigts levés (même pendant la répartition), rien ne disparaît jusqu'à « Rejouer »", () => {
  const o = openTeams(2);
  for (const id of [1, 2, 3, 4]) pointer(o, "pointerdown", id);
  timers.fire(); // fin de l'attente : roulette en cours
  pointer(o, "pointerup", 1); // levé pendant la roulette
  fireAll();
  assert.equal(Object.keys(JSON.parse(o.dataset.teams)).length, 4); // toujours réparti
  for (const id of [2, 3, 4]) pointer(o, "pointerup", id);
  pointer(o, "pointercancel", 2);
  assert.equal(circles(o).length, 4);
  assert.equal(o.dataset.phase, "result");
  assert.equal(o.querySelector(".chooser__legend").hidden, false);
  assert.equal(o.querySelector(".chooser__hint").textContent, "Touchez « Rejouer » pour recommencer");
  o.querySelector(".chooser__replay").click();
  assert.equal(circles(o).length, 0);
  assert.equal(o.dataset.phase, "waiting");
});
