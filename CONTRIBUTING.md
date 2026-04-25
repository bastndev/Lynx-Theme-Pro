# Contributing to Lynx Theme Pro

Before contributing, read the **[Architecture Guide](https://github.com/bastndev/Lynx-Theme-Pro/blob/main/ARCHITECTURE.md)** — it explains how themes, icons, and the blur engine fit together.

---

## Quick Start

1. **[Fork the repository](https://github.com/bastndev/Lynx-Theme-Pro/fork)** on GitHub
2. Clone your fork and set up:

```bash
git clone https://github.com/YOUR-USERNAME/Lynx-Theme-Pro.git
cd Lynx-Theme-Pro
git checkout dev   # always work on dev
code .             # press F5 to test your changes live
```

> Submit all PRs to the `dev` branch of the original repo. Never edit `package.json` — that's maintainer-only.

---

## What You Can Contribute

<details>
<summary><strong>🎨 New or improved themes</strong></summary>

<br>

**Location:** `src/themes/`  
**Naming:** `Lynx-[Name]-theme.json`  
**Base type:** `vs-dark` (dark) or `vs` (light)

Copy an existing theme as your starting point. The numeric prefix (`01_`, `02_`…) controls the order in VS Code's theme picker — new themes don't need a prefix unless you're adjusting order.

Current themes for reference: DARK · LIGHT · NIGHT · GHIBLI · FURY · KIRO · NVIM · BLUR _(experimental)_

Test your theme with at least: TypeScript, Python, Dart, and Rust files.

</details>

<details>
<summary><strong>🖼️ New icons</strong></summary>

<br>

**SVG files:** `src/assets/svg/`  
**JSON mappings:** `src/icons/` (styles A, B, C)

Naming convention:

- `name-file.svg`
- `name-folder.svg` / `name-folder-open.svg`

Map your new SVG in the relevant style JSON under `fileExtensions`, `fileNames`, or `languageIds`.

</details>

<details>
<summary><strong>📝 Documentation</strong></summary>

<br>

Target files: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`.

Screenshots go in `public/screenshots/themes/` or `public/screenshots/icons/` and are referenced in the README via GitHub raw URLs. They are not bundled in the VSIX.

</details>

---

## Submitting a PR

Your PR description should include:

- **What** changed and why
- **Screenshots** if visual (highly recommended)
- Confirmation that you tested on at least 2–3 language files

---

## Need Help?

- **Bug or idea?** → [Open an issue](https://github.com/bastndev/Lynx-Theme-Pro/issues)
- **Architecture questions?** → [ARCHITECTURE.md](https://github.com/bastndev/Lynx-Theme-Pro/blob/main/ARCHITECTURE.md)
- **VS Code theme API** → [code.visualstudio.com/api](https://code.visualstudio.com/api/extension-guides/color-theme)
- **Contact** → bastndev@gohit.xyz

Please follow our [Code of Conduct](https://github.com/bastndev/Lynx-Theme-Pro/blob/main/CODE_OF_CONDUCT.md).

---

<sub>Maintained by [Gohit X](https://gohit.xyz) · Licensed under MIT</sub>
