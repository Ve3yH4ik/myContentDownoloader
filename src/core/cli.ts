import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { runProject } from './engine';
import { ProjectStore } from './store';
async function main() {
  const [file, output = 'data/exports'] = process.argv.slice(2);
  if (!file) throw new Error('Usage: npm run cli -- project.json [output-directory]');
  const project: unknown = JSON.parse(await readFile(resolve(file), 'utf8'));
  await mkdir(resolve(output), { recursive: true });
  const store = new ProjectStore(join(resolve(output), 'projects.sqlite'));
  try {
    const id = store.save(project); const result = await runProject(store.open(id));
    await writeFile(join(output, 'result.json'), result.json);
    await writeFile(join(output, 'result.csv'), '\ufeff' + result.csv);
    await writeFile(join(output, 'run.json'), JSON.stringify(result, null, 2));
    console.log(result.log.join('\n')); console.log(`Saved to ${resolve(output)}`);
  } finally { store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
