import { describe, it, expect } from 'vitest';
import { createServer, type Server, type RequestListener } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import example from '../examples/products.json';
import { applyPipeline, parseDocument, runProject, toCsv } from '../src/core/engine';
import { projectSchema } from '../src/core/schema';
import { renderTemplate } from '../src/core/macros';
import { ProjectStore } from '../src/core/store';
const html = await readFile(new URL('../examples/catalog.html', import.meta.url), 'utf8');
async function server(handler: RequestListener, fn: (url: string) => Promise<void>) {
  const instance: Server = createServer(handler);
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  try { await fn(`http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`); }
  finally { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())); }
}
describe('first end-to-end scenario', () => {
  it('downloads HTML, parses scalar/repeating/nested boundaries and exports CSV/JSON', async () => {
    await server((_req, res) => { res.setHeader('Content-Type','text/html'); res.end(html); }, async url => {
      const result = await runProject({ ...example, url });
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toMatchObject({ title: 'Приклад каталогу', name: 'Фільтр & олива', price: '120.50' });
      expect(result.rows[1].price).toBe('980');
      expect(JSON.parse(result.json)).toEqual(result.rows);
      expect(result.csv).toContain('"120.50"');
      expect(result.log[0]).toContain('HTTP 200');
      const replace = result.trace.find(t => t.boundary === 'price' && t.operation === 'replace');
      expect(replace).toMatchObject({ before: '120.50 UAH', after: '120.50' });
    });
  });
  it('persists and reopens a project across database connections and retains versions', () => {
    const path = mkdtempSync(join(tmpdir(), 'udd-')); const db = join(path, 'projects.sqlite');
    try {
      let store = new ProjectStore(db); const id = store.save(example); store.close();
      store = new ProjectStore(db);
      expect(store.open(id)).toEqual(projectSchema.parse(example));
      store.save({ ...example, name: 'Second version' });
      expect(store.list()).toHaveLength(2);
      expect(parseDocument(store.open(id), html).rows[1].price).toBe('980'); store.close();
    } finally { rmSync(path, { recursive: true, force: true }); }
  });
});
describe('boundaries and ordered post-processing', () => {
  it('allows repeated inside scalar, repeated inside repeated and scalar inside repeated', () => {
    const p = { ...example, boundaries: [{ id:'outer', name:'Outer', mode:'between', start:'<root>', end:'</root>', repeat:false, children:[{id:'items', name:'Items', mode:'between', start:'<item>', end:'</item>', repeat:true, children:[{id:'tags',name:'Tags',mode:'regex',expression:'<t>(.*?)</t>',repeat:true,children:[{id:'letter',name:'Letter',mode:'regex',expression:'(.)'}]}]}]}] };
    const result = parseDocument(p, '<root><item><t>A</t><t>B</t></item></root>');
    expect(result.boundaries[0].values[0].children[0].values[0].children[0].values.map(v => v.children[0].joined)).toEqual(['A','B']);
    expect(result.rows.map(row => row.letter)).toEqual(['A','B']);
  });
  it('applies transformations in user order and records intermediate values', () => {
    const trace: Parameters<typeof applyPipeline>[3] = [];
    const value = applyPipeline(' X ', [{type:'trimWhitespace'}, {type:'prepend',value:'A'}, {type:'lowercase'}, {type:'replace', find:'a',replacement:'B',regex:false,flags:'g'}], 'x', trace);
    expect(value).toBe('Bx'); expect(trace.map(t=>t.after)).toEqual(['X','AX','ax','Bx']);
  });
  it('supports CSS and reverse/skip/max selection', () => {
    const result = parseDocument({...example,boundaries:[{id:'items',name:'Items',mode:'css',expression:'h2',repeat:true,reverse:true,skip:1,max:1}]}, html);
    expect(result.boundaries[0].joined).toBe('Фільтр &amp; олива');
  });
  it('supports fallback for no match and rejects required empty results', () => {
    const b = {id:'x',name:'X',mode:'between',start:'<x>',end:'</x>'};
    expect(parseDocument({...example,boundaries:[{...b,pipeline:[{type:'fallback',value:'none'}]}]},html).rows[0].x).toBe('none');
    expect(()=>parseDocument({...example,boundaries:[{...b,pipeline:[{type:'required'}]}]},html)).toThrow('required');
    expect(()=>parseDocument({...example,boundaries:[{...b,min:1}]},html)).toThrow('at least');
  });
  it('rejects duplicate IDs, unknown fields and invalid regex', () => {
    expect(()=>parseDocument({...example,boundaries:[example.boundaries[0],example.boundaries[0]]},html)).toThrow('Duplicate');
    expect(()=>parseDocument({...example, unsupported:true},html)).toThrow();
    expect(()=>parseDocument({...example,boundaries:[{id:'x',name:'X',mode:'regex',expression:'('}]},html)).toThrow();
  });
  it('CSV escapes commas, quotes and embedded newlines', () => {
    expect(toCsv([{a:'x,"y"\nz'}])).toBe('"a"\r\n"x,""y""\nz"');
  });
  it('does not evaluate macros inside substituted values and rejects unknown syntax', () => {
    const ctx = { value:'[WAIT]',count:2,index:1,boundaries:{title:'Catalog'} };
    expect(renderTemplate('[VALUE] [COUNT] [INDEX_ID] [BOUNDARY:title]',ctx)).toBe('[WAIT] 2 1 Catalog');
    expect(()=>renderTemplate('[IF]',ctx)).toThrow('Unsupported macro');
    expect(()=>renderTemplate('[BOUNDARY:missing]',ctx)).toThrow('Unknown boundary');
  });
});
describe('HTTP failure handling', () => {
  it('reports HTTP status failures', async () => {
    await server((_req,res)=>{res.writeHead(403);res.end('Forbidden');},async url => { await expect(runProject({...example,url})).rejects.toThrow('HTTP 403'); });
  });
  it('times out a stalled response', async () => {
    await server(()=>{},async url => { await expect(runProject({...example,url,timeoutMs:100})).rejects.toThrow(); });
  });
  it('honors explicit cancellation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(runProject(example,controller.signal)).rejects.toThrow();
  });
  it('rejects redirects rather than silently following to another host', async () => {
    await server((_req,res)=>{res.writeHead(302,{Location:'http://example.com'});res.end();},async url => { await expect(runProject({...example,url})).rejects.toThrow(); });
  });
});
