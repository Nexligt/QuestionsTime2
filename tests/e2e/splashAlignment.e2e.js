/*
  Test de bout en bout du Splash dans un VRAI navigateur (Chromium via
  Playwright) : alignement final à 1 px près, séquence des phases,
  mouvement réduit, Splash jamais réaffiché via « Accueil » ou #/main.

  Hors de `npm test` (jsdom ne calcule ni mise en page ni animations).

  Installation (une seule fois, à la racine du projet) :
    npm install --save-dev playwright
    npx playwright install chromium

  Lancement :
    npm run test:e2e
  (équivaut à : node tests/e2e/splashAlignment.e2e.js)

  Le script démarre lui-même un petit serveur local sur un port libre :
  aucun serveur à lancer à côté. Code de sortie 0 si tout est correct.
  Variable facultative : CHROMIUM_PATH=/chemin/vers/chromium (navigateur
  déjà installé ailleurs).
*/
import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json",
};
const TOLERANCE = 1; // px

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const file = path.join(ROOT, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "ok    " : "ÉCHEC "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const SCENARIOS = [
  { name: "téléphone portrait 390×844", viewport: { width: 390, height: 844 }, dpr: 3 },
  { name: "petit téléphone 320×568", viewport: { width: 320, height: 568 }, dpr: 2 },
  { name: "téléphone paysage 844×390", viewport: { width: 844, height: 390 }, dpr: 3 },
  { name: "tablette 768×1024", viewport: { width: 768, height: 1024 }, dpr: 2 },
];

async function openSplash(context) {
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`);
  await page.waitForSelector('.splash-intro[data-phase="float"]', { timeout: 10000 });
  await page.evaluate(() => {
    const plain = (r) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
    window.__phases = [];
    const overlay = document.querySelector(".splash-intro");
    new MutationObserver(() => window.__phases.push(overlay.dataset.phase))
      .observe(overlay, { attributes: true, attributeFilter: ["data-phase"] });
    window.__landed = new Promise((resolve) =>
      document.addEventListener("splash-intro:landed", (e) =>
        resolve({ splash: plain(e.detail.splash), target: plain(e.detail.target) }), { once: true }));
  });
  return page;
}

for (const reduced of [false, true]) {
  for (const scenario of SCENARIOS) {
    const label = `${scenario.name}${reduced ? " [mouvement réduit]" : ""}`;
    const context = await browser.newContext({
      viewport: scenario.viewport,
      deviceScaleFactor: scenario.dpr,
      hasTouch: true,
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    const page = await openSplash(context);

    // Même image pour les deux titres, même rapport largeur/hauteur.
    const styles = await page.evaluate(() => {
      const pick = (el) => {
        const img = el.querySelector("img");
        // Dimensions de mise en page (hors transformations du flottement).
        return { src: img?.getAttribute("src") ?? null, alt: img?.alt ?? null, loaded: Boolean(img?.complete && img.naturalWidth), ratio: parseFloat(getComputedStyle(el).width) / parseFloat(getComputedStyle(el).height) };
      };
      return {
        splash: pick(document.getElementById("img-titre-splash")),
        main: pick(document.getElementById("img-titre")),
        lock: getComputedStyle(document.getElementById("view-root")).overflowY,
        infinite: document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).length,
        mainHidden: getComputedStyle(document.getElementById("img-titre")).visibility,
      };
    });
    check(`${label} : même image pour les deux titres`, styles.splash.src === "assets/img_Titre.svg" && styles.splash.src === styles.main.src && styles.splash.alt === "QuestionsTime2" && styles.splash.loaded, JSON.stringify(styles.splash));
    check(`${label} : même rapport largeur/hauteur`, Math.abs(styles.splash.ratio - styles.main.ratio) < 0.01, `${styles.splash.ratio.toFixed(4)} / ${styles.main.ratio.toFixed(4)}`);
    check(`${label} : défilement bloqué pendant le Splash`, styles.lock === "hidden");
    check(`${label} : vrai titre caché sous le Splash`, styles.mainHidden === "hidden");
    check(`${label} : flottement ${reduced ? "absent" : "actif"}`, reduced ? styles.infinite === 0 : styles.infinite === 3, `${styles.infinite} animation(s) infinie(s)`);

    // Double toucher : une seule séquence.
    const box = await page.locator(".splash-intro").boundingBox();
    await page.touchscreen.tap(box.width / 2, box.height * 0.8);
    await page.touchscreen.tap(box.width / 2, box.height * 0.8);
    const landed = await page.evaluate(() => window.__landed);
    await page.waitForSelector(".splash-intro", { state: "detached", timeout: 5000 });

    const d = ["left", "top", "width", "height"].map((k) => Math.abs(landed.splash[k] - landed.target[k]));
    check(`${label} : arrivée exacte (≤ ${TOLERANCE} px)`, d.every((x) => x <= TOLERANCE),
      `écarts gauche/haut/largeur/hauteur = ${d.map((x) => x.toFixed(2)).join(" / ")} px`);

    const after = await page.evaluate(() => {
      const t = document.getElementById("img-titre");
      const r = t.getBoundingClientRect();
      return {
        phases: window.__phases,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        visible: getComputedStyle(t).visibility,
        focused: document.activeElement === t,
        locked: document.documentElement.classList.contains("splash-active"),
      };
    });
    const expected = reduced ? ["flight", "done"] : ["stop", "spin", "back", "flight", "done"];
    check(`${label} : séquence des phases`, JSON.stringify(after.phases) === JSON.stringify(expected), after.phases.join(" → "));
    const jump = ["left", "top", "width", "height"].map((k) => Math.abs(after.rect[k] - landed.target[k]));
    check(`${label} : aucun saut à l'échange, vrai titre visible et focalisé`,
      jump.every((x) => x < 0.01) && after.visible === "visible" && after.focused && !after.locked);

    if (!reduced && scenario === SCENARIOS[0]) {
      // « Accueil » ne réaffiche jamais le Splash ; retour non plus.
      await page.click('.nav-item[data-view="settings"]');
      await page.click('.nav-item[data-view="main"]');
      await page.waitForTimeout(300);
      check("« Accueil » : pas de Splash", (await page.locator(".splash-intro").count()) === 0);
      await page.goBack();
      await page.goBack();
      await page.waitForTimeout(300);
      check("bouton retour : pas de Splash", (await page.locator(".splash-intro").count()) === 0);

      const deep = await context.newPage();
      await deep.goto(`${BASE}/index.html#/main`);
      await deep.waitForSelector("#img-titre");
      await deep.waitForTimeout(300);
      check("rechargement sur #/main : pas de Splash", (await deep.locator(".splash-intro").count()) === 0);

      // Échap pendant la rotation : fin immédiate au bon endroit.
      const esc = await openSplash(context);
      await esc.click(".splash-intro");
      await esc.waitForSelector('.splash-intro[data-phase="spin"]');
      await esc.keyboard.press("Escape");
      await esc.waitForSelector(".splash-intro", { state: "detached", timeout: 2000 });
      check("Échap : fin immédiate", (await esc.evaluate(() => getComputedStyle(document.getElementById("img-titre")).visibility)) === "visible");
    }
    await context.close();
  }
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
process.exit(failed.length ? 1 : 0);
