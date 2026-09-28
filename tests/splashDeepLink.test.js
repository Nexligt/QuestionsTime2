/* Rechargement sur #/main : pas de Splash. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { waitFor } from "./helpers.js";

test("démarrage sur #/main : Main directement, aucun Splash", async () => {
  document.body.innerHTML = '<main id="view-root"></main><nav id="bottom-nav" hidden></nav>';
  window.matchMedia = () => ({ matches: false });
  window.location.hash = "#/main";
  await import("../js/app.js");
  await waitFor(() => document.getElementById("view-root").querySelector(".view--main"));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(document.querySelector(".splash-intro"), null);
  assert.equal(document.getElementById("img-titre").style.visibility, "");
  assert.ok(!document.documentElement.classList.contains("splash-active"));
});
