'use strict';
const vscode = require('vscode');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptions, removeElectronOptions,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms');

const {
  checkNeedsElevation, hasPkexec, hasNoNewPrivs, StagedFileWriter,
} = require('../utils/elevated-file-writer');

// ─── Constants ────────────────────────────────────────────────────────────────

const RUNTIME_VERSION = 'v1';
const RUNTIME_DIR_NAME = `lynx-blur-runtime-${RUNTIME_VERSION}`;

// ─── Background keys modified in workbench.colorCustomizations ────────────────
// Same categories as vibrancy-code for transparent backgrounds

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

// Lynx Dark base color
const THEME_BG = '0d0d0d';
const DEFAULT_OPACITY = 0.5;

// Supported editors: any VSCode fork with the same file structure
const CLI_COMMANDS = {
  'Visual Studio Code': 'code',
  'Visual Studio Code - Insiders': 'code-insiders',
  'VSCodium': 'codium',
  'Cursor': 'cursor',
  'Code - OSS': 'code-oss',
  'Windsurf': 'windsurf',
  'Windsurf - Next': 'windsurf-next',
  'Trae': 'trae',
  'Kiro': 'kiro',
  'Antigravity': 'antigravity',
};

// ─── In-memory state ──────────────────────────────────────────────────────────

let _installing = false;  // Mutex to avoid concurrent installations

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Resolves key paths of the VSCode resources directory.
 * Uses the same fallback chain as vibrancy-code:
 *   1. require.main.filename  — in the extension host points to the main process
 *   2. _VSCODE_FILE_ROOT      — internal global injected by VSCode in the extension host
 *   3. vscode.env.appRoot     — public API; may need \'out/\' subdir
 */
