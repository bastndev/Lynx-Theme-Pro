import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { t } from '../utils/l10n';
import {
  resolveVSCodePaths, applyColorCustomizations, restoreColorCustomizations, buildThemeCSS,
} from '../utils/platform-shared';

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptions, removeElectronOptions,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms') as typeof import('../utils/file-transforms');

const {
  checkNeedsElevation, hasPkexec, hasNoNewPrivs, StagedFileWriter,
} = require('../utils/elevated-file-writer') as typeof import('../utils/elevated-file-writer');

// ─── Constants ────────────────────────────────────────────────────────────────

const RUNTIME_DIR_NAME = 'lynx-liquid-runtime-v2';

const CLI_COMMANDS: Record<string, string> = {
  'Visual Studio Code':            'code',
  'Visual Studio Code - Insiders': 'code-insiders',
  'VSCodium':                      'codium',
  'Cursor':                        'cursor',
  'Code - OSS':                    'code-oss',
  'Windsurf':                      'windsurf',
  'Windsurf - Next':               'windsurf-next',
  'Trae':                          'trae',
  'Kiro':                          'kiro',
  'Antigravity':                   'antigravity',
};

let _installing = false;

// ─── Restart ──────────────────────────────────────────────────────────────────

async function promptRestart(): Promise<void> {
  const cliName    = CLI_COMMANDS[vscode.env.appName] || 'code';
  const binName    = path.basename(process.execPath).replace(/'/g, "'\\''");
  const scriptPath = path.join(os.tmpdir(), `lynx-liquid-restart-${process.pid}.sh`);
  const script = [
    '#!/bin/sh',
    `while pgrep -x '${binName}' > /dev/null 2>&1; do sleep 1; done`,
    'sleep 1',
    `${cliName} &`,
    'rm -f "$0"',
  ].join('\n');
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  spawn('setsid', ['nohup', scriptPath], { detached: true, stdio: 'ignore' }).unref();
  vscode.commands.executeCommand('workbench.action.quit');
}

// ─── Installation ─────────────────────────────────────────────────────────────

export async function install(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) { return; }
  _installing = true;

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } =
    resolveVSCodePaths(RUNTIME_DIR_NAME);

  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    vscode.window.showErrorMessage(t('lynx.liquid.error.linux.notFound', vscode.env.appName, 'Missing JS/HTML'));
    _installing = false; return;
  }

  const elevationNeeded = checkNeedsElevation(appDir);
  if (elevationNeeded === 'snap' || elevationNeeded === 'flatpak') {
    vscode.window.showErrorMessage(t('lynx.liquid.error.linux.snapFlatpak', elevationNeeded));
    _installing = false; return;
  }
  if (elevationNeeded && (hasNoNewPrivs() || !hasPkexec())) {
    vscode.window.showErrorMessage(t('lynx.liquid.error.linux.noPkexec'));
    _installing = false; return;
  }

  const writer = new StagedFileWriter(elevationNeeded);
  await writer.init();

  try {
    if (fs.existsSync(runtimeDir)) { await writer.rmdir(runtimeDir); }
    await writer.mkdir(runtimeDir);
    await writer.copyDir(runtimeSrcDir, runtimeDir);

    await writer.writeFile(
      ElectronJSFile,
      injectElectronOptions(await fsPromises.readFile(ElectronJSFile, 'utf-8')),
      'utf-8'
    );

    const themeCSS = buildThemeCSS(__dirname);
    const mainJS   = generateNewJS(
      await fsPromises.readFile(JSFile, 'utf-8'),
      __filename,
      { os: 'linux', themeCSS, config: { refreshInterval: 1000, preventFlash: true } },
      runtimeEntry,
    );
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) { await writer.writeFile(HTMLFile, patchedHTML, 'utf-8'); }

    await writer.flush();
    await applyColorCustomizations(context, { saveGpuAcceleration: true });
    try {
      await vscode.workspace.getConfiguration().update(
        'terminal.integrated.gpuAcceleration', 'off', vscode.ConfigurationTarget.Global
      );
    } catch {}
    await context.globalState.update('lynxLiquidInstalled', true);

    void vscode.window.showInformationMessage(
      t('lynx.liquid.install.success.linux'), { title: t('lynx.liquid.btn.restart') }
    ).then(msg => { if (msg) { void promptRestart(); } });
  } catch (error) {
    writer.cleanup();
    console.error('[Lynx Liquid][Linux] Installation error:', error);
  } finally {
    _installing = false;
  }
}

// ─── Uninstallation ───────────────────────────────────────────────────────────

export async function uninstall(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) { return; }
  _installing = true;
  await restoreColorCustomizations(context, { restoreGpuAcceleration: true });

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = resolveVSCodePaths(RUNTIME_DIR_NAME);
  const writer = new StagedFileWriter(checkNeedsElevation(appDir));
  await writer.init();

  try {
    if (fs.existsSync(JSFile)) {
      const { result, hadMarkers } = removeJSMarkers(await fsPromises.readFile(JSFile, 'utf-8'));
      if (ElectronJSFile === JSFile) {
        await writer.writeFile(JSFile, removeElectronOptions(result), 'utf-8');
      } else if (hadMarkers) {
        await writer.writeFile(JSFile, result, 'utf-8');
      }
    }
    if (ElectronJSFile !== JSFile && fs.existsSync(ElectronJSFile)) {
      const electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
      await writer.writeFile(ElectronJSFile, removeElectronOptions(electronJS), 'utf-8');
    }
    if (fs.existsSync(HTMLFile)) {
      const html    = await fsPromises.readFile(HTMLFile, 'utf-8');
      const cleaned = removeCSPPatch(html);
      if (cleaned !== html) { await writer.writeFile(HTMLFile, cleaned, 'utf-8'); }
    }
    if (fs.existsSync(runtimeDir)) { await writer.rmdir(runtimeDir); }

    await writer.flush();
    await context.globalState.update('lynxLiquidInstalled', false);

    void vscode.window.showInformationMessage(
      t('lynx.liquid.uninstall.success.linux'), { title: t('lynx.liquid.btn.restart') }
    ).then(msg => { if (msg) { void promptRestart(); } });
  } catch (error) {
    writer.cleanup();
    console.error('[Lynx Liquid][Linux] Uninstallation error:', error);
  } finally {
    _installing = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function handleActivation(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get('lynxLiquidInstalled', false)) { return; }
  await install(context);
}

export async function handleDeactivation(context: vscode.ExtensionContext): Promise<void> {
  if (!context.globalState.get('lynxLiquidInstalled', false)) { return; }
  await uninstall(context);
}
