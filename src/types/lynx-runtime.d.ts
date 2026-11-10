declare namespace Electron {
  interface BrowserWindow {
    isDestroyed(): boolean;
    setBackgroundColor(color: string): void;
    setVibrancy(type: string): void;
    getBounds(): { width: number; height: number; x: number; y: number };
    setBounds(bounds: Partial<{ width: number; height: number; x: number; y: number }>): void;
    on(event: 'closed', listener: () => void): void;
    webContents: {
      isDestroyed(): boolean;
      getURL(): string;
      on(event: 'dom-ready', listener: () => void): void;
      on(event: 'did-create-window', listener: (
        window: BrowserWindow,
        details: { url: string; options: { transparent?: boolean } },
      ) => void): void;
      on(event: 'did-start-navigation', listener: (
        event: unknown, url: string, isInPlace: boolean, isMainFrame: boolean,
      ) => void): void;
      executeJavaScript(script: string): Promise<unknown>;
      insertCSS(css: string): Promise<string>;
      removeInsertedCSS(key: string): Promise<void>;
    };
  }
}

declare module 'electron' {
  interface App {
    on(event: 'browser-window-created', listener: (event: unknown, window: Electron.BrowserWindow) => void): void;
  }

  const electron: {
    app: App;
  };

  export default electron;
}

// Runtime data injected into VS Code's Electron main process.
declare var lynx_liquid_plugin: {
  os: 'linux' | 'macos' | 'windows';
  themeCSS: string;
  vibrancyType?: string;
  config?: {
    refreshInterval: number;
    preventFlash: boolean;
  };
} | undefined;
