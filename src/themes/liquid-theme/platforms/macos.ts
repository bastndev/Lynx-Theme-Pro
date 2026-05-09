import * as vscode from 'vscode';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { t } from '../utils/l10n';
import {
  resolveVSCodePaths, applyColorCustomizations, restoreColorCustomizations,
  buildThemeCSS, getErrorMessage, hasErrorCode,
} from '../utils/platform-shared';

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptionsMacOS, removeElectronOptionsMacOS,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms') as typeof import('../utils/file-transforms');

const {
  checkNeedsElevationMacOS, StagedFileWriterMacOS,
} = require('../utils/elevated-file-writer') as typeof import('../utils/elevated-file-writer');

// ─── Constants ────────────────────────────────────────────────────────────────

const RUNTIME_DIR_NAME    = 'lynx-liquid-runtime-v1';
const MACOS_VIBRANCY_TYPE = 'under-window';

let _installing = false;

// ─── Restart ──────────────────────────────────────────────────────────────────

async function promptRestart(): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const style  = config.get('window.titleBarStyle') ?? 'native';
  await config.update('window.titleBarStyle', style === 'native' ? 'custom' : 'native', vscode.ConfigurationTarget.Global);
  await config.update('window.titleBarStyle', style, vscode.ConfigurationTarget.Global);
}

// ─── Installation ─────────────────────────────────────────────────────────────

export async function install(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) { return; }
  _installing = true;

  let paths;
  try {
    paths = resolveVSCodePaths(RUNTIME_DIR_NAME);
  } catch (err: unknown) {
    console.error('[Lynx Liquid][macOS] Path resolution failed:', err);
    vscode.window.showErrorMessage(t('lynx.liquid.error.generic', getErrorMessage(err)));
    _installing = false; return;
  }

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } = paths;

  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    const info = [
      `JSFile: ${JSFile} (${fs.existsSync(JSFile) ? '✓' : '✗'})`,
      `HTMLFile: ${HTMLFile} (${fs.existsSync(HTMLFile) ? '✓' : '✗'})`,
    ].join(' | ');
    console.error('[Lynx Liquid][macOS] Files not found:', info);
    vscode.window.showErrorMessage(t('lynx.liquid.error.notFound', vscode.env.appName, info));
    _installing = false; return;
  }

  const elevationNeeded = checkNeedsElevationMacOS(appDir);
  if (elevationNeeded) {
    const choice = await vscode.window.showInformationMessage(
      t('lynx.liquid.prompt.mac'),
      { title: t('lynx.liquid.btn.continue') },
      { title: t('lynx.liquid.btn.cancel') }
    );
    if (!choice || choice.title === t('lynx.liquid.btn.cancel')) { _installing = false; return; }
  }

  const writer = new StagedFileWriterMacOS(elevationNeeded);
  await writer.init();

  try {
    if (fs.existsSync(runtimeDir)) { await writer.rmdir(runtimeDir); }
    await writer.mkdir(runtimeDir);
    await writer.copyDir(runtimeSrcDir, runtimeDir);

    await writer.writeFile(
      ElectronJSFile,
      injectElectronOptionsMacOS(await fsPromises.readFile(ElectronJSFile, 'utf-8')),
      'utf-8'
    );

    const themeCSS = buildThemeCSS(__dirname);
    const mainJS   = generateNewJS(
      await fsPromises.readFile(JSFile, 'utf-8'),
      __filename,
      { os: 'macos', vibrancyType: MACOS_VIBRANCY_TYPE, themeCSS, config: { refreshInterval: 1000, preventFlash: true } },
      runtimeEntry,
    );
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) { await writer.writeFile(HTMLFile, patchedHTML, 'utf-8'); }

    await writer.flush();
    await applyColorCustomizations(context);
    await context.globalState.update('lynxLiquidInstalled', true);

    void vscode.window.showInformationMessage(
      t('lynx.liquid.install.success.mac'), { title: t('lynx.liquid.btn.restart') }
    ).then(msg => { if (msg) { void promptRestart(); } });
  } catch (error: unknown) {
    writer.cleanup();
    console.error('[Lynx Liquid][macOS] Installation error:', error);
    if (hasErrorCode(error, 'EACCES') || hasErrorCode(error, 'EPERM')) {
      vscode.window.showErrorMessage(t('lynx.liquid.error.noWrite', getErrorMessage(error)));
    } else {
      vscode.window.showErrorMessage(t('lynx.liquid.error.unexpected', getErrorMessage(error)));
    }
  } finally {
    _installing = false;
  }
}

// ─── Uninstallation ───────────────────────────────────────────────────────────

export async function uninstall(context: vscode.ExtensionContext): Promise<void> {
  if (_installing) { return; }
  _installing = true;
  await restoreColorCustomizations(context);

  let paths;
  try {
    paths = resolveVSCodePaths(RUNTIME_DIR_NAME);
  } catch (err: unknown) {
    console.error('[Lynx Liquid][macOS] Path resolution failed on uninstall:', err);
    _installing = false; return;
  }

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = paths;
  const writer = new StagedFileWriterMacOS(checkNeedsElevationMacOS(appDir));
  await writer.init();

  try {
    if (fs.existsSync(JSFile)) {
      const { result, hadMarkers } = removeJSMarkers(await fsPromises.readFile(JSFile, 'utf-8'));
      if (ElectronJSFile === JSFile) {
        await writer.writeFile(JSFile, removeElectronOptionsMacOS(result), 'utf-8');
      } else if (hadMarkers) {
        await writer.writeFile(JSFile, result, 'utf-8');
      }
    }
    if (ElectronJSFile !== JSFile && fs.existsSync(ElectronJSFile)) {
      const electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
      await writer.writeFile(ElectronJSFile, removeElectronOptionsMacOS(electronJS), 'utf-8');
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
      t('lynx.liquid.uninstall.success.mac'), { title: t('lynx.liquid.btn.restart') }
    ).then(msg => { if (msg) { void promptRestart(); } });
  } catch (error: unknown) {
    writer.cleanup();
    console.error('[Lynx Liquid][macOS] Uninstallation error:', error);
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
