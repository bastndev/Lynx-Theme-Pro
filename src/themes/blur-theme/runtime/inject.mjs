/**
 * runtime/inject.mjs — Runtime inyectado en el proceso Electron principal de VSCode
 *
 * Este archivo NO corre en el extension host — corre dentro del proceso
 * principal de Electron de VSCode, importado desde main.js después de que
 * la plataforma (Linux, macOS, o Windows) inyectó los marcadores.
 *
 * Flujo:
 *   1. Leer global.lynx_blur_plugin (inyectado por la plataforma)
 *   2. Escuchar 'browser-window-created' en electron.app
 *   3. Cuando se abre la ventana principal (workbench.html):
 *      a. setBackgroundColor('#00000000') — fondo totalmente transparente
 *      b. macOS: Activar vibrancy nativo
 *      c. Linux/Windows: Instalar método CSS para mantener transparencia
 *      d. Inyectar lynx-blur.css en el DOM via executeJavaScript
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

      // macOS: activar vibrancy nativa de Electron para blur real del escritorio
      if (app.os === 'macos' && app.vibrancyType) {
        window.setVibrancy(app.vibrancyType);
        // Hack de resize +1px para forzar que el compositor aplique la vibrancy.
        // Sin esto, el blur puede no aparecer hasta que el usuario mueva la ventana.
        const b = window.getBounds();
        window.setBounds({ width: b.width + 1 });
        window.setBounds({ width: b.width });
      }

      // Iniciar método de mantenimiento de transparencia (Linux / Windows CSS)
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
