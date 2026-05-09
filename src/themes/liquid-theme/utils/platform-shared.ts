import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  TRANSPARENT_BG_KEYS, GLASS_BG_KEYS, FROSTED_BG_KEYS,
  ALL_BG_KEYS, THEME_BG, DEFAULT_OPACITY, FROSTED_OPACITY,
} from './color-keys';

declare const _VSCODE_FILE_ROOT: string | undefined;

export type SavedColors = Record<string, string | null | undefined>;

export interface VSCodePaths {
  appDir:       string;
  JSFile:       string;
  ElectronJSFile: string;
  HTMLFile:     string;
  runtimeDir:   string;
  runtimeSrcDir: string;
  runtimeEntry: string;
}

export function resolveVSCodePaths(runtimeDirName: string): VSCodePaths {
  let appDir: string | undefined;
  try { appDir = require.main?.filename ? path.dirname(require.main.filename) : undefined; } catch {}
  if (!appDir) { try { appDir = _VSCODE_FILE_ROOT; } catch {} }

  const candidates = appDir ? [appDir] : [];
  const appRoot = vscode.env.appRoot;
  if (appRoot) { candidates.push(appRoot, path.join(appRoot, 'out')); }

  let resolvedDir: string | null = null;
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, 'main.js'))) {
      resolvedDir = candidate; break;
    }
  }

  if (!resolvedDir) {
    throw new Error(
      `main.js not found. Attempted: [${candidates.join(', ')}]. ` +
      `Editor: ${vscode.env.appName}. Platform: ${process.platform}.`
    );
  }

  const JSFile         = path.join(resolvedDir, 'main.js');
  let ElectronJSFile   = path.join(resolvedDir, 'vs', 'code', 'electron-main', 'main.js');
  if (!fs.existsSync(ElectronJSFile)) { ElectronJSFile = JSFile; }

  const htmlCandidates = [
    path.join(resolvedDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
    path.join(resolvedDir, 'vs', 'code', 'electron-browser', 'workbench', 'workbench.html'),
    path.join(resolvedDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.esm.html'),
  ];
  const HTMLFile = htmlCandidates.find(p => fs.existsSync(p)) || htmlCandidates[0];

  const runtimeDir    = path.join(resolvedDir, runtimeDirName);
  const runtimeSrcDir = path.resolve(__dirname, '../runtime');
  const runtimeEntry  = path.join(runtimeDir, 'inject.mjs');

  return { appDir: resolvedDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry };
}

export async function applyColorCustomizations(
  context: vscode.ExtensionContext,
  opts: { saveGpuAcceleration?: boolean } = {}
): Promise<void> {
  const config  = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = (inspect?.globalValue || {}) as Record<string, string>;

  if (!context.globalState.get<SavedColors>('lynxLiquidOriginalColors')) {
    const originals: SavedColors = {};
    for (const key of ALL_BG_KEYS) { originals[key] = current[key] ?? null; }
    originals['terminal.background'] = current['terminal.background'] ?? null;
    if (opts.saveGpuAcceleration) {
      originals['terminal.integrated.gpuAcceleration'] =
        config.inspect<string>('terminal.integrated.gpuAcceleration')?.globalValue ?? undefined;
    }
    await context.globalState.update('lynxLiquidOriginalColors', originals);
  }

  const alphaHex = (o: number) => Math.round(o * 255).toString(16).padStart(2, '0');
  const newColors = { ...current };

  for (const key of TRANSPARENT_BG_KEYS) { newColors[key] = `#${THEME_BG}00`; }
  for (const key of GLASS_BG_KEYS)       { newColors[key] = `#${THEME_BG}${alphaHex(DEFAULT_OPACITY)}`; }
  for (const key of FROSTED_BG_KEYS)     { newColors[key] = `#${THEME_BG}${alphaHex(FROSTED_OPACITY)}`; }
  newColors['terminal.background'] = '#00000000';

  await config.update('workbench.colorCustomizations', newColors, vscode.ConfigurationTarget.Global);
}

export async function restoreColorCustomizations(
  context: vscode.ExtensionContext,
  opts: { restoreGpuAcceleration?: boolean } = {}
): Promise<void> {
  const saved = context.globalState.get<SavedColors>('lynxLiquidOriginalColors');
  if (!saved) { return; }

  const config  = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = { ...((inspect?.globalValue || {}) as Record<string, string>) };

  for (const key of ALL_BG_KEYS) {
    if (saved[key] !== null && saved[key] !== undefined) { current[key] = saved[key]!; }
    else { delete current[key]; }
  }

  if (saved['terminal.background'] !== null && saved['terminal.background'] !== undefined) {
    current['terminal.background'] = saved['terminal.background']!;
  } else {
    delete current['terminal.background'];
  }

  await config.update('workbench.colorCustomizations', current, vscode.ConfigurationTarget.Global);

  if (opts.restoreGpuAcceleration) {
    await config.update(
      'terminal.integrated.gpuAcceleration',
      saved['terminal.integrated.gpuAcceleration'] ?? undefined,
      vscode.ConfigurationTarget.Global
    );
  }

  await context.globalState.update('lynxLiquidOriginalColors', undefined);
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' && error !== null &&
    'code' in error && (error as Record<string, unknown>).code === code
  );
}

export function buildThemeCSS(platformDir: string): string {
  const globalCSS      = fs.readFileSync(path.resolve(platformDir, '../css/global.css'), 'utf-8');
  const platformCSS    = fs.readFileSync(path.resolve(platformDir, '../css/liquid-glass/liquid-glass.css'), 'utf-8');
  return `${globalCSS}\n${platformCSS}`;
}

export function buildThemeCSSMac(platformDir: string): string {
  const globalCSS      = fs.readFileSync(path.resolve(platformDir, '../css/global.css'), 'utf-8');
  const platformCSS    = fs.readFileSync(path.resolve(platformDir, '../css/blur/blur.css'), 'utf-8');
  return `${globalCSS}\n${platformCSS}`;
}
