// Production build for the API.
//
// esbuild bundles our own code AND our internal workspace packages (@devconnect/*, which are
// shipped as TypeScript source) into one file: dist/server.js.
// Third-party npm packages stay "external": Node.js loads them from node_modules at runtime.
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const thirdParty = Object.keys(pkg.dependencies ?? {}).filter(
  (name) => !name.startsWith('@devconnect/'),
);

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  // "pino" and "pino/file" are both external, so match the package and its subpaths.
  external: thirdParty.flatMap((name) => [name, `${name}/*`]),
  logLevel: 'info',
});
