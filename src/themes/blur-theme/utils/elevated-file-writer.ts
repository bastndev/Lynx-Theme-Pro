import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec, execFile, execSync } from 'child_process';

type ElevationCheck = false | true | 'snap' | 'flatpak';

type FileOperation =
  | { type: 'mkdir'; path: string }
  | { type: 'rmdir'; path: string }
  | { type: 'copy'; src: string; dest: string }
  | { type: 'copyDir'; src: string; dest: string };

function hasErrorCode(error: unknown, codes: string[]): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && codes.includes(String(error.code));
}

// ─── Linux helpers ────────────────────────────────────────────────────────────

export function checkNeedsElevation(appDir: string): ElevationCheck {
  if (appDir.startsWith('/snap/') || process.env.SNAP) {return 'snap';}
  if (process.env.FLATPAK_ID || appDir.startsWith('/app/')) {return 'flatpak';}
  try {
    const testFile = path.join(appDir, '.lynx-blur-write-test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return false;
  } catch (err: unknown) {
    if (hasErrorCode(err, ['EACCES', 'EPERM', 'EROFS'])) {return true;}
    return false;
  }
}

export function hasPkexec(): boolean {
  try { execSync('which pkexec', { stdio: 'ignore' }); return true; } catch { return false; }
}

export function hasNoNewPrivs(): boolean {
  try {
    const status = fs.readFileSync('/proc/self/status', 'utf-8');
    const m = status.match(/NoNewPrivs:\s*(\d+)/);
    return Boolean(m && m[1] === '1');
  } catch { return false; }
}

function shellEscape(str: string): string {
  return str.replace(/'/g, "'\\''");
}

// ─── Directory copy ───────────────────────────────────────────────────────────

export function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {fs.mkdirSync(dest, { recursive: true });}
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

function buildShellScript(operations: FileOperation[]): string {
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

function elevatedCopyLinux(operations: FileOperation[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (operations.length === 0) {return resolve();}
    if (hasNoNewPrivs()) {return reject(new Error('no_new_privs'));}
    if (!hasPkexec())   {return reject(new Error('pkexec_missing'));}
    const script = buildShellScript(operations);
    execFile('pkexec', ['sh', '-c', script], (error, _stdout, stderr) => {
      if (error) {
        if (stderr && stderr.includes('setuid root')) {reject(new Error('no_new_privs'));}
        else {reject(new Error(`Elevation failed: ${stderr || error.message}`));}
      } else {
        resolve();
      }
    });
  });
}

// ─── Linux StagedFileWriter ───────────────────────────────────────────────────

export class StagedFileWriter {
  private tmpDir: string | null = null;
  private operations: FileOperation[] = [];
  private _counter = 0;

  constructor(private readonly requiresElevation: ElevationCheck) {}

  async init() {
    if (this.requiresElevation) {
      this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-blur-'));
    }
  }

  private _tmpPath(targetPath: string): string {
    if (!this.tmpDir) {throw new Error('Temporary directory is not initialized');}
    return path.join(this.tmpDir, `${this._counter++}_${path.basename(targetPath)}`);
  }

  async writeFile(targetPath: string, content: string, encoding: BufferEncoding) {
    if (!this.requiresElevation) {
      await fsPromises.writeFile(targetPath, content, encoding);
    } else {
      const tmp = this._tmpPath(targetPath);
      await fsPromises.writeFile(tmp, content, encoding);
      this.operations.push({ type: 'copy', src: tmp, dest: targetPath });
    }
  }

  async mkdir(targetPath: string) {
    if (!this.requiresElevation) {
      await fsPromises.mkdir(targetPath, { recursive: true });
    } else {
      this.operations.push({ type: 'mkdir', path: targetPath });
    }
  }

  async rmdir(targetPath: string) {
    if (!this.requiresElevation) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      this.operations.push({ type: 'rmdir', path: targetPath });
    }
  }

  async copyDir(src: string, dest: string) {
    if (!this.requiresElevation) {
      copyDirSync(src, dest);
    } else {
      if (!this.tmpDir) {throw new Error('Temporary directory is not initialized');}
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

export function checkNeedsElevationMacOS(appDir: string): boolean {
  try {
    const testFile = path.join(appDir, '.lynx-blur-write-test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return false;
  } catch (err: unknown) {
    if (hasErrorCode(err, ['EACCES', 'EPERM', 'EROFS'])) {return true;}
    return false;
  }
}

function elevatedCopyMacOS(operations: FileOperation[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (operations.length === 0) {return resolve();}
    const esc = (s: string) => s.replace(/'/g, "'\\''");
    const cmds = ['set -e'];
    for (const op of operations) {
      switch (op.type) {
        case 'mkdir':   cmds.push(`mkdir -p '${esc(op.path)}'`); break;
        case 'rmdir':   cmds.push(`rm -rf '${esc(op.path)}'`); break;
        case 'copy':    cmds.push(`cp '${esc(op.src)}' '${esc(op.dest)}'`); break;
        case 'copyDir': cmds.push(`cp -r '${esc(op.src)}/.' '${esc(op.dest)}/'`); break;
      }
    }
    const shellScript = cmds.join('; ');
    const escaped = shellScript.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const appleScript = `do shell script "${escaped}" with administrator privileges`;
    execFile('osascript', ['-e', appleScript], (error, _stdout, stderr) => {
      if (error) {reject(new Error(`macOS elevation failed: ${stderr || error.message}`));}
      else {resolve();}
    });
  });
}

export class StagedFileWriterMacOS {
  private tmpDir: string | null = null;
  private operations: FileOperation[] = [];
  private _counter = 0;

  constructor(private readonly requiresElevation: boolean) {}

  async init() {
    if (this.requiresElevation) {
      this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-blur-mac-'));
    }
  }

  private _tmpPath(targetPath: string): string {
    if (!this.tmpDir) {throw new Error('Temporary directory is not initialized');}
    return path.join(this.tmpDir, `${this._counter++}_${path.basename(targetPath)}`);
  }

  async writeFile(targetPath: string, content: string, encoding: BufferEncoding) {
    if (!this.requiresElevation) {await fsPromises.writeFile(targetPath, content, encoding);}
    else {
      const tmp = this._tmpPath(targetPath);
      await fsPromises.writeFile(tmp, content, encoding);
      this.operations.push({ type: 'copy', src: tmp, dest: targetPath });
    }
  }

  async mkdir(targetPath: string) {
    if (!this.requiresElevation) {await fsPromises.mkdir(targetPath, { recursive: true });}
    else {this.operations.push({ type: 'mkdir', path: targetPath });}
  }

  async rmdir(targetPath: string) {
    if (!this.requiresElevation) {fs.rmSync(targetPath, { recursive: true, force: true });}
    else {this.operations.push({ type: 'rmdir', path: targetPath });}
  }

  async copyDir(src: string, dest: string) {
    if (!this.requiresElevation) {copyDirSync(src, dest);}
    else {
      if (!this.tmpDir) {throw new Error('Temporary directory is not initialized');}
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

// ─── Windows elevation (PowerShell UAC) ───────────────────────────────────────

export function checkNeedsElevationWindows(appDir: string): boolean {
  try {
    const testFile = path.join(appDir, '.lynx-blur-write-test');
    fs.writeFileSync(testFile, '');
    fs.unlinkSync(testFile);
    return false;
  } catch (err: unknown) {
    if (hasErrorCode(err, ['EACCES', 'EPERM'])) {return true;}
    return false;
  }
}

function psEscape(str: string): string {
  return str.replace(/'/g, "''");
}

function buildPowerShellScript(operations: FileOperation[]): string {
  const commands: string[] = [];
  for (const op of operations) {
    switch (op.type) {
      case 'mkdir':   commands.push(`New-Item -Path '${psEscape(op.path)}' -ItemType Directory -Force | Out-Null`); break;
      case 'rmdir':   commands.push(`Remove-Item -Path '${psEscape(op.path)}' -Recurse -Force -ErrorAction SilentlyContinue`); break;
      case 'copy':    commands.push(`Copy-Item -Path '${psEscape(op.src)}' -Destination '${psEscape(op.dest)}' -Force`); break;
      case 'copyDir': commands.push(`Copy-Item -Path '${psEscape(op.src)}\\*' -Destination '${psEscape(op.dest)}' -Recurse -Force`); break;
    }
  }
  return commands.join('\n');
}

function elevatedCopyWindows(operations: FileOperation[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (operations.length === 0) {return resolve();}
    const statusFile = path.join(os.tmpdir(), `lynx-elev-${Date.now()}.txt`);
    const psScript = buildPowerShellScript(operations);
    const payload = [
      '$ErrorActionPreference = "Continue"',
      psScript,
      `'OK' | Set-Content -Path '${psEscape(statusFile)}' -Encoding UTF8`,
    ].join('\n');
    const encodedPayload = Buffer.from(payload, 'utf16le').toString('base64');
    const innerArgs = `-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedPayload}`;
    const elevateCmd = [
      'powershell.exe', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      `"Start-Process powershell.exe -ArgumentList '${innerArgs}' -Verb RunAs -WindowStyle Hidden -Wait"`
    ].join(' ');
    exec(elevateCmd, { encoding: 'utf-8' }, (error) => {
      try {
        const status = fs.readFileSync(statusFile, 'utf-8').trim();
        fs.unlinkSync(statusFile);
        if (status === 'OK') {resolve();}
        else {reject(new Error(`Elevation failed: ${status}`));}
      } catch {
        if (error) {reject(new Error('Elevation failed: User denied UAC or process cancelled'));}
        else {reject(new Error('Elevation failed: Elevated process did not complete'));}
      }
    });
  });
}

export class StagedFileWriterWindows {
  private tmpDir: string | null = null;
  private operations: FileOperation[] = [];
  private _counter = 0;

  constructor(private readonly requiresElevation: boolean) {}

  async init() {
    if (this.requiresElevation) {
      this.tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-blur-win-'));
    }
  }

  private _tmpPath(targetPath: string): string {
    if (!this.tmpDir) {throw new Error('Temporary directory is not initialized');}
    return path.join(this.tmpDir, `${this._counter++}_${path.basename(targetPath)}`);
  }

  async writeFile(targetPath: string, content: string, encoding: BufferEncoding) {
    if (!this.requiresElevation) {await fsPromises.writeFile(targetPath, content, encoding);}
    else {
      const tmp = this._tmpPath(targetPath);
      await fsPromises.writeFile(tmp, content, encoding);
      this.operations.push({ type: 'copy', src: tmp, dest: targetPath });
    }
  }

  async mkdir(targetPath: string) {
    if (!this.requiresElevation) {await fsPromises.mkdir(targetPath, { recursive: true });}
    else {this.operations.push({ type: 'mkdir', path: targetPath });}
  }

  async rmdir(targetPath: string) {
    if (!this.requiresElevation) {fs.rmSync(targetPath, { recursive: true, force: true });}
    else {this.operations.push({ type: 'rmdir', path: targetPath });}
  }

  async copyDir(src: string, dest: string) {
    if (!this.requiresElevation) {copyDirSync(src, dest);}
    else {
      if (!this.tmpDir) {throw new Error('Temporary directory is not initialized');}
      const tmpDest = path.join(this.tmpDir, `dir_${this._counter++}`);
      copyDirSync(src, tmpDest);
      this.operations.push({ type: 'copyDir', src: tmpDest, dest });
    }
  }

  async flush() {
    if (this.requiresElevation && this.operations.length > 0) {
      await elevatedCopyWindows(this.operations);
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
