import React, { useEffect, useState } from "react";
import type { SessionState, WindowKind } from "../shared/api";
import type { RequestProfile, HttpResult } from "../core/request-profile";
import type { BrowserSnapshot, BrowserAction } from "../core/browser";
import type { ProxyProfile } from "../core/proxies";
import type { AppSettings } from "../core/settings";
const api = window.downloader;
const groups = [
  ["general", "General"],
  ["performance", "Performance & Threads"],
  ["csv", "CSV Delimiters"],
  ["transfer", "FTP / SFTP"],
  ["captcha", "CAPTCHA Services"],
  ["regex", "Regular Expressions"],
  ["defaults", "Defaults"],
  ["policies", "Project Policies"],
  ["encodings", "Encodings"],
  ["editor", "Editor Highlighting"],
  ["browser", "Browser Settings"],
  ["cache", "Cache Management"],
] as const;
function useTask() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return {
    busy,
    message,
    run: async (fn: () => Promise<unknown>, success = "Готово") => {
      setBusy(true);
      setMessage("Виконання…");
      try {
        await fn();
        setMessage(success);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
  };
}
function SecretEditor() {
  const [id, setId] = useState("");
  const [value, setValue] = useState("");
  const task = useTask();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    api
      .service<string[]>("secret.list")
      .then(setIds)
      .catch(() => {});
  }, []);
  return (
    <details className="secret-box">
      <summary>
        Захищені секрети Windows (ID замість пароля в конфігурації)
      </summary>
      <p>
        Для headers використовуйте JSON-об’єкт, для proxy —{" "}
        {'{"username":"…","password":"…"}'}, для cookie — name=value. Секрети не
        повертаються в редактор і не входять в експорт налаштувань.
      </p>
      <div className="form-row">
        <input
          aria-label="ID секрету"
          placeholder="ID секрету"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <input
          className="grow"
          type="password"
          aria-label="Значення секрету"
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          disabled={task.busy || !id || !value}
          onClick={() =>
            task.run(async () => {
              await api.service("secret.set", { id, value });
              setValue("");
              setIds(await api.service("secret.list"));
            })
          }
        >
          Захистити й зберегти
        </button>
        <button
          disabled={task.busy || !ids.includes(id)}
          onClick={() =>
            task.run(async () => {
              await api.service("secret.delete", id);
              setIds(await api.service("secret.list"));
            })
          }
        >
          Видалити секрет
        </button>
      </div>
      <p>
        Наявні ID: {ids.join(", ") || "немає"}. {task.message}
      </p>
    </details>
  );
}
export function EngineTools({
  view,
  state,
}: {
  view: WindowKind;
  state: SessionState;
}) {
  if (view === "application") return <ApplicationSettings />;
  if (view === "proxies") return <ProxyManager />;
  return <RequestTools browser={view === "browser"} state={state} />;
}
function ApplicationSettings() {
  const task = useTask();
  const [data, setData] = useState<{
    value: AppSettings;
    sources: Record<string, string>;
    defaults: AppSettings;
    notes: Record<string, string>;
  }>();
  const [group, setGroup] = useState<(typeof groups)[number][0]>("general");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [cache, setCache] = useState("");
  const load = async () => {
    const d = await api.service<NonNullable<typeof data>>("settings.read");
    setData(d);
    setDraft({ ...d.value[group] });
  };
  useEffect(() => {
    void task.run(load);
  }, [group]);
  const choices: Record<string, string[]> = {
    browserEngine: ["chromium"],
    macroCompatibility: ["udd-v1"],
    protocol: ["ftp", "ftps", "sftp"],
    provider: ["disabled", "custom"],
    delimiter: [",", ";", "\t", "|"],
    lineEnding: ["CRLF", "LF"],
    manual: ["keep", "replace", "merge", "rename", "ask"],
    scheduler: ["keep", "replace", "merge", "rename", "ask"],
    proxyImport: ["keep", "replace", "merge", "rename", "ask"],
    browserNames: ["keep", "replace", "merge", "rename", "ask"],
    linkedFiles: ["keep", "replace", "merge", "rename", "ask"],
    missingDependencies: ["keep", "replace", "merge", "rename", "ask"],
    response: [
      "auto",
      "utf-8",
      "windows-1251",
      "windows-1252",
      "iso-8859-1",
      "utf-16le",
    ],
    export: ["utf-8", "windows-1251", "utf-16le"],
  };
  return (
    <div className="settings-layout">
      <nav>
        {groups.map(([key, label]) => (
          <button
            key={key}
            className={key === group ? "active" : ""}
            onClick={() => setGroup(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <section>
        <p className="intro">
          Типізовані налаштування з defaults, валідацією й міграціями.
          Застосування без перезапуску; наступний браузер використовує нові
          параметри. Джерело кожного значення показано праворуч.
        </p>
        {data?.notes[group] && (
          <div className="info-box">{data.notes[group]}</div>
        )}
        {Object.entries(draft).map(([key, value]) => (
          <div className="setting-row" key={key}>
            <label>{key}</label>
            {typeof value === "boolean" ? (
              <input
                aria-label={key}
                type="checkbox"
                checked={value}
                onChange={(e) =>
                  setDraft({ ...draft, [key]: e.target.checked })
                }
              />
            ) : choices[key] ? (
              <select
                aria-label={key}
                value={String(value)}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              >
                {choices[key].map((v) => (
                  <option key={v} value={v}>
                    {v === "\t" ? "TAB" : v}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={key}
                type={typeof value === "number" ? "number" : "text"}
                value={String(value)}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    [key]:
                      typeof value === "number"
                        ? Number(e.target.value)
                        : e.target.value,
                  })
                }
              />
            )}
            <small>{data?.sources[`${group}.${key}`] ?? "default"}</small>
            <button
              title="Скинути параметр"
              onClick={() =>
                task.run(async () => {
                  await api.service("settings.reset", { group, key });
                  await load();
                })
              }
            >
              ↺
            </button>
          </div>
        ))}
        <div className="actions">
          <button
            className="primary"
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await api.service("settings.write", { [group]: draft });
                await load();
              })
            }
          >
            Застосувати групу
          </button>
          <button
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await api.service("settings.reset", { group });
                await load();
              })
            }
          >
            Скинути групу
          </button>
          <button
            onClick={() => task.run(() => api.service("settings.export"))}
          >
            Експорт налаштувань
          </button>
          <button
            onClick={() =>
              task.run(async () => {
                await api.service("settings.import");
                await load();
              })
            }
          >
            Імпорт налаштувань
          </button>
        </div>
        {group === "cache" && (
          <div className="actions">
            <button
              onClick={() =>
                task.run(async () => {
                  const info = await api.service<{
                    files: number;
                    bytes: number;
                  }>("cache.info");
                  setCache(`${info.files} файлів / ${info.bytes} байт`);
                })
              }
            >
              Перевірити кеш
            </button>
            <button
              onClick={() =>
                task.run(async () => {
                  await api.service("cache.clear");
                  setCache("Кеш очищено");
                })
              }
            >
              Очистити кеш
            </button>
            <span>{cache}</span>
          </div>
        )}
        <p className="tool-status" role="status">
          {task.message}
        </p>
        <SecretEditor />
      </section>
    </div>
  );
}
function ProxyManager() {
  const task = useTask();
  const [data, setData] = useState<{
    proxies: ProxyProfile[];
    log: { id: string; ok: boolean; durationMs: number; time: string }[];
    schedule?: { url: string; seconds: number };
  }>({ proxies: [], log: [] });
  const [text, setText] = useState("");
  const [url, setUrl] = useState("http://127.0.0.1:4179");
  const [seconds, setSeconds] = useState(300);
  const [intervalActive, setIntervalActive] = useState(false);
  const [edit, setEdit] = useState("");
  const load = async () => {
    const value = await api.service<typeof data>("proxy.list");
    setData(value);
    if (value.schedule) {
      setIntervalActive(value.schedule.seconds > 0);
      if (value.schedule.seconds) setSeconds(value.schedule.seconds);
      if (value.schedule.url) setUrl(value.schedule.url);
    }
  };
  useEffect(() => {
    void task.run(load);
  }, []);
  return (
    <section className="child-content">
      <p className="intro">
        Формат: http://host:port, https://user:pass@host:port,
        socks4://host:port, socks5://user:pass@host:port. Авторизація під час
        імпорту відокремлюється та захищається Windows. Використовуйте лише свої
        або дозволені проксі.
      </p>
      <textarea
        aria-label="Імпорт проксі"
        className="large-editor"
        value={text}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="actions">
        <button
          disabled={task.busy || !text}
          onClick={() =>
            task.run(async () => {
              await api.service("proxy.import", { text });
              setText("");
              await load();
            })
          }
        >
          Імпортувати проксі
        </button>
        <button onClick={() => task.run(load)}>Оновити статистику</button>
      </div>
      <div className="form-row">
        <input
          className="grow"
          aria-label="URL перевірки проксі"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          disabled={task.busy}
          onClick={() =>
            task.run(async () => {
              await api.service("proxy.check", url);
              await load();
            })
          }
        >
          Перевірити всі
        </button>
        <input
          type="number"
          min={30}
          max={86400}
          aria-label="Інтервал перевірки"
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
        />
        <button
          onClick={() =>
            task.run(async () => {
              await api.service("proxy.schedule", {
                url,
                seconds: intervalActive ? 0 : seconds,
              });
              setIntervalActive(!intervalActive);
            })
          }
        >
          {intervalActive
            ? "Зупинити періодичну перевірку"
            : "Увімкнути періодичну перевірку"}
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Профіль / ID</th>
            <th>Сервер</th>
            <th>Успіх / помилки</th>
            <th>Дії</th>
          </tr>
        </thead>
        <tbody>
          {data.proxies.map((p) => (
            <tr key={p.id}>
              <td>
                {p.name}
                <br />
                <code>{p.id}</code>
              </td>
              <td>
                {p.server}
                <br />
                {p.credentialId ? "Авторизація захищена" : "Без авторизації"}
              </td>
              <td>
                {p.success} / {p.failure}
              </td>
              <td>
                <button onClick={() => setEdit(JSON.stringify(p, null, 2))}>
                  Редагувати
                </button>
                <button
                  onClick={() =>
                    task.run(async () => {
                      await api.service("proxy.update", {
                        ...p,
                        enabled: !p.enabled,
                      });
                      await load();
                    })
                  }
                >
                  {p.enabled ? "Вимкнути" : "Увімкнути"}
                </button>
                <button
                  onClick={() =>
                    task.run(async () => {
                      await api.service("proxy.delete", p.id);
                      await load();
                    })
                  }
                >
                  Видалити
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <>
          <p>
            origins — дозволені джерела (origin); порожній список — усі.
            credentialId — ID захищеної авторизації.
          </p>
          <textarea
            className="large-editor"
            aria-label="Профіль проксі"
            value={edit}
            onChange={(e) => setEdit(e.target.value)}
          />
          <button
            onClick={() =>
              task.run(async () => {
                await api.service("proxy.update", JSON.parse(edit));
                await load();
              })
            }
          >
            Зберегти профіль проксі
          </button>
        </>
      )}
      <details>
        <summary>Журнал використання ({data.log.length})</summary>
        <pre>{JSON.stringify(data.log, null, 2)}</pre>
      </details>
      <p className="tool-status" role="status">
        {task.message}
      </p>
      <SecretEditor />
    </section>
  );
}
function RequestTools({
  browser,
  state,
}: {
  browser: boolean;
  state: SessionState;
}) {
  const task = useTask();
  const [profile, setProfile] = useState("");
  const [http, setHttp] = useState<HttpResult>();
  const [snap, setSnap] = useState<BrowserSnapshot>();
  const [tab, setTab] = useState("Preview");
  const [selector, setSelector] = useState("body");
  const [inspection, setInspection] = useState("");
  const [code, setCode] = useState("document.title");
  const [recording, setRecording] = useState(false);
  const [sessionId, setSessionId] = useState("browser-session");
  const [steps, setSteps] = useState<BrowserAction[]>(
    state.project.browserActions,
  );
  const [type, setType] = useState("click");
  const [draft, setDraft] = useState("");
  const [editIndex, setEditIndex] = useState<number>();
  const [keyboardText, setKeyboardText] = useState("");
  let draftObject: Record<string, unknown> = {};
  try {
    draftObject = JSON.parse(draft || "{}");
  } catch {}
  useEffect(() => {
    void task.run(async () =>
      setProfile(JSON.stringify(await api.service("http.defaults"), null, 2)),
    );
  }, []);
  const request = () => JSON.parse(profile) as RequestProfile;
  async function apply() {
    const p = request();
    await api.patch({ url: p.url, requestProfile: p });
  }
  const actionDefaults: Record<string, unknown> = {
    click: { type: "click", selector: "button" },
    fill: { type: "fill", selector: "input", value: "" },
    select: { type: "select", selector: "select", value: "" },
    check: { type: "check", selector: "input", checked: true },
    press: { type: "press", selector: "input", value: "Enter" },
    scroll: { type: "scroll", x: 0, y: 500 },
    waitForSelector: { type: "waitForSelector", selector: "body" },
    waitForLoad: { type: "waitForLoad", state: "domcontentloaded" },
    goto: { type: "goto", value: state.project.url },
    evaluate: { type: "evaluate", code: "document.title" },
  };
  return (
    <section className="child-content">
      <details open={!browser}>
        <summary>
          Спільний RequestProfile: URL, метод, заголовки, секрети, proxyId,
          ресурси
        </summary>
        <p className="intro">
          proxyId: порожньо — без проксі, ID — конкретний профіль, rotate —
          ротація за прив’язкою origins. Cookies, Authorization та API-ключі
          задаються через secret ID. POST/PATCH повторюються лише з
          retryUnsafe=true.
        </p>
        <textarea
          aria-label="RequestProfile"
          className="large-editor"
          value={profile}
          spellCheck={false}
          onChange={(e) => setProfile(e.target.value)}
        />
        <div className="actions">
          <button disabled={task.busy} onClick={() => task.run(apply)}>
            Застосувати RequestProfile
          </button>
          <button
            disabled={task.busy}
            onClick={() =>
              task.run(async () => {
                await apply();
                await api.save((await api.state()).project);
              })
            }
          >
            Зберегти профіль у проєкті
          </button>
        </div>
      </details>
      <div className="actions">
        {browser ? (
          <>
            <button
              className="primary"
              disabled={task.busy}
              onClick={() =>
                task.run(async () => {
                  await apply();
                  setSnap(await api.service("browser.open", request()));
                })
              }
            >
              Відкрити Chromium
            </button>
            <button
              disabled={task.busy || !snap}
              onClick={() =>
                task.run(async () =>
                  setSnap(await api.service("browser.snapshot")),
                )
              }
            >
              Оновити браузер
            </button>
            <button
              onClick={() =>
                task.run(async () => {
                  await api.service("browser.close");
                  setSnap(undefined);
                })
              }
            >
              Закрити браузер
            </button>
            <button
              disabled={!snap}
              onClick={() =>
                task.run(async () => {
                  await api.service("browser.record", !recording);
                  setRecording(!recording);
                })
              }
            >
              {recording ? "Зупинити запис" : "Записувати дії"}
            </button>
            <button
              disabled={!snap}
              onClick={() =>
                task.run(async () => {
                  const id = await api.service<string | false>(
                    "browser.saveSession",
                    sessionId,
                  );
                  if (id) setSessionId(id);
                })
              }
            >
              Зберегти сесію
            </button>
            <button
              onClick={() =>
                task.run(async () =>
                  setSnap(
                    await api.service("browser.restoreSession", sessionId),
                  ),
                )
              }
            >
              Відновити сесію
            </button>
            <input
              aria-label="Ім’я браузерної сесії"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            />
            <button
              disabled={!snap}
              onClick={() =>
                task.run(() => api.service("browser.parse", "html"))
              }
            >
              HTML → Parsing
            </button>
            <button
              disabled={!snap}
              onClick={() =>
                task.run(() => api.service("browser.parse", "json"))
              }
            >
              JSON → Parsing
            </button>
          </>
        ) : (
          <>
            <button
              className="primary"
              disabled={task.busy || !profile}
              onClick={() =>
                task.run(async () => {
                  await apply();
                  setHttp(await api.service("http.run", request()));
                })
              }
            >
              Виконати HTTP
            </button>
            <button
              disabled={!http}
              onClick={() => task.run(() => api.service("http.save"))}
            >
              Зберегти тіло відповіді
            </button>
            <button
              disabled={!http || http.binary}
              onClick={() => task.run(() => api.service("http.parse"))}
            >
              Відповідь → Parsing
            </button>
          </>
        )}
      </div>
      <p className="tool-status" role="status">
        {task.message}
      </p>
      {!browser && http && (
        <>
          <div className="info-box">
            HTTP {http.status} · {http.bytes} байт ·{" "}
            {http.durationMs.toFixed(0)} мс · спроб {http.attempts} ·{" "}
            {http.binary ? "Binary" : "Text"}
          </div>
          <details>
            <summary>Headers / Redirects / Log</summary>
            <pre>
              {JSON.stringify(
                {
                  headers: http.headers,
                  redirects: http.redirects,
                  log: http.log,
                },
                null,
                2,
              )}
            </pre>
          </details>
          <pre className="preview-box">
            {http.binary
              ? `Base64 preview:\n${http.bodyBase64.slice(0, 10000)}`
              : http.text.slice(0, 200000)}
          </pre>
        </>
      )}
      {browser && (
        <>
          <nav className="tabs">
            {[
              "Preview",
              "DOM / CSS / XPath",
              "JavaScript",
              "Scenario",
              "Network / Log",
            ].map((t) => (
              <button
                className={tab === t ? "active" : ""}
                key={t}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
          {tab === "Preview" && (
            <>
              <div className="form-row">
                <input
                  className="grow"
                  type="password"
                  aria-label="Введення у браузер"
                  placeholder="Текст для елемента у фокусі"
                  value={keyboardText}
                  onChange={(e) => setKeyboardText(e.target.value)}
                />
                <button
                  disabled={!snap || task.busy}
                  onClick={() =>
                    task.run(async () => {
                      setSnap(await api.service("browser.type", keyboardText));
                      setKeyboardText("");
                    })
                  }
                >
                  Ввести у фокус
                </button>
              </div>
              {snap ? (
                <img
                  className="browser-preview"
                  alt="Chromium preview"
                  onWheel={(e) => {
                    if (!task.busy)
                      void task.run(async () =>
                        setSnap(
                          await api.service("browser.wheel", {
                            x: e.deltaX,
                            y: e.deltaY,
                          }),
                        ),
                      );
                  }}
                  src={`data:image/jpeg;base64,${snap.screenshot}`}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x =
                      ((e.clientX - rect.left) * e.currentTarget.naturalWidth) /
                      rect.width;
                    const y =
                      ((e.clientY - rect.top) * e.currentTarget.naturalHeight) /
                      rect.height;
                    void task.run(async () =>
                      setSnap(await api.service("browser.point", { x, y })),
                    );
                  }}
                />
              ) : (
                <div className="empty">
                  Відкрийте Chromium. Тут з’явиться інтерактивний знімок
                  сторінки.
                  <br />
                  Видимий/фоновий режим — Application Settings → Browser
                  Settings → headless.
                </div>
              )}
            </>
          )}
          {tab === "DOM / CSS / XPath" && (
            <>
              <div className="form-row">
                <input
                  aria-label="CSS або XPath"
                  className="grow"
                  value={selector}
                  onChange={(e) => setSelector(e.target.value)}
                />
                <button
                  disabled={!snap}
                  onClick={() =>
                    task.run(async () =>
                      setInspection(
                        JSON.stringify(
                          await api.service("browser.inspect", selector),
                          null,
                          2,
                        ),
                      ),
                    )
                  }
                >
                  Inspect
                </button>
              </div>
              <pre className="preview-box">{inspection}</pre>
              <table>
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>ID / CSS</th>
                    <th>Text</th>
                  </tr>
                </thead>
                <tbody>
                  {snap?.dom.map((node, i) => (
                    <tr key={i} onClick={() => setSelector(node.selector)}>
                      <td>{node.tag}</td>
                      <td>{node.selector}</td>
                      <td>{node.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {tab === "JavaScript" && (
            <>
              <p className="intro">
                Код виконується в контексті сторінки Chromium, без доступу до
                Node.js. Не запускайте неперевірений код.
              </p>
              <textarea
                aria-label="JavaScript"
                className="large-editor"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className="actions">
                <button
                  disabled={!snap || task.busy}
                  onClick={() =>
                    task.run(async () =>
                      setSnap(
                        await api.service("browser.act", {
                          type: "evaluate",
                          code,
                        }),
                      ),
                    )
                  }
                >
                  Виконати JavaScript
                </button>
                <button
                  onClick={() =>
                    setSteps([...steps, { type: "evaluate", code }])
                  }
                >
                  Додати JS до сценарію
                </button>
              </div>
              <pre className="preview-box">
                {JSON.stringify(snap?.json, null, 2)}
              </pre>
            </>
          )}
          {tab === "Scenario" && (
            <>
              <div className="actions">
                <select
                  aria-label="Тип браузерної дії"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {Object.keys(actionDefaults).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    setEditIndex(undefined);
                    setDraft(JSON.stringify(actionDefaults[type], null, 2));
                  }}
                >
                  Нова дія
                </button>
                <button
                  disabled={!snap}
                  onClick={() =>
                    task.run(async () => {
                      const current =
                        await api.service<BrowserSnapshot>("browser.snapshot");
                      setSnap(current);
                      setSteps([...steps, ...current.actions]);
                    })
                  }
                >
                  Запис → сценарій
                </button>
                <button
                  onClick={() =>
                    task.run(() => api.patch({ browserActions: steps }))
                  }
                >
                  Застосувати сценарій
                </button>
                <button
                  disabled={!snap || task.busy}
                  onClick={() =>
                    task.run(async () => {
                      await api.patch({ browserActions: steps });
                      setSnap(await api.service("browser.replay"));
                    })
                  }
                >
                  Виконати сценарій
                </button>
              </div>
              {steps.map((step, i) => (
                <div
                  className="action-row"
                  key={i}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", String(i))
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (
                      !Number.isInteger(from) ||
                      from < 0 ||
                      from >= steps.length
                    )
                      return;
                    const next = [...steps];
                    const [moved] = next.splice(from, 1);
                    next.splice(i, 0, moved);
                    setSteps(next);
                  }}
                >
                  <b>
                    {i + 1}. {step.type}
                  </b>
                  <code>{"selector" in step ? step.selector : ""}</code>
                  <button
                    onClick={() => {
                      setDraft(JSON.stringify(step, null, 2));
                      setEditIndex(i);
                    }}
                  >
                    Редагувати
                  </button>
                  <button
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...steps];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      setSteps(next);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    disabled={i === steps.length - 1}
                    onClick={() => {
                      const next = [...steps];
                      [next[i + 1], next[i]] = [next[i], next[i + 1]];
                      setSteps(next);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => setSteps(steps.filter((_, n) => n !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              {draft && (
                <>
                  <div className="action-fields">
                    {Object.entries(draftObject)
                      .filter(([key]) => key !== "type")
                      .map(([key, value]) => (
                        <label className="field" key={key}>
                          {key}
                          <input
                            aria-label={`Дія ${key}`}
                            type={
                              typeof value === "boolean"
                                ? "checkbox"
                                : typeof value === "number"
                                  ? "number"
                                  : "text"
                            }
                            {...(typeof value === "boolean"
                              ? { checked: value }
                              : { value: String(value) })}
                            onChange={(e) =>
                              setDraft(
                                JSON.stringify(
                                  {
                                    ...draftObject,
                                    [key]:
                                      typeof value === "boolean"
                                        ? e.target.checked
                                        : typeof value === "number"
                                          ? Number(e.target.value)
                                          : e.target.value,
                                  },
                                  null,
                                  2,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                  </div>
                  <textarea
                    aria-label="Браузерна дія"
                    className="large-editor"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div className="actions">
                    <button
                      onClick={() =>
                        task.run(async () => {
                          const next = [...steps];
                          if (editIndex === undefined)
                            next.push(JSON.parse(draft));
                          else next[editIndex] = JSON.parse(draft);
                          await api.patch({ browserActions: next });
                          setSteps(next);
                          setDraft("");
                          setEditIndex(undefined);
                        })
                      }
                    >
                      Додати дію
                    </button>
                    <button
                      disabled={!snap}
                      onClick={() =>
                        task.run(async () =>
                          setSnap(
                            await api.service("browser.act", JSON.parse(draft)),
                          ),
                        )
                      }
                    >
                      Виконати одну дію
                    </button>
                  </div>
                </>
              )}
            </>
          )}
          {tab === "Network / Log" && (
            <pre className="preview-box">
              {JSON.stringify(
                { network: snap?.network, log: snap?.log },
                null,
                2,
              )}
            </pre>
          )}
        </>
      )}
      <SecretEditor />
    </section>
  );
}
