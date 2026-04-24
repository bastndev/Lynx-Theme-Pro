// platforms/macos.js — Stub para macOS (implementación futura)
//
// En macOS el efecto blur es nativo via Electron:
//   window.setVibrancy(type) — tipos: 'under-window', 'fullscreen-ui', etc.
//   visualEffectState: 'active' en BrowserWindow options
//
// No requiere frame:false ni el hack de setBackgroundColor.
// Solo necesita inyectar el CSS del tema Lynx encima.
//
// TODO (Fase 3 - macOS):
//   - injectElectronOptions() → visualEffectState:'active', experimentalDarkMode
//   - window.setVibrancy('under-window') en el runtime
//   - installJS() con CSS de lynx-blur.css
//   - No requiere pkexec en la mayoría de los casos

const vscode = require('vscode');

async function handleActivation(context) {
  vscode.window.showInformationMessage(
    '🍎 [Lynx Blur] macOS — Próximamente disponible.'
  );
  console.log('[Lynx Blur][macOS] handleActivation — no implementado aún');
}

async function handleDeactivation(context) {
  console.log('[Lynx Blur][macOS] handleDeactivation — no implementado aún');
}

module.exports = { handleActivation, handleDeactivation };
