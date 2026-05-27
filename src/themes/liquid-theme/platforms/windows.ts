import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { t } from '../utils/l10n';
import {
  resolveVSCodePaths, saveColorBackup, restoreColorCustomizations,
  applyPendingColorCustomizations, buildThemeCSS, getErrorMessage,
} from '../utils/platform-shared';

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptions, removeElectronOptions,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms') as typeof import('../utils/file-transforms');

const {
  checkNeedsElevationWindows, StagedFileWriterWindows,
} = require('../utils/elevated-file-writer') as typeof import('../utils/elevated-file-writer');

// ─── Constants ────────────────────────────────────────────────────────────────

const RUNTIME_DIR_NAME = 'lynx-liquid-runtime-v2';

let _installing = false;

// ─── Restart ──────────────────────────────────────────────────────────────────

async function promptRestart(context?: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const style  = config.get('window.titleBarStyle') ?? 'custom';
  await config.update('window.titleBarStyle', style === 'custom' ? 'native' : 'custom', vscode.ConfigurationTarget.Global);
  await config.update('window.titleBarStyle', style, vscode.ConfigurationTarget.Global);
  if (context) {
    await applyPendingColorCustomizations(context);
  }
}

// ─── Installation ─────────────────────────────────────────────────────────────

export async function install(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) { return; }
  _installing = true;

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } =
    resolveVSCodePaths(RUNTIME_DIR_NAME);

  const writer = new StagedFileWriterWindows(checkNeedsElevationWindows(appDir));
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
      { os: 'windows', themeCSS, config: { refreshInterval: 1000, preventFlash: true } },
      runtimeEntry,
    );
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) { await writer.writeFile(HTMLFile, patchedHTML, 'utf-8'); }

    await writer.flush();
    await saveColorBackup(context);
    await context.globalState.update('lynxLiquidInstalled', true);
    await context.globalState.update('lynxLiquidPendingColorApply', true);

    void vscode.window.showInformationMessage(
      t('lynx.liquid.install.success.win'), { title: t('lynx.liquid.btn.restart') }
    ).then(msg => { if (msg) { void promptRestart(context); } });
  } catch (error: unknown) {
    writer.cleanup();
    console.error('[Lynx Liquid][Windows] Installation error:', error);
    vscode.window.showErrorMessage(t('lynx.liquid.error.installFailed', getErrorMessage(error)));
  } finally {
    _installing = false;
  }
}

// ─── Uninstallation ───────────────────────────────────────────────────────────

export async function uninstall(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) { return; }
  _installing = true;
  await restoreColorCustomizations(context);

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = resolveVSCodePaths(RUNTIME_DIR_NAME);
  const writer = new StagedFileWriterWindows(checkNeedsElevationWindows(appDir));
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
      t('lynx.liquid.uninstall.success.win'), { title: t('lynx.liquid.btn.restart') }
    ).then(msg => { if (msg) { void promptRestart(); } });
  } catch (error: unknown) {
    writer.cleanup();
    console.error('[Lynx Liquid][Windows] Uninstallation error:', error);
    vscode.window.showErrorMessage(t('lynx.liquid.error.uninstallFailed', getErrorMessage(error)));
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
