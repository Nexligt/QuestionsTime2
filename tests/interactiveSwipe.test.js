/* Swipe interactif : la carte suit le doigt, revient ou sort avec animation. */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase, mount, waitFor, mainIsReady, displayedQuestionId } from "./helpers.js";
import { createMainView } from "../js/features/questions/mainView.js";
import { getHistory } from "../js/data/historyRepository.js";
import { getSetting } from "../js/data/settingsRepository.js";
import { CURRENT_QUESTION_ID_KEY } from "../js/features/questions/questionEngine.js";
import { SWIPE_ANIMATION } from "../js/ui/swipeGesture.js";

beforeEach(resetDatabase);

const mountMain = () => mount(createMainView, mainIsReady);
const card = (v) => v.querySelector(".question-card");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pointer(target, type, x, y) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "touch" });
  Object.defineProperty(event, "isPrimary", { value: true });
  target.dispatchEvent(event);
}

test("1. la carte suit horizontalement le doigt, avec une légère rotation", async () => {
  const view = await mountMain();
  const c = card(view);
  pointer(c, "pointerdown", 300, 200);
  pointer(c, "pointermove", 260, 202);
  assert.match(c.style.transform, /translateX\(-40px\) rotate\(-2deg\)/);
  assert.equal(c.style.transition, "none"); // suivi direct, sans latence
  assert.ok(c.classList.contains("is-dragging"));

  pointer(c, "pointermove", 180, 205);
  assert.match(c.style.transform, /translateX\(-120px\) rotate\(-6deg\)/);
  pointer(c, "pointermove", -300, 205); // rotation plafonnée
  assert.match(c.style.transform, /rotate\(-12deg\)/);

  // Un geste d'abord vertical ne déplace pas la carte (défilement de la page).
  pointer(c, "pointerup", -300, 205);
  await sleep(SWIPE_ANIMATION.outDuration + 100);
  await waitFor(() => !view.querySelector(".question-next").disabled);
  const c2 = card(view);
  pointer(c2, "pointerdown", 200, 100);
  pointer(c2, "pointermove", 198, 160);
  pointer(c2, "pointermove", 150, 200);
  assert.equal(c2.style.transform, "");
});

test("2. swipe insuffisant : retour animé à la position initiale, question inchangée", async () => {
  const view = await mountMain();
  const first = displayedQuestionId(view);
  const c = card(view);
  pointer(c, "pointerdown", 300, 200);
  pointer(c, "pointermove", 260, 200);
  pointer(c, "pointerup", 260, 200); // 40 px < seuil de 60 px

  assert.match(c.style.transition, /transform 200ms/);
  assert.match(c.style.transform, /translateX\(0px\)/);
  await sleep(SWIPE_ANIMATION.backDuration + 100);
  assert.equal(c.style.transform, "");
  assert.equal(c.classList.contains("is-dragging"), false);
  assert.equal(displayedQuestionId(view), first);
  assert.equal((await getHistory()).length, 1);
});

test("3. swipe valide : sortie animée PUIS changement de question", async () => {
  const view = await mountMain();
  const first = displayedQuestionId(view);
  const c = card(view);
  pointer(c, "pointerdown", 300, 200);
  pointer(c, "pointermove", 220, 205);
  pointer(c, "pointermove", 150, 208);
  pointer(c, "pointerup", 150, 208);

  // Pendant l'animation de sortie : pas encore de changement, bouton bloqué.
  assert.match(c.style.transition, /transform 220ms/);
  assert.equal(c.style.opacity, "0");
  assert.equal(view.querySelector(".question-next").disabled, true);
  assert.equal((await getHistory()).length, 1);

  await sleep(SWIPE_ANIMATION.outDuration + 100);
  await waitFor(() => !view.querySelector(".question-next").disabled);
  assert.notEqual(displayedQuestionId(view), first);
  assert.equal((await getHistory()).length, 2);
  assert.equal(await getSetting(CURRENT_QUESTION_ID_KEY), displayedQuestionId(view));
  assert.equal(c.style.transform, ""); // carte replacée pour la nouvelle question
  assert.equal(c.style.opacity, "");
});
