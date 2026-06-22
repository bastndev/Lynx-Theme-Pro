# 🏗️ Lynx Theme Pro — Architecture

A VS Code extension that ships **8 themes**, a **1280+ SVG icon pack**, and an experimental **Glassmorphism blur engine**.

---

## 📁 Project Structure

```text
Lynx-Theme-Pro/
├── src/
│   ├── themes/          # 8 theme JSONs + blur engine
│   │   ├── 01_dark … 07_nvim
│   │   └── blur-theme/  # 🧪 JS/CSS injection engine
│   ├── icons/           # 3 file/folder styles (A, B, C) + System
│   └── assets/
│       ├── svg/         # 1280+ SVG icons
│       └── woff/        # Font assets
├── public/              # Screenshots & marketing (excluded from VSIX)
├── package.json         # Extension manifest
└── .vscodeignore        # VSIX bundle rules
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
