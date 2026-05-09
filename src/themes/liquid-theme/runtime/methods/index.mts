import interval from './interval.mjs';
import overwrite from './overwrite.mjs';

export interface TransparencyEffects {
  install(): void;
  uninstall(): void;
}

export type TransparencyMethodMap = Record<'interval' | 'overwrite', TransparencyEffects>;

export default (window: Electron.BrowserWindow): TransparencyMethodMap => ({
  interval:  interval(window),
  overwrite: overwrite(window),
});
