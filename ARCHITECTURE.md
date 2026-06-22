# 🏗️ Lynx Theme Pro — Architecture

A VS Code extension that ships **8 themes**, a **1280+ SVG icon pack**, and an experimental **Glassmorphism blur engine**.

---

## 📁 Project Structure

```text
Lynx-Theme-Pro/
├── .vscode/                             # Editor workspace settings
├── src/
│   ├── themes/                          # 8 theme JSONs + Liquid (blur) engine
│   │   ├── 01_Lynx-Dark-theme.json
│   │   ├── 02_Lynx-Light-theme.json
│   │   ├── 03_Lynx-Night-theme.json
│   │   ├── 04_Lynx-Ghibli-theme.json
│   │   ├── 05_Lynx-Fury-theme.json
│   │   ├── 06_Lynx-Kiro-theme.json
│   │   ├── 07_Lynx-NVIM-theme.json
│   │   ├── 08_Lynx-Liquid-theme.json
│   │   └── liquid-theme/                # 🧪 Glassmorphism engine (TS)
│   │       ├── css/                     # Per-OS CSS patches
│   │       ├── platforms/               # OS detection & integration
│   │       ├── runtime/                 # Injection + activation
│   │       ├── utils/                   # Shared helpers
│   │       └── liquid-theme.ts          # Entry point
│   ├── icons/                           # Icon system (JSON configs)
│   │   ├── icon-system/                 # IDE chrome icons (material/test)
│   │   └── icon-themes/                 # File/folder icon themes
│   │       ├── lynx-icons-dark.json     # Style A — dark variant
│   │       ├── lynx-icons-light.json    # Style B — light variant
│   │       └── lynx-icons-gray.json     # Style C — gray variant
│   ├── assets/
│   │   ├── svg/                         # 1280+ SVG icon files
│   │   └── woff/                        # Font assets
│   ├── types/                           # Shared TypeScript types
│   └── __test__/                        # Unit tests
├── public/                              # Marketing & docs (excluded from VSIX)
│   ├── banner.webp                      # README banner
│   ├── docs/                            # Translated READMEs (11 languages)
│   │   └── README_AR / DE / ES / FR / HI / JA / KO / PT / RU / VI / ZH
│   └── github/
│       ├── icon/                        # Marketplace badges & icons
│       ├── images/                      # Marketing images
│       └── screenshots/                 # Theme & icon previews
├── dist/                                # esbuild output (gitignored)
├── .gitattributes
├── .gitignore
├── .prettierignore
├── .vscodeignore                        # Controls what ships in the VSIX bundle
├── AGENTS.md                            # Build commands & conventions
├── ARCHITECTURE.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE                              # MIT
├── README.md
├── bun.lock                             # Bun lockfile
├── esbuild.js                           # Bundler config
├── eslint.config.mjs                    # Lint rules
├── icon.png                             # Extension marketplace icon
├── package.json                         # Extension manifest & contributes
├── package.nls.json                     # Default UI strings (en)
├── package.nls.{ar,de,es,fr,hi,ja,ko,pt-br,ru,vi,zh-cn}.json   # i18n
├── tsconfig.json                        # TypeScript config
└── vsc-extension-quickstart.md
```

---

## 🎨 The 8 Themes

| # | Theme | Type |
| :- | :---- | :--- |
| 1 | **DARK** | Dark |
| 2 | **LIGHT** | Light |
| 3 | **NIGHT** | Dark |
| 4 | **GHIBLI** | Dark |
| 5 | **FURY** | Dark |
| 6 | **KIRO** | Dark |
| 7 | **NVIM** | Dark |
| 8 | **BLUR** 🧪 | Dark + Glass |

The `01_` prefix isn't decoration — VS Code sorts the theme picker alphabetically, so the numeric prefixes guarantee display order.

---

## 🖼️ The Icon System

`src/icons/` maps the SVGs in `src/assets/svg/` to file extensions and UI regions. It exposes **three file/folder styles** (A, B, C) plus a **System** set for IDE chrome. All styles share the same SVG pool.

| Style | Target |
| :---- | :----- |
| **System** | Activity bar, sidebar, explorer chrome |
| **A / B / C** | File and folder icons (three looks) |

---

## 🔬 The Blur Engine

VS Code has no native API for window-level blur, so the Blur Engine **injects CSS directly into the workbench**.

```text
blur-theme.js
├── Detect OS (Linux / macOS / Windows)
├── Pick the CSS template for that OS
├── Inject CSS into the active window
└── Persist enable/disable state
```

> [!WARNING]
> Patching the workbench is unsupported by Microsoft and may trigger the "installation appears to be corrupt" warning. Cosmetic only — the extension still works.

---

## 📦 What VS Code Loads

`package.json` is the single source of truth. It declares the 8 themes and 4 icon themes via `contributes`. The `.vscodeignore` file strips `public/` and dev configs from the published VSIX bundle.

---

## 🧩 Companion Extensions

| Extension | Purpose |
| :-------- | :------ |
| [ATM](https://github.com/bastndev/ATM) | Error Lens, Git Blame, Env Protection, screenshots |
| [Lynx Keymap Pro](https://github.com/bastndev/Lynx-Keymap-Pro) | Unified keyboard shortcuts |
| [Compare Code](https://github.com/bastndev/Compare-Code) | Side-by-side code diffing |

---

<sub>Maintained by [Gohit X](https://gohit.xyz) · Extension ID: `bastndev.lynx-theme` · MIT</sub>
