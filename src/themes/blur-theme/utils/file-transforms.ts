import { pathToFileURL } from 'url';

export const LYNX_BLUR_START = '/* !! LYNX-BLUR-START !! */';
export const LYNX_BLUR_END   = '/* !! LYNX-BLUR-END !! */';
export const MARKER_REGEX    = /\n\/\* !! LYNX-BLUR-START !! \*\/[\s\S]*?\/\* !! LYNX-BLUR-END !! \*\//;
export const CSP_POLICY      = 'LynxBlurTheme';

export interface LynxBlurInjectData {
  os: 'linux' | 'macos' | 'windows';
  themeCSS: string;
  vibrancyType?: string;
  config: {
    refreshInterval: number;
    preventFlash: boolean;
  };
}

export interface RemoveMarkersResult {
  result: string;
  hadMarkers: boolean;
}

export interface PatchCSPResult {
  result: string;
  alreadyPatched: boolean;
  noMetaTag: boolean;
}

/** Injects the Lynx Blur runtime into VSCode's main.js */
export function generateNewJS(
  js: string,
  base: string,
  injectData: LynxBlurInjectData,
  runtimePath: string,
): string {
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
export function removeJSMarkers(js: string): RemoveMarkersResult {
  return { result: js.replace(MARKER_REGEX, ''), hadMarkers: MARKER_REGEX.test(js) };
}

/** Injects frame:false + transparent:true into BrowserWindow options (Linux) */
export function injectElectronOptions(electronJS: string): string {
  if (electronJS.includes('frame:false,')) {return electronJS;}
  return electronJS.replace(
    /experimentalDarkMode/g,
    'frame:false,transparent:true,experimentalDarkMode'
  );
}

/** Removes the Linux-injected BrowserWindow options */
export function removeElectronOptions(electronJS: string): string {
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
export function injectElectronOptionsMacOS(electronJS: string): string {
  if (electronJS.includes('visualEffectState:')) {return electronJS;}
  return electronJS.replace(
    /experimentalDarkMode/g,
    'visualEffectState:"active",experimentalDarkMode'
  );
}

/** Removes the macOS-injected BrowserWindow options */
export function removeElectronOptionsMacOS(electronJS: string): string {
  return electronJS.replace(
    /visualEffectState:"active",experimentalDarkMode/g,
    'experimentalDarkMode'
  );
}

/** Adds LynxBlurTheme to the trusted-types CSP directive */
export function patchCSP(html: string): PatchCSPResult {
  const re    = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([\s\S]+?)">/;
  const match = html.match(re);
  if (!match) {return { result: html, alreadyPatched: false, noMetaTag: true };}

  const csp = match[1];
  if (csp.includes(CSP_POLICY)) {return { result: html, alreadyPatched: true, noMetaTag: false };}

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
export function removeCSPPatch(html: string): string {
  return html.replace(new RegExp(` ${CSP_POLICY}`, 'g'), '');
}
