const fs          = require('fs');
const fsPromises  = require('fs').promises;
const path        = require('path');
const os          = require('os');
const { execSync, execFile } = require('child_process');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns: false (no elevation), true (needs pkexec),
 *          'snap' (Snap, blocked), 'flatpak' (Flatpak, blocked).
 */
function checkNeedsElevation(appDir) {
  // Snap: squashfs — immutable even for root
  if (appDir.startsWith('/snap/') || process.env.SNAP) return 'snap';

  // Flatpak: the app directory is inside the read-only sandbox
  // Detected via FLATPAK_ID or if the path starts with /app/
  if (process.env.FLATPAK_ID || appDir.startsWith('/app/')) return 'flatpak';

  try {
    const testFile = path.join(appDir, '.lynx-blur-write-test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return false;
  } catch (err) {
    // EACCES/EPERM: no permission → elevate with pkexec
    // EROFS: read-only filesystem (e.g., AppImage) → elevate as well
    if (['EACCES', 'EPERM', 'EROFS'].includes(err.code)) return true;
    return false;
  }
}

function hasPkexec() {
  try { execSync('which pkexec', { stdio: 'ignore' }); return true; } catch { return false; }
}

function hasNoNewPrivs() {
  try {
    const status = fs.readFileSync('/proc/self/status', 'utf-8');
    const m = status.match(/NoNewPrivs:\s*(\d+)/);
    return m && m[1] === '1';
  } catch { return false; }
}

function shellEscape(str) {
  return str.replace(/'/g, "'\\''");
}

// ─── Directory copy (without fs-extra) ───────────────────────────────────────

function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Linux elevation (pkexec) ─────────────────────────────────────────────────

function buildShellScript(operations) {
  const cmds = ['set -e'];
  for (const op of operations) {
    switch (op.type) {
      case 'mkdir':   cmds.push(`mkdir -p '${shellEscape(op.path)}'`); break;
      case 'rmdir':   cmds.push(`rm -rf '${shellEscape(op.path)}'`); break;
      case 'copy':    cmds.push(`cp '${shellEscape(op.src)}' '${shellEscape(op.dest)}'`); break;
      case 'copyDir': cmds.push(`cp -r '${shellEscape(op.src)}/.' '${shellEscape(op.dest)}/'`); break;
    }
  }
  return cmds.join('\n');
}

function elevatedCopyLinux(operations) {
  return new Promise((resolve, reject) => {
    if (operations.length === 0) return resolve();
    if (hasNoNewPrivs()) return reject(new Error('no_new_privs'));
    if (!hasPkexec())   return reject(new Error('pkexec_missing'));

    const script = buildShellScript(operations);
    execFile('pkexec', ['sh', '-c', script], (error, _stdout, stderr) => {
      if (error) {
        if (stderr && stderr.includes('setuid root')) reject(new Error('no_new_privs'));
        else reject(new Error(`Elevation failed: ${stderr || error.message}`));
      } else {
        resolve();
      }
    });
  });
}

// ─── StagedFileWriter ─────────────────────────────────────────────────────────

class StagedFileWriter {
  constructor(requiresElevation) {
    this.requiresElevation = requiresElevation;
    this.tmpDir     = null;
    this.operations = [];
    this._counter   = 0;
  }

  async init() {
    if (this.requiresElevation) {
      this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-blur-'));
    }
  }

  _tmpPath(targetPath) {
    return path.join(this.tmpDir, `${this._counter++}_${path.basename(targetPath)}`);
  }

  async writeFile(targetPath, content, encoding) {
    if (!this.requiresElevation) {
      await fsPromises.writeFile(targetPath, content, encoding);
    } else {
      const tmp = this._tmpPath(targetPath);
      await fsPromises.writeFile(tmp, content, encoding);
      this.operations.push({ type: 'copy', src: tmp, dest: targetPath });
    }
  }

  async mkdir(targetPath) {
    if (!this.requiresElevation) {
      await fsPromises.mkdir(targetPath, { recursive: true });
    } else {
      this.operations.push({ type: 'mkdir', path: targetPath });
    }
  }

  async rmdir(targetPath) {
    if (!this.requiresElevation) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      this.operations.push({ type: 'rmdir', path: targetPath });
    }
  }

  async copyDir(src, dest) {
    if (!this.requiresElevation) {
      copyDirSync(src, dest);
    } else {
      const tmpDest = path.join(this.tmpDir, `dir_${this._counter++}`);
      copyDirSync(src, tmpDest);
      this.operations.push({ type: 'copyDir', src: tmpDest, dest });
    }
  }

  async flush() {
    if (this.requiresElevation && this.operations.length > 0) {
      await elevatedCopyLinux(this.operations);
      this.operations = [];
    }
    this.cleanup();
  }

  cleanup() {
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
      this.tmpDir = null;
    }
  }
}

