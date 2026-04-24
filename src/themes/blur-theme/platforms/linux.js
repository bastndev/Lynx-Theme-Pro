// platforms/linux.js — Implementación completa del Blur Theme para Linux
//
// Pipeline de instalación:
//   1. Detectar appDir (directorio de recursos de VSCode)
//      → require.main.filename (igual que vibrancy-code)
//      → _VSCODE_FILE_ROOT   (global interno que VSCode inyecta en el extension host)
//      → vscode.env.appRoot  (API pública de VSCode, carpeta raíz de la app)
//   2. Resolver rutas: JSFile, ElectronJSFile, HTMLFile
//   3. Verificar elevación (pkexec si el directorio no es escribible)
//   4. Copiar runtime/ al directorio de VSCode
//   5. Parchear ElectronJSFile: frame:false + transparent:true
//   6. Parchear JSFile: inyectar marcadores + import del runtime
//   7. Parchear HTMLFile (workbench.html): CSP trusted-types
//   8. Aplicar setting window.controlsStyle = "custom"
//   9. Reiniciar VSCode con setsid + nohup

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

// ─── Constantes ───────────────────────────────────────────────────────────────

const RUNTIME_VERSION  = 'v1';
const RUNTIME_DIR_NAME = `lynx-blur-runtime-${RUNTIME_VERSION}`;

// ─── Background keys que se modifican en workbench.colorCustomizations ────────
// Mismas categorías que vibrancy-code para que los backgrounds sean transparentes

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

// Color base Lynx Dark
const THEME_BG = '0d0d0d';
const DEFAULT_OPACITY = 0.5;

// Editores soportados: todo fork de VSCode con la misma estructura de archivos
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

// ─── Estado en memoria ────────────────────────────────────────────────────────

let _installing = false;  // Mutex para evitar instalaciones concurrentes

// ─── Helpers de rutas ─────────────────────────────────────────────────────────

/**
 * Resuelve las rutas clave del directorio de recursos de VSCode.
 * Usa la misma cadena de fallbacks que vibrancy-code:
 *   1. require.main.filename  — en el extension host apunta al proceso principal
 *   2. _VSCODE_FILE_ROOT      — global interno que VSCode inyecta en el extension host
 *   3. vscode.env.appRoot     — API pública; puede necesitar subdir 'out/'
 */
function resolveVSCodePaths() {
  let appDir;

  // Estrategia 1 (mismo que vibrancy-code)
  try {
    appDir = path.dirname(require.main.filename);
  } catch {
    // Estrategia 2: global interno que VSCode inyecta
    // eslint-disable-next-line no-undef
    try { appDir = _VSCODE_FILE_ROOT; } catch { }
  }

  // Estrategia 3: vscode.env.appRoot (API pública)
  // Si main.js no existe en appDir, probamos subcarpetas comunes
  const candidates = appDir
    ? [appDir]
    : [];

  const appRoot = vscode.env.appRoot; // e.g. /usr/share/code/resources/app
  if (appRoot) {
    candidates.push(appRoot, path.join(appRoot, 'out'));
  }

  // Seleccionar el primer candidato que contenga main.js
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
      `No se encontró main.js. Rutas intentadas: [${tried}]. ` +
      `Editor: ${vscode.env.appName}. Plataforma: ${process.platform}.`
    );
  }

  appDir = resolvedDir;
  console.log('[Lynx Blur] appDir resuelto:', appDir);

  const JSFile = path.join(appDir, 'main.js');

  // VSCode 1.95+ fusiona ambos main.js en uno
  let ElectronJSFile = path.join(appDir, 'vs', 'code', 'electron-main', 'main.js');
  if (!fs.existsSync(ElectronJSFile)) ElectronJSFile = JSFile;

  // Buscar workbench.html (la ruta cambia entre versiones de VSCode)
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
// ─── Color Customizations (la pieza clave) ───────────────────────────────────

/**
 * Aplica colorCustomizations para hacer los backgrounds transparentes.
 * Guarda los valores originales en globalState para poder restaurarlos.
 */
async function applyColorCustomizations(context) {
  const config = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = inspect?.globalValue || {};

  // Guardar los originales si no se han guardado antes
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

  // Calcular colores transparentes
  const alphaHex = (opacity) => Math.round(opacity * 255).toString(16).padStart(2, '0');
  const newColors = { ...current };

  // Transparentes puros (#RRGGBB00)
  for (const key of TRANSPARENT_BG_KEYS) {
    newColors[key] = `#${THEME_BG}00`;
  }

  // Semi-transparentes (#RRGGBBAA)
  for (const key of SEMITRANSPARENT_BG_KEYS) {
    newColors[key] = `#${THEME_BG}${alphaHex(DEFAULT_OPACITY)}`;
  }

  // Semi-opacos (#RRGGBBE6 ≈ 0.9)
  for (const key of OPAQUE_BG_KEYS) {
    newColors[key] = `#${THEME_BG}${alphaHex(0.9)}`;
  }

  newColors['terminal.background'] = '#00000000';

  await config.update('workbench.colorCustomizations', newColors, vscode.ConfigurationTarget.Global);
}

