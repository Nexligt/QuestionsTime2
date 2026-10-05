/*
  chooser.js
  Mini-application « Qui commence ? » (principe « Chwazi ») : réglages et
  tirage du doigt gagnant (logique pure).
*/

import { randomUnit } from "../dice/dice.js";
import { getSetting, setSetting } from "../../../data/settingsRepository.js";
import { formTeams } from "../teams/teams.js";

export const CHOOSER = Object.freeze({
  waitMs: 3000, // nombre de doigts stable pendant 3 s -> tirage
  minFingers: 2,
  colors: 6, // .chooser__circle--0 … --5 (themes.css), puis réutilisées
});

/** Doigt gagnant parmi les identifiants posés. */
export function pickWinner(ids, random = randomUnit) {
  if (ids.length === 0) return null;
  return ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))];
}

/** Première couleur libre (sinon la moins utilisée). */
export function nextColor(usedColors) {
  const counts = Array.from({ length: CHOOSER.colors }, (_, i) => usedColors.filter((c) => c === i).length);
  const min = Math.min(...counts);
  return counts.indexOf(min);
}

/* ------------------------------------------------------------------
   Mode « Équipes » : les doigts posés sont répartis en équipes
   équilibrées (écart d'un joueur au plus), avec capitaine en option.
   ------------------------------------------------------------------ */

export const CHOOSER_MODES = Object.freeze({ SINGLE: "single", TEAMS: "teams" });
export const CHOOSER_TEAMS = Object.freeze({ min: 2, max: 6 });
export const CHOOSER_ROULETTE = Object.freeze({ duration: 800, step: 100 }); // défilement des couleurs
export const CHOOSER_KEYS = Object.freeze({ mode: "chooser.mode", teams: "chooser.teams", captain: "chooser.captain" });

export function clampChooserTeams(value) {
  const n = Number.isInteger(value) ? value : Number.parseInt(value, 10);
  return Number.isInteger(n) ? Math.min(CHOOSER_TEAMS.max, Math.max(CHOOSER_TEAMS.min, n)) : CHOOSER_TEAMS.min;
}

/** Doigts nécessaires : 2 pour un joueur ; au moins un par équipe sinon. */
export function minFingersFor(mode, teamCount) {
  return mode === CHOOSER_MODES.TEAMS ? Math.max(CHOOSER.minFingers, clampChooserTeams(teamCount)) : CHOOSER.minFingers;
}

/** Répartition des doigts : équipes (listes d'identifiants) et équipe de chaque doigt. */
export function assignFingerTeams(ids, teamCount, random = randomUnit) {
  const teams = formTeams(ids, clampChooserTeams(teamCount), random);
  const teamOf = new Map();
  teams.forEach((members, team) => members.forEach((id) => teamOf.set(id, team)));
  return { teams, teamOf };
}

/** Un capitaine tiré au hasard dans chaque équipe. */
export function pickCaptains(teams, random = randomUnit) {
  return teams.map((members) => pickWinner(members, random)).filter((id) => id !== null);
}

export async function loadChooserSettings() {
  const [mode, teams, captain] = await Promise.all([
    getSetting(CHOOSER_KEYS.mode, CHOOSER_MODES.SINGLE),
    getSetting(CHOOSER_KEYS.teams, CHOOSER_TEAMS.min),
    getSetting(CHOOSER_KEYS.captain, false),
  ]);
  return {
    mode: mode === CHOOSER_MODES.TEAMS ? CHOOSER_MODES.TEAMS : CHOOSER_MODES.SINGLE,
    teams: clampChooserTeams(teams),
    captain: captain === true,
  };
}

export const saveChooserMode = (mode) => setSetting(CHOOSER_KEYS.mode, mode === CHOOSER_MODES.TEAMS ? CHOOSER_MODES.TEAMS : CHOOSER_MODES.SINGLE);
export const saveChooserTeams = (teams) => setSetting(CHOOSER_KEYS.teams, clampChooserTeams(teams));
export const saveChooserCaptain = (enabled) => setSetting(CHOOSER_KEYS.captain, Boolean(enabled));
