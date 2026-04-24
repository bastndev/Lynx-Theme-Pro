// platforms/windows.js — Stub para Windows (implementación futura)
//
// En Windows el efecto se logra vía native addon (.node):
//   setVibrancy(hwnd, ACCENT_ENABLE_ACRYLICBLURBEHIND, r, g, b, 0)
//   Requiere win10refresh.mjs para refrescar el efecto periódicamente.
//
// También requiere frame:false + transparent:true en BrowserWindow.
// Los archivos .node están bloqueados mientras VSCode corre,
// por lo que la copia se difiere al script de reinicio (.vbs).
//
// TODO (Fase 4 - Windows):
//   - Compilar o distribuir vibrancy-x64.node y vibrancy-arm64.node
//   - installRuntimeWin() → manejo de .node bloqueados + pendingNodeCopies
//   - Restart vía VBScript (WMI poll para detectar salida de VSCode)
//   - Elevar con PowerShell Start-Process -Verb RunAs

const vscode = require('vscode');

async function handleActivation(context) {
  vscode.window.showInformationMessage(
    '🪟 [Lynx Blur] Windows — Próximamente disponible.'
  );
  console.log('[Lynx Blur][Windows] handleActivation — no implementado aún');
}

async function handleDeactivation(context) {
  console.log('[Lynx Blur][Windows] handleDeactivation — no implementado aún');
}

module.exports = { handleActivation, handleDeactivation };
