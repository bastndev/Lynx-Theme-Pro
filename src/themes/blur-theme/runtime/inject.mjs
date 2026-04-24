/**
 * runtime/inject.mjs — Runtime inyectado en el proceso Electron de VSCode
 *
 * Este archivo es importado DENTRO del main.js de VSCode (no en la extensión).
 * Se ejecuta en el contexto del proceso principal de Electron al arrancar VSCode.
 *
 * Responsabilidades:
 *   1. Escuchar 'browser-window-created' para atrapar la ventana principal
 *   2. Fijar el fondo a #00000000 (completamente transparente)
 *   3. Mantener ese fondo via interval o overwrite (VSCode lo revierte internamente)
 *   4. Inyectar el CSS del tema Lynx Blur al DOM de la ventana
 *
 * TODO (Fase 2): Implementar cuerpo completo
 *   - import transparencyMethods from './methods/index.mjs'
 *   - electron.app.on('browser-window-created', ...)
 *   - window.setBackgroundColor('#00000000')
 *   - effects.install()
 *   - injectHTML(window) con lynx-blur.css embebido
 */

// Datos inyectados por blur-theme.js al momento de parchear main.js
// Estarán disponibles como global.lynx_blur_plugin
const app = global.lynx_blur_plugin;

// --- STUB ---
// El cuerpo real se implementará en la Fase 2.
// Por ahora este archivo es un placeholder que define la interfaz esperada.

console.log('[Lynx Blur Runtime] inject.mjs cargado — os:', app?.os ?? 'desconocido');
