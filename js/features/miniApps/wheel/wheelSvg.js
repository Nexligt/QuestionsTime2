/*
  wheelSvg.js
  Dessin SVG de la roue : parts égales, couleurs alternées (variables de
  themes.css via des classes), texte lisible coupé avec « … ».
*/

const SVG_NS = "http://www.w3.org/2000/svg";
const RADIUS = 96;

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Point du cercle, angle mesuré dans le sens horaire depuis le haut. */
function point(angle, r = RADIUS) {
  const a = (angle * Math.PI) / 180;
  return [(r * Math.sin(a)).toFixed(2), (-r * Math.cos(a)).toFixed(2)];
}

/** Couleur de la part i : 2 couleurs alternées, une 3e pour la dernière si n est impair. */
export function sliceTone(i, count) {
  if (count % 2 === 1 && count > 1 && i === count - 1) return "c";
  return i % 2 === 0 ? "a" : "b";
}

/** Texte coupé avec « … » selon la place disponible. */
export function fitLabel(text, maxChars) {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}

function fontSizeFor(count) {
  if (count <= 6) return 13;
  if (count <= 12) return 11;
  return 9;
}

/** Roue complète (SVG) pour la liste d'entrées donnée. */
export function drawWheel(entries) {
  const count = entries.length;
  const svg = el("svg", { viewBox: "-100 -100 200 200", class: "wheel", "aria-hidden": "true", focusable: "false" });
  const segment = 360 / count;
  const fontSize = fontSizeFor(count);
  const maxChars = Math.floor(66 / (fontSize * 0.56));
  entries.forEach((entry, i) => {
    const tone = sliceTone(i, count);
    const group = el("g", { class: `wheel__slice wheel__slice--${tone}`, "data-index": i });
    if (count === 1) {
      group.append(el("circle", { class: "wheel__part", r: RADIUS }));
    } else {
      const [x0, y0] = point(i * segment);
      const [x1, y1] = point((i + 1) * segment);
      group.append(el("path", {
        class: "wheel__part",
        d: `M0 0 L${x0} ${y0} A${RADIUS} ${RADIUS} 0 ${segment > 180 ? 1 : 0} 1 ${x1} ${y1} Z`,
      }));
    }
    const mid = (i + 0.5) * segment;
    const label = el("text", {
      class: "wheel__label",
      x: 88,
      y: 0,
      "text-anchor": "end",
      "dominant-baseline": "central",
      "font-size": fontSize,
      transform: `rotate(${(mid - 90).toFixed(2)})`,
    });
    label.textContent = fitLabel(entry, maxChars);
    group.append(label);
    svg.append(group);
  });
  svg.append(el("circle", { class: "wheel__hub", r: 10 }));
  return svg;
}
