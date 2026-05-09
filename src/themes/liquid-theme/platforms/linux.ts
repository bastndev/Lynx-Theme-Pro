import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { t } from '../utils/l10n';
import {
  TRANSPARENT_BG_KEYS, GLASS_BG_KEYS, FROSTED_BG_KEYS,
  ALL_BG_KEYS, THEME_BG, DEFAULT_OPACITY, FROSTED_OPACITY,
} from '../utils/color-keys';

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptions, removeElectronOptions,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms') as typeof import('../utils/file-transforms');

const {
  checkNeedsElevation, hasPkexec, hasNoNewPrivs, StagedFileWriter,
} = require('../utils/elevated-file-writer') as typeof import('../utils/elevated-file-writer');

const RUNTIME_VERSION  = 'v2';
const RUNTIME_DIR_NAME = `lynx-liquid-runtime-${RUNTIME_VERSION}`;

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

const CLI_COMMANDS: Record<string, string> = {
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

let _installing = false;

function resolveVSCodePaths(): VSCodePaths {
  let appDir: string | undefined;
  try { appDir = require.main?.filename ? path.dirname(require.main.filename) : undefined; } catch {}
  if (!appDir) { try { appDir = _VSCODE_FILE_ROOT; } catch {} }

  const candidates = appDir ? [appDir] : [];
  const appRoot = vscode.env.appRoot;
  if (appRoot) { candidates.push(appRoot, path.join(appRoot, 'out')); }

  let resolvedDir = null;
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'main.js'))) {
      resolvedDir = candidate; break;
    }
  }

  if (!resolvedDir) { throw new Error('main.js not found.'); }
  appDir = resolvedDir;

  const JSFile = path.join(appDir, 'main.js');
  let ElectronJSFile = path.join(appDir, 'vs', 'code', 'electron-main', 'main.js');
  if (!fs.existsSync(ElectronJSFile)) {ElectronJSFile = JSFile;}

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

async function applyColorCustomizations(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = (inspect?.globalValue || {}) as Record<string, string>;

  const saved = context.globalState.get<SavedColors>('lynxLiquidOriginalColors');
  if (!saved) {
    const originals: SavedColors = {};
    for (const key of ALL_BG_KEYS) { originals[key] = current[key] ?? null; }
    originals['terminal.background'] = current['terminal.background'] ?? null;
    originals['terminal.integrated.gpuAcceleration'] =
      config.inspect<string>('terminal.integrated.gpuAcceleration')?.globalValue ?? undefined;
    await context.globalState.update('lynxLiquidOriginalColors', originals);
  }

  const alphaHex = (opacity: number) => Math.round(opacity * 255).toString(16).padStart(2, '0');
  const newColors = { ...current };

  for (const key of TRANSPARENT_BG_KEYS) { newColors[key] = `#${THEME_BG}00`; }
  for (const key of GLASS_BG_KEYS)       { newColors[key] = `#${THEME_BG}${alphaHex(DEFAULT_OPACITY)}`; }
  for (const key of FROSTED_BG_KEYS)     { newColors[key] = `#${THEME_BG}${alphaHex(FROSTED_OPACITY)}`; }

  newColors['terminal.background'] = '#00000000';
  await config.update('workbench.colorCustomizations', newColors, vscode.ConfigurationTarget.Global);
}

async function restoreColorCustomizations(context: vscode.ExtensionContext): Promise<void> {
  const saved = context.globalState.get<SavedColors>('lynxLiquidOriginalColors');
  if (!saved) {return;}
  const config = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = { ...((inspect?.globalValue || {}) as Record<string, string>) };

  for (const key of ALL_BG_KEYS) {
    if (saved[key] !== null && saved[key] !== undefined) { current[key] = saved[key]; }
    else { delete current[key]; }
  }

  if (saved['terminal.background'] !== null && saved['terminal.background'] !== undefined) {
    current['terminal.background'] = saved['terminal.background'];
  } else { delete current['terminal.background']; }

  await config.update('workbench.colorCustomizations', current, vscode.ConfigurationTarget.Global);

  if (saved['terminal.integrated.gpuAcceleration'] !== undefined) {
    await config.update('terminal.integrated.gpuAcceleration', saved['terminal.integrated.gpuAcceleration'], vscode.ConfigurationTarget.Global);
  } else {
    await config.update('terminal.integrated.gpuAcceleration', undefined, vscode.ConfigurationTarget.Global);
  }
  await context.globalState.update('lynxLiquidOriginalColors', undefined);
}

