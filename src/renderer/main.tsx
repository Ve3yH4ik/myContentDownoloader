import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Boundary, Project } from "../core/schema";
import { macroRegistry } from "../core/macros";
import { generateUrls } from "../core/generator";
import type { SessionState, Version, WindowKind } from "../shared/api";
import "./style.css";
const api = window.downloader;
const names: Record<WindowKind, string> = {
  settings: "Налаштування HTTP і проєкту",
  template: "Редактор шаблону",
  scanner: "Вебсканер",
  boundaries: "Редактор границь",
  report: "Звіт виконання",
  projects: "Збережені проєкти",
};
function App() {
  const [state, setState] = useState<SessionState>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    let mounted = true;
    const off = api.subscribe((s) => {
      if (mounted) setState(s);
    });
    api
      .state()
      .then((s) => {
        if (mounted) setState(s);
      })
      .catch((e) => setMessage(String(e)));
    return () => {
      mounted = false;
      off();
    };
  }, []);
  async function perform(task: () => Promise<unknown>, success?: string) {
    try {
      setMessage("");
      await task();
      if (success) setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }
  const view = new URLSearchParams(location.search).get(
    "view",
  ) as WindowKind | null;
  if (!state)
    return (
      <div className="loading">{message || "Завантаження робочого місця…"}</div>
    );
  return (
    <>
      <div className={view ? "child-shell" : "app-shell"}>
        {view ? (
          <>
            <header className="child-header">
              <span className="app-icon">U</span>
              <div>
                <small>UNIVERSAL DATA DOWNLOADER</small>
                <h1>{names[view]}</h1>
              </div>
              <button onClick={() => window.close()}>Закрити</button>
            </header>
            <Child key={view} view={view} state={state} perform={perform} />
          </>
        ) : (
          <Workspace state={state} perform={perform} />
        )}
      </div>
      <footer role="status">
        <span className={state.busy ? "dot running" : "dot"} />
        {message || state.status}
      </footer>
    </>
  );
}
type Props = {
  state: SessionState;
  perform: (task: () => Promise<unknown>, success?: string) => Promise<void>;
};
function Workspace({ state, perform }: Props) {
  const { project, result, busy } = state;
  const [url, setUrl] = useState(project.url);
  const [template, setTemplate] = useState(project.template);
  const [queue, setQueue] = useState(project.urlQueue.join("\n"));
  const [generator, setGenerator] = useState(project.generator);
  const [tab, setTab] = useState("Таблиця");
  useEffect(() => setUrl(project.url), [project.url]);
  useEffect(() => setTemplate(project.template), [project.template]);
  useEffect(
    () => setQueue(project.urlQueue.join("\n")),
    [project.urlQueue.join("\n")],
  );
  useEffect(
    () => setGenerator(project.generator),
    [JSON.stringify(project.generator)],
  );
  const input = () => ({ ...project, url, template });
  const open = (kind: WindowKind) =>
    perform(async () => {
      if (!busy) await api.patch({ url, template });
      await api.window(kind);
    });
  const queueValues = () => [
    ...new Set(
      queue
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  const keys = [...new Set(result?.rows.flatMap(Object.keys) ?? [])];
  function toggle(id: string, enabled: boolean) {
    const visit = (nodes: Boundary[]): Boundary[] =>
      nodes.map((b) => ({
        ...b,
        enabled: b.id === id ? enabled : b.enabled,
        children: visit(b.children),
      }));
    void perform(() => api.patch({ boundaries: visit(project.boundaries) }));
  }
  function tree(nodes: Boundary[], level = 0): React.ReactNode {
    return nodes.map((b) => (
      <React.Fragment key={b.id}>
        <div className="tree-row" style={{ paddingLeft: 12 + level * 16 }}>
          <input
            aria-label={`Увімкнути ${b.name}`}
            type="checkbox"
            disabled={busy}
            checked={b.enabled}
            onChange={(e) => toggle(b.id, e.target.checked)}
          />
          <button
            title="Відкрити редактор границь"
            onClick={() => open("boundaries")}
          >
            <span className={b.repeat ? "repeat-symbol" : "boundary-symbol"}>
              {b.repeat ? "↻" : "◇"}
            </span>
            {b.name}
            <code>{b.id}</code>
          </button>
        </div>
        {tree(b.children, level + 1)}
      </React.Fragment>
    ));
  }
  return (
    <>
      <header className="brand">
        <span className="app-icon">U</span>
        <div>
          <h1>Майстерня даних</h1>
          <small>UNIVERSAL DATA DOWNLOADER</small>
        </div>
        <span className="project-name">{project.name}</span>
        <span className="version-tag">0.2 · Робоче місце</span>
      </header>
      <section className="tool-ribbon" aria-label="Панель інструментів">
        <button
          title="Відкрити збережений проєкт"
          disabled={busy}
          onClick={() => open("projects")}
        >
          ▣ Проєкти
        </button>
        <button
          disabled={busy}
          onClick={() => perform(() => api.save(input()))}
        >
          Зберегти проєкт
        </button>
        <span className="divider" />
        <button
          className="primary"
          disabled={busy}
          onClick={() => perform(() => api.run(input()))}
        >
          ▶ Запустити
        </button>
        <button disabled={!busy} onClick={() => perform(() => api.stop())}>
          ■ Зупинити
        </button>
        <span className="divider" />
        <button onClick={() => open("settings")}>⚙ Налаштування</button>
        <button onClick={() => open("boundaries")}>◇ Границі</button>
        <button onClick={() => open("template")}>▤ Редактор шаблону</button>
        <button onClick={() => open("scanner")}>◎ Вебсканер</button>
        <button onClick={() => open("report")}>▥ Звіт</button>
      </section>
      <section className="download-bar">
        <label className="grow">
          Завантаження WEB-документа
          <input
            aria-label="URL"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <div className="stat">
          <small>МЕТОД</small>
          <b>HTTP GET</b>
        </div>
        <div className="stat">
          <small>ТАЙМ-АУТ</small>
          <b>{project.timeoutMs / 1000} с</b>
        </div>
        <div className="stat">
          <small>ЕКСПОРТ</small>
          <div>
            <button
              disabled={!result}
              onClick={() => perform(() => api.export(result!.csv, "csv"))}
            >
              CSV ↓
            </button>
            <button
              disabled={!result}
              onClick={() => perform(() => api.export(result!.json, "json"))}
            >
              JSON ↓
            </button>
          </div>
        </div>
      </section>
      <section className="work-grid">
        <aside className="panel boundaries">
          <div className="panel-title">
            <h2>Границі парсингу</h2>
            <button
              aria-label="Редагувати границі"
              onClick={() => open("boundaries")}
            >
              ✎
            </button>
          </div>
          <div className="tree">{tree(project.boundaries)}</div>
          <div className="panel-note">
            ◇ Звичайна границя
            <br />↻ Повторювана границя
            <br />
            Вкладені вузли працюють із результатом батьківського.
          </div>
        </aside>
        <section className="panel editor-panel">
          <div className="panel-title">
            <h2>Шаблон результату</h2>
            <button onClick={() => open("template")}>В окремому вікні ↗</button>
          </div>
          <textarea
            className="template-area"
            aria-label="Шаблон результату"
            value={template}
            disabled={busy}
            onChange={(e) => setTemplate(e.target.value)}
            spellCheck={false}
          />
          <div className="editor-bottom">
            <span>[VALUE] · [COUNT] · [INDEX_ID] · [BOUNDARY:id]</span>
            <button
              disabled={busy}
              onClick={() =>
                perform(() => api.patch({ template }), "Шаблон застосовано")
              }
            >
              Застосувати шаблон
            </button>
          </div>
          <nav className="tabs">
            {[
              "Таблиця",
              "JSON",
              "Шаблон",
              "Документ",
              "Трасування",
              "Журнал",
            ].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          <div className="result">
            {!result ? (
              <div className="empty">
                <span>↧</span>
                <h3>Робоче місце готове</h3>
                <p>
                  Вкажіть URL, налаштуйте границі й запустіть обробку.
                  <br />
                  Документ, дані та кроки виконання з’являться тут.
                </p>
              </div>
            ) : tab === "Таблиця" ? (
              <table>
                <thead>
                  <tr>
                    {keys.map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={i}>
                      {keys.map((k) => (
                        <td key={k}>{row[k]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <pre>
                {tab === "JSON"
                  ? result.json
                  : tab === "Шаблон"
                    ? result.output
                    : tab === "Документ"
                      ? result.document
                      : tab === "Трасування"
                        ? JSON.stringify(result.trace, null, 2)
                        : result.log.join("\n")}
              </pre>
            )}
          </div>
        </section>
        <aside className="panel tools-panel">
          <div className="panel-title">
            <h2>Інструменти проєкту</h2>
          </div>
          {(
            [
              ["settings", "HTTP і проєкт", "URL, назва та тайм-аут"],
              ["boundaries", "Редактор границь", "Вкладені вузли й обробка"],
              ["template", "Редактор шаблону", "Макроси та перегляд"],
              ["scanner", "Вебсканер / Sitemap", "Збір посилань у чергу"],
              ["report", "Звіт виконання", "Статус кожного документа"],
              ["projects", "Збережені версії", "Відновлення налаштувань"],
            ] as const
          ).map(([kind, title, detail]) => (
            <button className="tool-card" key={kind} onClick={() => open(kind)}>
              <strong>
                {title}
                <span>↗</span>
              </strong>
              <small>{detail}</small>
            </button>
          ))}
          <div className="panel-note">
            Налаштування й редактори відкриваються в самостійних вікнах.
          </div>
        </aside>
      </section>
      <section className="panel generator">
        <div className="section-caption">
          Генератор посилань <span>Змінна частина: {"{num}"}</span>
        </div>
        <div className="form-row">
          <input
            className="grow"
            aria-label="Шаблон посилань"
            value={generator.pattern}
            disabled={busy}
            onChange={(e) =>
              setGenerator({ ...generator, pattern: e.target.value })
            }
          />
          {(["from", "to", "step"] as const).map((key, i) => (
            <label className="number-field" key={key}>
              {["Від", "До", "Крок"][i]}
              <input
                type="number"
                aria-label={["Від", "До", "Крок"][i]}
                value={generator[key]}
                disabled={busy}
                onChange={(e) =>
                  setGenerator({ ...generator, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <button
            disabled={busy}
            onClick={() =>
              perform(async () => {
                const urls = generateUrls(generator);
                await api.patch({
                  generator,
                  urlQueue: [...new Set([...queueValues(), ...urls])],
                });
              }, "Посилання додано до черги")
            }
          >
            Згенерувати
          </button>
        </div>
      </section>
      <section className="panel queue-panel">
        <div className="panel-title">
          <h2>
            Черга URL <span className="count">{project.urlQueue.length}</span>
          </h2>
          <div>
            <button onClick={() => open("scanner")}>
              Вебсканер / Sitemap ↗
            </button>
            <button
              disabled={busy}
              onClick={() =>
                perform(
                  () => api.patch({ urlQueue: queueValues() }),
                  "Чергу застосовано",
                )
              }
            >
              Застосувати список
            </button>
            <button
              disabled={busy || !project.urlQueue.length}
              onClick={() => perform(() => api.patch({ urlQueue: [] }))}
            >
              Очистити
            </button>
            <button
              className="primary"
              disabled={busy || !queueValues().length}
              onClick={() =>
                perform(async () => {
                  await api.patch({ url, template, urlQueue: queueValues() });
                  await api.runQueue();
                })
              }
            >
              ▶ Обробити чергу
            </button>
          </div>
        </div>
        <textarea
          aria-label="Черга URL"
          value={queue}
          disabled={busy}
          onChange={(e) => setQueue(e.target.value)}
          placeholder="Один URL у рядку. Вставте список, згенеруйте адреси або додайте їх із вебсканера."
          spellCheck={false}
        />
      </section>
    </>
  );
}
function Child({ view, state, perform }: Props & { view: WindowKind }) {
  const p = state.project;
  const [name, setName] = useState(p.name);
  const [url, setUrl] = useState(p.url);
  const [timeout, setTimeoutValue] = useState(p.timeoutMs);
  const [template, setTemplate] = useState(p.template);
  const [preview, setPreview] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const [config, setConfig] = useState(JSON.stringify(p.boundaries, null, 2));
  const [scannerUrl, setScannerUrl] = useState(p.scannerUrl || p.url);
  const [sameOrigin, setSameOrigin] = useState(p.scannerSameOrigin);
  const [links, setLinks] = useState<string[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (view === "projects") api.list().then(setVersions);
  }, [view]);
  const apply = async (patch: Partial<Project>, save = false) => {
    await api.patch(patch);
    if (save) await api.save((await api.state()).project);
  };
  function insert(text: string) {
    const el = editor.current;
    if (!el) {
      setTemplate((v) => v + text);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setTemplate(template.slice(0, start) + text + template.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }
  if (view === "settings")
    return (
      <section className="child-content">
        <p className="intro">
          Параметри завантаження й назва поточного проєкту. Зміни застосовуються
          до головного вікна.
        </p>
        <label className="field">
          Назва проєкту
          <input
            aria-label="Назва проєкту"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          URL документа
          <input
            aria-label="URL документа"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <label className="field">
          Тайм-аут, мс
          <input
            aria-label="Тайм-аут, мс"
            type="number"
            min={100}
            max={120000}
            value={timeout}
            onChange={(e) => setTimeoutValue(Number(e.target.value))}
          />
        </label>
        <div className="info-box">
          HTTP GET · UTF-8 · до 5 MiB · автоматичні перенаправлення вимкнено.
        </div>
        <div className="actions">
          <button
            className="primary"
            disabled={state.busy}
            onClick={() =>
              perform(
                () => apply({ name, url, timeoutMs: timeout }),
                "Налаштування застосовано",
              )
            }
          >
            Застосувати
          </button>
          <button
            disabled={state.busy}
            onClick={() =>
              perform(
                () => apply({ name, url, timeoutMs: timeout }, true),
                "Налаштування збережено в проєкті",
              )
            }
          >
            Застосувати й зберегти
          </button>
        </div>
      </section>
    );
  if (view === "template")
    return (
      <section className="child-content">
        <p className="intro">
          Редагуйте текст виведення. Попередній перегляд використовує останній
          результат без повторного завантаження документа.
        </p>
        <div className="macro-library">
          {macroRegistry.map((m) => (
            <button
              key={m.name}
              title={m.description}
              onClick={() => insert(m.syntax)}
            >
              {m.syntax}
            </button>
          ))}
          {p.boundaries.map((b) => (
            <button key={b.id} onClick={() => insert(`[BOUNDARY:${b.id}]`)}>
              {b.name}
            </button>
          ))}
        </div>
        <textarea
          ref={editor}
          className="large-editor"
          aria-label="Текст шаблону"
          spellCheck={false}
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value);
            setPreview("");
          }}
        />
        <div className="actions">
          <button
            className="primary"
            disabled={state.busy}
            onClick={() =>
              perform(() => apply({ template }), "Шаблон застосовано")
            }
          >
            Застосувати
          </button>
          <button
            disabled={state.busy}
            onClick={() =>
              perform(
                () => apply({ template }, true),
                "Шаблон збережено в проєкті",
              )
            }
          >
            Застосувати й зберегти
          </button>
          <button
            disabled={!state.result}
            onClick={() =>
              perform(async () => setPreview(await api.preview(template)))
            }
          >
            Попередній перегляд
          </button>
        </div>
        <h2>Результат шаблону</h2>
        <pre className="preview-box">
          {preview ||
            "Натисніть «Попередній перегляд» після виконання сценарію."}
        </pre>
      </section>
    );
  if (view === "boundaries")
    return (
      <section className="child-content">
        <p className="intro">
          Редактор дерева границь у форматі JSON. children задає вкладені
          границі, pipeline — порядок обробки. Перевірка схеми виконується перед
          застосуванням.
        </p>
        <textarea
          className="large-editor tall"
          aria-label="Конфігурація границь"
          spellCheck={false}
          value={config}
          onChange={(e) => setConfig(e.target.value)}
        />
        <div className="actions">
          <button
            className="primary"
            disabled={state.busy}
            onClick={() =>
              perform(
                () => apply({ boundaries: JSON.parse(config) }),
                "Границі застосовано",
              )
            }
          >
            Застосувати
          </button>
          <button
            disabled={state.busy}
            onClick={() =>
              perform(
                () => apply({ boundaries: JSON.parse(config) }, true),
                "Границі збережено в проєкті",
              )
            }
          >
            Застосувати й зберегти
          </button>
        </div>
      </section>
    );
  if (view === "scanner")
    return (
      <section className="child-content">
        <p className="intro">
          Отримує посилання з однієї HTML-сторінки або XML Sitemap (loc). Без
          JavaScript та рекурсивного обходу. Дублікати й фрагменти #
          видаляються.
        </p>
        <label className="field">
          Адреса сторінки або Sitemap
          <input
            aria-label="Адреса сканування"
            value={scannerUrl}
            disabled={state.busy}
            onChange={(e) => {
              setScannerUrl(e.target.value);
              setLinks([]);
            }}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={sameOrigin}
            disabled={state.busy}
            onChange={(e) => {
              setSameOrigin(e.target.checked);
              setLinks([]);
            }}
          />
          Лише той самий origin (протокол, домен і порт)
        </label>
        <div className="actions">
          <button
            className="primary"
            disabled={state.busy}
            onClick={() =>
              perform(async () => {
                setLinks([]);
                setLinks(await api.scan(scannerUrl, sameOrigin));
              })
            }
          >
            Сканувати
          </button>
          <button
            disabled={!state.busy}
            onClick={() => perform(() => api.stop())}
          >
            Зупинити
          </button>
          <button
            disabled={state.busy || !links.length}
            onClick={() =>
              perform(async () => {
                const current = await api.state();
                await api.patch({
                  urlQueue: [
                    ...new Set([...current.project.urlQueue, ...links]),
                  ],
                });
              }, "Посилання додано до черги")
            }
          >
            Додати до черги
          </button>
          <button
            disabled={state.busy}
            onClick={() =>
              perform(
                () =>
                  apply({ scannerUrl, scannerSameOrigin: sameOrigin }, true),
                "Параметри сканера збережено",
              )
            }
          >
            Зберегти параметри
          </button>
        </div>
        <h2>Знайдені посилання: {links.length}</h2>
        <ol className="link-list">
          {links.map((link) => (
            <li key={link}>{link}</li>
          ))}
        </ol>
      </section>
    );
  if (view === "projects")
    return (
      <section className="child-content">
        <p className="intro">
          Кожне збереження створює окрему версію. Відкриття відновлює границі,
          шаблон, HTTP, чергу та параметри генератора/сканера.
        </p>
        <div className="actions">
          <button
            onClick={() => perform(async () => setVersions(await api.list()))}
          >
            Оновити список
          </button>
          <button
            className="primary"
            disabled={!selected || state.busy}
            onClick={() =>
              perform(
                () => api.open(Number(selected)),
                "Проєкт відкрито в головному вікні",
              )
            }
          >
            Відкрити
          </button>
        </div>
        <select
          className="version-list"
          aria-label="Збережені версії"
          size={12}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              #{v.id} · {v.name} ·{" "}
              {new Date(v.saved_at).toLocaleString("uk-UA")}
            </option>
          ))}
        </select>
      </section>
    );
  const csv = [
    ["URL", "Status", "Rows", "Duration ms", "Message", "Time"],
    ...state.history.map((h) => [
      h.url,
      h.status,
      String(h.rows),
      h.durationMs.toFixed(0),
      h.message,
      h.time,
    ]),
  ]
    .map((row) => row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","))
    .join("\r\n");
  return (
    <section className="child-content">
      <div className="actions">
        <span className="grow">
          Останні {state.history.length} документів поточного сеансу (до 1000)
        </span>
        <button
          disabled={!state.history.length}
          onClick={() => perform(() => api.export(csv, "csv"))}
        >
          Експорт звіту CSV
        </button>
      </div>
      <div className="report-table">
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Адреса документа</th>
              <th>Статус</th>
              <th>Рядків</th>
              <th>Час, мс</th>
              <th>Повідомлення</th>
            </tr>
          </thead>
          <tbody>
            {state.history.map((h, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{h.url}</td>
                <td
                  className={h.status === "ok" ? "success-text" : "error-text"}
                >
                  {h.status === "ok" ? "Успішно" : "Помилка"}
                </td>
                <td>{h.rows}</td>
                <td>{h.durationMs.toFixed(0)}</td>
                <td>{h.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!state.history.length && (
          <div className="empty">
            Запустіть обробку документа або черги. Звіт оновлюється автоматично.
          </div>
        )}
      </div>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
