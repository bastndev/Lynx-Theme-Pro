'use strict';

/**
 * Liquid Glass — Color keys for workbench.colorCustomizations
 *
 * Three tiers of transparency applied over the native Electron
 * transparent window so the wallpaper "shines through" like glass:
 *
 *   TRANSPARENT  → fully clear (#RRGGBB00)
 *   GLASS        → subtle tinted glass (DEFAULT_OPACITY ≈ 0.55)
 *   FROSTED      → denser frosted glass (0.82) for floating UI
 */

export const TRANSPARENT_BG_KEYS = [
  'editorPane.background',
  'breadcrumb.background',
  'panel.background',
  'panelStickyScroll.background',
  'tab.activeBackground',
  'tab.unfocusedActiveBackground',
];

export const GLASS_BG_KEYS = [
  'editorGroupHeader.tabsBackground',
  'editorGroupHeader.noTabsBackground',
  'sideBar.background',
  'sideBarTitle.background',
  'sideBarStickyScroll.background',
  'auxiliaryBar.background',
  'chat.background',
  'chat.requestBackground',
  'interactive.background',
  'editor.background',
  'editorGutter.background',
  'editorStickyScroll.background',
  'editorStickyScrollGutter.background',
  'tab.inactiveBackground',
  'tab.unfocusedInactiveBackground',
  'titleBar.activeBackground',
  'titleBar.inactiveBackground',
];

export const FROSTED_BG_KEYS = [
  'inlineChat.background',
  'editorWidget.background',
  'editorHoverWidget.background',
  'editorSuggestWidget.background',
  'notifications.background',
  'notificationCenterHeader.background',
  'menu.background',
  'quickInput.background',
];

export const ALL_BG_KEYS = [
  ...TRANSPARENT_BG_KEYS,
  ...GLASS_BG_KEYS,
  ...FROSTED_BG_KEYS,
];

// Liquid Glass base color — cool dark blue-gray
export const THEME_BG = '0c1118';
export const DEFAULT_OPACITY = 0.55;
