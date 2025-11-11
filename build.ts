import fs from 'node:fs';
import {glob} from 'glob';
import {rimraf} from 'rimraf';
import {build, type Options} from 'tsdown';

const tsdownConfig: Options = {
  dts: true,
  clean: false,
  sourcemap: false,
  target: 'esnext',
  format: ['esm', 'cjs'],
  outDir: './dist',
  unbundle: true,
  treeshake: true,
  unused: true,
};

const entries: Options[] = [
  {entry: './src/index.ts', external: [/.*\/uws$/, /^\.\.\/uws/, 'uws']},
];

async function buildProject() {
  // Clean previous dist folders
  await rimraf('./dist', {glob: false});

  console.log('🚀 Building exstack...');
  for (const entry of entries) {
    // Build main entry point
    await build({...tsdownConfig, ...entry});
  }
  // Remove all .d.mts files
  await rimraf(['./dist/**/*.d.mts', './dist/**/*.d.cts'], {glob: true});

  console.log('✅ Build completed successfully!\n📁 Generated files:');

  // List all files in dist/
  const _glob = await glob('**/*', {
    cwd: './dist',
  });
  for (const file of _glob) {
    console.log('  -', file);
  }
}

buildProject()
  .then(async () => {
    // 🧩 Fix ESM import paths to include `.mjs`
    const _glob = await glob('./dist/**/*.mjs', {cwd: '.'});

    for (const entry of _glob) {
      const content = await fs.promises.readFile(entry, 'utf-8');
      const fixed = content
        // Only match imports/exports from relative paths
        .replace(
          /(import|export)\s*\{([^}]*)\}\s*from\s*['"]((?:\.{1,2}\/)[^'"]+?)(?<!\.mjs)['"]/g,
          '$1{$2}from"$3.mjs"',
        )
        .replace(
          /(import|export)\s+([\w_$]+)\s+from\s*['"]((?:\.{1,2}\/)[^'"]+?)(?<!\.mjs)['"]/g,
          '$1 $2 from"$3.mjs"',
        );
      await fs.promises.writeFile(entry, fixed);
    }
  })
  .catch(console.error);
