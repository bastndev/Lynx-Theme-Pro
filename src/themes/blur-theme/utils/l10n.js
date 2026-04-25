const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let messages = {};
let fallbackMessages = {};

/**
 * Initialize localization by loading the appropriate package.nls.json files.
 * @param {vscode.ExtensionContext} context 
 */
function init(context) {
    const lang = vscode.env.language;
    const extensionPath = context.extensionPath;
    
    // Load fallback (English)
    try {
        const fallbackPath = path.join(extensionPath, 'package.nls.json');
        if (fs.existsSync(fallbackPath)) {
            fallbackMessages = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
        }
    } catch (e) {
        console.error('[Lynx Blur] Failed to load fallback localization', e);
    }

    // Load language specific
    try {
        const langPath = path.join(extensionPath, `package.nls.${lang}.json`);
        if (fs.existsSync(langPath)) {
            messages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
        }
    } catch (e) {
        // It's ok if lang file doesn't exist, we use fallback
    }
}

/**
 * Translate a string key.
 * @param {string} key 
 * @param  {...any} args 
 * @returns {string}
 */
function t(key, ...args) {
    let text = messages[key] || fallbackMessages[key] || key;
    if (args.length > 0) {
        args.forEach((arg, i) => {
            text = text.replace(new RegExp(`\\{${i}\\}`, 'g'), arg);
        });
    }
    return text;
}

module.exports = { init, t };