/**
 * Restaura los colorCustomizations originales del usuario.
 */
async function restoreColorCustomizations(context) {
  const saved = context.globalState.get('lynxBlurOriginalColors');
  if (!saved) return;

  const config = vscode.workspace.getConfiguration();
  const inspect = config.inspect('workbench.colorCustomizations');
  const current = { ...(inspect?.globalValue || {}) };

  // Restaurar o eliminar cada key
  for (const key of ALL_BG_KEYS) {
    if (saved[key] !== null && saved[key] !== undefined) {
      current[key] = saved[key];
    } else {
      delete current[key];
    }
  }

  // Restaurar terminal background
  if (saved['terminal.background'] !== null && saved['terminal.background'] !== undefined) {
    current['terminal.background'] = saved['terminal.background'];
  } else {
    delete current['terminal.background'];
  }

  await config.update('workbench.colorCustomizations', current, vscode.ConfigurationTarget.Global);

  // Restaurar GPU acceleration
  if (saved['terminal.integrated.gpuAcceleration'] !== undefined) {
    await config.update('terminal.integrated.gpuAcceleration',
      saved['terminal.integrated.gpuAcceleration'], vscode.ConfigurationTarget.Global);
  } else {
    await config.update('terminal.integrated.gpuAcceleration', undefined, vscode.ConfigurationTarget.Global);
  }

  await context.globalState.update('lynxBlurOriginalColors', undefined);
}

// ─── Reinicio limpio (setsid + nohup) ────────────────────────────────────────

async function promptRestart(setControlsStyle) {
  // Aplicar / limpiar window.controlsStyle
  try {
    const value = setControlsStyle ? 'custom' : undefined;
    await vscode.workspace.getConfiguration()
      .update('window.controlsStyle', value, vscode.ConfigurationTarget.Global);
  } catch { /* setting no disponible en esta versión */ }

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

// ─── Instalación ──────────────────────────────────────────────────────────────

async function install(context) {
  if (_installing) return;
  _installing = true;

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry } =
    resolveVSCodePaths();

  // Verificar que los archivos clave existen (mostrar diagnóstico si fallan)
  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    const info = `JSFile: ${JSFile} (${fs.existsSync(JSFile) ? '✓' : '✗'}) | HTMLFile: ${HTMLFile} (${fs.existsSync(HTMLFile) ? '✓' : '✗'})`;
    console.error('[Lynx Blur][Linux] Archivos no encontrados:', info);
    vscode.window.showErrorMessage(
      `[Lynx Blur] Archivos de VSCode no encontrados. Editor: ${vscode.env.appName}. ` +
      `Si usas un fork de VSCode, abre un issue. Detalle: ${info}`
    );
    _installing = false;
    return;
  }

  // Verificar si se necesita elevación
  const elevationNeeded = checkNeedsElevation(appDir);

  if (elevationNeeded === 'snap' || elevationNeeded === 'flatpak') {
    const kind = elevationNeeded === 'flatpak' ? 'Flatpak' : 'Snap';
    vscode.window.showErrorMessage(
      `[Lynx Blur] ${kind} no soportado — instala VSCode como .deb para usar este efecto.`,
      { title: '📥 Descargar .deb' }
    ).then(msg => {
      if (msg) vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/download'));
    });
    _installing = false;
    return;
  }

  if (elevationNeeded && hasNoNewPrivs()) {
    vscode.window.showErrorMessage('[Lynx Blur] No es posible elevar permisos en esta sesión. Reinicia VSCode normalmente e intenta de nuevo.');
    _installing = false;
    return;
  }

  if (elevationNeeded && !hasPkexec()) {
    vscode.window.showErrorMessage('[Lynx Blur] Se requiere pkexec (Polkit) para escribir en el directorio de VSCode. Instálalo e intenta de nuevo.');
    _installing = false;
    return;
  }

  if (elevationNeeded) {
    const choice = await vscode.window.showWarningMessage(
      '[Lynx Blur] Se necesitan permisos de administrador para aplicar el efecto transparencia. ¿Continuar?',
      { title: 'Sí, continuar' },
      { title: 'Cancelar' }
    );
    if (!choice || choice.title === 'Cancelar') { _installing = false; return; }
  }

  const writer = new StagedFileWriter(elevationNeeded);
  await writer.init();

  try {
    // 1. Copiar runtime al directorio de VSCode
    if (fs.existsSync(runtimeDir)) await writer.rmdir(runtimeDir);
    await writer.mkdir(runtimeDir);
    await writer.copyDir(runtimeSrcDir, runtimeDir);

    // 2. Parchear ElectronJSFile (frame:false + transparent:true)
    let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
    electronJS = injectElectronOptions(electronJS);
    await writer.writeFile(ElectronJSFile, electronJS, 'utf-8');

    // 3. Parchear main.js (inyectar runtime)
    const themeCSS = await fsPromises.readFile(
      path.resolve(__dirname, '../css/lynx-blur.css'), 'utf-8'
    );
    const injectData = {
      os: 'linux',
      themeCSS,
      config: { refreshInterval: 1000, preventFlash: false },
    };
    let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
    mainJS = generateNewJS(mainJS, __filename, injectData, runtimeEntry);
    await writer.writeFile(JSFile, mainJS, 'utf-8');

    // 4. Parchear workbench.html (CSP)
    const html = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) await writer.writeFile(HTMLFile, patchedHTML, 'utf-8');

    // 5. Flush (copia elevada si es necesario)
    await writer.flush();

    // 6. Aplicar colorCustomizations para hacer los backgrounds transparentes
    await applyColorCustomizations(context);

    // 7. Desactivar GPU acceleration del terminal (artefactos visuales)
    try {
      await vscode.workspace.getConfiguration()
        .update('terminal.integrated.gpuAcceleration', 'off', vscode.ConfigurationTarget.Global);
    } catch {}

    // 8. Guardar estado instalado
    await context.globalState.update('lynxBlurInstalled', true);

    // 9. Pedir reinicio
    vscode.window.showInformationMessage(
      '✅ [Lynx Blur] Efecto transparencia instalado. Reinicia VSCode para activarlo.',
      { title: 'Reiniciar ahora' }
    ).then(msg => { if (msg) promptRestart(true); });

  } catch (error) {
    writer.cleanup();
    console.error('[Lynx Blur][Linux] Error en instalación:', error);

    if (error.message === 'no_new_privs') {
      vscode.window.showErrorMessage('[Lynx Blur] No se puede elevar permisos en esta sesión. Reinicia VSCode e intenta de nuevo.');
    } else if (error.code === 'EACCES' || error.code === 'EPERM') {
      vscode.window.showErrorMessage(`[Lynx Blur] Sin permisos para escribir: ${error.message}`);
    } else {
      vscode.window.showErrorMessage(`[Lynx Blur] Error inesperado: ${error.message}`);
    }
  } finally {
    _installing = false;
  }
}

