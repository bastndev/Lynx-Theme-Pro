import type { TransparencyEffects } from './index.mjs';

/**
 * Método "overwrite": intercepta window.setBackgroundColor() para que siempre
 * devuelva #00000000, ignorando cualquier color que VSCode intente aplicar.
 * Útil cuando config.preventFlash = true.
 */
export default (window: Electron.BrowserWindow): TransparencyEffects => {
  let overwritten: Electron.BrowserWindow['setBackgroundColor'] | undefined;

  return {
    install() {
      if (overwritten) { return; }
      overwritten = window.setBackgroundColor;
      const original = window.setBackgroundColor.bind(window);
      window.setBackgroundColor = (_bg: string) => original('#00000000');
    },
    uninstall() {
      if (overwritten) {
        window.setBackgroundColor = overwritten;
        overwritten = undefined;
      }
    },
  };
};
