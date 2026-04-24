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

export default (window) => ({
  interval: interval(window),
  overwrite: overwrite(window),
});
