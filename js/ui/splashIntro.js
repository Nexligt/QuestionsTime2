/*
  splashIntro.js
  Écran de lancement (Splash) animé — cahier des charges §14.

  Principe : le Splash n'est PAS une route. Au lancement, la page
  principale (Main) est déjà rendue dessous ; le Splash est une couche
  plein écran posée par-dessus. Le grand titre du Splash flotte, puis au
  toucher : arrêt -> rotation 720° + enfoncement -> retour -> envol jusqu'à
  la position et la taille EXACTES du titre de Main (technique FLIP :
  mesure avec getBoundingClientRect juste avant l'envol, animation Web
  Animations API), puis échange invisible avec le vrai titre et retrait
  de la couche. Le titre ne disparaît jamais.

  Titre : le contenu du titre du Splash est un CLONE du titre de Main
  (#img-titre). Texte aujourd'hui ; une future image img_Titre (SVG de
  préférence, placée dans le titre de Main) sera reprise telle quelle,
  sans changer cette logique (on attend simplement son décodage).

  Performance : seules les propriétés translate / rotate / scale / opacity
  sont animées. L'ombre et l'assombrissement sont des calques séparés
  dont seule l'opacité varie (jamais box-shadow ni filter animés).
*/

/* ------------------------------------------------------------------ */
/* Réglages (toutes les durées et amplitudes sont ici)                */
/* ------------------------------------------------------------------ */

/** Durées en millisecondes. */
export const SPLASH_TIMINGS = Object.freeze({
  appear: 400, // phase 0 : apparition du titre
  floatCycle: 3200, // phase 1 : cycle de flottement (aller-retour)
  stop: 150, // phase 2 : arrêt du flottement au toucher
  spin: 900, // phase 3 : rotation 720° + enfoncement
  back: 250, // phase 4 : retour à la taille normale
  flight: 650, // phase 5 : envol vers le titre de Main
  reducedFlight: 300, // mouvement réduit : envol direct, sobre
  hintFade: 150, // disparition de l'indication « Toucher l'écran »
  readyTimeout: 1500, // attente maximale police / image avant d'afficher
});

/** Amplitudes des mouvements. */
export const SPLASH_MOTION = Object.freeze({
  floatY: 6, // px, montée/descente
  floatScaleMin: 0.98,
  floatScaleMax: 1.03,
  floatTilt: 2, // degrés, balancement
  spinDegrees: 720,
  pressScale: 0.86, // enfoncement
  backOvershoot: 1.04,
  shadeOpacity: 0.35, // assombrissement maximal (calque)
  shadowRest: 0.5, // ombre au repos (calque)
  shadowPressed: 0.15, // ombre quand le titre est enfoncé dans la page
});

/** Courbes d'accélération. */
export const SPLASH_EASINGS = Object.freeze({
  appear: "ease-out",
  float: "ease-in-out",
  stop: "ease-out",
  spin: "cubic-bezier(0.45, 0, 0.25, 1)",
  back: "cubic-bezier(0.2, 0.9, 0.3, 1.2)",
  flight: "cubic-bezier(0.2, 0.8, 0.2, 1)",
});

/* ------------------------------------------------------------------ */
/* Fonctions pures                                                    */
/* ------------------------------------------------------------------ */

/**
 * Transformation FLIP : déplacement (entre les centres) et facteur de
 * taille pour amener la boîte `from` exactement sur la boîte `to`, avec
 * une origine de transformation au centre.
 * @param {{left:number, top:number, width:number, height:number}} from
 * @param {{left:number, top:number, width:number, height:number}} to
 * @returns {{dx:number, dy:number, scale:number}}
 */
export function computeFlipTransform(from, to) {
  const fromCx = from.left + from.width / 2;
  const fromCy = from.top + from.height / 2;
  const toCx = to.left + to.width / 2;
  const toCy = to.top + to.height / 2;
  const scale = from.width > 0 ? to.width / from.width : 1;
  return { dx: toCx - fromCx, dy: toCy - fromCy, scale };
}

/**
 * Séquence des phases déclenchées par le toucher.
 * @param {{reducedMotion?: boolean}} [options]
 * @returns {Array<{name: "stop"|"spin"|"back"|"flight", duration: number}>}
 */
