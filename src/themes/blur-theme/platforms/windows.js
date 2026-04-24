'use strict';
const vscode      = require('vscode');
const fs          = require('fs');
const fsPromises  = require('fs').promises;
const path        = require('path');
const os          = require('os');

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptions, removeElectronOptions,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms');

const {
  checkNeedsElevationWindows, StagedFileWriterWindows,
} = require('../utils/elevated-file-writer');

// ─── Constants ────────────────────────────────────────────────────────────────

const RUNTIME_VERSION = 'v1';
const RUNTIME_DIR_NAME = `lynx-blur-runtime-${RUNTIME_VERSION}`;

// ─── Background transparency keys (same groups as Linux) ──────────────────────

const TRANSPARENT_BG_KEYS = [
  'editorPane.background',
  'editorGroupHeader.tabsBackground',
  'editorGroupHeader.noTabsBackground',
  'breadcrumb.background',
  'editorGutter.background',
  'panel.background',
  'panelStickyScroll.background',
  'tab.activeBackground',
  'tab.unfocusedActiveBackground',
];

const SEMITRANSPARENT_BG_KEYS = [
  'sideBar.background',
  'sideBarTitle.background',
  'sideBarStickyScroll.background',
  'editor.background',
  'editorStickyScroll.background',
  'editorStickyScrollGutter.background',
  'tab.inactiveBackground',
  'tab.unfocusedInactiveBackground',
];

const OPAQUE_BG_KEYS = [
  'inlineChat.background',
  'editorWidget.background',
  'editorHoverWidget.background',
  'editorSuggestWidget.background',
  'notifications.background',
  'notificationCenterHeader.background',
  'menu.background',
  'quickInput.background',
];

const ALL_BG_KEYS = [...TRANSPARENT_BG_KEYS, ...SEMITRANSPARENT_BG_KEYS, ...OPAQUE_BG_KEYS];

// Lynx Dark glassmorphism base color
const THEME_BG = '060a08';
const DEFAULT_OPACITY = 0.45;

// ─── In-memory mutex ──────────────────────────────────────────────────────────

let _installing = false;

// ─── Path resolution (identical strategy to Linux/macOS) ──────────────────────

function resolveVSCodePaths() {
  let appDir;

  // Strategy 1: require.main.filename
  try {
    appDir = path.dirname(require.main.filename);
  } catch {
    // Strategy 2: internal global
    // eslint-disable-next-line no-undef
    try { appDir = _VSCODE_FILE_ROOT; } catch { }
  }

  // Strategy 3: vscode.env.appRoot
  const candidates = appDir ? [appDir] : [];
  const appRoot = vscode.env.appRoot;
  if (appRoot) {
    candidates.push(appRoot, path.join(appRoot, 'out'));
  }

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
  console.log('[Lynx Blur][Windows] resolved appDir:', appDir);

  const JSFile = path.join(appDir, 'main.js');

  // VSCode 1.95+ merges electron-main/main.js
  let ElectronJSFile = path.join(appDir, 'vs', 'code', 'electron-main', 'main.js');
  if (!fs.existsSync(ElectronJSFile)) ElectronJSFile = JSFile;

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

async function applyColorCustomizations(context) {
  const config  = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = inspect?.globalValue || {};

  const saved = context.globalState.get('lynxBlurOriginalColors');
  if (!saved) {
    const originals = {};
    for (const key of ALL_BG_KEYS) {
      originals[key] = current[key] ?? null;
    }
    originals['terminal.background'] = current['terminal.background'] ?? null;
    await context.globalState.update('lynxBlurOriginalColors', originals);
  }

  const alphaHex = (opacity) => Math.round(opacity * 255).toString(16).padStart(2, '0');
  const newColors = { ...current };

  for (const key of TRANSPARENT_BG_KEYS) newColors[key] = `#${THEME_BG}00`;
  for (const key of SEMITRANSPARENT_BG_KEYS) newColors[key] = `#${THEME_BG}${alphaHex(DEFAULT_OPACITY)}`;
  for (const key of OPAQUE_BG_KEYS) newColors[key] = `#${THEME_BG}${alphaHex(0.9)}`;
  newColors['terminal.background'] = '#00000000';

  await config.update('workbench.colorCustomizations', newColors, vscode.ConfigurationTarget.Global);
}

async function restoreColorCustomizations(context) {
  const saved = context.globalState.get('lynxBlurOriginalColors');
  if (!saved) return;

  const config  = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = { ...(inspect?.globalValue || {}) };

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

// ─── Restart (Native VSCode Dialog) ───────────────────────────────────────────

async function promptRestart() {
  const config         = vscode.workspace.getConfiguration();
  const currentStyle   = config.get('window.titleBarStyle') ?? 'custom';
  const toggledStyle   = currentStyle === 'custom' ? 'native' : 'custom';

  await config.update('window.titleBarStyle', toggledStyle,  vscode.ConfigurationTarget.Global);
  await config.update('window.titleBarStyle', currentStyle,  vscode.ConfigurationTarget.Global);
}

// ─── Installation ─────────────────────────────────────────────────────────────

async function install(context) {
  if (_installing) return;
  _installing = true;

  let paths;
  try {
    paths = resolveVSCodePaths();
  } catch (err) {
    console.error('[Lynx Blur][Windows] Path resolution failed:', err);
    vscode.window.showErrorMessage(`[Lynx Blur] ${err.message}`);
    _installing = false;
    return;
  }

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } = paths;

  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    const info = `JSFile: ${fs.existsSync(JSFile)}, HTMLFile: ${fs.existsSync(HTMLFile)}`;
    vscode.window.showErrorMessage(`[Lynx Blur] VSCode files not found. ${info}`);
    _installing = false;
    return;
  }

  const elevationNeeded = checkNeedsElevationWindows(appDir);

  if (elevationNeeded) {
    const choice = await vscode.window.showInformationMessage(
      '[Lynx Theme Pro] Administrator permissions are required to modify VSCode installation in C:\\Program Files. ' +
      'A UAC prompt will appear.',
      { title: 'Yes, continue' },
      { title: 'Cancel' }
    );
    if (!choice || choice.title === 'Cancel') { _installing = false; return; }
  }

  const writer = new StagedFileWriterWindows(elevationNeeded);
  await writer.init();

  try {
    // 1. Copy runtime files
    if (fs.existsSync(runtimeDir)) await writer.rmdir(runtimeDir);
    await writer.mkdir(runtimeDir);
    await writer.copyDir(runtimeSrcDir, runtimeDir);

    // 2. Patch ElectronJSFile (frame:false, transparent:true) — we reuse the Linux injector!
    let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
    electronJS = injectElectronOptions(electronJS);
    await writer.writeFile(ElectronJSFile, electronJS, 'utf-8');

    // 3. Patch main.js
    const themeCSS  = await fsPromises.readFile(
      path.resolve(__dirname, '../css/lynx-blur.css'), 'utf-8'
    );
    const injectData = {
      os:           'windows',
      themeCSS,
      config: { refreshInterval: 1000, preventFlash: true },
    };
    let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
    mainJS = generateNewJS(mainJS, __filename, injectData, runtimeEntry);
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    // 4. Patch workbench.html CSP
    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) await writer.writeFile(HTMLFile, patchedHTML, 'utf-8');

    // 5. Flush writes (trigger PowerShell UAC if needed)
    await writer.flush();

    // 6. UI color adjustments
    await applyColorCustomizations(context);

    // 7. Save state
    await context.globalState.update('lynxBlurInstalled', true);

    // 8. Restart prompt
    vscode.window.showInformationMessage(
      '✔️ Windows Transparent effect installed. 🔄 Restart VSCode to activate it.',
      { title: 'Restart now' }
    ).then(msg => { if (msg) promptRestart(); });

  } catch (error) {
    writer.cleanup();
    console.error('[Lynx Blur][Windows] Installation error:', error);
    vscode.window.showErrorMessage(`[Lynx Blur] Installation failed: ${error.message}`);
  } finally {
    _installing = false;
  }
}

