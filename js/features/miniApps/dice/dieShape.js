/*
  dieShape.js
  Rendu SVG d'un dé : d6 avec des points, autres dés en forme simple
  avec le chiffre au centre. Couleurs en CSS (variables de themes.css).
*/

const SVG_NS = "http://www.w3.org/2000/svg";

/** Positions des points du d6 (grille 25 / 50 / 75). */
const PIPS = {
  1: [[50, 50]],
  2: [[27, 27], [73, 73]],
  3: [[27, 27], [50, 50], [73, 73]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]],
  6: [[27, 25], [73, 25], [27, 50], [73, 50], [27, 75], [73, 75]],
};

function regularPolygon(sides, radius, cx = 50, cy = 50, rotation = -90) {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((rotation + (360 / sides) * i) * Math.PI) / 180;
    return `${(cx + radius * Math.cos(a)).toFixed(1)},${(cy + radius * Math.sin(a)).toFixed(1)}`;
  }).join(" ");
}

/** Forme du dé selon le nombre de faces : [élément, attributs, y du chiffre]. */
function bodyFor(faces) {
  switch (faces) {
    case 4: return ["polygon", { points: "50,6 95,88 5,88" }, 64];
    case 8: return ["polygon", { points: "50,4 96,50 50,96 4,50" }, 50];
    case 10: return ["polygon", { points: "50,4 95,42 50,96 5,42" }, 46];
    case 12: return ["polygon", { points: regularPolygon(5, 47, 50, 53) }, 55];
    case 20: return ["polygon", { points: regularPolygon(6, 47, 50, 50, -90) }, 50];
    default: return ["circle", { cx: 50, cy: 50, r: 46 }, 50];
  }
}

function svgEl(name, attrs) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Contenu SVG d'un dé (remplace le précédent). */
export function drawDie(svg, value, faces) {
  svg.replaceChildren();
  if (faces === 6) {
    svg.append(svgEl("rect", { class: "die__body", x: 6, y: 6, width: 88, height: 88, rx: 18 }));
    for (const [cx, cy] of PIPS[value] ?? []) svg.append(svgEl("circle", { class: "die__pip", cx, cy, r: 8 }));
    return;
  }
  const [shape, attrs, textY] = bodyFor(faces);
  svg.append(svgEl(shape, { class: "die__body", ...attrs }));
  const text = svgEl("text", {
    class: "die__value",
    x: 50,
    y: textY,
    "text-anchor": "middle",
    "dominant-baseline": "central",
    "font-size": value >= 100 ? 28 : 34,
  });
  text.textContent = String(value);
  svg.append(text);
}

/** Élément « dé » accessible (image avec texte alternatif). */
export function createDie(value, faces) {
  const die = document.createElement("span");
  die.className = "die";
  die.setAttribute("role", "img");
  const svg = svgEl("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" });
  die.append(svg);
  setDieValue(die, value, faces);
  return die;
}

/** Change la valeur affichée (et le texte alternatif). */
export function setDieValue(die, value, faces) {
  drawDie(die.firstElementChild, value, faces);
  die.dataset.value = String(value);
  die.setAttribute("aria-label", `Dé à ${faces} faces : ${value}`);
}
