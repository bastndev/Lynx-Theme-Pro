const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function collectFiles(dir, extension) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, extension));
    } else if (entry.isFile() && fullPath.endsWith(extension) && !fullPath.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function copyRuntimeAssets() {
  const cssSource = path.join('src', 'themes', 'liquid-theme', 'css');
  const cssTarget = path.join('dist', 'themes', 'liquid-theme', 'css');

  fs.rmSync(cssTarget, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(cssTarget), { recursive: true });
  fs.cpSync(cssSource, cssTarget, { recursive: true });
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.debug('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });

      if (result.errors.length === 0) {
        copyRuntimeAssets();
      }

      console.debug('[watch] build finished');
    });
  },
};

function createBuildOptions() {
  fs.rmSync('dist', { recursive: true, force: true });

  const commonOptions = {
    bundle: false,
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outdir: 'dist',
    outbase: 'src',
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin],
  };

  const extensionHost = {
    ...commonOptions,
    entryPoints: collectFiles(path.join('src', 'themes', 'liquid-theme'), '.ts')
      .filter((file) => !file.includes(`${path.sep}runtime${path.sep}`)),
    format: 'cjs',
  };

  const electronRuntime = {
    ...commonOptions,
    entryPoints: collectFiles(path.join('src', 'themes', 'liquid-theme', 'runtime'), '.mts'),
    format: 'esm',
    outExtension: { '.js': '.mjs' },
  };

  return [extensionHost, electronRuntime];
}

async function main() {
  const buildOptions = createBuildOptions();

  if (watch) {
    const contexts = await Promise.all(buildOptions.map((options) => esbuild.context(options)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(buildOptions.map((options) => esbuild.build(options)));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
