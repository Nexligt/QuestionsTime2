import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId,
} from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { createSettingsView } from "../js/features/settings/settingsView.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting, setSetting } from "../js/data/settingsRepository.js";
import {
  CURRENT_QUESTION_ID_KEY, SELECTION_MODE_KEY,
} from "../js/features/questions/questionEngine.js";
import {
  NEXT_NAVIGATION_KEY, getNextNavigation,
} from "../js/features/questions/nextNavigation.js";
import { isLeftSwipe } from "../js/ui/swipeGesture.js";

beforeEach(resetDatabase);

const mountMain = () => mount(createMainView, mainIsReady);
const section = (view) => view.querySelector('[data-setting="next-navigation"]');
const mountSettings = () =>
  mount(createSettingsView, (v) => section(v) && !section(v).querySelector("input").disabled);

/** Événement pointeur natif simulé (jsdom n'a pas PointerEvent). */
function pointer(target, type, x, y, pointerId = 1) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "isPrimary", { value: true });
  target.dispatchEvent(event);
}

function gesture(view, [x1, y1], [x2, y2]) {
  const card = view.querySelector(".question-card");
  const target = card.firstElementChild ?? card; // le geste part du texte de la question
  pointer(target, "pointerdown", x1, y1);
  pointer(target, "pointerup", x2, y2);
}
const swipeLeft = (view) => gesture(view, [300, 200], [100, 210]);

/** Laisse le temps à une éventuelle sélection de se produire. */
async function settle(view) {
  await new Promise((r) => setTimeout(r, 30));
  await waitFor(() => !view.querySelector(".question-next").disabled);
}

async function historyLength() {
  return (await getHistory()).length;
}

test("1. les 3 choix sont affichés dans Paramètres", async () => {
  const view = await mountSettings();
  const labels = [...section(view).querySelectorAll(".settings-choice__label")].map((l) => l.textContent);
  assert.deepEqual(labels, ["Bouton uniquement", "Swipe uniquement", "Bouton + Swipe"]);
});

test("3. valeur par défaut = bouton + swipe", async () => {
  assert.equal(await getSetting(NEXT_NAVIGATION_KEY, null), null);
  assert.equal(await getNextNavigation(), "both");
  const view = await mountSettings();
  assert.equal(section(view).querySelector("input:checked").value, "both");
});

test("2. le réglage est persisté et relu", async () => {
  let view = await mountSettings();
  const input = section(view).querySelector('input[value="swipe"]');
  input.click();
  await waitFor(() => section(view).querySelector(".settings-choices").dataset.value === "swipe");
  assert.equal(await getSetting(NEXT_NAVIGATION_KEY), "swipe");

  view = await mountSettings();
  assert.equal(section(view).querySelector("input:checked").value, "swipe");
  // Le mode de sélection n'est pas affecté.
  assert.equal(await getSetting(SELECTION_MODE_KEY, "strict"), "strict");
});

test("4. bouton uniquement : Suivante fonctionne, le swipe ne fait rien", async () => {
  await setSetting(NEXT_NAVIGATION_KEY, "button");
  const view = await mountMain();
  const button = view.querySelector(".question-next");
  assert.equal(button.hidden, false);

  swipeLeft(view);
  await settle(view);
  assert.equal(await historyLength(), 1);

  button.click();
  await settle(view);
  assert.equal(await historyLength(), 2);
});

test("5. swipe uniquement : le swipe change de question, le bouton non", async () => {
  await setSetting(NEXT_NAVIGATION_KEY, "swipe");
  const view = await mountMain();
  const first = displayedQuestionId(view);
  const button = view.querySelector(".question-next");
  assert.equal(button.hidden, true);

  button.click(); // même forcé, aucun effet
  await settle(view);
  assert.equal(await historyLength(), 1);
  assert.equal(displayedQuestionId(view), first);

  swipeLeft(view);
  await settle(view);
  assert.equal(await historyLength(), 2);
  assert.notEqual(displayedQuestionId(view), first);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), displayedQuestionId(view));
});

test("6. bouton + swipe : les deux fonctionnent (défaut)", async () => {
  const view = await mountMain();
  view.querySelector(".question-next").click();
  await settle(view);
  swipeLeft(view);
  await settle(view);
  assert.equal(await historyLength(), 3);
});

test("7. un tap / simple clic sur la question ne change rien", async () => {
  const view = await mountMain();
  const first = displayedQuestionId(view);
  gesture(view, [200, 200], [200, 200]); // tap
  gesture(view, [200, 200], [185, 203]); // petit glissement accidentel
  view.querySelector(".question-card").click();
  await settle(view);
  assert.equal(displayedQuestionId(view), first);
  assert.equal(await historyLength(), 1);
});

test("8. swipe dans le mauvais sens ou trop vertical : aucun changement", async () => {
  const view = await mountMain();
  const first = displayedQuestionId(view);
  gesture(view, [100, 200], [300, 205]); // gauche -> droite
  gesture(view, [300, 100], [220, 300]); // plutôt vertical
  await settle(view);
  assert.equal(displayedQuestionId(view), first);
  assert.equal(await historyLength(), 1);

  // Règles pures du geste
  const t = 0;
  assert.equal(isLeftSwipe({ x: 300, y: 0, time: t }, { x: 200, y: 10, time: t + 200 }), true);
  assert.equal(isLeftSwipe({ x: 300, y: 0, time: t }, { x: 260, y: 0, time: t + 200 }), false);
  assert.equal(isLeftSwipe({ x: 300, y: 0, time: t }, { x: 200, y: 0, time: t + 2000 }), false);
});

test("9. Strict/Libre et currentQuestionId restent corrects avec le swipe", async () => {
  await setSetting(NEXT_NAVIGATION_KEY, "swipe");
  let view = await mountMain();
  const seen = new Set([displayedQuestionId(view)]);
  for (let i = 0; i < 4; i++) {
    swipeLeft(view);
    await settle(view);
    seen.add(displayedQuestionId(view));
  }
  assert.equal(seen.size, 5); // Strict : jamais deux fois la même
  const lastId = displayedQuestionId(view);

  swipeLeft(view); // épuisement Strict, sans reset
  await settle(view);
  assert.match(view.querySelector(".question-card").textContent, /toutes les questions disponibles/);
  assert.equal(await historyLength(), 5);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), lastId);

  view = await mountMain(); // remontage : même question, rien d'écrit
  assert.equal(displayedQuestionId(view), lastId);
  assert.equal(await historyLength(), 5);

  // Libre par le bouton de mode : le swipe suivant utilise le mode Libre.
  const modeButton = view.querySelector(".mode-indicator");
  await waitFor(() => !modeButton.disabled);
  modeButton.click();
  await waitFor(() => modeButton.textContent === "Mode : Libre");
  swipeLeft(view);
  await settle(view);
  const modes = (await getHistory()).map((h) => h.mode);
  assert.equal(modes.filter((m) => m === "libre").length, 1);
  assert.equal(modes.filter((m) => m === "strict").length, 5);
});
