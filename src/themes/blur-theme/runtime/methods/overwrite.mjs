/**
 * runtime/methods/overwrite.mjs — Método "overwrite" para mantener transparencia
 *
 * Alternativa al interval: en lugar de usar un timer, sobrescribe directamente
 * la función window.setBackgroundColor() para que SIEMPRE devuelva #00000000,
 * ignorando cualquier color que VSCode intente aplicar.
 *
 * Útil cuando config.preventFlash = true (evita el flash de color al enfocar/
 * desenfocar la ventana).
 *
 * @param {Electron.BrowserWindow} window
 * @returns {{ install: () => void, uninstall: () => void }}
 */
export default (window) => {
  let overwritten;

  return {
    install() {
      if (overwritten) return;
      overwritten = window.setBackgroundColor;
      const original = window.setBackgroundColor.bind(window);
      // Interceptamos cualquier llamada y forzamos siempre transparente
      window.setBackgroundColor = (_bg) => original('#00000000');
    },
    uninstall() {
      if (overwritten) {
        window.setBackgroundColor = overwritten;
        overwritten = undefined;
      }
    },
  };
};
