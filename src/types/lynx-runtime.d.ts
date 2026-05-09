declare namespace Electron {
  interface BrowserWindow {
    setBackgroundColor(color: string): void;
    setVibrancy(type: string): void;
    getBounds(): { width: number; height: number; x: number; y: number };
    setBounds(bounds: Partial<{ width: number; height: number; x: number; y: number }>): void;
    on(event: 'closed', listener: () => void): void;
    webContents: {
      getURL(): string;
      on(event: 'dom-ready', listener: () => void): void;
      executeJavaScript(script: string): Promise<unknown>;
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
