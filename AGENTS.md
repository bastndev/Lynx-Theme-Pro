# AGENTS.md

## Build Commands

```bash
npm run compile    # development build → dist/
npm run watch      # watch mode
npm run package    # production build (runs vscode:prepublish)
npm run lint       # eslint
npm run check-types # tsc --noEmit
```

**Order matters**: lint → check-types → compile/package before testing.

## Architecture

- 7 of 8 themes are **pure JSON** (`src/themes/01_Lynx-*.json`). Only the **BLUR theme** (8th) has TypeScript code.
- BLUR theme entry point: `dist/themes/blur-theme/blur-theme.js` (compiled from `src/themes/blur-theme/blur-theme.ts`)
- The BLUR theme also runs code in VS Code's **Electron main process** via `runtime/inject.mts` — this is NOT extension host code.

## esbuild Build Split

`esbuild.js` produces **two separate outputs**:

| Output | Format | Extension | Source |
|--------|--------|-----------|--------|
| Extension host | CJS | `.js` | `src/themes/blur-theme/**/*.ts` (except `runtime/`) |
| Electron runtime | ESM | `.mjs` | `src/themes/blur-theme/runtime/**/*.mts` |

CSS files from `src/themes/blur-theme/css/` are copied to `dist/` after each build.

## Theme Naming

The numeric prefix (`01_`–`08_`) is intentional — it controls alphabetical sort order in VS Code's theme picker. Do not remove or reorder existing prefixes without good reason.

## Icons

Icon themes are defined in `src/icons/`. All three file-icon styles (A/B/C) and system icons share the same underlying SVG pool at `src/assets/svg/` (1280+ files).

## No Test Suite

This project has no test framework configured. Verification is manual: install the extension in VS Code and inspect themes visually across multiple language files.

## Branch & PR Conventions

- Work on `dev` branch
- PRs target `dev` branch of the original repo
- Do not edit `package.json` — maintainer-only

## BLUR Theme Warning

The BLUR theme injects CSS directly into VS Code's workbench DOM. This is unsupported by Microsoft and may produce a "corrupt installation" cosmetic warning. It functions normally despite this.
