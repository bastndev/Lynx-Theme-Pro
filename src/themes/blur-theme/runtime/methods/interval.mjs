/**
 * runtime/methods/interval.mjs — Método "interval" para mantener transparencia
 *
 * VSCode internamente llama a window.setBackgroundColor() periódicamente
 * para restaurar su color de fondo. Este método lo contrarresta con un
 * setInterval que re-aplica #00000000 cada N ms.
 *
 * Referencia original en vibrancy-code:
 * https://github.com/microsoft/vscode/blob/9f8431f7fccf7a048531043eb6b6d24819482781/src/vs/platform/theme/electron-main/themeMainService.ts#L80
 *
 * @param {Electron.BrowserWindow} window
 * @returns {{ install: () => void, uninstall: () => void }}
 *
 * TODO (Fase 2): Activar con refreshInterval configurable
 */

const app = global.lynx_blur_plugin;

export default (window) => {
  let backgroundColorTimer;

  return {
    install() {
      clearInterval(backgroundColorTimer);
      backgroundColorTimer = setInterval(() => {
        window.setBackgroundColor('#00000000');
      }, app?.config?.refreshInterval ?? 1000);
    },
    uninstall() {
      clearInterval(backgroundColorTimer);
    },
  };
};