// ─── Uninstallation ───────────────────────────────────────────────────────────

async function uninstall(context) {
  if (_installing) return;
  _installing = true;

  await restoreColorCustomizations(context);

  let paths;
  try {
    paths = resolveVSCodePaths();
  } catch (err) {
    _installing = false;
    return;
  }

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = paths;
  const elevationNeeded = checkNeedsElevationWindows(appDir);

  const writer = new StagedFileWriterWindows(elevationNeeded);
  await writer.init();

  try {
    if (fs.existsSync(JSFile)) {
      let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
      const { result, hadMarkers } = removeJSMarkers(mainJS);

      if (ElectronJSFile === JSFile) {
        const clean = removeElectronOptions(result);
        await writer.writeFile(JSFile, clean, 'utf-8');
      } else {
        if (hadMarkers) await writer.writeFile(JSFile, result, 'utf-8');
      }
    }

    if (ElectronJSFile !== JSFile && fs.existsSync(ElectronJSFile)) {
      let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
      await writer.writeFile(ElectronJSFile, removeElectronOptions(electronJS), 'utf-8');
    }

    if (fs.existsSync(HTMLFile)) {
      const html    = await fsPromises.readFile(HTMLFile, 'utf-8');
      const cleaned = removeCSPPatch(html);
      if (cleaned !== html) await writer.writeFile(HTMLFile, cleaned, 'utf-8');
    }

    if (fs.existsSync(runtimeDir)) await writer.rmdir(runtimeDir);

    await writer.flush();
    await context.globalState.update('lynxBlurInstalled', false);

    vscode.window.showInformationMessage(
      'Windows Transparent effect removed. 🔄 Restart VSCode.',
      { title: 'Restart now' }
    ).then(msg => { if (msg) promptRestart(); });

  } catch (error) {
    writer.cleanup();
    vscode.window.showErrorMessage(`[Lynx Blur] Uninstallation failed: ${error.message}`);
  } finally {
    _installing = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function handleActivation(context) {
  const alreadyInstalled = context.globalState.get('lynxBlurInstalled', false);
  if (alreadyInstalled) return;
  await install(context);
}

async function handleDeactivation(context) {
  const isInstalled = context.globalState.get('lynxBlurInstalled', false);
  if (!isInstalled) return;
  await uninstall(context);
}

module.exports = { handleActivation, handleDeactivation };
