// platforms/linux.js — Lógica específica para Linux
// Implementa: install, uninstall, handleActivation, handleDeactivation
//
// En Linux no hay API nativa de blur/vibrancy en Electron.
// La técnica es: frame:false + transparent:true en BrowserWindow
// + setBackgroundColor('#00000000') mantenido por el runtime.
//
// TODO: Implementar en la siguiente fase
//   - modifyElectronJSFile() → inyecta frame:false, transparent:true
//   - installRuntime()       → copia runtime/ al directorio de VSCode
//   - installJS()            → inyecta marcadores en main.js
//   - installHTML()          → parchea CSP en workbench.html
//   - promptRestart()        → setsid nohup para reinicio limpio

const vscode = require('vscode');

/**
 * Estado de instalación (en memoria, por sesión).
 * Permite evitar instalar dos veces sin reinicio.
 */
let _installed = false;

/**
 * Se llama cuando el usuario selecciona el Blur Theme.
 * Aquí irá el flujo completo de instalación para Linux.
 *
 * @param {vscode.ExtensionContext} context
 */
async function handleActivation(context) {
  if (_installed) return;

  vscode.window.showInformationMessage(
    '🐧 [Lynx Blur] Preparando efecto transparencia para Linux...',
    { modal: false }
  );

  // TODO (Fase 2): Implementar install real
  //   1. checkNeedsElevation(appDir)   → decidir si usar pkexec
  //   2. modifyElectronJSFile()        → frame:false, transparent:true
  //   3. installRuntime()              → copiar runtime/ a VSCode
  //   4. installJS()                  → inyectar CSS + marcadores
  //   5. installHTML()                 → parchar CSP
  //   6. promptRestart()              → reinicio limpio con setsid

  console.log('[Lynx Blur][Linux] handleActivation — stub activo, pendiente implementación');
  _installed = true;
}

/**
 * Se llama cuando el usuario cambia a otro tema (sale del Blur Theme).
 * Aquí irá el flujo de desinstalación para Linux.
 *
 * @param {vscode.ExtensionContext} context
 */
async function handleDeactivation(context) {
  if (!_installed) return;

  // TODO (Fase 2): Implementar uninstall real
  //   1. removeJSMarkers()            → limpiar main.js
  //   2. removeElectronOptions()      → restaurar BrowserWindow
  //   3. removeCSPPatch()             → limpiar workbench.html
  //   4. restorePreviousSettings()    → restaurar settings de VSCode
  //   5. promptRestart()              → reinicio limpio

  console.log('[Lynx Blur][Linux] handleDeactivation — stub activo, pendiente implementación');
  _installed = false;
}

module.exports = { handleActivation, handleDeactivation };
