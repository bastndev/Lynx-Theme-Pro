import * as vscode from 'vscode';

export function t(key: string, ...args: unknown[]): string {
  return vscode.l10n.t(key, ...(args as string[]));
}