// ─── macOS elevation (osascript) ──────────────────────────────────────────────

/**
 * Returns false (no elevation needed) or true (needs osascript admin) for macOS.
 * Unlike Linux, there is no Snap/Flatpak to check.
 */
function checkNeedsElevationMacOS(appDir) {
  try {
    const testFile = path.join(appDir, '.lynx-blur-write-test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return false;
  } catch (err) {
    if (['EACCES', 'EPERM', 'EROFS'].includes(err.code)) return true;
    return false;
  }
}

/**
 * Executes file-system operations with macOS admin privileges via osascript.
 * Builds a POSIX shell script and runs it through
 * `do shell script ... with administrator privileges`.
 */
function elevatedCopyMacOS(operations) {
  return new Promise((resolve, reject) => {
    if (operations.length === 0) return resolve();

    const esc = (s) => s.replace(/'/g, "'\\''");
    const cmds = ['set -e'];
    for (const op of operations) {
      switch (op.type) {
        case 'mkdir':   cmds.push(`mkdir -p '${esc(op.path)}'`);                    break;
        case 'rmdir':   cmds.push(`rm -rf '${esc(op.path)}'`);                      break;
        case 'copy':    cmds.push(`cp '${esc(op.src)}' '${esc(op.dest)}'`);         break;
        case 'copyDir': cmds.push(`cp -r '${esc(op.src)}/.' '${esc(op.dest)}/'`);  break;
      }
    }

    const shellScript = cmds.join('; ');
    // Escape backslashes and double-quotes for AppleScript string literal
    const escaped = shellScript.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const appleScript = `do shell script "${escaped}" with administrator privileges`;

    execFile('osascript', ['-e', appleScript], (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`macOS elevation failed: ${stderr || error.message}`));
      } else {
        resolve();
      }
    });
  });
}

/** Staged writer for macOS — uses osascript for elevated write operations. */
class StagedFileWriterMacOS {
  constructor(requiresElevation) {
    this.requiresElevation = requiresElevation;
    this.tmpDir     = null;
    this.operations = [];
    this._counter   = 0;
  }

  async init() {
    if (this.requiresElevation) {
      this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-blur-mac-'));
    }
  }

  _tmpPath(targetPath) {
    return path.join(this.tmpDir, `${this._counter++}_${path.basename(targetPath)}`);
  }

  async writeFile(targetPath, content, encoding) {
    if (!this.requiresElevation) {
      await fsPromises.writeFile(targetPath, content, encoding);
    } else {
      const tmp = this._tmpPath(targetPath);
      await fsPromises.writeFile(tmp, content, encoding);
      this.operations.push({ type: 'copy', src: tmp, dest: targetPath });
    }
  }

  async mkdir(targetPath) {
    if (!this.requiresElevation) {
      await fsPromises.mkdir(targetPath, { recursive: true });
    } else {
      this.operations.push({ type: 'mkdir', path: targetPath });
    }
  }

  async rmdir(targetPath) {
    if (!this.requiresElevation) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      this.operations.push({ type: 'rmdir', path: targetPath });
    }
  }

  async copyDir(src, dest) {
    if (!this.requiresElevation) {
      copyDirSync(src, dest);
    } else {
      const tmpDest = path.join(this.tmpDir, `dir_${this._counter++}`);
      copyDirSync(src, tmpDest);
      this.operations.push({ type: 'copyDir', src: tmpDest, dest });
    }
  }

  async flush() {
    if (this.requiresElevation && this.operations.length > 0) {
      await elevatedCopyMacOS(this.operations);
      this.operations = [];
    }
    this.cleanup();
  }

  cleanup() {
    if (this.tmpDir) {
      try { fs.rmSync(this.tmpDir, { recursive: true, force: true }); } catch {}
      this.tmpDir = null;
    }
  }
}

module.exports = {
  checkNeedsElevation, hasPkexec, hasNoNewPrivs,
  copyDirSync, StagedFileWriter,
  // macOS
  checkNeedsElevationMacOS, StagedFileWriterMacOS,
};