export function buildSplashTimeline({ reducedMotion = false } = {}) {
  if (reducedMotion) return [{ name: "flight", duration: SPLASH_TIMINGS.reducedFlight }];
  return [
    { name: "stop", duration: SPLASH_TIMINGS.stop },
    { name: "spin", duration: SPLASH_TIMINGS.spin },
    { name: "back", duration: SPLASH_TIMINGS.back },
    { name: "flight", duration: SPLASH_TIMINGS.flight },
  ];
}

/** Vrai si l'utilisateur demande de réduire les animations. */
export function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Contrôleur                                                         */
/* ------------------------------------------------------------------ */

const LOCK_CLASS = "splash-active";

/** Animation par défaut : Web Animations API. */
function defaultAnimate(element, keyframes, options) {
  return element.animate(keyframes, options);
}

/** Attend que le titre soit prêt (image décodée ou police chargée), avec délai maximal. */
function waitForTitleReady(title, timeout) {
  const images = [...title.querySelectorAll("img")];
  const ready = images.length
    ? Promise.all(images.map((img) => (img.decode ? img.decode().catch(() => {}) : undefined)))
    : Promise.resolve(document.fonts?.ready).catch(() => {});
  return Promise.race([ready, new Promise((resolve) => setTimeout(resolve, timeout))]);
}

/**
 * Affiche le Splash par-dessus la page et gère toute la séquence.
 *
 * @param {object} [options]
 * @param {() => HTMLElement|null} [options.getTarget] - titre de Main (cible).
 * @param {(el:Element, keyframes:object[], options:object) => {finished:Promise, cancel:Function}} [options.animate]
 * @param {boolean} [options.reducedMotion]
 * @param {HTMLElement} [options.container] - où insérer la couche (body).
 * @returns {{ overlay: HTMLElement, trigger: () => void, skip: () => void, done: Promise<void> }}
 */
