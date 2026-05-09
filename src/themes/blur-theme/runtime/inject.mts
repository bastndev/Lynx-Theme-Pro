import electron from 'electron';
import transparencyMethods from './methods/index.mjs';

interface LynxBlurRuntimeConfig {
  os: 'linux' | 'macos' | 'windows';
  themeCSS: string;
  vibrancyType?: string;
  config?: {
    refreshInterval: number;
    preventFlash: boolean;
  };
}

const app = global.lynx_blur_plugin as LynxBlurRuntimeConfig | undefined;

if (!app) {
  console.error('[Lynx Blur Runtime] Extension config not found.');
} else {
  electron.app.on('browser-window-created', (_event: unknown, window: Electron.BrowserWindow) => {
    const methods    = transparencyMethods(window);
    const hackMethod = app.config?.preventFlash ? 'overwrite' : 'interval';
    const effects    = methods[hackMethod];

    window.on('closed', () => effects.uninstall());

    window.webContents.on('dom-ready', () => {
      const url = window.webContents.getURL();
      const isWorkbench = url.includes('workbench.html') || url.includes('workbench.esm.html');
      if (!isWorkbench) {return;}

      if (app.os === 'macos' && app.vibrancyType) {
        window.setBackgroundColor('#00000000');
        window.setVibrancy(app.vibrancyType as any);
        const b = window.getBounds();
        window.setBounds({ width: b.width + 1 });
        window.setBounds({ width: b.width });
        effects.install();
        void injectStyles(window);
      } else {
        // Liquid glass: prevent full transparency flash by setting dark background
        // wait for CSS to load, then enable true transparency
        window.setBackgroundColor('#0c1118');
        void injectStyles(window).then(() => {
          window.setBackgroundColor('#00000000');
          effects.install();
        });
      }
    });
  });
}

function buildStyleHTML(): string {
  const css = app?.themeCSS ?? '';
  return `<style id="lynx-blur-theme-css">${css}</style>`;
}

function injectStyles(window: Electron.BrowserWindow): Promise<void> {
  const styleHTML = buildStyleHTML();
  return window.webContents.executeJavaScript(`
    (function() {
      try {
        const ttp = window.trustedTypes
          ? window.trustedTypes.createPolicy("LynxBlurTheme", { createHTML: (v) => v })
          : null;
        const existing = document.getElementById('lynx-blur-style-root');
        if (existing) existing.remove();
        const container = document.createElement('div');
        container.id = 'lynx-blur-style-root';
        container.innerHTML = ttp ? ttp.createHTML(${JSON.stringify(styleHTML)}) : ${JSON.stringify(styleHTML)};
        document.body.appendChild(container);
      } catch (e) { console.error(e); }
    })();
  `).then(() => undefined).catch(e => console.error(e));
}
