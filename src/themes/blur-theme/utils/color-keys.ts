'use strict';

export const TRANSPARENT_BG_KEYS = [
  // Editor chrome
  'editorPane.background',
  'breadcrumb.background',
  // Tabs — we paint these via CSS for the specular treatment
  'tab.activeBackground',
  'tab.unfocusedActiveBackground',
  // Panels & Activity
  'panel.background',
  'panelStickyScroll.background',
  'activityBar.background',
  'activityBarTop.background',
];

/* ─── Glass surfaces (light tint + blur via CSS) ──────────────────────────── */
export const GLASS_BG_KEYS = [
  // Editor areas
  'editor.background',
  'editorGutter.background',
  'editorStickyScroll.background',
  'editorStickyScrollGutter.background',
  'editorGroupHeader.tabsBackground',
  'editorGroupHeader.noTabsBackground',

  // Sidebar family
  'sideBar.background',
  'sideBarTitle.background',
  'sideBarStickyScroll.background',
  'auxiliaryBar.background',

  // Chat & AI
  'chat.background',
  'chat.requestBackground',
  'interactive.background',

  // Inactive tabs
  'tab.inactiveBackground',
  'tab.unfocusedInactiveBackground',

  // Window chrome
  'titleBar.activeBackground',
  'titleBar.inactiveBackground',
];

/* ─── Frosted surfaces (denser, for floating overlays) ────────────────────── */
export const FROSTED_BG_KEYS = [
  // Widgets & overlays
  'inlineChat.background',
  'editorWidget.background',
  'editorHoverWidget.background',
  'editorSuggestWidget.background',
  'inlineCompletionsBadge.background',

  // Notifications
  'notifications.background',
  'notificationCenterHeader.background',
  'notificationToast.background',

  // Menus & quick input
  'menu.background',
  'menubar.selectionBackground',
  'quickInput.background',
  'quickInputTitle.background',

  // Debug toolbar
  'debugToolBarBackground',

  // Banner
  'banner.background',
];

export const ALL_BG_KEYS = [
  ...TRANSPARENT_BG_KEYS,
  ...GLASS_BG_KEYS,
  ...FROSTED_BG_KEYS,
];

/* ─── Color constants ─────────────────────────────────────────────────────── */

/** Base color: cool dark blue-black that reads as "depth behind glass" */
export const THEME_BG = '0a0e14';

/** Glass tier: subtle enough to feel transparent but with perceptible tint */
export const DEFAULT_OPACITY = 0.42;

/** Frosted tier: dense enough for readability on floating panels */
export const FROSTED_OPACITY = 0.76;
