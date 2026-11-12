import React, { useEffect, useRef, useState } from "react";
import type { Boundary, Operation } from "../core/schema";
import type { BrowserSnapshot, PickedElement } from "../core/browser";
import type { BoundaryResult, RunResult } from "../core/engine";
import type { SessionState } from "../shared/api";
import {
  boundaryList,
  updateBoundary,
  addBoundary,
  removeBoundary,
} from "../core/boundary-tree";
import { Icon } from "./ui";
const api = window.downloader;
const operationNames: Record<Operation["type"], string> = {
  replace: "Пошук і заміна",
  prepend: "Додати на початку",
  append: "Додати в кінці",
  fallback: "Значення за відсутності",
  trimEndCharacters: "Прибрати кінцеві символи",
  trimWhitespace: "Прибрати крайні пробіли",
  htmlToText: "HTML → текст",
  lowercase: "Нижній регістр",
  singleLine: "Один рядок",
  required: "Обов’язкове значення",
};
type PickResponse = { snapshot: BrowserSnapshot; selection: PickedElement };
export function BoundaryEditor({ state }: { state: SessionState }) {
  const initial = state.project.boundaries;
  const [tree, setTree] = useState<Boundary[]>(initial);
  const [selected, setSelected] = useState(
    () => new URLSearchParams(location.search).get("boundary") ?? initial[0].id,
  );
  const [tab, setTab] = useState("boundary");
  const [url, setUrl] = useState(state.project.url);
  const [snapshot, setSnapshot] = useState<BrowserSnapshot>();
  const [html, setHtml] = useState(state.result?.document ?? "");
  const [picked, setPicked] = useState<PickedElement>();
  const [pickMode, setPickMode] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    "Завантажте сторінку або налаштуйте границю на останньому HTML",
  );
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<RunResult>();
  const [json, setJson] = useState(JSON.stringify(initial, null, 2));
  const [jsonDirty, setJsonDirty] = useState(false);
  const jsonDirtyRef = useRef(jsonDirty);
  jsonDirtyRef.current = jsonDirty;
  const [operation, setOperation] =
    useState<Operation["type"]>("trimWhitespace");
  const viewport = useRef<HTMLDivElement>(null);
  const [sourceSelection, setSourceSelection] = useState("");
  const [external, setExternal] = useState(false);
  const baseline = useRef(JSON.stringify(initial));
  const code = useRef<HTMLTextAreaElement>(null);
  const hover = useRef<{ x: number; y: number } | undefined>(undefined);
  const busyRef = useRef(false);
  const pickAction = useRef<() => void>(() => {});
  const treeRef = useRef(tree);
  treeRef.current = tree;
  const entries = boundaryList(tree);
  const boundary =
    entries.find((v) => v.boundary.id === selected)?.boundary ??
    entries[0]?.boundary;
  useEffect(
    () =>
      api.subscribeBoundaryFocus((id) => {
        if (jsonDirtyRef.current) {
          setMessage("Спочатку застосуйте або скиньте незбережений JSON");
          return;
        }
        if (boundaryList(treeRef.current).some((v) => v.boundary.id === id)) {
          setSelected(id);
          setTab("boundary");
        }
      }),
    [],
  );
  useEffect(() => {
    const incoming = JSON.stringify(state.project.boundaries);
    if (incoming === baseline.current) return;
    if (JSON.stringify(treeRef.current) !== baseline.current || jsonDirty) {
      setExternal(true);
      return;
    }
    baseline.current = incoming;
    setTree(state.project.boundaries);
    setJson(JSON.stringify(state.project.boundaries, null, 2));
    setJsonDirty(false);
  }, [state.project.boundaries]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "F4") {
        e.preventDefault();
        pickAction.current();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  async function task(fn: () => Promise<void>, success?: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function change(patch: Partial<Boundary>) {
    if (!boundary) return;
    setTree((value) => updateBoundary(value, boundary.id, patch));
    setPreview(undefined);
  }
  function selectCode(start: number, end: number) {
    requestAnimationFrame(() => {
      const el = code.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
      const before = el.value.slice(0, start);
      const lines = before.split("\n");
      el.scrollTop = Math.max(0, (lines.length - 4) * 19);
      const style = getComputedStyle(el);
      const context = document.createElement("canvas").getContext("2d")!;
      context.font = style.fontSize + " " + style.fontFamily;
      el.scrollLeft = Math.max(
        0,
        context.measureText(lines.at(-1)!).width - el.clientWidth / 4,
      );
      setSourceSelection(el.value.slice(start, end));
    });
  }
  function acceptPicked(value: PickResponse) {
    setSnapshot(value.snapshot);
    setHtml(value.snapshot.html);
    setPicked(value.selection);
    setPreview(undefined);
    selectCode(value.selection.start, value.selection.end);
    setMessage(
      `Знайдено <${value.selection.tag}> · ${value.selection.end - value.selection.start} символів`,
    );
  }
  const pick = (point?: { x: number; y: number }) => {
    if (!point) {
      setMessage(
        "Наведіть курсор на елемент у перегляді сторінки й натисніть F4",
      );
      return;
    }
    void task(async () =>
      acceptPicked(await api.service<PickResponse>("boundary.pick", point)),
    );
  };
  pickAction.current = () => {
    if (snapshot) pick(hover.current);
    else setMessage("Спочатку завантажте сторінку");
  };
  async function validated() {
    const value = await api.service<Boundary[]>(
      "boundary.validate",
      tab === "json" ? JSON.parse(json) : tree,
    );
    return value;
  }
  async function apply(save = false) {
    await task(
      async () => {
        const value = await validated();
        await api.patch({ boundaries: value });
        baseline.current = JSON.stringify(value);
        setTree(value);
        setJson(JSON.stringify(value, null, 2));
        setJsonDirty(false);
        setExternal(false);
        if (!boundaryList(value).some((v) => v.boundary.id === selected))
          setSelected(value[0].id);
        if (save) await api.save((await api.state()).project);
      },
      save
        ? "Границі застосовано й збережено у версії проєкту"
        : "Границі застосовано до проєкту",
    );
  }
  async function load(target = url) {
    await task(async () => {
      setPicked(undefined);
      setPreview(undefined);
      const value = await api.service<BrowserSnapshot>("boundary.load", {
        url: target,
        width: viewport.current?.clientWidth,
        height: viewport.current?.clientHeight,
      });
      setSnapshot(value);
      setHtml(value.html);
      setUrl(target);
      setSourceSelection("");
      setMessage(
        `Сторінку завантажено · ${value.html.length} символів HTML/DOM`,
      );
    });
  }
  function switchTab(next: string) {
    if (tab === "json" && jsonDirty && next !== "json") {
      setMessage(
        "Застосуйте зміни JSON кнопкою «Оновити дерево» або скиньте їх",
      );
      return;
    }
    if (next === "json") {
      setJson(JSON.stringify(tree, null, 2));
      setJsonDirty(false);
    }
    setTab(next);
  }
  function add(repeat: boolean, nested = false) {
    const value = addBoundary(tree, repeat, nested ? boundary?.id : undefined);
    setTree(value.nodes);
    setSelected(value.id);
    setTab("boundary");
    setPreview(undefined);
  }
  const urls = [...new Set([state.project.url, ...state.project.urlQueue])];
  const values: string[] = [];
  const collect = (nodes: BoundaryResult[]) =>
    nodes.forEach((node) => {
      node.values.forEach((v) => {
        if (node.id === boundary?.id) values.push(v.value);
        collect(v.children);
      });
    });
  if (preview) collect(preview.boundaries);
  return (
    <section className="boundary-workbench">
      <div className="boundary-toolbar">
        <label className="grow">
          Адреса сторінки
          <input
            aria-label="URL редактора границь"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load();
            }}
          />
        </label>
        <button className="primary" disabled={busy} onClick={() => load()}>
          <Icon name="browser" />
          Завантажити сторінку
        </button>
        <button
          disabled={busy || !snapshot}
          onClick={() =>
            task(async () => {
              const value = await api.service<BrowserSnapshot>(
                "boundary.viewport",
                {
                  width: viewport.current?.clientWidth ?? 1000,
                  height: viewport.current?.clientHeight ?? 500,
                },
              );
              setSnapshot(value);
              setHtml(value.html);
              setPicked(undefined);
            }, "HTML і сторінку оновлено")
          }
        >
          Оновити
        </button>
        <button disabled={busy || state.busy} onClick={() => apply()}>
          Застосувати
        </button>
        <button disabled={busy || state.busy} onClick={() => apply(true)}>
          Застосувати й зберегти
        </button>
      </div>
      {external && (
        <div className="boundary-warning">
          Проєкт змінено в іншому вікні. Ваші незбережені зміни залишаються в
          редакторі.
          <button
            onClick={() => {
              setTree(state.project.boundaries);
              baseline.current = JSON.stringify(state.project.boundaries);
              setJson(JSON.stringify(state.project.boundaries, null, 2));
              setJsonDirty(false);
              setExternal(false);
            }}
          >
            Завантажити границі з проєкту
          </button>
        </div>
      )}
      <div className="boundary-grid">
        <div className="boundary-document">
          <section className="panel source-pane">
            <div className="panel-title">
              <h2>
                HTML / DOM{" "}
                <span className="count">
                  {html.length.toLocaleString("uk-UA")} символів
                </span>
              </h2>
              <div>
                <input
                  aria-label="Пошук у HTML"
                  className="source-search"
                  value={search}
                  placeholder="Знайти у коді…"
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const from = code.current?.selectionEnd ?? 0;
                      let i = html
                        .toLowerCase()
                        .indexOf(search.toLowerCase(), from);
                      if (i < 0)
                        i = html.toLowerCase().indexOf(search.toLowerCase());
                      if (i < 0) setMessage("Текст у коді не знайдено");
                      else selectCode(i, i + search.length);
                    }
                  }}
                />
                <button
                  disabled={!search}
                  onClick={() => {
                    const from = code.current?.selectionEnd ?? 0;
                    let i = html
                      .toLowerCase()
                      .indexOf(search.toLowerCase(), from);
                    if (i < 0)
                      i = html.toLowerCase().indexOf(search.toLowerCase());
                    if (i < 0) setMessage("Текст у коді не знайдено");
                    else selectCode(i, i + search.length);
                  }}
                >
                  Знайти далі
                </button>
              </div>
            </div>
            <textarea
              ref={code}
              className="boundary-source"
              aria-label="HTML документа"
              value={html}
              readOnly
              spellCheck={false}
              wrap="off"
              onSelect={(e) => {
                const el = e.currentTarget;
                setSourceSelection(
                  el.value.slice(el.selectionStart, el.selectionEnd),
                );
              }}
              onClick={(e) => {
                if (e.ctrlKey && snapshot) {
                  const offset = e.currentTarget.selectionStart;
                  void task(async () =>
                    acceptPicked(
                      await api.service<PickResponse>(
                        "boundary.locate",
                        offset,
                      ),
                    ),
                  );
                }
              }}
            />
            <div className="source-actions">
              <span>Виділено: {sourceSelection.length} символів</span>
              <button
                disabled={!sourceSelection || !boundary || busy}
                onClick={() =>
                  change({ mode: "between", start: sourceSelection })
                }
              >
                Виділення → початок
              </button>
              <button
                disabled={!sourceSelection || !boundary || busy}
                onClick={() =>
                  change({ mode: "between", end: sourceSelection })
                }
              >
                Виділення → кінець
              </button>
            </div>
          </section>
          <section className="panel boundary-page">
            <div className="panel-title">
              <h2>Перегляд сторінки</h2>
              <label className="check">
                <input
                  aria-label="Режим вибору елемента"
                  type="checkbox"
                  checked={pickMode}
                  onChange={(e) => setPickMode(e.target.checked)}
                />
                Вибір елемента
              </label>
              <span className="boundary-shortcut">
                Наведіть + <kbd>F4</kbd>
              </span>
            </div>
            <div className="boundary-page-scroll" ref={viewport}>
              {snapshot ? (
                <div className="boundary-image-wrap">
                  <img
                    alt="Сторінка для налаштування границь"
                    src={`data:image/jpeg;base64,${snapshot.screenshot}`}
                    onMouseMove={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      hover.current = {
                        x:
                          ((e.clientX - r.left) *
                            e.currentTarget.naturalWidth) /
                          r.width,
                        y:
                          ((e.clientY - r.top) *
                            e.currentTarget.naturalHeight) /
                          r.height,
                      };
                    }}
                    onMouseLeave={() => {
                      hover.current = undefined;
                    }}
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const point = {
                        x:
                          ((e.clientX - r.left) *
                            e.currentTarget.naturalWidth) /
                          r.width,
                        y:
                          ((e.clientY - r.top) *
                            e.currentTarget.naturalHeight) /
                          r.height,
                      };
                      if (pickMode) pick(point);
                      else
                        void task(async () => {
                          const value = await api.service<BrowserSnapshot>(
                            "boundary.click",
                            point,
                          );
                          setSnapshot(value);
                          setHtml(value.html);
                          setPicked(undefined);
                        });
                    }}
                    onWheel={(e) => {
                      if (!busyRef.current)
                        void task(async () => {
                          const value = await api.service<BrowserSnapshot>(
                            "boundary.scroll",
                            { x: e.deltaX, y: e.deltaY },
                          );
                          setSnapshot(value);
                          setHtml(value.html);
                          setPicked(undefined);
                        });
                    }}
                  />
                  {picked && (
                    <div
                      className="picked-outline"
                      style={{
                        left:
                          (100 * picked.rect.x) / picked.viewport.width + "%",
                        top:
                          (100 * picked.rect.y) / picked.viewport.height + "%",
                        width:
                          (100 * picked.rect.width) / picked.viewport.width +
                          "%",
                        height:
                          (100 * picked.rect.height) / picked.viewport.height +
                          "%",
                      }}
                    >
                      <span>&lt;{picked.tag}&gt;</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty">
                  <Icon name="scan" />
                  <h3>Знайдіть потрібні дані на сторінці</h3>
                  <p>
                    Завантажте URL, наведіть курсор на елемент і натисніть F4.
                    HTML-код елемента буде виділено угорі.
                  </p>
                </div>
              )}
            </div>
            <div className="boundary-selection">
              {picked ? (
                <>
                  <code title={picked.selector}>{picked.selector}</code>
                  <button
                    disabled={!boundary || busy}
                    onClick={() =>
                      change({ mode: "css", expression: picked.selector })
                    }
                  >
                    Використати CSS
                  </button>
                  <button
                    disabled={!boundary || busy || !picked.closing}
                    onClick={() =>
                      change({
                        mode: "between",
                        start: picked.opening,
                        end: picked.closing,
                      })
                    }
                  >
                    Межі з елемента
                  </button>
                </>
              ) : (
                <span>
                  Ctrl+клік у коді — показати елемент на сторінці. Коліщатко —
                  прокручування сторінки.
                </span>
              )}
            </div>
          </section>
        </div>
        <aside className="boundary-sidebar">
          <section className="panel boundary-definition">
            <div className="panel-title">
              <h2>Налаштування границі</h2>
              <span className="count">{entries.length}</span>
            </div>
            <div className="boundary-chooser">
              <select
                aria-label="Активна границя"
                value={boundary?.id ?? ""}
                disabled={busy || jsonDirty}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setPreview(undefined);
                }}
              >
                {entries.map(({ boundary: b, depth }) => (
                  <option key={b.id} value={b.id}>
                    {"　".repeat(depth)}
                    {b.repeat ? "↻" : "◇"} {b.name} · {b.id}
                  </option>
                ))}
              </select>
              <div className="boundary-add">
                <button disabled={busy || jsonDirty} onClick={() => add(false)}>
                  + Звичайна
                </button>
                <button disabled={busy || jsonDirty} onClick={() => add(true)}>
                  + Повторювана
                </button>
                <button
                  disabled={busy || jsonDirty || !boundary}
                  onClick={() => add(false, true)}
                >
                  + Вкладена
                </button>
              </div>
            </div>
            <nav className="tabs">
              {[
                ["boundary", "Границя"],
                ["pipeline", "Обробка"],
                ["result", "Результат"],
                ["json", "JSON"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  aria-label={key === "json" ? "JSON границь" : label}
                  className={tab === key ? "active" : ""}
                  onClick={() => switchTab(key)}
                >
                  {label}
                </button>
              ))}
            </nav>
            <fieldset className="boundary-definition-body" disabled={busy}>
              {tab === "boundary" && boundary && (
                <>
                  <label className="field">
                    Назва
                    <input
                      aria-label="Назва границі"
                      value={boundary.name}
                      onChange={(e) => change({ name: e.target.value })}
                    />
                  </label>
                  <div className="boundary-flags">
                    <code>ID: {boundary.id}</code>
                    <label className="check">
                      <input
                        type="checkbox"
                        aria-label="Границя увімкнена"
                        checked={boundary.enabled}
                        onChange={(e) => change({ enabled: e.target.checked })}
                      />
                      Увімкнена
                    </label>
                  </div>
                  <label className="field">
                    Спосіб отримання
                    <select
                      aria-label="Режим границі"
                      value={boundary.mode}
                      onChange={(e) =>
                        change({ mode: e.target.value as Boundary["mode"] })
                      }
                    >
                      <option value="between">Початок / кінець</option>
                      <option value="regex">Регулярний вираз</option>
                      <option value="css">CSS-селектор</option>
                    </select>
                  </label>
                  {boundary.mode === "between" ? (
                    <>
                      <label className="field">
                        Початкова границя
                        <textarea
                          aria-label="Початкова границя"
                          value={boundary.start}
                          onChange={(e) => change({ start: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        Кінцева границя
                        <textarea
                          aria-label="Кінцева границя"
                          value={boundary.end}
                          onChange={(e) => change({ end: e.target.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <label className="field">
                      {boundary.mode === "regex"
                        ? "Regex (перша група або весь збіг)"
                        : "CSS (внутрішній HTML)"}
                      <textarea
                        aria-label="Вираз границі"
                        value={boundary.expression}
                        onChange={(e) => change({ expression: e.target.value })}
                      />
                    </label>
                  )}
                  {boundary.mode === "regex" && (
                    <label className="field">
                      Прапорці Regex
                      <input
                        aria-label="Прапорці Regex"
                        value={boundary.flags}
                        onChange={(e) => change({ flags: e.target.value })}
                      />
                    </label>
                  )}
                  {boundary.mode === "css" && (
                    <button
                      disabled={!snapshot || !boundary.expression}
                      onClick={() =>
                        task(async () =>
                          acceptPicked(
                            await api.service<PickResponse>(
                              "boundary.selector",
                              boundary.expression,
                            ),
                          ),
                        )
                      }
                    >
                      Знайти CSS на сторінці
                    </button>
                  )}
                  <div className="boundary-flags">
                    <label className="check">
                      <input
                        type="checkbox"
                        aria-label="Повторювана границя"
                        checked={boundary.repeat}
                        onChange={(e) => change({ repeat: e.target.checked })}
                      />
                      Повторювана
                    </label>
                    <label className="check">
                      <input
                        type="checkbox"
                        aria-label="Зворотний пошук"
                        checked={boundary.reverse}
                        onChange={(e) => change({ reverse: e.target.checked })}
                      />
                      Зворотний пошук
                    </label>
                  </div>
                  <div className="boundary-numbers">
                    {(["skip", "min", "max"] as const).map((key, i) => (
                      <label key={key}>
                        {["Пропустити", "MIN", "MAX"][i]}
                        <input
                          aria-label={
                            [
                              "Пропустити входження",
                              "MIN результатів",
                              "MAX результатів",
                            ][i]
                          }
                          type="number"
                          min={key === "max" ? 1 : 0}
                          value={boundary[key]}
                          onChange={(e) =>
                            change({ [key]: Number(e.target.value) })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <label className="field">
                    Роздільник результатів
                    <input
                      aria-label="Роздільник результатів"
                      value={boundary.separator
                        .replaceAll("\n", "\\n")
                        .replaceAll("\t", "\\t")}
                      onChange={(e) =>
                        change({
                          separator: e.target.value
                            .replaceAll("\\n", "\n")
                            .replaceAll("\\t", "\t"),
                        })
                      }
                    />
                  </label>
                  <button
                    className="danger-text"
                    disabled={tree.length === 1 && tree[0].id === boundary.id}
                    onClick={() => {
                      const value = removeBoundary(tree, boundary.id);
                      setTree(value);
                      setSelected(value[0]?.id ?? "");
                      setPreview(undefined);
                    }}
                  >
                    Видалити границю та вкладені
                  </button>
                </>
              )}
              {tab === "pipeline" && boundary && (
                <>
                  <p className="intro">
                    Операції виконуються згори вниз. Змінюйте порядок стрілками.
                  </p>
                  {boundary.pipeline.map((op, index) => (
                    <div className="boundary-operation" key={index}>
                      <div>
                        <strong>
                          {index + 1}. {operationNames[op.type]}
                        </strong>
                        <button
                          aria-label={`Операція ${index + 1} угору`}
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...boundary.pipeline];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            change({ pipeline: next });
                          }}
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`Операція ${index + 1} униз`}
                          disabled={index === boundary.pipeline.length - 1}
                          onClick={() => {
                            const next = [...boundary.pipeline];
                            [next[index + 1], next[index]] = [
                              next[index],
                              next[index + 1],
                            ];
                            change({ pipeline: next });
                          }}
                        >
                          ↓
                        </button>
                        <button
                          aria-label={`Видалити операцію ${index + 1}`}
                          onClick={() =>
                            change({
                              pipeline: boundary.pipeline.filter(
                                (_, n) => n !== index,
                              ),
                            })
                          }
                        >
                          ×
                        </button>
                      </div>
                      {Object.entries(op)
                        .filter(([key]) => key !== "type")
                        .map(([key, value]) => (
                          <label className="field" key={key}>
                            {(
                              {
                                find: "Що замінити",
                                replacement: "На що замінити",
                                regex: "Regex",
                                flags: "Прапорці",
                                value: "Значення",
                              } as Record<string, string>
                            )[key] ?? key}
                            <input
                              aria-label={`Операція ${index + 1}: ${key}`}
                              type={
                                typeof value === "boolean" ? "checkbox" : "text"
                              }
                              {...(typeof value === "boolean"
                                ? { checked: value }
                                : { value: String(value) })}
                              onChange={(e) =>
                                change({
                                  pipeline: boundary.pipeline.map((item, n) =>
                                    n === index
                                      ? ({
                                          ...item,
                                          [key]:
                                            typeof value === "boolean"
                                              ? e.target.checked
                                              : e.target.value,
                                        } as Operation)
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                        ))}
                    </div>
                  ))}
                  <div className="actions">
                    <select
                      aria-label="Нова операція"
                      value={operation}
                      onChange={(e) =>
                        setOperation(e.target.value as Operation["type"])
                      }
                    >
                      {Object.entries(operationNames).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const op: Operation =
                          operation === "replace"
                            ? {
                                type: "replace",
                                find: "текст",
                                replacement: "",
                                regex: false,
                                flags: "g",
                              }
                            : [
                                  "prepend",
                                  "append",
                                  "fallback",
                                  "trimEndCharacters",
                                ].includes(operation)
                              ? { type: operation as "prepend", value: "" }
                              : { type: operation as "trimWhitespace" };
                        change({ pipeline: [...boundary.pipeline, op] });
                      }}
                    >
                      Додати операцію
                    </button>
                  </div>
                </>
              )}
              {tab === "result" && (
                <>
                  <div className="boundary-result-count">
                    Знайдено значень: <b>{values.length}</b>
                  </div>
                  {values.slice(0, 100).map((value, i) => (
                    <pre className="boundary-result-value" key={i}>
                      <span>#{i + 1}</span>
                      {value}
                    </pre>
                  ))}
                  {values.length > 100 && <p>Показано перші 100 значень.</p>}
                  {preview && (
                    <details>
                      <summary>Кроки обробки та журнал</summary>
                      <pre>
                        {JSON.stringify(
                          {
                            log: preview.log,
                            trace: preview.trace.filter(
                              (t) => t.boundary === boundary?.id,
                            ),
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                  {!preview && (
                    <p className="intro">
                      Завантажте HTML і натисніть «Перевірити границю».
                    </p>
                  )}
                  {picked && (
                    <details>
                      <summary>CSS / XPath вибраного елемента</summary>
                      <pre>
                        {JSON.stringify(
                          {
                            css: picked.selector,
                            xpath: picked.xpath,
                            text: picked.text,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                </>
              )}
              {tab === "json" && (
                <>
                  <p className="intro">
                    Повне дерево, ID та вкладеність. Перевірка схеми виконується
                    перед застосуванням.
                  </p>
                  <textarea
                    aria-label="Конфігурація границь"
                    className="boundary-json"
                    value={json}
                    spellCheck={false}
                    onChange={(e) => {
                      setJson(e.target.value);
                      setJsonDirty(true);
                    }}
                  />
                  <div className="actions">
                    <button
                      onClick={() =>
                        task(async () => {
                          const value = await api.service<Boundary[]>(
                            "boundary.validate",
                            JSON.parse(json),
                          );
                          setTree(value);
                          setJson(JSON.stringify(value, null, 2));
                          setJsonDirty(false);
                          setSelected(
                            boundaryList(value).some(
                              (b) => b.boundary.id === selected,
                            )
                              ? selected
                              : value[0].id,
                          );
                          setTab("boundary");
                        }, "Дерево оновлено з JSON")
                      }
                    >
                      Оновити дерево
                    </button>
                    <button
                      onClick={() => {
                        setJson(JSON.stringify(tree, null, 2));
                        setJsonDirty(false);
                      }}
                    >
                      Скинути JSON
                    </button>
                  </div>
                </>
              )}
            </fieldset>
            <div className="boundary-test">
              <button
                className="primary"
                disabled={busy || !html || !boundary}
                onClick={() =>
                  task(async () => {
                    const value = await validated();
                    const result = await api.service<RunResult>(
                      "boundary.preview",
                      { boundaries: value, id: boundary!.id, html },
                    );
                    setPreview(result);
                    setTab("result");
                    setMessage(
                      "Перевірку завершено. Показано значення з урахуванням батьківських границь.",
                    );
                  })
                }
              >
                <Icon name="play" />
                Перевірити границю
              </button>
            </div>
          </section>
          <section className="panel boundary-urls">
            <div className="panel-title">
              <h2>Список URL</h2>
              <span className="count">{urls.length}</span>
            </div>
            <div>
              {urls.map((item, i) => (
                <button
                  key={item}
                  className={url === item ? "selected-url" : ""}
                  title={item}
                  disabled={busy}
                  onClick={() => load(item)}
                >
                  <span>{i + 1}</span>
                  {item}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <p className="boundary-status" role="status">
        <span className={busy ? "dot running" : "dot"} />
        {busy ? "Виконання…" : message}
      </p>
    </section>
  );
}
