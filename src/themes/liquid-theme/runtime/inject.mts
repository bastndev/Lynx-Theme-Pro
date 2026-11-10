import electron from 'electron';
import transparencyMethods from './methods/index.mjs';

interface LynxLiquidRuntimeConfig {
  os: 'linux' | 'macos' | 'windows';
  themeCSS: string;
  vibrancyType?: string;
  config?: {
    refreshInterval: number;
    preventFlash: boolean;
  };
}

const app = global.lynx_liquid_plugin as LynxLiquidRuntimeConfig | undefined;
const windowHandlers = new WeakMap<Electron.BrowserWindow, (transparent: boolean) => void>();

function isWorkbenchURL(url: string): boolean {
  try {
    return /\/workbench(?:\.esm)?\.html$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

if (!app) {
  console.error('[Lynx Liquid Runtime] Extension config not found.');
} else {
  electron.app.on('browser-window-created', (_event: unknown, window: Electron.BrowserWindow) => {
    trackWindow(window);
  });
}

function trackWindow(window: Electron.BrowserWindow): (transparent: boolean) => void {
  const existing = windowHandlers.get(window);
  if (existing) { return existing; }

  const contents = window.webContents;
  const methods = transparencyMethods(window);
  const effects = methods[app?.config?.preventFlash ? 'overwrite' : 'interval'];
  let auxiliary = false;
  let transparentAtCreation = true;
  let documentVersion = 0;
  let applying = false;
  let styled = false;
  let attempts = 0;
  let retryTimer: NodeJS.Timeout | undefined;

  const isAlive = () => !window.isDestroyed() && !contents.isDestroyed();

  function resetDocument(): void {
    documentVersion++;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    attempts = 0;
    applying = false;
    styled = false;
    effects.uninstall();
  }

  async function applyStyles(): Promise<void> {
    if (!app || !isAlive() || applying || styled) { return; }

    const mainWorkbench = isWorkbenchURL(contents.getURL());
    if (!mainWorkbench && !(auxiliary && contents.getURL() === 'about:blank')) { return; }

    clearTimeout(retryTimer);
    retryTimer = undefined;
    const version = documentVersion;
    const isCurrent = () => isAlive() && version === documentVersion;
    applying = true;

    try {
      if (!mainWorkbench) {
        // The opener builds an auxiliary editor's DOM after its about:blank window opens.
        const hasEditor = await contents.executeJavaScript(
          "Boolean(document.querySelector('.monaco-workbench .part.editor'))"
        );
        if (!isCurrent()) { return; }
        if (!hasEditor) {
          if (++attempts < 50) {
            retryTimer = setTimeout(() => {
              retryTimer = undefined;
              void applyStyles();
            }, 100);
          }
          return;
        }
        if (app.os !== 'macos' && !transparentAtCreation) {
          console.warn('[Lynx Liquid Runtime] Floating editor was created without native transparency. Reinstall the Liquid effect and restart the editor.');
        }
      }

      // Keep the dark loading background until CSS injection succeeds.
      window.setBackgroundColor('#0c1118');
      const cssKey = await contents.insertCSS(app.themeCSS);
      if (!isCurrent()) {
        if (isAlive()) { await contents.removeInsertedCSS(cssKey); }
        return;
      }

      window.setBackgroundColor('#00000000');
      if (app.os === 'macos' && app.vibrancyType) {
        window.setVibrancy(app.vibrancyType);
        const b = window.getBounds();
        window.setBounds({ width: b.width + 1 });
        window.setBounds({ width: b.width });
      }
      effects.install();
      styled = true;
    } catch (error: unknown) {
      if (isCurrent()) { console.error('[Lynx Liquid Runtime] Failed to apply glass styles:', error); }
    } finally {
      if (version === documentVersion) { applying = false; }
    }
  }

  const markAuxiliary = (transparent: boolean) => {
    auxiliary = true;
    transparentAtCreation = transparent;
    // did-create-window may arrive after the child's initial dom-ready event.
    void applyStyles();
  };
  windowHandlers.set(window, markAuxiliary);

  contents.on('did-create-window', (child, details) => {
    if (!isAlive() || details.url !== 'about:blank') { return; }
    const url = contents.getURL();
    if (!isWorkbenchURL(url) && !(auxiliary && styled && url === 'about:blank')) { return; }

    trackWindow(child)(details.options.transparent === true);
  });
  contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) { resetDocument(); }
  });
  contents.on('dom-ready', () => { void applyStyles(); });
  window.on('closed', () => {
    resetDocument();
    windowHandlers.delete(window);
  });

  return markAuxiliary;
}
