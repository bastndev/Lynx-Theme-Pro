# Contributing to Lynx Theme Pro

## Welcome! 🌟

Thank you for your interest in contributing to **Lynx Theme Pro**! We're excited to have you join our community of developers and designers who are passionate about creating beautiful, productive coding environments.

Whether you want to improve existing themes, create new ones, add icons, or enhance documentation, your contributions are valuable and welcome.

## Understanding the Project 🏗️

Before diving into contributions, we recommend reading our [**Architecture Documentation**](https://github.com/bastndev/Lynx-Theme-Pro/blob/main/ARCHITECTURE.md) to understand:
- How the extension works internally
- The relationship between themes, icons, and VS Code
- File organization and naming conventions
- The overall project structure

This will help you make more effective contributions and understand where your changes fit in the bigger picture.

## Getting Started 🚀

### Prerequisites

- **Code editor** of your choice
- **Git** for version control
- No additional dependencies required - it's a pure theme extension!

### Setting Up Your Development Environment

1. **Fork the repository**: Click the "Fork" button on the [Lynx Theme Pro repository](https://github.com/bastndev/Lynx-Theme-Pro)

2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Lynx-Theme-Pro.git
   cd Lynx-Theme-Pro
   ```

3. **Switch to the dev branch**:
   ```bash
   git checkout dev
   ```

4. **Open in VS Code**:
   ```bash
   code .
   ```

## Development Workflow 🛠️

### Testing Your Changes

- **Press `F5`** to launch a new VS Code window with your theme loaded
- **Alternative**: If you have "Lynx Keymap Pro" extension, press `Alt+P`
- Test with different file types: **TypeScript**, **Python**, **Dart**, **Rust**

### Making Changes

1. **Create your changes** in the `dev` branch
2. **Test thoroughly** with multiple programming languages
3. **Commit your changes** with descriptive messages
4. **Push to your fork**:
   ```bash
   git push origin dev
   ```

## Types of Contributions 📝

### 1. Creating New Themes

**Location**: `./themes/`

**Naming Convention**: `Lynx-[YourThemeName]-theme.json`

**Examples**:
- `Lynx-Ocean-theme.json`
- `Lynx-Sunset-theme.json`
- `Lynx-Minimal-theme.json`

**Structure**: Follow the existing theme structure. You can use any existing theme as a template.

> 💡 **Sorting tip**: For display order control in VS Code, you can use prefixes like `x`, `y`, `z` (e.g., `Lynx-xOcean-theme.json`). See the [Architecture guide](https://github.com/bastndev/Lynx-Theme-Pro/blob/main/ARCHITECTURE.md) for more details.

### 2. Improving Existing Themes

You can enhance any of our current themes:
- **Lynx Dark** (`Lynx-Dark-theme.json`)
- **Lynx Light** (`Lynx-Light-theme.json`)
- **Lynx Night** (`Lynx-Night-theme.json`)
- **Lynx Ghibli** (`Lynx-xGhibli-theme.json`)
- **Lynx Coffee** (`Lynx-yCoffee-theme.json`)
- **Lynx Kiro** (`Lynx-zKiro-theme.json`)

### 3. Adding Icons

**Icon files location**: `./assets/icons/`

**Configuration**: `./icon-themes/lynx-pro-icons.json`

**Naming conventions**:
- Files: `name-file.svg`
- Folders: `name-folder.svg`
- Open folders: `name-folder-open.svg`

**Icon categories in the JSON**:
- `folderNames`: Specific folder names
- `folderNamesExpanded`: Opened folder states
- `fileExtensions`: File extensions (e.g., `.dart`, `.ts`)
- `fileNames`: Specific file names
- `languageIds`: Programming language identifiers
- `light`/`highContrast`: Theme variants

### 4. Documentation Improvements

We welcome improvements to:
- **README.md** - Main project documentation
- **CONTRIBUTING.md** - This guide
- **ARCHITECTURE.md** - Technical architecture documentation
- **CHANGELOG.md** - Version history
- Code comments and inline documentation

## Submitting Your Contribution 🎯

### Pull Request Requirements

When creating your PR, please include:

1. **Clear description** of what you've added/changed
2. **Theme information** (if adding a new theme):
   - Theme name
   - UI theme type: `vs-dark` (dark themes) or `vs` (light themes)
   - Brief description of the theme's style/inspiration

3. **Screenshots** (highly recommended):
   - Show your theme/icons in action
   - Include examples with different programming languages

### Testing Checklist

Before submitting, please test with:
- ✅ **TypeScript** files  
- ✅ **Python** files
- ✅ **Dart** files
- ✅ **Rust** files
- ✅ Different UI elements (sidebar, editor, terminal)
- ✅ Both file explorer and code syntax highlighting

## Important Notes ⚠️

### What NOT to Modify

- **`package.json`** - Only the maintainer updates this file for version releases and theme registration

### Code Formatting

When creating themes, please respect the existing structure and formatting. The project uses `.prettierignore` to maintain the specific formatting of theme files, so your themes won't be auto-formatted and will preserve their intended structure.

### Branch Strategy

- **Work in**: `dev` branch only
- **Submit PRs to**: `dev` branch
- The maintainer will merge `dev` → `main` for releases

## Getting Help 🆘

- **Bugs?** Create an [Issue](https://github.com/bastndev/Lynx-Theme-Pro/issues)
- **Architecture questions?** Check the [Architecture documentation](https://github.com/bastndev/Lynx-Theme-Pro/blob/main/ARCHITECTURE.md)
- **Need inspiration?** Check out the existing themes and the [VS Code theme documentation](https://code.visualstudio.com/api/extension-guides/color-theme)

## Code of Conduct 📋

Please read and follow our [Code of Conduct](https://github.com/bastndev/Lynx-Theme-Pro/blob/main/CODE_OF_CONDUCT.md) to ensure a welcoming environment for everyone.

---

**Thank you for contributing to Lynx Theme Pro!** Your work helps developers worldwide have a better coding experience. 🚀