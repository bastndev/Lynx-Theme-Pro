import * as vscode from 'vscode';
import * as l10n from './utils/l10n';
import {
  applyPendingColorCustomizations, cleanupLiquidResidue,
} from './utils/platform-shared';

// Exact theme label name in package.json
const LIQUID_THEME_LABEL = '8. LIQUIDㅤㅤ(Lynx Theme) 🧪';

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
 * Checks if the currently active theme is the Lynx liquid theme.
 */
function isLiquidThemeActive() {
  const current = vscode.workspace
    .getConfiguration()
    .get<string>('workbench.colorTheme');
  return current === LIQUID_THEME_LABEL;
}

/**
 * Extension activation point.
 * Called when VSCode finishes loading (onStartupFinished).
 */
export function activate(context: vscode.ExtensionContext) {
  l10n.init(context);
  console.log('[Lynx Liquid] Extension active — waiting for liquid theme selection.');

  const handler = getPlatformHandler();

  if (!handler) {
    console.warn('[Lynx Liquid] Unsupported platform:', process.platform);
    return;
  }

  const isInstalled = context.globalState.get('lynxLiquidInstalled', false);

  if (isLiquidThemeActive()) {
    void applyPendingColorCustomizations(context);
  }

  if (!isLiquidThemeActive() && !isInstalled) {
    void cleanupLiquidResidue(context);
  }

  if (isLiquidThemeActive()) {
    void handler.handleActivation(context);
  }

  const disposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration('workbench.colorTheme')) {
      return;
    }

    if (isLiquidThemeActive()) {
      void handler.handleActivation(context);
    } else {
      void handler.handleDeactivation(context);
    }
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  console.log('[Lynx Liquid] Extension deactivated.');
}