// ─── Desinstalación ───────────────────────────────────────────────────────────

async function uninstall(context) {
  if (_installing) return;
  _installing = true;

  // Restaurar colorCustomizations ANTES de tocar archivos
  await restoreColorCustomizations(context);

  const { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir } = resolveVSCodePaths();

  const elevationNeeded = checkNeedsElevation(appDir);
  if (elevationNeeded === 'snap') { _installing = false; return; }

  const writer = new StagedFileWriter(elevationNeeded);
  await writer.init();

  try {
    // 1. Limpiar marcadores de main.js
    if (fs.existsSync(JSFile)) {
      let mainJS = await fsPromises.readFile(JSFile, 'utf-8');
      const { result, hadMarkers } = removeJSMarkers(mainJS);
      if (hadMarkers) await writer.writeFile(JSFile, result, 'utf-8');

      // En VSCode 1.95+ ElectronJSFile === JSFile, aplicar en el mismo buffer
      if (ElectronJSFile === JSFile) {
        const clean = removeElectronOptions(result);
        await writer.writeFile(JSFile, clean, 'utf-8');
      }
    }

    // 2. Limpiar ElectronJSFile si es diferente
    if (ElectronJSFile !== JSFile && fs.existsSync(ElectronJSFile)) {
      let electronJS = await fsPromises.readFile(ElectronJSFile, 'utf-8');
      await writer.writeFile(ElectronJSFile, removeElectronOptions(electronJS), 'utf-8');
    }

    // 3. Limpiar CSP de workbench.html
    if (fs.existsSync(HTMLFile)) {
      const html = await fsPromises.readFile(HTMLFile, 'utf-8');
      const cleaned = removeCSPPatch(html);
      if (cleaned !== html) await writer.writeFile(HTMLFile, cleaned, 'utf-8');
    }

    // 4. Eliminar directorio del runtime
    if (fs.existsSync(runtimeDir)) await writer.rmdir(runtimeDir);

    await writer.flush();
    await context.globalState.update('lynxBlurInstalled', false);

    vscode.window.showInformationMessage(
      '🔄 [Lynx Blur] Efecto transparencia eliminado. Reinicia VSCode.',
      { title: 'Reiniciar ahora' }
    ).then(msg => { if (msg) promptRestart(false); });

  } catch (error) {
    writer.cleanup();
    console.error('[Lynx Blur][Linux] Error en desinstalación:', error);
    vscode.window.showErrorMessage(`[Lynx Blur] Error al desinstalar: ${error.message}`);
  } finally {
    _installing = false;
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

async function handleActivation(context) {
  const alreadyInstalled = context.globalState.get('lynxBlurInstalled', false);
  if (alreadyInstalled) {
    console.log('[Lynx Blur][Linux] Ya instalado — sin acción necesaria.');
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
