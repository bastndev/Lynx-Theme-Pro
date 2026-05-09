import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import { t } from '../utils/l10n';
import {
  TRANSPARENT_BG_KEYS, GLASS_BG_KEYS, FROSTED_BG_KEYS,
  ALL_BG_KEYS, THEME_BG, DEFAULT_OPACITY, FROSTED_OPACITY,
} from '../utils/color-keys';

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptionsMacOS, removeElectronOptionsMacOS,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms') as typeof import('../utils/file-transforms');

const {
  checkNeedsElevationMacOS, StagedFileWriterMacOS,
} = require('../utils/elevated-file-writer') as typeof import('../utils/elevated-file-writer');

// ─── Constants ────────────────────────────────────────────────────────────────

const RUNTIME_VERSION = 'v1';
const RUNTIME_DIR_NAME = `lynx-blur-runtime-${RUNTIME_VERSION}`;

/**
 * Vibrancy type passed to Electron's window.setVibrancy().
 * 'under-window' blurs whatever is behind the VSCode window — the most
 * dramatic "glass" effect available on macOS.
 * Other valid values: 'sidebar', 'titlebar', 'menu', 'popover', etc.
 */
const MACOS_VIBRANCY_TYPE = 'under-window';

declare const _VSCODE_FILE_ROOT: string | undefined;

interface VSCodePaths {
  appDir: string;
  JSFile: string;
  ElectronJSFile: string;
  HTMLFile: string;
  runtimeDir: string;
  runtimeSrcDir: string;
  runtimeEntry: string;
}

type SavedColors = Record<string, string | null | undefined>;

// ─── In-memory mutex ──────────────────────────────────────────────────────────

let _installing = false;

// ─── Path resolution (identical strategy to Linux) ───────────────────────────

/**
 * Resolves key paths of the VSCode resources directory on macOS.
 * Typical macOS layout:
 *   /Applications/Visual Studio Code.app/Contents/Resources/app/out/main.js
 *
 * Uses the same three-strategy fallback chain as linux.js.
 */
