import { pathToFileURL } from 'url';

export const LYNX_BLUR_START = '/* !! LYNX-LIQUID-START !! */';
export const LYNX_BLUR_END   = '/* !! LYNX-LIQUID-END !! */';
export const MARKER_REGEX    = /\n\/\* !! LYNX-LIQUID-START !! \*\/[\s\S]*?\/\* !! LYNX-LIQUID-END !! \*\//;
export const CSP_POLICY      = 'LynxLiquidTheme';

export interface LynxLiquidInjectData {
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
  noMetaTag: boolean;
}

// ─── main.js injection ────────────────────────────────────────────────────────

export function generateNewJS(
  js: string,
  base: string,
  injectData: LynxLiquidInjectData,
  runtimePath: string,
): string {
  const cleaned    = js.replace(MARKER_REGEX, '');
  const runtimeUrl = pathToFileURL(runtimePath).toString();
  return (
    cleaned +
    `\n${LYNX_BLUR_START}\n;(function(){\n` +
    `try { if (!require('fs').existsSync(${JSON.stringify(base)})) return; } catch(e){}\n` +
    `global.lynx_liquid_plugin = ${JSON.stringify(injectData)};\n` +
    `try { import(${JSON.stringify(runtimeUrl)}); } catch(e){ console.error('[LynxLiquid]',e); }\n` +
    `})();\n${LYNX_BLUR_END}`
  );
}

export function removeJSMarkers(js: string): RemoveMarkersResult {
  return { result: js.replace(MARKER_REGEX, ''), hadMarkers: MARKER_REGEX.test(js) };
}

// ─── BrowserWindow options — Linux / Windows ──────────────────────────────────

export function injectElectronOptions(electronJS: string): string {
  if (electronJS.includes('frame:false,')) {return electronJS;}
  return electronJS.replace(
    /experimentalDarkMode/g,
    'frame:false,transparent:true,experimentalDarkMode'
  );
}

export function removeElectronOptions(electronJS: string): string {
  return electronJS.replace(
    /frame:false,transparent:true,experimentalDarkMode/g,
    'experimentalDarkMode'
  );
}

// ─── BrowserWindow options — macOS ────────────────────────────────────────────

export function injectElectronOptionsMacOS(electronJS: string): string {
  if (electronJS.includes('visualEffectState:')) {return electronJS;}
  return electronJS.replace(
    /experimentalDarkMode/g,
    'visualEffectState:"active",experimentalDarkMode'
  );
}

export function removeElectronOptionsMacOS(electronJS: string): string {
  return electronJS.replace(
    /visualEffectState:"active",experimentalDarkMode/g,
    'experimentalDarkMode'
  );
}

// ─── CSP patch ────────────────────────────────────────────────────────────────

export function patchCSP(html: string): PatchCSPResult {
  const re    = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([\s\S]+?)">/;
  const match = html.match(re);
  if (!match) {return { result: html, noMetaTag: true };}

  const csp = match[1];
  if (csp.includes(CSP_POLICY)) {return { result: html, noMetaTag: false };}

  const newCsp = csp.includes('trusted-types')
    ? csp.replace(/(?<!-)trusted-types(?!-)/, `trusted-types ${CSP_POLICY}`)
    : csp.replace(/;?\s*$/, `; trusted-types ${CSP_POLICY}`);

  return {
    result: html.replace(match[0], match[0].replace(csp, newCsp)),
    noMetaTag: false,
  };
}

export function removeCSPPatch(html: string): string {
  return html.replace(new RegExp(` ${CSP_POLICY}`, 'g'), '');
}
