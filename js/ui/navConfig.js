/*
  navConfig.js
  Configuration déclarative du menu inférieur.
  Ajouter/retirer un bouton = ajouter/retirer une entrée ici,
  sans toucher à navBar.js ni au layout CSS.
*/

export const NAV_ITEMS = [
  {
    id: "home",
    label: "Accueil",
    icon: "assets/icons/nav-home.svg",
    view: "main", // toujours la page principale, jamais l'écran d'accueil (splash)
  },
  {
    id: "filters",
    label: "Filtres",
    icon: "assets/icons/nav-filters.svg",
    view: "filters",
  },
  {
    id: "deleted",
    label: "Supprimées",
    icon: "assets/icons/nav-deleted.svg",
    view: "deleted-questions",
  },
  {
    id: "settings",
    label: "Paramètres",
    icon: "assets/icons/nav-settings.svg",
    view: "settings",
  },
];
