/*
  swipeGesture.js
  Détection native (Pointer Events, sans bibliothèque) d'un swipe
  horizontal de DROITE vers GAUCHE.

  Pour éviter les déclenchements accidentels, le geste doit être :
  - suffisamment long   : déplacement horizontal >= minDistance (px) ;
  - clairement horizontal : |dx| >= horizontalRatio * |dy| ;
  - assez rapide        : durée <= maxDuration (ms) ;
  - dans le bon sens    : dx négatif (vers la gauche).
  Un tap/clic (déplacement quasi nul) ne déclenche donc jamais rien.
*/

export const SWIPE_DEFAULTS = Object.freeze({
  minDistance: 60,
  horizontalRatio: 2,
  maxDuration: 800,
});

/**
 * Décision pure à partir des coordonnées de début/fin du geste.
 * @returns {boolean} true si c'est un swipe droite -> gauche valide.
 */
export function isLeftSwipe(start, end, options = SWIPE_DEFAULTS) {
  const { minDistance, horizontalRatio, maxDuration } = { ...SWIPE_DEFAULTS, ...options };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const duration = end.time - start.time;
  return (
    dx <= -minDistance &&
    Math.abs(dx) >= horizontalRatio * Math.abs(dy) &&
    duration <= maxDuration
  );
}

/** Réglages de l'animation de la carte (légère : transform/opacity uniquement). */
export const SWIPE_ANIMATION = Object.freeze({
  outDuration: 220, // sortie de la carte après un swipe valide (ms)
  backDuration: 200, // retour à la position initiale (ms)
  rotationPerPx: 0.05, // degrés de rotation par pixel de déplacement
  maxRotation: 12, // degrés
  dragStart: 8, // px avant de considérer que le doigt glisse
});

/**
 * Écoute les swipes droite -> gauche sur `element`, avec retour visuel :
 * - pendant le geste, l'élément suit horizontalement le doigt, avec une
 *   légère rotation proportionnelle au déplacement ;
 * - geste valide (mêmes seuils que `isLeftSwipe`) : l'élément termine
 *   sa sortie vers la gauche, PUIS `onSwipeLeft()` est appelé ; l'élément
 *   est replacé une fois la promesse éventuelle de `onSwipeLeft` résolue ;
 * - geste insuffisant / annulé : retour animé à la position initiale,
 *   `onSwipeLeft` n'est jamais appelé.
 * Un geste d'abord vertical est abandonné (défilement, `touch-action: pan-y`).
 *
 * @param {HTMLElement} element
 * @param {() => (void|Promise<unknown>)} onSwipeLeft
 * @param {object} [options] - seuils (voir SWIPE_DEFAULTS) +
 *   `onCommit()` appelé dès qu'un swipe valide est reconnu (avant l'animation).
 * @returns {() => void} fonction de désinscription.
 */
export function attachLeftSwipe(element, onSwipeLeft, options = {}) {
  let start = null;
  let dragging = false;
  let animating = false;

  function setTransform(dx, withTransition, duration = 0, opacity = "") {
    element.style.transition = withTransition
      ? `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`
      : "none";
    if (dx === 0 && !withTransition) {
      element.style.transform = "";
    } else {
      const rotation = Math.max(
        -SWIPE_ANIMATION.maxRotation,
        Math.min(SWIPE_ANIMATION.maxRotation, dx * SWIPE_ANIMATION.rotationPerPx)
      );
      element.style.transform = `translateX(${dx}px) rotate(${rotation}deg)`;
    }
    element.style.opacity = opacity;
  }

  /** Attend la fin d'une transition (repli par minuterie : jsdom, onglet masqué…). */
  function afterTransition(duration) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        element.removeEventListener("transitionend", onEnd);
        resolve();
      };
      const onEnd = (event) => {
        if (event.target === element) finish();
      };
      element.addEventListener("transitionend", onEnd);
      setTimeout(finish, duration + 50);
    });
  }

  function resetInstantly() {
    element.style.transition = "none";
    element.style.transform = "";
    element.style.opacity = "";
    element.classList.remove("is-dragging");
  }

  async function animateBack() {
    animating = true;
    element.classList.remove("is-dragging");
    setTransform(0, true, SWIPE_ANIMATION.backDuration);
    await afterTransition(SWIPE_ANIMATION.backDuration);
    resetInstantly();
    animating = false;
  }

  async function animateOutThenAdvance() {
    animating = true;
    options.onCommit?.();
    element.classList.remove("is-dragging");
    const distance = -(element.offsetWidth || 320) * 1.3;
    setTransform(distance, true, SWIPE_ANIMATION.outDuration, "0");
    await afterTransition(SWIPE_ANIMATION.outDuration);
    try {
      await onSwipeLeft();
    } finally {
      resetInstantly();
      animating = false;
    }
  }

  function onPointerDown(event) {
    if (animating) return;
    if (event.isPrimary === false) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    start = { id: event.pointerId, x: event.clientX, y: event.clientY, time: Date.now() };
    dragging = false;
  }

  function onPointerMove(event) {
    if (!start || event.pointerId !== start.id) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (!dragging) {
      if (Math.abs(dx) < SWIPE_ANIMATION.dragStart && Math.abs(dy) < SWIPE_ANIMATION.dragStart) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        start = null; // geste vertical : on laisse défiler la page
        return;
      }
      dragging = true;
      element.classList.add("is-dragging");
      try {
        element.setPointerCapture?.(event.pointerId);
      } catch {
        /* capture facultative */
      }
    }
    setTransform(dx, false);
  }

  function onPointerUp(event) {
    if (!start || event.pointerId !== start.id) return;
    const end = { x: event.clientX, y: event.clientY, time: Date.now() };
    const begin = start;
    start = null;
    const wasDragging = dragging;
    dragging = false;

    if (isLeftSwipe(begin, end, options)) {
      animateOutThenAdvance();
    } else if (wasDragging) {
      animateBack();
    }
  }

  function onPointerCancel() {
    const wasDragging = dragging;
    start = null;
    dragging = false;
    if (wasDragging) animateBack();
  }

  element.addEventListener("pointerdown", onPointerDown);
  element.addEventListener("pointermove", onPointerMove);
  element.addEventListener("pointerup", onPointerUp);
  element.addEventListener("pointercancel", onPointerCancel);

  return () => {
    element.removeEventListener("pointerdown", onPointerDown);
    element.removeEventListener("pointermove", onPointerMove);
    element.removeEventListener("pointerup", onPointerUp);
    element.removeEventListener("pointercancel", onPointerCancel);
  };
}
