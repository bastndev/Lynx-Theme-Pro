import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let messages: Record<string, string> = {};
let fallbackMessages: Record<string, string> = {};

/**
 * Initialize localization by loading the appropriate package.nls.json files.
 * @param {vscode.ExtensionContext} context 
 */
export function init(context: vscode.ExtensionContext) {
    const lang = vscode.env.language;
    const extensionPath = context.extensionPath;
    
    // Load fallback (English)
    try {
        const fallbackPath = path.join(extensionPath, 'package.nls.json');
        if (fs.existsSync(fallbackPath)) {
            fallbackMessages = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
        }
    } catch (e) {
        console.error('[Lynx Liquid] Failed to load fallback localization', e);
    }

    // Load language specific
    try {
        const langPath = path.join(extensionPath, `package.nls.${lang}.json`);
        if (fs.existsSync(langPath)) {
            messages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
        }
    } catch {
        // It's ok if lang file doesn't exist, we use fallback
    }
}

/**
 * Translate a string key.
 * @param {string} key 
 * @param  {...any} args 
 * @returns {string}
 */
export function t(key: string, ...args: unknown[]): string {
    let text = messages[key] || fallbackMessages[key] || key;
    if (args.length > 0) {
        args.forEach((arg, i) => {
            text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), String(arg));
        });
    }
    return text;
}
