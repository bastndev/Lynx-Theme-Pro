/**
 * runtime/methods/index.mjs — Exporta ambos métodos de transparencia
 *
 * Selección del método:
 *   - 'interval'  → Timer periódico (default, menos agresivo)
 *   - 'overwrite' → Sobrescritura directa (cuando preventFlash = true)
 *
 * El método se elige en inject.mjs según app.config.preventFlash
 */

import interval from './interval.mjs';
import overwrite from './overwrite.mjs';

export interface TransparencyEffects {
  install(): void;
  uninstall(): void;
}

export type TransparencyMethodMap = Record<'interval' | 'overwrite', TransparencyEffects>;

export default (window: Electron.BrowserWindow): TransparencyMethodMap => ({
  interval: interval(window),
  overwrite: overwrite(window),
});
