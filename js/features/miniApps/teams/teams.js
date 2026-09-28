/*
  teams.js
  Mini-application « Équipes » : logique pure (répartition équilibrée,
  réglages) et mémorisation dans le store `settings` existant.
*/

import { getSetting, setSetting } from "../../../data/settingsRepository.js";
import { randomUnit } from "../dice/dice.js";

export const TEAMS_LIMITS = Object.freeze({
  minNames: 2,
  maxNames: 30,
  maxLength: 30,
  minTeams: 2,
  maxTeams: 6,
  minSize: 1,
});
export const TEAM_MODES = Object.freeze({ COUNT: "count", SIZE: "size" });
export const DEFAULT_TEAM_NAMES = Object.freeze(["Joueur 1", "Joueur 2", "Joueur 3", "Joueur 4"]);
export const TEAMS_SETTING_KEYS = Object.freeze({
  names: "teams.names",
  mode: "teams.mode",
  count: "teams.count",
  size: "teams.size",
});

/** Nom nettoyé : espaces superflus retirés, 30 caractères maximum. */
export function normalizeName(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim().slice(0, TEAMS_LIMITS.maxLength);
}

/** Liste valide : noms non vides, 30 au plus ; moins de 2 -> liste par défaut. */
export function normalizeNames(list) {
  const names = (Array.isArray(list) ? list : []).map(normalizeName).filter(Boolean).slice(0, TEAMS_LIMITS.maxNames);
  return names.length >= TEAMS_LIMITS.minNames ? names : [...DEFAULT_TEAM_NAMES];
}

function toInteger(value, fallback) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return Number.isInteger(n) ? n : fallback;
}

/** Nombre d'équipes ramené entre 2 et 6. */
export function clampTeamCount(value) {
  return Math.min(TEAMS_LIMITS.maxTeams, Math.max(TEAMS_LIMITS.minTeams, toInteger(value, TEAMS_LIMITS.minTeams)));
}

/** Joueurs par équipe : au moins 1, au plus 30. */
export function clampTeamSize(value) {
  return Math.min(TEAMS_LIMITS.maxNames, Math.max(TEAMS_LIMITS.minSize, toInteger(value, 2)));
}

/**
 * Nombre d'équipes pour `playerCount` joueurs, ou erreur si impossible.
 * - mode "count" : le nombre choisi ;
 * - mode "size"  : autant d'équipes qu'il en faut (écart d'un joueur au plus).
 * @returns {{ teams: number } | { error: string }}
 */
export function planTeams({ mode, count, size }, playerCount) {
  const teams = mode === TEAM_MODES.SIZE
    ? Math.ceil(playerCount / clampTeamSize(size))
    : clampTeamCount(count);
  if (teams > playerCount) {
    return { error: `Impossible : ${teams} équipes pour ${playerCount} joueurs. Il faut au moins un joueur par équipe.` };
  }
  if (teams < TEAMS_LIMITS.minTeams) {
    return { error: `Impossible : avec ${playerCount} joueurs et ${clampTeamSize(size)} par équipe, il n'y aurait qu'une équipe.` };
  }
  if (teams > TEAMS_LIMITS.maxTeams) {
    return { error: `Impossible : il faudrait ${teams} équipes (${TEAMS_LIMITS.maxTeams} au plus). Augmentez le nombre de joueurs par équipe.` };
  }
  return { teams };
}

/** Mélange (Fisher-Yates) sans modifier la liste d'origine. */
export function shuffle(list, random = randomUnit) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Répartition aléatoire et équilibrée : chaque joueur une seule fois, écart d'un joueur au plus. */
export function formTeams(names, teamCount, random = randomUnit) {
  const teams = Array.from({ length: teamCount }, () => []);
  shuffle(names, random).forEach((name, i) => teams[i % teamCount].push(name));
  return teams;
}

export async function loadTeamsSettings() {
  const [names, mode, count, size] = await Promise.all([
    getSetting(TEAMS_SETTING_KEYS.names, null),
    getSetting(TEAMS_SETTING_KEYS.mode, TEAM_MODES.COUNT),
    getSetting(TEAMS_SETTING_KEYS.count, 2),
    getSetting(TEAMS_SETTING_KEYS.size, 2),
  ]);
  return {
    names: normalizeNames(names ?? DEFAULT_TEAM_NAMES),
    mode: mode === TEAM_MODES.SIZE ? TEAM_MODES.SIZE : TEAM_MODES.COUNT,
    count: clampTeamCount(count),
    size: clampTeamSize(size),
  };
}

export const saveTeamNames = (names) => setSetting(TEAMS_SETTING_KEYS.names, normalizeNames(names));
export const saveTeamMode = (mode) => setSetting(TEAMS_SETTING_KEYS.mode, mode === TEAM_MODES.SIZE ? TEAM_MODES.SIZE : TEAM_MODES.COUNT);
export const saveTeamCount = (count) => setSetting(TEAMS_SETTING_KEYS.count, clampTeamCount(count));
export const saveTeamSize = (size) => setSetting(TEAMS_SETTING_KEYS.size, clampTeamSize(size));
