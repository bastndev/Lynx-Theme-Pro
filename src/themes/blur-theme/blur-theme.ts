import * as vscode from 'vscode';
import * as l10n from './utils/l10n';

// Exact theme label name in package.json
const BLUR_THEME_LABEL = '8. BLURㅤㅤ(Lynx Theme) 🧪';

interface PlatformHandler {
  handleActivation(context: vscode.ExtensionContext): Promise<void>;
  handleDeactivation(context: vscode.ExtensionContext): Promise<void>;
}

/**
 * Detects the platform and returns the corresponding module.
 * Each platform exposes: { install, uninstall }
 */
function getPlatformHandler(): PlatformHandler | null {
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
    .get<string>('workbench.colorTheme');
  return current === BLUR_THEME_LABEL;
}

/**
 * Extension activation point.
 * Called when VSCode finishes loading (onStartupFinished).
 */
export function activate(context: vscode.ExtensionContext) {
  l10n.init(context);
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
    void handler.handleActivation(context);
  }

  // --- Theme change listener ---
  // Only acts when the user switches to or from the blur theme.
  const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('workbench.colorTheme')) {
      return;
    }

    if (isBlurThemeActive()) {
      void handler.handleActivation(context);
    } else {
      void handler.handleDeactivation(context);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log('[Lynx Blur] Extension deactivated.');
}
