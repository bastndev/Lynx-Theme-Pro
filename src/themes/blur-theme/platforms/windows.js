const vscode = require('vscode');

async function handleActivation(context) {
  vscode.window.showInformationMessage(
    '🪟 [Lynx Blur] Windows — Coming soon.'
  );
  console.log('[Lynx Blur][Windows] handleActivation — not implemented yet');
}

async function handleDeactivation(context) {
  console.log('[Lynx Blur][Windows] handleDeactivation — not implemented yet');
}

module.exports = { handleActivation, handleDeactivation };
