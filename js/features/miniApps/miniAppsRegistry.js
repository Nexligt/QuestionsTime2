/*
  miniAppsRegistry.js
  Liste des mini-applications de l'onglet « Mini-apps » des Paramètres.

  Ajouter une mini-application : créer son module (dossier à son nom) qui
  exporte une fonction `build(labelledBy)` renvoyant un élément, puis
  l'ajouter ci-dessous avec son logo (SVG 24×24, contour, trait 1,8, en
  currentColor). Le menu de l'onglet (miniAppsMenu.js) affiche une tuile
  par entrée et ouvre l'application à l'adresse #/settings/miniapps/<id> :
  aucune autre modification n'est nécessaire.
*/

import { buildDiceApp } from "./dice/diceView.js";
import { buildWheelApp } from "./wheel/wheelView.js";
import { buildCoinApp } from "./coin/coinView.js";
import { buildTeamsApp } from "./teams/teamsView.js";
import { buildTimerApp } from "./timer/timerView.js";
import { buildChooserApp } from "./chooser/chooserView.js";

const ICON_ATTRS = 'viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"';

/** Logos du menu (même style que la barre du bas). */
const ICONS = {
  dice: `<svg ${ICON_ATTRS}><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none"/></svg>`,
  chooser: `<svg ${ICON_ATTRS}><circle cx="12" cy="7.5" r="3"/><circle cx="12" cy="7.5" r="5.5" stroke-dasharray="2 2.3"/><circle cx="5.5" cy="17" r="3"/><circle cx="18.5" cy="17" r="3"/></svg>`,
  timer: `<svg ${ICON_ATTRS}><path d="M6 3h12M6 21h12"/><path d="M7 3c0 4.5 4 6 4.6 9-.6 3-4.6 4.5-4.6 9M17 3c0 4.5-4 6-4.6 9 .6 3 4.6 4.5 4.6 9"/><path d="M9.5 18.5h5"/></svg>`,
  teams: `<svg ${ICON_ATTRS}><circle cx="9" cy="8" r="3"/><path d="M3.5 19.5c0-3.2 2.5-5.5 5.5-5.5s5.5 2.3 5.5 5.5"/><circle cx="16.5" cy="9" r="2.4"/><path d="M15.8 14.1c.3 0 .5-.1.7-.1 2.4 0 4.3 1.9 4.3 4.6"/></svg>`,
  coin: `<svg ${ICON_ATTRS}><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.6"/><path d="M12 9.6v4.8M10.2 11.2h3.6"/></svg>`,
  wheel: `<svg ${ICON_ATTRS}><circle cx="12" cy="13" r="8.2"/><circle cx="12" cy="13" r="1.4"/><path d="M12 4.8v6.8M12 14.4v6.8M3.8 13h6.8M13.4 13h6.8"/><path d="M10.2 1.8h3.6L12 4.6z"/></svg>`,
};

/** @type {ReadonlyArray<{ id: string, title: string, icon: string, build: (labelledBy: string) => HTMLElement }>} */
export const MINI_APPS = Object.freeze([
  { id: "dice", title: "Dés", icon: ICONS.dice, build: buildDiceApp },
  { id: "wheel", title: "Roue", icon: ICONS.wheel, build: buildWheelApp },
  { id: "coin", title: "Pile ou face", icon: ICONS.coin, build: buildCoinApp },
  { id: "teams", title: "Équipes", icon: ICONS.teams, build: buildTeamsApp },
  { id: "timer", title: "Sablier", icon: ICONS.timer, build: (labelledBy) => buildTimerApp(labelledBy) },
  { id: "chooser", title: "Qui commence ?", icon: ICONS.chooser, build: (labelledBy) => buildChooserApp(labelledBy) },
]);
