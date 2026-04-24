'use strict';
const { pathToFileURL } = require('url');

const LYNX_BLUR_START = '/* !! LYNX-BLUR-START !! */';
const LYNX_BLUR_END   = '/* !! LYNX-BLUR-END !! */';
const MARKER_REGEX    = /\n\/\* !! LYNX-BLUR-START !! \*\/[\s\S]*?\/\* !! LYNX-BLUR-END !! \*\//;
const CSP_POLICY      = 'LynxBlurTheme';

/** Inyecta el runtime de Lynx Blur en el main.js de VSCode */
function generateNewJS(js, base, injectData, runtimePath) {
  const cleaned    = js.replace(MARKER_REGEX, '');
  const runtimeUrl = pathToFileURL(runtimePath).toString();
  return (
    cleaned +
    `\n${LYNX_BLUR_START}\n;(function(){\n` +
    `try { if (!require('fs').existsSync(${JSON.stringify(base)})) return; } catch(e){}\n` +
    `global.lynx_blur_plugin = ${JSON.stringify(injectData)};\n` +
    `try { import(${JSON.stringify(runtimeUrl)}); } catch(e){ console.error('[LynxBlur]',e); }\n` +
    `})();\n${LYNX_BLUR_END}`
  );
}

/** Elimina marcadores de Lynx Blur del main.js */
function removeJSMarkers(js) {
  return { result: js.replace(MARKER_REGEX, ''), hadMarkers: MARKER_REGEX.test(js) };
}

/** Inyecta frame:false + transparent:true en las opciones de BrowserWindow (Linux) */
function injectElectronOptions(electronJS) {
  if (electronJS.includes('frame:false,')) return electronJS;
  return electronJS.replace(
    /experimentalDarkMode/g,
    'frame:false,transparent:true,experimentalDarkMode'
  );
}

/** Elimina las opciones inyectadas de BrowserWindow */
function removeElectronOptions(electronJS) {
  return electronJS.replace(
    /frame:false,transparent:true,experimentalDarkMode/g,
    'experimentalDarkMode'
  );
}

/** Añade LynxBlurTheme a la directiva trusted-types del CSP */
function patchCSP(html) {
  const re    = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([\s\S]+?)">/;
  const match = html.match(re);
  if (!match) return { result: html, alreadyPatched: false, noMetaTag: true };

  const csp = match[1];
  if (csp.includes(CSP_POLICY)) return { result: html, alreadyPatched: true, noMetaTag: false };

  const newCsp = csp.includes('trusted-types')
    ? csp.replace(/(?<!-)trusted-types(?!-)/, `trusted-types ${CSP_POLICY}`)
    : csp.replace(/;?\s*$/, `; trusted-types ${CSP_POLICY}`);

  return {
    result: html.replace(match[0], match[0].replace(csp, newCsp)),
    alreadyPatched: false,
    noMetaTag: false,
  };
}

/** Elimina LynxBlurTheme del CSP */
function removeCSPPatch(html) {
  return html.replace(new RegExp(` ${CSP_POLICY}`, 'g'), '');
}

module.exports = {
  LYNX_BLUR_START, LYNX_BLUR_END, MARKER_REGEX, CSP_POLICY,
  generateNewJS, removeJSMarkers,
  injectElectronOptions, removeElectronOptions,
  patchCSP, removeCSPPatch,
};