function resolveVSCodePaths() {
  let appDir;

  // Strategy 1 (same as vibrancy-code)
  try {
    appDir = path.dirname(require.main.filename);
  } catch {
    // Strategy 2: internal global injected by VSCode
    // eslint-disable-next-line no-undef
    try { appDir = _VSCODE_FILE_ROOT; } catch { }
  }

  // Strategy 3: vscode.env.appRoot (public API)
  // If main.js does not exist in appDir, try common subfolders
  const candidates = appDir
    ? [appDir]
    : [];

  const appRoot = vscode.env.appRoot; // e.g. /usr/share/code/resources/app
  if (appRoot) {
    candidates.push(appRoot, path.join(appRoot, 'out'));
  }

  // Select the first candidate containing main.js
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
  console.log('[Lynx Blur] resolved appDir:', appDir);

  const JSFile = path.join(appDir, 'main.js');

  // VSCode 1.95+ merges both main.js into one
  let ElectronJSFile = path.join(appDir, 'vs', 'code', 'electron-main', 'main.js');
  if (!fs.existsSync(ElectronJSFile)) ElectronJSFile = JSFile;

  // Find workbench.html (path changes between VSCode versions)
  const htmlCandidates = [
    path.join(appDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
    path.join(appDir, 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
    path.join(appDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.esm.html'),
  ];
  const HTMLFile = htmlCandidates.find(p => fs.existsSync(p)) || htmlCandidates[0];

  const runtimeDir = path.join(appDir, RUNTIME_DIR_NAME);
  const runtimeSrcDir = path.resolve(__dirname, '../runtime');
  const runtimeEntry = path.join(runtimeDir, 'inject.mjs');

  return { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry };
}
// ─── Color Customizations (the core piece) ────────────────────────────────────

/**
 * Applies colorCustomizations to make backgrounds transparent.
 * Saves the original values in globalState to restore them later.
 */
async function applyColorCustomizations(context) {
  const config = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = inspect?.globalValue || {};

  // Save the originals if they haven\'t been saved before
  const saved = context.globalState.get('lynxBlurOriginalColors');
  if (!saved) {
    const originals = {};
    for (const key of ALL_BG_KEYS) {
      originals[key] = current[key] ?? null;
    }
    originals['terminal.background'] = current['terminal.background'] ?? null;
    originals['terminal.integrated.gpuAcceleration'] =
      config.inspect('terminal.integrated.gpuAcceleration')?.globalValue ?? undefined;
    await context.globalState.update('lynxBlurOriginalColors', originals);
  }

  // Calculate transparent colors
  const alphaHex = (opacity) => Math.round(opacity * 255).toString(16).padStart(2, '0');
  const newColors = { ...current };

  // Pure transparent (#RRGGBB00)
  for (const key of TRANSPARENT_BG_KEYS) {
    newColors[key] = `#${THEME_BG}00`;
  }

  // Semi-transparent (#RRGGBBAA)
  for (const key of SEMITRANSPARENT_BG_KEYS) {
    newColors[key] = `#${THEME_BG}${alphaHex(DEFAULT_OPACITY)}`;
  }

  // Semi-opaque (#RRGGBBE6 ≈ 0.9)
  for (const key of OPAQUE_BG_KEYS) {
    newColors[key] = `#${THEME_BG}${alphaHex(0.9)}`;
  }

  newColors['terminal.background'] = '#00000000';

  await config.update('workbench.colorCustomizations', newColors, vscode.ConfigurationTarget.Global);
}

/**
 * Restores the user\'s original colorCustomizations.
 */
async function restoreColorCustomizations(context) {
  const saved = context.globalState.get('lynxBlurOriginalColors');
  if (!saved) return;

  const config = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = { ...(inspect?.globalValue || {}) };

  // Restore or remove each key
  for (const key of ALL_BG_KEYS) {
    if (saved[key] !== null && saved[key] !== undefined) {
      current[key] = saved[key];
    } else {
      delete current[key];
    }
  }

  // Restore terminal background
  if (saved['terminal.background'] !== null && saved['terminal.background'] !== undefined) {
    current['terminal.background'] = saved['terminal.background'];
  } else {
    delete current['terminal.background'];
  }

  await config.update('workbench.colorCustomizations', current, vscode.ConfigurationTarget.Global);

  // Restore GPU acceleration
  if (saved['terminal.integrated.gpuAcceleration'] !== undefined) {
    await config.update('terminal.integrated.gpuAcceleration',
      saved['terminal.integrated.gpuAcceleration'], vscode.ConfigurationTarget.Global);
  } else {
    await config.update('terminal.integrated.gpuAcceleration', undefined, vscode.ConfigurationTarget.Global);
  }

  await context.globalState.update('lynxBlurOriginalColors', undefined);
}

// ─── Clean restart (setsid + nohup) ───────────────────────────────────────────

async function promptRestart() {
  // Only launches the restart script — without changing settings.
  const cliName = CLI_COMMANDS[vscode.env.appName] || 'code';
  const pid = process.pid;
  const binName = path.basename(process.execPath).replace(/'/g, "'\\''");

  const script = [
    '#!/bin/sh',
    `while pgrep -x '${binName}' > /dev/null 2>&1; do sleep 1; done`,
    'sleep 1',
    `${cliName} &`,
    'rm -f "$0"',
  ].join('\n');

  const scriptPath = path.join(os.tmpdir(), `lynx-blur-restart-${pid}.sh`);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  spawn('setsid', ['nohup', scriptPath], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env },
  }).unref();

  vscode.commands.executeCommand('workbench.action.quit');
}

// ─── Installation ─────────────────────────────────────────────────────────────

async function install(context) {
  if (_installing) return;
  _installing = true;

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } =
    resolveVSCodePaths();

  // Verify that key files exist (show diagnostic if they fail)
  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    const info = `JSFile: ${JSFile} (${fs.existsSync(JSFile) ? '✓' : '✗'}) | HTMLFile: ${HTMLFile} (${fs.existsSync(HTMLFile) ? '✓' : '✗'})`;
    console.error('[Lynx Blur][Linux] Files not found:', info);
    vscode.window.showErrorMessage(
      `[Lynx Blur] VSCode files not found. Editor: ${vscode.env.appName}. ` +
      `If you use a VSCode fork, open an issue. Detail: ${info}`
    );
    _installing = false;
    return;
  }

  // Check if elevation is needed
  const elevationNeeded = checkNeedsElevation(appDir);

  if (elevationNeeded === 'snap' || elevationNeeded === 'flatpak') {
    const kind = elevationNeeded === 'flatpak' ? 'Flatpak' : 'Snap';
    vscode.window.showErrorMessage(
      `[Lynx Blur] ${kind} not supported — install VSCode as .deb to use this effect.`,
      { title: '📥 Download .deb' }
    ).then(msg => {
      if (msg) vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/download'));
    });
    _installing = false;
    return;
  }

  if (elevationNeeded && hasNoNewPrivs()) {
    vscode.window.showErrorMessage('[Lynx Blur] Cannot elevate permissions in this session. Restart VSCode normally and try again.');
    _installing = false;
    return;
  }

  if (elevationNeeded && !hasPkexec()) {
    vscode.window.showErrorMessage('[Lynx Blur] pkexec (Polkit) is required to write to the VSCode directory. Install it and try again.');
    _installing = false;
    return;
  }

  if (elevationNeeded) {
    const choice = await vscode.window.showInformationMessage(
      '[Lynx Theme Pro Blur] Administrator permissions are required to apply the transparency effect. Continue?',
      { title: 'Yes, continue' },
      { title: 'Cancel' }
    );
    if (!choice || choice.title === 'Cancel') { _installing = false; return; }
  }

  const writer = new StagedFileWriter(elevationNeeded);
  await writer.init();

  try {
    // 1. Copy runtime to VSCode directory
    if (fs.existsSync(runtimeDir)) await writer.rmdir(runtimeDir);
    await writer.mkdir(runtimeDir);
    await writer.copyDir(runtimeSrcDir, runtimeDir);

    // 2. Patch ElectronJSFile (frame:false + transparent:true)
    let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
    electronJS = injectElectronOptions(electronJS);
    await writer.writeFile(ElectronJSFile, electronJS, 'utf-8');

    // 3. Patch main.js (inject runtime)
    const themeCSS = await fsPromises.readFile(
      path.resolve(__dirname, '../css/lynx-blur.css'), 'utf-8'
    );
    const injectData = {
      os: 'linux',
      themeCSS,
      config: { refreshInterval: 1000, preventFlash: true },
    };
    let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
    mainJS = generateNewJS(mainJS, __filename, injectData, runtimeEntry);
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    // 4. Patch workbench.html (CSP)
    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) await writer.writeFile(HTMLFile, patchedHTML, 'utf-8');

    // 5. Flush (elevated copy if necessary)
    await writer.flush();

    // 6. Apply colorCustomizations to make backgrounds transparent
    await applyColorCustomizations(context);

    // 7. Disable terminal GPU acceleration (visual artifacts)
    try {
      await vscode.workspace.getConfiguration()
        .update('terminal.integrated.gpuAcceleration', 'off', vscode.ConfigurationTarget.Global);
    } catch { }

    // 8. Save installed state
    await context.globalState.update('lynxBlurInstalled', true);

    // 9. Prompt for restart
    vscode.window.showInformationMessage(
      '✔️ Transparency effect installed. 🔄 Restart VSCode to activate it.',
      { title: 'Restart now' }
    ).then(msg => { if (msg) promptRestart(); });

  } catch (error) {
    writer.cleanup();
    console.error('[Lynx Blur][Linux] Installation error:', error);

    if (error.message === 'no_new_privs') {
      vscode.window.showErrorMessage('[Lynx Blur] Cannot elevate permissions in this session. Restart VSCode and try again.');
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      vscode.window.showErrorMessage(`[Lynx Blur] No write permissions: ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`[Lynx Blur] Unexpected error: ${error.message}`);
    }
  } finally {
    _installing = false;
  }
}

// ─── Uninstallation ───────────────────────────────────────────────────────────

async function uninstall(context) {
  if (_installing) return;
  _installing = true;

  // Restore colorCustomizations BEFORE touching files
  await restoreColorCustomizations(context);

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = resolveVSCodePaths();

  const elevationNeeded = checkNeedsElevation(appDir);
  if (elevationNeeded === 'snap') { _installing = false; return; }

  const writer = new StagedFileWriter(elevationNeeded);
  await writer.init();

  try {
    // 1. Clean main.js markers
    if (fs.existsSync(JSFile)) {
      let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
      const { result, hadMarkers } = removeJSMarkers(mainJS);
      if (hadMarkers) await writer.writeFile(JSFile, result, 'utf-8');

      // In VSCode 1.95+ ElectronJSFile === JSFile, apply in the same buffer
      if (ElectronJSFile === JSFile) {
        const clean = removeElectronOptions(result);
        await writer.writeFile(JSFile, clean, 'utf-8');
      }
    }

    // 2. Clean ElectronJSFile if different
    if (ElectronJSFile !== JSFile && fs.existsSync(ElectronJSFile)) {
      let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
      await writer.writeFile(ElectronJSFile, removeElectronOptions(electronJS), 'utf-8');
    }

    // 3. Clean workbench.html CSP
    if (fs.existsSync(HTMLFile)) {
      const html = await fsPromises.readFile(HTMLFile, 'utf-8');
      const cleaned = removeCSPPatch(html);
      if (cleaned !== html) await writer.writeFile(HTMLFile, cleaned, 'utf-8');
    }

    // 4. Remove runtime directory
    if (fs.existsSync(runtimeDir)) await writer.rmdir(runtimeDir);

    await writer.flush();
    await context.globalState.update('lynxBlurInstalled', false);

    vscode.window.showInformationMessage(
      'Transparency effect removed. 🔄 Restart VSCode.',
      { title: 'Restart now' }
    ).then(msg => { if (msg) promptRestart(); });

  } catch (error) {
    writer.cleanup();
    console.error('[Lynx Blur][Linux] Uninstallation error:', error);
    vscode.window.showErrorMessage(`[Lynx Blur] Error uninstalling: ${error.message}`);
  } finally {
    _installing = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

async function handleActivation(context) {
  const alreadyInstalled = context.globalState.get('lynxBlurInstalled', false);
  if (alreadyInstalled) {
    console.log('[Lynx Blur][Linux] Already installed — no action needed.');
    return;
  }
  await install(context);
}

async function handleDeactivation(context) {
  const isInstalled = context.globalState.get('lynxBlurInstalled', false);
  if (!isInstalled) return;
  await uninstall(context);
}

module.exports = { handleActivation, handleDeactivation };
