const vscode = require('vscode');

// Exact theme label name in package.json
const BLUR_THEME_LABEL = '8. BLURㅤㅤ(Lynx Theme) 🧪';

/**
 * Detects the platform and returns the corresponding module.
 * Each platform exposes: { install, uninstall }
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
 * Checks if the currently active theme is the Lynx blur theme.
 */
function isBlurThemeActive() {
  const current = vscode.workspace
    .getConfiguration()
    .get('workbench.colorTheme');
  return current === BLUR_THEME_LABEL;
}

/**
 * Extension activation point.
 * Called when VSCode finishes loading (onStartupFinished).
 */
function activate(context) {
  console.log('[Lynx Blur] Extension active — waiting for blur theme selection.');

  const handler = getPlatformHandler();

  // If the platform is not supported yet, exit without doing anything
  if (!handler) {
    console.warn('[Lynx Blur] Unsupported platform:', process.platform);
    return;
  }

  // --- Startup verification ---
  // If the user already had the blur theme selected before restarting,
  // check if it's already installed to avoid prompting again.
  if (isBlurThemeActive()) {
    handler.handleActivation(context);
  }

  // --- Theme change listener ---
  // Only acts when the user switches to or from the blur theme.
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
  console.log('[Lynx Blur] Extension deactivated.');
}

module.exports = { activate, deactivate };
