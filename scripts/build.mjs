import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('dist/desktop', { recursive: true });
for (const entry of ['main', 'preload', 'worker']) {
  await build({ entryPoints: [`src/desktop/${entry}.ts`], outfile: `dist/desktop/${entry}.cjs`, bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], sourcemap: true });
}
