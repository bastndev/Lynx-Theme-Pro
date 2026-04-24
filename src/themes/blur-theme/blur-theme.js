// blur-theme.js — Entry point del Blur Theme de Lynx
// Se activa en onStartupFinished pero NO instala nada hasta que
// el usuario seleccione explícitamente "8. BLUR (Lynx Theme)"

const vscode = require('vscode');

// Nombre exacto del label del tema en package.json
const BLUR_THEME_LABEL = '8. BLURㅤㅤ(Lynx Theme) 🧪';

/**
 * Detecta la plataforma y retorna el módulo correspondiente.
 * Cada plataforma expone: { install, uninstall }
 */
function getPlatformHandler() {
  switch (process.platform) {
    case 'linux':
      return require('./platforms/linux');
    case 'darwin':
      return require('./platforms/macos');
    case 'win32':
      return require('./platforms/windows');
    default:
      return null;
  }
}

/**
 * Verifica si el tema activo actualmente es el blur theme de Lynx.
 */
function isBlurThemeActive() {
  const current = vscode.workspace
    .getConfiguration()
    .get('workbench.colorTheme');
  return current === BLUR_THEME_LABEL;
}

/**
 * Punto de activación de la extensión.
 * Se llama cuando VSCode termina de cargar (onStartupFinished).
 */
function activate(context) {
  console.log('[Lynx Blur] Extensión activa — esperando selección del tema blur.');

  const handler = getPlatformHandler();

  // Si la plataforma no está soportada aún, salimos sin hacer nada
  if (!handler) {
    console.warn('[Lynx Blur] Plataforma no soportada:', process.platform);
    return;
  }

  // --- Verificación al arrancar ---
  // Si el usuario ya tenía el blur theme seleccionado antes de reiniciar,
  // verificamos si ya está instalado para no volver a pedir.
  if (isBlurThemeActive()) {
    handler.handleActivation(context);
  }

  // --- Escucha de cambios de tema ---
  // Solo actúa cuando el usuario cambia al blur theme o sale de él.
  const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('workbench.colorTheme')) return;

    if (isBlurThemeActive()) {
      handler.handleActivation(context);
    } else {
      handler.handleDeactivation(context);
    }
  });

  context.subscriptions.push(disposable);
}

function deactivate() {
  console.log('[Lynx Blur] Extensión desactivada.');
}

module.exports = { activate, deactivate };
