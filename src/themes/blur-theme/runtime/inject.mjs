/**
 * runtime/inject.mjs — Runtime inyectado en el proceso Electron principal de VSCode
 *
 * Este archivo NO corre en el extension host — corre dentro del proceso
 * principal de Electron de VSCode, importado desde main.js después de que
 * linux.js inyectó los marcadores.
 *
 * Flujo:
 *   1. Leer global.lynx_blur_plugin (inyectado por linux.js)
 *   2. Escuchar 'browser-window-created' en electron.app
 *   3. Cuando se abre la ventana principal (workbench.html):
 *      a. setBackgroundColor('#00000000') — fondo totalmente transparente
 *      b. Instalar método interval o overwrite para mantener transparencia
 *      c. Inyectar lynx-blur.css en el DOM via executeJavaScript
 */

import electron from 'electron';
import transparencyMethods from './methods/index.mjs';

/** @type {{ os: string, themeCSS: string, config: { refreshInterval: number, preventFlash: boolean } }} */
const app = global.lynx_blur_plugin;

if (!app) {
  console.error('[Lynx Blur Runtime] global.lynx_blur_plugin no encontrado — abortando.');
} else {

  electron.app.on('browser-window-created', (_event, window) => {
    const methods    = transparencyMethods(window);
    const hackMethod = app.config?.preventFlash ? 'overwrite' : 'interval';
    const effects    = methods[hackMethod];

    window.on('closed', () => effects.uninstall());

    window.webContents.on('dom-ready', () => {
      const url = window.webContents.getURL();

      // Solo actuar en la ventana principal del workbench
      const isWorkbench =
        url.includes('workbench.html') ||
        url.includes('workbench.esm.html') ||
        url.includes('workbench-monkey-patch.html');

      if (!isWorkbench) return;

      // Forzar fondo transparente
      window.setBackgroundColor('#00000000');

      // Iniciar método de mantenimiento de transparencia
      effects.install();

      // Inyectar CSS del tema Lynx Blur
      injectStyles(window);
    });
  });

}

// ─── Inyección de CSS ─────────────────────────────────────────────────────────

function buildStyleHTML() {
  const css = app?.themeCSS ?? '';
  return `<style id="lynx-blur-theme-css">${css}</style>`;
}

function injectStyles(window) {
  const styleHTML = buildStyleHTML();

  window.webContents.executeJavaScript(`
    (function() {
      try {
        const ttp = window.trustedTypes
          ? window.trustedTypes.createPolicy("LynxBlurTheme", { createHTML: (v) => v })
          : null;

        // Limpiar inyección previa si existe
        const existing = document.getElementById('lynx-blur-style-root');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.id = 'lynx-blur-style-root';
        container.innerHTML = ttp
          ? ttp.createHTML(${JSON.stringify(styleHTML)})
          : ${JSON.stringify(styleHTML)};

        document.body.appendChild(container);
      } catch (e) {
        console.error('[Lynx Blur Runtime] Error inyectando estilos:', e);
      }
    })();
  `).catch(err => console.error('[Lynx Blur Runtime] executeJavaScript falló:', err));
}