function resolveVSCodePaths(): VSCodePaths {
  let appDir: string | undefined;

  // Strategy 1: require.main.filename (extension host points to main process)
  try {
    appDir = require.main?.filename ? path.dirname(require.main.filename) : undefined;
  } catch {
    // Strategy 2: internal global injected by VSCode
     
    try { appDir = _VSCODE_FILE_ROOT; } catch { /* noop */ }
  }

  // Strategy 3: vscode.env.appRoot (public API)
  const candidates = appDir ? [appDir] : [];
  const appRoot = vscode.env.appRoot;
  if (appRoot) {
    candidates.push(appRoot, path.join(appRoot, 'out'));
  }

  // Select first candidate that contains main.js
  let resolvedDir = null;
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'main.js'))) {
      resolvedDir = candidate;
      break;
    }
  }

  if (!resolvedDir) {
    const tried = candidates.join(', ');
    throw new Error(
      `main.js not found. Attempted paths: [${tried}]. ` +
      `Editor: ${vscode.env.appName}. Platform: ${process.platform}.`
    );
  }

  appDir = resolvedDir;
  console.log('[Lynx Blur][macOS] resolved appDir:', appDir);

  const JSFile = path.join(appDir, 'main.js');

  // VSCode 1.95+ merges electron-main/main.js into the single main.js
  let ElectronJSFile = path.join(appDir, 'vs', 'code', 'electron-main', 'main.js');
  if (!fs.existsSync(ElectronJSFile)) {ElectronJSFile = JSFile;}

  // Find workbench.html — path changes between VSCode versions
  const htmlCandidates = [
    path.join(appDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
    path.join(appDir, 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
    path.join(appDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.esm.html'),
  ];
  const HTMLFile = htmlCandidates.find(p => fs.existsSync(p)) || htmlCandidates[0];

  const runtimeDir    = path.join(appDir, RUNTIME_DIR_NAME);
  const runtimeSrcDir = path.resolve(__dirname, '../runtime');
  const runtimeEntry  = path.join(runtimeDir, 'inject.mjs');

  return { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry };
}

// ─── Color Customizations ─────────────────────────────────────────────────────

/**
 * Applies transparent colorCustomizations.
 * Saves original values in globalState so they can be restored on uninstall.
 */
async function applyColorCustomizations(context: vscode.ExtensionContext): Promise<void> {
  const config  = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = (inspect?.globalValue || {}) as Record<string, string>;

  // Save originals only once (idempotent)
  const saved = context.globalState.get<SavedColors>('lynxBlurOriginalColors');
  if (!saved) {
    const originals: SavedColors = {};
    for (const key of ALL_BG_KEYS) {
      originals[key] = current[key] ?? null;
    }
    originals['terminal.background'] = current['terminal.background'] ?? null;
    await context.globalState.update('lynxBlurOriginalColors', originals);
  }

  const alphaHex = (opacity: number) => Math.round(opacity * 255).toString(16).padStart(2, '0');
  const newColors = { ...current };

  // Pure transparent (#RRGGBB00)
  for (const key of TRANSPARENT_BG_KEYS) {
    newColors[key] = `#${THEME_BG}00`;
  }
  // Glass surfaces — subtle tint
  for (const key of GLASS_BG_KEYS) {
    newColors[key] = `#${THEME_BG}${alphaHex(DEFAULT_OPACITY)}`;
  }
  // Frosted surfaces — denser for floating UI
  for (const key of FROSTED_BG_KEYS) {
    newColors[key] = `#${THEME_BG}${alphaHex(FROSTED_OPACITY)}`;
  }
  newColors['terminal.background'] = '#00000000';

  await config.update('workbench.colorCustomizations', newColors, vscode.ConfigurationTarget.Global);
}

/**
 * Restores the user's original colorCustomizations saved before installation.
 */
async function restoreColorCustomizations(context: vscode.ExtensionContext): Promise<void> {
  const saved = context.globalState.get<SavedColors>('lynxBlurOriginalColors');
  if (!saved) {return;}

  const config  = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = { ...((inspect?.globalValue || {}) as Record<string, string>) };

  for (const key of ALL_BG_KEYS) {
    if (saved[key] !== null && saved[key] !== undefined) {
      current[key] = saved[key];
    } else {
      delete current[key];
    }
  }

  if (saved['terminal.background'] !== null && saved['terminal.background'] !== undefined) {
    current['terminal.background'] = saved['terminal.background'];
  } else {
    delete current['terminal.background'];
  }

  await config.update('workbench.colorCustomizations', current, vscode.ConfigurationTarget.Global);
  await context.globalState.update('lynxBlurOriginalColors', undefined);
}

// ─── Restart (macOS native approach) ──────────────────────────────────────────

/**
 * Triggers VSCode's built-in restart dialog by momentarily toggling
 * window.titleBarStyle. This is the recommended macOS approach — no need
 * for shell scripts or process spawning.
 */
async function promptRestart(): Promise<void> {
  const config         = vscode.workspace.getConfiguration();
  const currentStyle   = config.get('window.titleBarStyle') ?? 'native';
  const toggledStyle   = currentStyle === 'native' ? 'custom' : 'native';

  // Toggle to opposite → toggle back: this forces VSCode to show its own
  // "Configuration changed. Restart required." prompt.
  await config.update('window.titleBarStyle', toggledStyle,  vscode.ConfigurationTarget.Global);
  await config.update('window.titleBarStyle', currentStyle,  vscode.ConfigurationTarget.Global);
}

// ─── Installation ─────────────────────────────────────────────────────────────

async function install(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) {return;}
  _installing = true;

  // Resolve VSCode internal paths
  let paths;
  try {
    paths = resolveVSCodePaths();
  } catch (err: unknown) {
    console.error('[Lynx Blur][macOS] Path resolution failed:', err);
    vscode.window.showErrorMessage(t('lynx.blur.error.generic', getErrorMessage(err)));
    _installing = false;
    return;
  }

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } = paths;

  // Sanity-check that key files exist
  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    const info = [
      `JSFile: ${JSFile} (${fs.existsSync(JSFile) ? '✓' : '✗'})`,
      `HTMLFile: ${HTMLFile} (${fs.existsSync(HTMLFile) ? '✓' : '✗'})`,
    ].join(' | ');
    console.error('[Lynx Blur][macOS] Files not found:', info);
    vscode.window.showErrorMessage(
      t('lynx.blur.error.notFound', vscode.env.appName, info)
    );
    _installing = false;
    return;
  }

  // Check if elevated writes are required
  const elevationNeeded = checkNeedsElevationMacOS(appDir);

  if (elevationNeeded) {
    const choice = await vscode.window.showInformationMessage(
      t('lynx.blur.prompt.mac'),
      { title: t('lynx.blur.btn.continue') },
      { title: t('lynx.blur.btn.cancel') }
    );
    if (!choice || choice.title === t('lynx.blur.btn.cancel')) { _installing = false; return; }
  }

  const writer = new StagedFileWriterMacOS(elevationNeeded);
  await writer.init();

  try {
    // 1. Copy runtime files into VSCode directory
    if (fs.existsSync(runtimeDir)) {await writer.rmdir(runtimeDir);}
    await writer.mkdir(runtimeDir);
    await writer.copyDir(runtimeSrcDir, runtimeDir);

    // 2. Patch ElectronJSFile — add visualEffectState:"active" to BrowserWindow
    //    (keeps vibrancy blur active even when the window loses focus)
    let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
    electronJS = injectElectronOptionsMacOS(electronJS);
    await writer.writeFile(ElectronJSFile, electronJS, 'utf-8');

    // 3. Patch main.js — inject the Lynx Blur runtime loader
    const themeCSS  = await fsPromises.readFile(
      path.resolve(__dirname, '../css/lynx-blur.css'), 'utf-8'
    );
    const injectData = {
      os:           'macos',
      vibrancyType: MACOS_VIBRANCY_TYPE,
      themeCSS,
      config: { refreshInterval: 1000, preventFlash: true },
    } as const;
    let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
    mainJS = generateNewJS(mainJS, __filename, injectData, runtimeEntry);
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    // 4. Patch workbench.html — add LynxBlurTheme to trusted-types CSP
    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) {await writer.writeFile(HTMLFile, patchedHTML, 'utf-8');}

    // 5. Flush all staged writes (elevated copy via osascript if needed)
    await writer.flush();

    // 6. Make UI backgrounds transparent via colorCustomizations
    await applyColorCustomizations(context);

    // 7. Save installed state
    await context.globalState.update('lynxBlurInstalled', true);

    // 8. Prompt for restart
    void vscode.window.showInformationMessage(
      t('lynx.blur.install.success.mac'),
      { title: t('lynx.blur.btn.restart') }
    ).then(msg => {
      if (msg) {
        void promptRestart();
      }
    });

  } catch (error: unknown) {
    writer.cleanup();
    console.error('[Lynx Blur][macOS] Installation error:', error);

    if (hasErrorCode(error, 'EACCES') || hasErrorCode(error, 'EPERM')) {
      vscode.window.showErrorMessage(t('lynx.blur.error.noWrite', getErrorMessage(error)));
    } else {
      vscode.window.showErrorMessage(t('lynx.blur.error.unexpected', getErrorMessage(error)));
    }
  } finally {
    _installing = false;
  }
}

