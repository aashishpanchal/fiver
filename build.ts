// import fs from 'node:fs';
// import {glob} from 'glob';
import {rimraf} from 'rimraf';
import {build, type Options} from 'tsdown';

const isWatch = process.argv.includes('--watch');

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
  watch: isWatch,
};

const entries: Options[] = [
  {
    entry: ['./src/index.ts', './src/middle/error-handler.ts', './src/consts.ts'],
    external: [/.*\/uws$/, /^\.\.\/uws/, 'uws'],
  },
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
}

buildProject();
// .then(async () => {
//   // 🧩 Fix ESM import paths to include `.js`
//   const _glob = await glob('./dist/**/*.js', {cwd: '.'});

//   for (const entry of _glob) {
//     const content = await fs.promises.readFile(entry, 'utf-8');
//     const fixed = content
//       // Only match imports/exports from relative paths
//       .replace(
//         /(import|export)\s*\{([^}]*)\}\s*from\s*['"]((?:\.{1,2}\/)[^'"]+?)(?<!\.js)['"]/g,
//         '$1{$2}from"$3.js"',
//       )
//       .replace(
//         /(import|export)\s+([\w_$]+)\s+from\s*['"]((?:\.{1,2}\/)[^'"]+?)(?<!\.js)['"]/g,
//         '$1 $2 from"$3.js"',
//       );
//     await fs.promises.writeFile(entry, fixed);
//   }
// })
// .catch(console.error);
