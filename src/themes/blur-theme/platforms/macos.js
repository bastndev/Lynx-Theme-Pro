const vscode = require('vscode');

async function handleActivation(context) {
  vscode.window.showInformationMessage(
    '🍎 [Lynx Blur] macOS — Coming soon.'
  );
  console.log('[Lynx Blur][macOS] handleActivation — not implemented yet');
}

async function handleDeactivation(context) {
  console.log('[Lynx Blur][macOS] handleDeactivation — not implemented yet');
}

module.exports = { handleActivation, handleDeactivation };
