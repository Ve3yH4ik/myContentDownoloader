import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import example from '../../examples/products.json';
import type { Project } from '../core/schema';
import type { RunResult } from '../core/engine';
import './style.css';
interface Version { id: number; name: string; saved_at: string }
declare global { interface Window { downloader: {
  run(project: unknown): Promise<RunResult>; stop(): Promise<void>; save(project: unknown): Promise<number>;
  list(): Promise<Version[]>; open(id: number): Promise<Project>; export(content: string, format: 'csv' | 'json'): Promise<boolean>;
} } }
function App() {
  const [config, setConfig] = useState(JSON.stringify(example, null, 2));
  const [url, setUrl] = useState(example.url); const [result, setResult] = useState<RunResult>();
  const [busy, setBusy] = useState(false); const [status, setStatus] = useState('Готово до запуску');
  const [versions, setVersions] = useState<Version[]>([]); const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('Таблиця');
  const report = (e: unknown) => setStatus(e instanceof Error ? e.message : String(e));
  useEffect(() => { window.downloader.list().then(setVersions).catch(report); }, []);
  const project = () => ({ ...JSON.parse(config), url });
  async function run() {
    setBusy(true); setResult(undefined); setStatus('Завантаження та обробка…');
    try { const value = await window.downloader.run(project()); setResult(value); setStatus(`Завершено · ${value.rows.length} рядків`); }
    catch (e) { report(e); } finally { setBusy(false); }
  }
  async function save() {
    try { const id = await window.downloader.save(project()); setVersions(await window.downloader.list()); setSelected(String(id)); setStatus(`Збережено версію №${id}`); } catch (e) { report(e); }
  }
  async function open() {
    try { const p = await window.downloader.open(Number(selected)); setConfig(JSON.stringify(p, null, 2)); setUrl(p.url); setResult(undefined); setStatus(`Відкрито версію №${selected}`); } catch (e) { report(e); }
  }
  async function exportResult(format: 'csv' | 'json') {
    try { if (result && await window.downloader.export(result[format], format)) setStatus(`Експорт ${format.toUpperCase()} збережено`); } catch (e) { report(e); }
  }
  const keys = [...new Set(result?.rows.flatMap(Object.keys) ?? [])];
  return <main>
    <header><div><small>UNIVERSAL DATA DOWNLOADER / 0.1</small><h1>Майстерня даних</h1></div><span className="badge">Етап 1 · HTTP + границі</span></header>
    <section className="toolbar"><label className="url">Адреса документа<input aria-label="URL" value={url} onChange={e => setUrl(e.target.value)} disabled={busy}/></label><button className="primary" onClick={run} disabled={busy}>▶ Запустити</button><button onClick={() => window.downloader.stop().catch(report)} disabled={!busy}>■ Зупинити</button><button onClick={save} disabled={busy}>Зберегти проєкт</button></section>
    <section className="workspace"><aside><div className="panel-title"><h2>Проєкт і границі</h2><span>JSON v1</span></div><p>Змініть границі, вкладені вузли та порядок pipeline. Усі налаштування проходять перевірку перед виконанням.</p><textarea aria-label="Конфігурація проєкту" spellCheck={false} value={config} onChange={e => setConfig(e.target.value)} disabled={busy}/><div className="versions"><select aria-label="Збережені версії" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Збережені версії…</option>{versions.map(v => <option key={v.id} value={v.id}>#{v.id} {v.name} · {v.saved_at}</option>)}</select><button disabled={!selected || busy} onClick={open}>Відкрити</button></div></aside>
    <article><div className="panel-title"><h2>Результат виконання</h2><div><button disabled={!result} onClick={() => exportResult('csv')}>CSV ↓</button><button disabled={!result} onClick={() => exportResult('json')}>JSON ↓</button></div></div><nav>{['Таблиця','JSON','Шаблон','Документ','Трасування','Журнал'].map(t => <button className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>{t}</button>)}</nav><div className="result">
    {!result ? <div className="empty"><b>Документ → границі → результат</b><p>Запустіть сценарій, щоб переглянути дані й кожен крок обробки.</p><p>Для прикладу запустіть <code>npm run fixture</code>.</p></div> : tab === 'Таблиця' ? <table><thead><tr>{keys.map(k => <th key={k}>{k}</th>)}</tr></thead><tbody>{result.rows.map((row,i) => <tr key={i}>{keys.map(k => <td key={k}>{row[k]}</td>)}</tr>)}</tbody></table> : <pre>{tab === 'JSON' ? result.json : tab === 'Шаблон' ? result.output : tab === 'Документ' ? result.document : tab === 'Трасування' ? JSON.stringify(result.trace,null,2) : result.log.join('\n')}</pre>}
    </div></article></section><footer role="status"><i className={busy ? 'running' : ''}/>{status}</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
