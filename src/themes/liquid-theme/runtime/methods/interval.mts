import type { TransparencyEffects } from './index.mjs';

const app = global.lynx_liquid_plugin;

/**
 * Método "interval": contrarresta el setBackgroundColor() periódico de VSCode
 * con un setInterval que re-aplica #00000000 cada N ms.
 * Referencia: https://github.com/microsoft/vscode/blob/9f8431f7/src/vs/platform/theme/electron-main/themeMainService.ts#L80
 */
export default (window: Electron.BrowserWindow): TransparencyEffects => {
  let backgroundColorTimer: NodeJS.Timeout | undefined;

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
