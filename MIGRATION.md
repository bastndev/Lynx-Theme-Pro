# 🔄 Migration to `src/` Architecture

## Date: April 20, 2026

## Changes Made

### 1. Directory Structure
- ✅ Created `src/` directory as the main source folder
- ✅ Moved `themes/` → `src/themes/`
- ✅ Moved `assets/` → `src/assets/`

### 2. Updated Files

#### `package.json`
Updated all path references in the `contributes` section:
- **Themes**: `./themes/` → `./src/themes/`
- **Icon Themes**: `./assets/icon-system/` → `./src/assets/icon-system/`
- **Product Icons**: `./assets/icon-system/` → `./src/assets/icon-system/`

#### `ARCHITECTURE.md`
- Added new project structure diagram
- Updated architecture diagram to reflect `src/` folder
- Documented the new organization

### 3. New Structure

```
Lynx-Theme-Pro/
├── src/                           ← NEW
│   ├── themes/                    ← Moved from root
│   │   ├── Lynx-Dark-theme.json
│   │   ├── Lynx-Light-theme.json
│   │   ├── Lynx-Night-theme.json
│   │   ├── Lynx-xGhibli-theme.json
│   │   ├── Lynx-yCoffee-theme.json
│   │   ├── Lynx-zKiro-theme.json
│   │   └── Lynx-NVIM-theme.json
│   └── assets/                    ← Moved from root
│       ├── icon-system/
│       │   ├── themes-icons/
│       │   └── material-icons/
│       └── icon-themes/
│           ├── dark/
│           ├── light/
│           └── gray/
├── public/                        ← Unchanged
├── package.json                   ← Updated paths
├── ARCHITECTURE.md                ← Updated
└── ...
```

## Benefits

✅ **Better Organization**: Clear separation between source code and public assets
✅ **Scalability**: Easier to add build processes or code generation in the future
✅ **Professional Structure**: Follows modern project conventions
✅ **Maintainability**: Clearer for contributors to understand project layout

## Testing Checklist

Before publishing, verify:
- [ ] All themes load correctly in VS Code
- [ ] All icon themes work properly
- [ ] Product icons display correctly
- [ ] No broken paths in console
- [ ] Extension packages correctly with `vsce package`

## Rollback (if needed)

If you need to revert:
1. Move `src/themes/` back to `themes/`
2. Move `src/assets/` back to `assets/`
3. Revert `package.json` paths
4. Delete `src/` folder

## Notes

- Icon theme JSON files use relative paths (`../../icon-themes/`) which remain valid
- No changes needed to icon SVG files
- Public folder remains unchanged (marketing assets)
