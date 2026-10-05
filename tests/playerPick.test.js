/* Option « Joueur désigné » : un joueur de la Roue tiré à chaque changement de question. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId } from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { PLAYER_PICK, getPlayerPick, setPlayerPick, pickPlayer, resolvePlayer } from "../js/features/questions/playerPick.js";
import { saveWheelEntries } from "../js/features/miniApps/wheel/wheel.js";

beforeEach(resetDatabase);

const ENTRIES = ["Alice", "Bob", "Chloé"];
const mountMain = () => mount(createMainView, (v) => mainIsReady(v) && !v.querySelector(".mode-indicator").disabled);
const player = (v) => v.querySelector(".question-card__player-name")?.textContent ?? null;

test("tirage : toujours une entrée de la Roue, jamais deux fois de suite la même", () => {
  for (const r of [0, 0.5, 0.9999]) {
    const name = pickPlayer(ENTRIES, "Bob", () => r);
    assert.ok(["Alice", "Chloé"].includes(name));
  }
  assert.equal(pickPlayer(["Seul"], "Seul"), "Seul");
  assert.equal(pickPlayer([]), null);
});

test("même question (retour sur Main) : même joueur ; nouvelle question : nouveau tirage", async () => {
  await saveWheelEntries(ENTRIES);
  assert.equal(await resolvePlayer(3, true), null); // option désactivée par défaut
  await setPlayerPick(PLAYER_PICK.ON);
  const first = await resolvePlayer(3, true);
  assert.ok(ENTRIES.includes(first));
  assert.equal(await resolvePlayer(3, false), first);
  const next = await resolvePlayer(4, true);
  assert.ok(ENTRIES.includes(next) && next !== first);
});

test("Main : « Au tour de » affiché seulement si l'option est activée, et change avec la question", async () => {
  await saveWheelEntries(ENTRIES);
  let v = await mountMain();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(player(v), null); // désactivée

  await setPlayerPick(PLAYER_PICK.ON);
  v = await mountMain();
  await waitFor(() => player(v));
  const first = player(v);
  assert.ok(ENTRIES.includes(first));
  assert.equal(v.querySelector(".question-card__player-label").textContent, "Au tour de");

  const before = displayedQuestionId(v);
  v.querySelector(".question-next").click();
  await waitFor(() => displayedQuestionId(v) !== before && player(v));
  assert.ok(ENTRIES.includes(player(v)));
  assert.notEqual(player(v), first); // jamais deux fois de suite

  const shown = player(v);
  v = await mountMain(); // retour sur Main : même question, même joueur
  await waitFor(() => player(v));
  assert.equal(player(v), shown);
});

test("réglage dans Paramètres > Réglages, mémorisé", async () => {
  const v = await mount(createSettingsView, (x) => x.querySelector('[data-setting="player-pick"] .settings-choices'));
  const group = v.querySelector('[data-setting="player-pick"] .settings-choices');
  await waitFor(() => group.dataset.value === PLAYER_PICK.OFF);
  group.querySelector(`input[value="${PLAYER_PICK.ON}"]`).click();
  await waitFor(() => group.dataset.value === PLAYER_PICK.ON);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(await getPlayerPick(), PLAYER_PICK.ON);
});

test("option « pas deux fois de suite » : réglable, activée par défaut", async () => {
  const { getPlayerNoRepeat, setPlayerNoRepeat } = await import("../js/features/questions/playerPick.js");
  assert.equal(await getPlayerNoRepeat(), PLAYER_PICK.ON);
  assert.equal(pickPlayer(["A", "B"], "A", () => 0, { noRepeat: false }), "A"); // répétition permise
  assert.equal(pickPlayer(["A", "B"], "A", () => 0, { noRepeat: true }), "B");
  await saveWheelEntries(["A", "B"]);
  await setPlayerPick(PLAYER_PICK.ON);
  assert.equal(await setPlayerNoRepeat(PLAYER_PICK.OFF), PLAYER_PICK.OFF);
  const seen = [];
  for (let i = 1; i <= 40; i++) seen.push(await resolvePlayer(i, true));
  assert.ok(seen.some((name, i) => i > 0 && name === seen[i - 1])); // la répétition arrive
  await setPlayerNoRepeat(PLAYER_PICK.ON);
  const strict = [];
  for (let i = 100; i <= 120; i++) strict.push(await resolvePlayer(i, true));
  assert.ok(strict.every((name, i) => i === 0 || name !== strict[i - 1]));
});

test("Réglages : les deux options dans la carte « Joueur désigné », mémorisées", async () => {
  const { getPlayerNoRepeat } = await import("../js/features/questions/playerPick.js");
  const v = await mount(createSettingsView, (x) => x.querySelector('[data-setting="player-pick"] .settings-player-pick__repeat'));
  const repeat = v.querySelector('[data-setting="player-pick"] .settings-player-pick__repeat');
  await waitFor(() => repeat.dataset.value === PLAYER_PICK.ON);
  repeat.querySelector(`input[value="${PLAYER_PICK.OFF}"]`).click();
  await waitFor(() => repeat.dataset.value === PLAYER_PICK.OFF);
  assert.equal(await getPlayerNoRepeat(), PLAYER_PICK.OFF);
});

test("mini-app Roue : case « Désigner un joueur », synchronisée avec Réglages", async () => {
  const v = await mount(() => createSettingsView("miniapps/wheel"), (x) => !x.querySelector(".wheel-app__player-pick")?.disabled && x.querySelector('[data-setting="player-pick"] .settings-player-pick__display')?.dataset.value);
  const box = v.querySelector(".wheel-app__player-pick");
  const display = v.querySelector('[data-setting="player-pick"] .settings-player-pick__display');
  assert.equal(box.checked, false);
  box.click(); // depuis la Roue
  await waitFor(() => display.dataset.value === PLAYER_PICK.ON);
  assert.equal(await getPlayerPick(), PLAYER_PICK.ON);
  display.querySelector(`input[value="${PLAYER_PICK.OFF}"]`).click(); // depuis Réglages
  await waitFor(() => box.checked === false);
  assert.equal(await getPlayerPick(), PLAYER_PICK.OFF);
});