async function promptRestart(): Promise<void> {
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
  const scriptPath = path.join(os.tmpdir(), `lynx-liquid-restart-${pid}.sh`);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  spawn('setsid', ['nohup', scriptPath], { detached: true, stdio: 'ignore' }).unref();
  vscode.commands.executeCommand('workbench.action.quit');
}

export async function install(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) {return;}
  _installing = true;
  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } = resolveVSCodePaths();

  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    vscode.window.showErrorMessage('Lynx Liquid: Required VSCode files not found.');
    _installing = false; return;
  }

  const elevationNeeded = checkNeedsElevation(appDir);
  if (elevationNeeded === 'snap' || elevationNeeded === 'flatpak') {
    vscode.window.showErrorMessage(`Lynx Liquid is not compatible with ${elevationNeeded} installations.`);
    _installing = false; return;
  }

  if (elevationNeeded && (hasNoNewPrivs() || !hasPkexec())) {
    vscode.window.showErrorMessage('Lynx Liquid requires pkexec to install on Linux.');
    _installing = false; return;
  }

  const writer = new StagedFileWriter(elevationNeeded);
  await writer.init();

  try {
    if (fs.existsSync(runtimeDir)) {await writer.rmdir(runtimeDir);}
    await writer.mkdir(runtimeDir);
    await writer.copyDir(runtimeSrcDir, runtimeDir);

    let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
    electronJS = injectElectronOptions(electronJS);
    await writer.writeFile(ElectronJSFile, electronJS, 'utf-8');

    const themeCSS = await fsPromises.readFile(path.resolve(__dirname, '../css/lynx-liquid.css'), 'utf-8');
    const injectData = {
      os: 'linux',
      themeCSS,
      config: { refreshInterval: 1000, preventFlash: true },
    } as const;
    let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
    mainJS = generateNewJS(mainJS, __filename, injectData, runtimeEntry);
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) {await writer.writeFile(HTMLFile, patchedHTML, 'utf-8');}

    await writer.flush();
    await applyColorCustomizations(context);
    try { await vscode.workspace.getConfiguration().update('terminal.integrated.gpuAcceleration', 'off', vscode.ConfigurationTarget.Global); } catch {}
    await context.globalState.update('lynxLiquidInstalled', true);

    void vscode.window.showInformationMessage(t('lynx.liquid.install.success.linux'), { title: t('lynx.liquid.btn.restart') }).then(msg => { if (msg) {void promptRestart();} });
  } catch (error) {
    writer.cleanup();
    console.error(error);
  } finally { _installing = false; }
}

export async function uninstall(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) {return;}
  _installing = true;
  await restoreColorCustomizations(context);
  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = resolveVSCodePaths();
  const elevationNeeded = checkNeedsElevation(appDir);
  const writer = new StagedFileWriter(elevationNeeded);
  await writer.init();

  try {
    if (fs.existsSync(JSFile)) {
      let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
      const { result, hadMarkers } = removeJSMarkers(mainJS);
      if (ElectronJSFile === JSFile) {
        // VSCode 1.95+: both files are the same — apply all cleanups to one buffer
        await writer.writeFile(JSFile, removeElectronOptions(result), 'utf-8');
      } else if (hadMarkers) {
        await writer.writeFile(JSFile, result, 'utf-8');
      }
    }
    if (ElectronJSFile !== JSFile && fs.existsSync(ElectronJSFile)) {
      let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
      await writer.writeFile(ElectronJSFile, removeElectronOptions(electronJS), 'utf-8');
    }
    if (fs.existsSync(HTMLFile)) {
      const html = await fsPromises.readFile(HTMLFile, 'utf-8');
      const cleaned = removeCSPPatch(html);
      if (cleaned !== html) {await writer.writeFile(HTMLFile, cleaned, 'utf-8');}
    }
    if (fs.existsSync(runtimeDir)) {await writer.rmdir(runtimeDir);}
    await writer.flush();
    await context.globalState.update('lynxLiquidInstalled', false);
    void vscode.window.showInformationMessage(t('lynx.liquid.uninstall.success.linux'), { title: t('lynx.liquid.btn.restart') }).then(msg => { if (msg) {void promptRestart();} });
  } catch {
    writer.cleanup();
  } finally { _installing = false; }
}

export async function handleActivation(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get('lynxLiquidInstalled', false)) {return;}
  await install(context);
}

export async function handleDeactivation(context: vscode.ExtensionContext): Promise<void> {
  if (!context.globalState.get('lynxLiquidInstalled', false)) {return;}
  await uninstall(context);
}
