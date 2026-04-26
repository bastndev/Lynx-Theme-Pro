'use strict';

/**
 * Background keys modified in workbench.colorCustomizations.
 * These panels are made transparent so the native window background
 * (Linux/Windows CSS transparency or macOS vibrancy) can show through.
 */

const TRANSPARENT_BG_KEYS = [
  'editorPane.background',
  'editorGroupHeader.tabsBackground',
  'editorGroupHeader.noTabsBackground',
  'breadcrumb.background',
  'panel.background',
  'panelStickyScroll.background',
  'tab.activeBackground',
  'tab.unfocusedActiveBackground',
];

const SEMITRANSPARENT_BG_KEYS = [
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

const OPAQUE_BG_KEYS = [
  'inlineChat.background',
  'editorWidget.background',
  'editorHoverWidget.background',
  'editorSuggestWidget.background',
  'notifications.background',
  'notificationCenterHeader.background',
  'menu.background',
  'quickInput.background',
];

const ALL_BG_KEYS = [...TRANSPARENT_BG_KEYS, ...SEMITRANSPARENT_BG_KEYS, ...OPAQUE_BG_KEYS];

// Lynx Dark glassmorphism base color & opacity
const THEME_BG = '181e28';
const DEFAULT_OPACITY = 0.70;

module.exports = {
  TRANSPARENT_BG_KEYS,
  SEMITRANSPARENT_BG_KEYS,
  OPAQUE_BG_KEYS,
  ALL_BG_KEYS,
  THEME_BG,
  DEFAULT_OPACITY,
};
