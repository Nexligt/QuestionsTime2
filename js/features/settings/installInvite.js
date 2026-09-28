/*
  installInvite.js
  Paramètres > Infos : invitation discrète à installer l'application.
  - installation possible (Android/Chrome) : bouton « Installer l'application » ;
  - iPhone : courte explication (Partager → Sur l'écran d'accueil) ;
  - déjà installée, ou navigateur sans installation : rien.
*/

import { getInstallState, onInstallStateChange, promptInstall } from "../../core/pwa.js";

/**
 * @param {{ getState?: Function, prompt?: Function, subscribe?: Function }} [deps] - injectables (tests).
 * @returns {HTMLElement}
 */
export function buildInstallInvite({ getState = getInstallState, prompt = promptInstall, subscribe = onInstallStateChange } = {}) {
  const root = document.createElement("div");
  root.className = "settings-install";

  function render(state = getState()) {
    root.replaceChildren();
    root.dataset.state = state.installed ? "installed" : state.canPrompt ? "prompt" : state.ios ? "ios" : "none";
    root.hidden = root.dataset.state === "installed" || root.dataset.state === "none";
    if (state.canPrompt) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button button--secondary settings-install__button";
      button.textContent = "Installer l'application";
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await prompt();
        } finally {
          render();
        }
      });
      root.append(button);
    } else if (state.ios) {
      const text = document.createElement("p");
      text.className = "settings-install__hint";
      text.textContent = "Pour installer l'application : touchez Partager, puis « Sur l'écran d'accueil ».";
      root.append(text);
    }
  }

  render();
  const unsubscribe = subscribe((state) => {
    if (!root.isConnected && root.dataset.rendered === "true") {
      unsubscribe?.();
      return;
    }
    render(state);
  });
  root.dataset.rendered = "true";
  return root;
}