export function startSplashIntro({
  getTarget = () => document.getElementById("img-titre"),
  animate = defaultAnimate,
  reducedMotion = prefersReducedMotion(),
  container = document.body,
} = {}) {
  const target = getTarget();
  const view = container.ownerDocument.defaultView ?? window;

  // --- Construction de la couche ------------------------------------
  const overlay = document.createElement("div");
  overlay.className = "splash-intro";
  overlay.setAttribute("role", "button");
  overlay.setAttribute("tabindex", "0");
  overlay.setAttribute("aria-label", "Toucher l'écran pour entrer dans l'application");
  overlay.dataset.phase = "appear";

  const backdrop = document.createElement("div");
  backdrop.className = "splash-intro__backdrop";

  const stage = document.createElement("div");
  stage.className = "splash-intro__stage";

  // Calque animé (translate / rotate / scale) contenant le titre.
  const mover = document.createElement("div");
  mover.className = "splash-intro__title";

  const shadow = document.createElement("div");
  shadow.className = "splash-intro__shadow";
  shadow.setAttribute("aria-hidden", "true");

  const title = document.createElement("h1");
  title.id = "img-titre-splash";
  title.className = "splash__title";
  fillTitle(title, target);

  // Assombrissement : copie exacte du titre, teintée, dont seule l'opacité varie.
  const shade = title.cloneNode(true);
  shade.removeAttribute("id");
  shade.className = "splash__title splash-intro__shade";
  shade.setAttribute("aria-hidden", "true");

  mover.append(shadow, title, shade);

  const hint = document.createElement("p");
  hint.className = "splash__hint";
  hint.textContent = "Toucher l'écran pour commencer";

  stage.append(mover, hint);
  overlay.append(backdrop, stage);

  // --- État -----------------------------------------------------------
  let state = "idle"; // idle -> running -> done
  let currentPhase = null;
  let floatAnimations = [];
  const running = new Set();
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  function setPhase(name) {
    currentPhase = name;
    overlay.dataset.phase = name;
  }

  function play(element, keyframes, options) {
    const animation = animate(element, keyframes, { fill: "forwards", ...options });
    running.add(animation);
    const finished = Promise.resolve(animation?.finished).catch(() => {});
    finished.then(() => running.delete(animation));
    return finished;
  }

  function cancelAll() {
    for (const animation of [...running, ...floatAnimations]) {
      try {
        animation.cancel?.();
      } catch {
        /* animation déjà terminée */
      }
    }
    running.clear();
    floatAnimations = [];
  }

  // --- Fin : échange invisible avec le vrai titre ----------------------
  function finish() {
    if (state === "done") return;
    state = "done";
    setPhase("done");
    const landedTarget = getTarget();
    // Instrumentation (tests d'alignement) : positions finales mesurées
    // juste avant l'échange. CustomEvent de la fenêtre de la page.
    const EventCtor = overlay.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
    overlay.dispatchEvent(
      new EventCtor("splash-intro:landed", {
        bubbles: true,
        detail: {
          splash: title.getBoundingClientRect(),
          target: landedTarget ? landedTarget.getBoundingClientRect() : null,
        },
      })
    );
    // Même image affichée : le vrai titre apparaît, la couche disparaît.
    if (landedTarget) landedTarget.style.visibility = "";
    cancelAll();
    overlay.remove();
    document.documentElement.classList.remove(LOCK_CLASS);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onDocumentKeydown);
    if (landedTarget) {
      if (!landedTarget.hasAttribute("tabindex")) landedTarget.setAttribute("tabindex", "-1");
      landedTarget.focus?.({ preventScroll: true });
    }
    resolveDone();
  }

  // --- Phases ------------------------------------------------------------
  const phases = {
    async stop(duration) {
      // Arrêt du flottement à partir de la pose actuelle, sans à-coup.
      const from = currentPose();
      for (const animation of floatAnimations) animation.cancel?.();
      floatAnimations = [];
      await play(
        mover,
        [from, { translate: "0px 0px", rotate: "0deg", scale: "1" }],
        { duration, easing: SPLASH_EASINGS.stop }
      );
    },
    async spin(duration) {
      await Promise.all([
        play(
          mover,
          [
            { translate: "0px 0px", rotate: "0deg", scale: "1" },
            { translate: "0px 0px", rotate: `${SPLASH_MOTION.spinDegrees}deg`, scale: String(SPLASH_MOTION.pressScale) },
          ],
          { duration, easing: SPLASH_EASINGS.spin }
        ),
        play(shade, [{ opacity: 0 }, { opacity: SPLASH_MOTION.shadeOpacity }], { duration, easing: SPLASH_EASINGS.spin }),
        play(shadow, [{ opacity: SPLASH_MOTION.shadowRest }, { opacity: SPLASH_MOTION.shadowPressed }], { duration, easing: SPLASH_EASINGS.spin }),
      ]);
    },
    async back(duration) {
      const rotate = `${SPLASH_MOTION.spinDegrees}deg`;
      await Promise.all([
        play(
          mover,
          [
            { translate: "0px 0px", rotate, scale: String(SPLASH_MOTION.pressScale) },
            { translate: "0px 0px", rotate, scale: String(SPLASH_MOTION.backOvershoot), offset: 0.7 },
            { translate: "0px 0px", rotate, scale: "1" },
          ],
          { duration, easing: SPLASH_EASINGS.back }
        ),
        play(shade, [{ opacity: SPLASH_MOTION.shadeOpacity }, { opacity: 0 }], { duration }),
        play(shadow, [{ opacity: SPLASH_MOTION.shadowPressed }, { opacity: SPLASH_MOTION.shadowRest }], { duration }),
      ]);
    },
    async flight(duration) {
      const destination = getTarget();
      if (!destination) return; // aucune cible : fin directe
      // Mesure au dernier moment (rotation d'écran, barre d'adresse...).
      const { dx, dy, scale } = computeFlipTransform(
        title.getBoundingClientRect(),
        destination.getBoundingClientRect()
      );
      const rotate = reducedMotion ? "0deg" : `${SPLASH_MOTION.spinDegrees}deg`;
      await Promise.all([
        play(
          mover,
          [
            { translate: "0px 0px", rotate, scale: "1" },
            { translate: `${dx}px ${dy}px`, rotate, scale: String(scale) },
          ],
          { duration, easing: SPLASH_EASINGS.flight }
        ),
        play(shadow, [{ opacity: currentOpacity(shadow, SPLASH_MOTION.shadowRest) }, { opacity: 0 }], { duration: duration * 0.5 }),
        play(backdrop, [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration, easing: "ease-in" }),
      ]);
    },
  };

  function currentPose() {
    const style = view.getComputedStyle(mover);
    return {
      translate: style.translate && style.translate !== "none" ? style.translate : "0px 0px",
      rotate: style.rotate && style.rotate !== "none" ? style.rotate : "0deg",
      scale: style.scale && style.scale !== "none" ? style.scale : "1",
    };
  }

  function currentOpacity(element, fallback) {
    const value = Number.parseFloat(view.getComputedStyle(element).opacity);
    return Number.isFinite(value) ? value : fallback;
  }

  async function runSequence() {
    try {
      play(hint, [{ opacity: 1 }, { opacity: 0 }], { duration: SPLASH_TIMINGS.hintFade });
      for (const phase of buildSplashTimeline({ reducedMotion })) {
        if (state !== "running") return; // Échap / redimensionnement : déjà terminé
        setPhase(phase.name);
        await phases[phase.name](phase.duration);
      }
    } catch (error) {
      console.warn("[splashIntro] Animation interrompue, affichage direct :", error);
    }
    finish();
  }

  // --- Déclencheurs --------------------------------------------------------
  function trigger() {
    if (state !== "idle") return; // double toucher ignoré
    state = "running";
    overlay.setAttribute("aria-busy", "true");
    runSequence();
  }

  function skip() {
    finish();
  }

  function onResize() {
    // Pendant l'envol, la cible mesurée n'est plus valable : fin immédiate.
    if (state === "running" && currentPhase === "flight") finish();
  }

  function onDocumentKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      skip();
    }
  }

  overlay.addEventListener("click", trigger);
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      trigger();
    }
  });
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onDocumentKeydown);

  // --- Mise en place -------------------------------------------------------
  if (target) target.style.visibility = "hidden"; // vrai titre caché pendant le Splash
  document.documentElement.classList.add(LOCK_CLASS); // défilement bloqué
  container.append(overlay);
  overlay.focus?.({ preventScroll: true });

  (async () => {
    await waitForTitleReady(title, SPLASH_TIMINGS.readyTimeout);
    if (state !== "idle") return;
    try {
      play(mover, [{ opacity: 0 }, { opacity: 1 }], { duration: SPLASH_TIMINGS.appear, easing: SPLASH_EASINGS.appear });
      if (!reducedMotion) startFloating();
      if (state === "idle") setPhase("float");
    } catch (error) {
      // Animations indisponibles : Splash statique, toucher = entrée directe.
      console.warn("[splashIntro] Animations indisponibles :", error);
      if (state === "idle") setPhase("static");
    }
  })();

  function startFloating() {
    const { floatY, floatScaleMin, floatScaleMax, floatTilt } = SPLASH_MOTION;
    const common = { iterations: Infinity, direction: "alternate", easing: SPLASH_EASINGS.float, fill: "none" };
    // Trois rythmes légèrement décalés pour un mouvement naturel.
    floatAnimations = [
      animate(mover, [{ translate: `0px ${floatY}px` }, { translate: `0px ${-floatY}px` }], { ...common, duration: SPLASH_TIMINGS.floatCycle / 2 }),
      animate(mover, [{ scale: String(floatScaleMin) }, { scale: String(floatScaleMax) }], { ...common, duration: (SPLASH_TIMINGS.floatCycle * 1.3) / 2 }),
      animate(mover, [{ rotate: `${-floatTilt}deg` }, { rotate: `${floatTilt}deg` }], { ...common, duration: (SPLASH_TIMINGS.floatCycle * 1.7) / 2 }),
    ];
  }

  return { overlay, trigger, skip, done };
}

/** Copie le contenu du titre de Main (texte ou future image img_Titre). */
function fillTitle(title, target) {
  if (target && target.childNodes.length) {
    for (const node of target.childNodes) title.append(node.cloneNode(true));
  } else {
    title.textContent = "QuestionsTime2";
  }
}
