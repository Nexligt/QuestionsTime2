/* Mini-application « Qui commence ? » : événements pointer simulés. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { waitFor } from "./helpers.js";
import { CHOOSER, pickWinner } from "../js/features/miniApps/chooser/chooser.js";
import { buildChooserApp } from "../js/features/miniApps/chooser/chooserView.js";

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