// ─── Uninstallation ───────────────────────────────────────────────────────────

async function uninstall(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) {return;}
  _installing = true;

  // Restore colorCustomizations BEFORE touching files
  await restoreColorCustomizations(context);

  let paths;
  try {
    paths = resolveVSCodePaths();
  } catch (err: unknown) {
    console.error('[Lynx Blur][macOS] Path resolution failed on uninstall:', err);
    _installing = false;
    return;
  }

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = paths;
  const elevationNeeded = checkNeedsElevationMacOS(appDir);

  const writer = new StagedFileWriterMacOS(elevationNeeded);
  await writer.init();

  try {
    // 1. Clean main.js markers
    if (fs.existsSync(JSFile)) {
      let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
      const { result, hadMarkers } = removeJSMarkers(mainJS);

      if (ElectronJSFile === JSFile) {
        // VSCode 1.95+: both files are the same — apply all cleanups to one buffer
        const clean = removeElectronOptionsMacOS(result);
        await writer.writeFile(JSFile, clean, 'utf-8');
      } else {
        if (hadMarkers) {await writer.writeFile(JSFile, result, 'utf-8');}
      }
    }

    // 2. Clean ElectronJSFile (if separate from main.js)
    if (ElectronJSFile !== JSFile && fs.existsSync(ElectronJSFile)) {
      let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
      await writer.writeFile(ElectronJSFile, removeElectronOptionsMacOS(electronJS), 'utf-8');
    }

    // 3. Clean workbench.html CSP
    if (fs.existsSync(HTMLFile)) {
      const html    = await fsPromises.readFile(HTMLFile, 'utf-8');
      const cleaned = removeCSPPatch(html);
      if (cleaned !== html) {await writer.writeFile(HTMLFile, cleaned, 'utf-8');}
    }

    // 4. Remove runtime directory
    if (fs.existsSync(runtimeDir)) {await writer.rmdir(runtimeDir);}

    await writer.flush();
    await context.globalState.update('lynxBlurInstalled', false);

    void vscode.window.showInformationMessage(
      t('lynx.blur.uninstall.success.mac'),
      { title: t('lynx.blur.btn.restart') }
    ).then(msg => {
      if (msg) {
        void promptRestart();
      }
    });

  } catch (error: unknown) {
    writer.cleanup();
    console.error('[Lynx Blur][macOS] Uninstallation error:', error);
    vscode.window.showErrorMessage(t('lynx.blur.error.uninstallFailed', getErrorMessage(error)));
  } finally {
    _installing = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function handleActivation(context: vscode.ExtensionContext): Promise<void> {
  const alreadyInstalled = context.globalState.get('lynxBlurInstalled', false);
  if (alreadyInstalled) {
    console.log('[Lynx Blur][macOS] Already installed — no action needed.');
    return;
  }
  await install(context);
}

export async function handleDeactivation(context: vscode.ExtensionContext): Promise<void> {
  const isInstalled = context.globalState.get('lynxBlurInstalled', false);
  if (!isInstalled) {return;}
  await uninstall(context);
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
