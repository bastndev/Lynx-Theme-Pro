const { pathToFileURL } = require('url');

const LYNX_BLUR_START = '/* !! LYNX-BLUR-START !! */';
const LYNX_BLUR_END   = '/* !! LYNX-BLUR-END !! */';
const MARKER_REGEX    = /\n\/\* !! LYNX-BLUR-START !! \*\/[\s\S]*?\/\* !! LYNX-BLUR-END !! \*\//;
const CSP_POLICY      = 'LynxBlurTheme';

/** Injects the Lynx Blur runtime into VSCode's main.js */
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

/** Removes Lynx Blur markers from main.js */
function removeJSMarkers(js) {
  return { result: js.replace(MARKER_REGEX, ''), hadMarkers: MARKER_REGEX.test(js) };
}

/** Injects frame:false + transparent:true into BrowserWindow options (Linux) */
function injectElectronOptions(electronJS) {
  if (electronJS.includes('frame:false,')) return electronJS;
  return electronJS.replace(
    /experimentalDarkMode/g,
    'frame:false,transparent:true,experimentalDarkMode'
  );
}

/** Removes the Linux-injected BrowserWindow options */
function removeElectronOptions(electronJS) {
  return electronJS.replace(
    /frame:false,transparent:true,experimentalDarkMode/g,
    'experimentalDarkMode'
  );
}

/**
 * Injects visualEffectState:"active" into BrowserWindow options (macOS).
 * This keeps the native vibrancy/blur active even when the window loses focus.
 * Does NOT inject frame:false — macOS uses its native window frame.
 */
function injectElectronOptionsMacOS(electronJS) {
  if (electronJS.includes('visualEffectState:')) return electronJS;
  return electronJS.replace(
    /experimentalDarkMode/g,
    'visualEffectState:"active",experimentalDarkMode'
  );
}

/** Removes the macOS-injected BrowserWindow options */
function removeElectronOptionsMacOS(electronJS) {
  return electronJS.replace(
    /visualEffectState:"active",experimentalDarkMode/g,
    'experimentalDarkMode'
  );
}

/** Adds LynxBlurTheme to the trusted-types CSP directive */
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

/** Removes LynxBlurTheme from the CSP */
function removeCSPPatch(html) {
  return html.replace(new RegExp(` ${CSP_POLICY}`, 'g'), '');
}

module.exports = {
  LYNX_BLUR_START, LYNX_BLUR_END, MARKER_REGEX, CSP_POLICY,
  generateNewJS, removeJSMarkers,
  // Linux
  injectElectronOptions, removeElectronOptions,
  // macOS
  injectElectronOptionsMacOS, removeElectronOptionsMacOS,
  patchCSP, removeCSPPatch,
};
