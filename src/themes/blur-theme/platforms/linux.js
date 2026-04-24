// platforms/linux.js — Implementación completa del Blur Theme para Linux
//
// Pipeline de instalación:
//   1. Detectar appDir (directorio de recursos de VSCode)
//   2. Resolver rutas: JSFile, ElectronJSFile, HTMLFile
//   3. Verificar elevación (pkexec si el directorio no es escribible)
//   4. Copiar runtime/ al directorio de VSCode
//   5. Parchear ElectronJSFile: frame:false + transparent:true
//   6. Parchear JSFile: inyectar marcadores + import del runtime
//   7. Parchear HTMLFile (workbench.html): CSP trusted-types
//   8. Aplicar setting window.controlsStyle = "custom"
//   9. Reiniciar VSCode con setsid + nohup

'use strict';
const vscode      = require('vscode');
const fs          = require('fs');
const fsPromises  = require('fs').promises;
const path        = require('path');
const os          = require('os');
const { spawn }   = require('child_process');

const {
  generateNewJS, removeJSMarkers,
  injectElectronOptions, removeElectronOptions,
  patchCSP, removeCSPPatch,
} = require('../utils/file-transforms');

const {
  checkNeedsElevation, hasPkexec, hasNoNewPrivs, StagedFileWriter,
} = require('../utils/elevated-file-writer');

// ─── Constantes ───────────────────────────────────────────────────────────────

const RUNTIME_VERSION = 'v1';
const RUNTIME_DIR_NAME = `lynx-blur-runtime-${RUNTIME_VERSION}`;

// Nombre del CLI por editor (para el reinicio)
const CLI_COMMANDS = {
  'Visual Studio Code':           'code',
  'Visual Studio Code - Insiders':'code-insiders',
  'VSCodium':                     'codium',
  'Cursor':                       'cursor',
  'Code - OSS':                   'code-oss',
};

// ─── Estado en memoria ────────────────────────────────────────────────────────

let _installing = false;  // Mutex para evitar instalaciones concurrentes

// ─── Helpers de rutas ─────────────────────────────────────────────────────────

function resolveVSCodePaths() {
  let appDir;
  try {
    appDir = path.dirname(require.main.filename);
  } catch {
    // Fallback: navegar desde el ejecutable de Electron
    appDir = path.join(path.dirname(process.execPath), 'resources', 'app');
  }

  const JSFile = path.join(appDir, 'main.js');

  // VSCode 1.95+ fusiona ambos main.js en uno
  let ElectronJSFile = path.join(appDir, 'vs', 'code', 'electron-main', 'main.js');
  if (!fs.existsSync(ElectronJSFile)) ElectronJSFile = JSFile;

  // Buscar workbench.html (la ruta cambia entre versiones)
  const htmlCandidates = [
    path.join(appDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.html'),
    path.join(appDir, 'vs', 'code', 'electron-browser',  'workbench', 'workbench.html'),
    path.join(appDir, 'vs', 'code', 'electron-sandbox', 'workbench', 'workbench.esm.html'),
  ];
  const HTMLFile = htmlCandidates.find(p => fs.existsSync(p)) || htmlCandidates[0];

  const runtimeDir     = path.join(appDir, RUNTIME_DIR_NAME);
  const runtimeSrcDir  = path.resolve(__dirname, '../runtime');
  const runtimeEntry   = path.join(runtimeDir, 'inject.mjs');

  return { appDir, JSFile, ElectronJSFile, HTMLFile, runtimeDir, runtimeSrcDir, runtimeEntry };
}

// ─── Reinicio limpio (setsid + nohup) ────────────────────────────────────────

async function promptRestart(setControlsStyle) {
  // Aplicar / limpiar window.controlsStyle
  try {
    const value = setControlsStyle ? 'custom' : undefined;
    await vscode.workspace.getConfiguration()
      .update('window.controlsStyle', value, vscode.ConfigurationTarget.Global);
  } catch { /* setting no disponible en esta versión */ }

  const cliName  = CLI_COMMANDS[vscode.env.appName] || 'code';
  const pid      = process.pid;
  const binName  = path.basename(process.execPath).replace(/'/g, "'\\''");

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

  // Verificar que los archivos clave existen
  if (!fs.existsSync(JSFile) || !fs.existsSync(HTMLFile)) {
    vscode.window.showErrorMessage('[Lynx Blur] No se encontraron los archivos de VSCode. Instalación cancelada.');
    _installing = false;
    return;
  }

  // Verificar si se necesita elevación
  const elevationNeeded = checkNeedsElevation(appDir);

  if (elevationNeeded === 'snap') {
    vscode.window.showErrorMessage('[Lynx Blur] Las instalaciones Snap son de solo lectura. El efecto blur no puede aplicarse.');
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
    const html    = await fsPromises.readFile(HTMLFile, 'utf-8');
    const { result: patchedHTML, noMetaTag } = patchCSP(html);
    if (!noMetaTag) await writer.writeFile(HTMLFile, patchedHTML, 'utf-8');

    // 5. Flush (copia elevada si es necesario)
    await writer.flush();

    // 6. Guardar estado instalado
    await context.globalState.update('lynxBlurInstalled', true);

    // 7. Pedir reinicio
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
      const html    = await fsPromises.readFile(HTMLFile, 'utf-8');
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
