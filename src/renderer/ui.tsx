import React, { useEffect, useRef, useState } from "react";
export type IconName =
  | "folder"
  | "save"
  | "play"
  | "stop"
  | "settings"
  | "boundary"
  | "template"
  | "scan"
  | "report"
  | "http"
  | "browser"
  | "proxy"
  | "sliders"
  | "sun"
  | "moon"
  | "help"
  | "close"
  | "arrow";
const paths: Record<IconName, React.ReactNode> = {
  folder: <path d="M3 7h6l2-3h5a2 2 0 0 1 2 2v2h3l-3 12H3V7Z" />,
  save: (
    <>
      <path d="M5 3h12l4 4v14H3V3h2Z" />
      <path d="M7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  play: <path d="m8 4 13 8-13 8V4Z" />,
  stop: <rect x="5" y="5" width="14" height="14" rx="3" />,
  settings: (
    <>
      <path d="m9 3-.6 3-2.7 1L3 6l-1 3 2.3 2v3L2 16l1.5 3 3-.6 2 1.5.5 3h4l.7-3 2.6-1.1 2.7 1 1.5-3-2.2-2v-3l2.2-2-1.5-3-2.7 1-2.6-1.1L13 3H9Z" />
      <circle cx="11" cy="13" r="3" />
    </>
  ),
  boundary: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
      <path d="M6 13v5h5M13 6h5v5" />
    </>
  ),
  template: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18M9 9v12M13 13h4M13 17h4" />
    </>
  ),
  scan: (
    <>
      <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M3 12h18" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  report: (
    <>
      <path d="M5 3h14v18H5V3Z" />
      <path d="M9 16v-4M12 16V8M15 16v-6" />
    </>
  ),
  http: (
    <>
      <path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18" />
    </>
  ),
  browser: (
    <>
      <rect x="2" y="3" width="20" height="18" rx="4" />
      <path d="M2 8h20M6 5.5h.01M10 5.5h.01" />
      <circle cx="12" cy="14" r="4" />
      <path d="M8 14h8M12 10v8" />
    </>
  ),
  proxy: (
    <>
      <rect x="2" y="8" width="7" height="8" rx="2" />
      <rect x="15" y="8" width="7" height="8" rx="2" />
      <path d="M9 12h6M5 5V2m14 3V2M5 22v-3m14 3v-3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 3v7m0 5v6M12 3v12m0 5v1M20 3v3m0 5v10" />
      <rect x="1" y="10" width="6" height="5" rx="2" />
      <rect x="9" y="15" width="6" height="5" rx="2" />
      <rect x="17" y="6" width="6" height="5" rx="2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" />
    </>
  ),
  moon: <path d="M21 14A9 9 0 0 1 10 3a9 9 0 1 0 11 11Z" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function ThemeButton() {
  const [theme, setTheme] = useState(() =>
    localStorage.getItem("udd-theme") === "light" ? "light" : "dark",
  );
  useEffect(() => {
    const apply = (value: string) => {
      document.documentElement.dataset.theme = value;
      void window.downloader.appearance(value as "light" | "dark");
    };
    apply(theme);
    localStorage.setItem("udd-theme", theme);
  }, [theme]);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "udd-theme")
        setTheme(e.newValue === "light" ? "light" : "dark");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  return (
    <button
      className="icon-button theme-button"
      aria-label={
        theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему"
      }
      data-tooltip={
        theme === "dark"
          ? "Світла тема. Вибір зберігається для наступного запуску."
          : "Темна тема. Вибір зберігається для наступного запуску."
      }
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
export function HelpButton() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const open = () => {
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.current?.showModal();
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        if (!dialog.current?.open) open();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <>
      <button
        ref={trigger}
        className="icon-button"
        aria-label="Підказки"
        data-tooltip="Коротка довідка та клавіші швидкого доступу · F1"
        onClick={open}
      >
        <Icon name="help" />
      </button>
      <dialog
        ref={dialog}
        className="help-dialog"
        onClose={() => (previousFocus.current ?? trigger.current)?.focus()}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <div className="help-card">
          <div className="help-heading">
            <span className="eyebrow">ШВИДКИЙ ПОЧАТОК</span>
            <button
              className="icon-button"
              aria-label="Закрити довідку"
              onClick={() => dialog.current?.close()}
            >
              <Icon name="close" />
            </button>
          </div>
          <h2>Від документа до готових даних</h2>
          <p className="help-lead">
            Усе потрібне — у вашому робочому просторі.
          </p>
          <ol className="help-steps">
            <li>
              <b>01</b>
              <div>
                <strong>Додайте джерело</strong>
                <p>
                  Вставте URL або зберіть адреси через вебсканер і генератор
                  посилань.
                </p>
              </div>
            </li>
            <li>
              <b>02</b>
              <div>
                <strong>Налаштуйте обробку</strong>
                <p>
                  Виберіть границі та шаблон. HTTP, Chromium і проксі
                  відкриваються з лівої панелі.
                </p>
              </div>
            </li>
            <li>
              <b>03</b>
              <div>
                <strong>Запустіть і збережіть</strong>
                <p>
                  Перегляньте результат та журнал. Експортуйте CSV/JSON і
                  збережіть версію проєкту.
                </p>
              </div>
            </li>
          </ol>
          <div className="shortcut-grid">
            <span>
              Новий проєкт <kbd>Ctrl N</kbd>
            </span>
            <span>
              Відкрити <kbd>Ctrl O</kbd>
            </span>
            <span>
              Зберегти <kbd>Ctrl S</kbd>
            </span>
            <span>
              Підказки <kbd>F1</kbd>
            </span>
          </div>
        </div>
      </dialog>
    </>
  );
}
const hints: Record<string, string> = {
  "Зберегти проєкт":
    "Зберегти поточні налаштування як нову версію проєкту · Ctrl+S",
  "▣ Проєкти":
    "Відкрити збережені версії проєктів і відновити їхні налаштування · Ctrl+O",
  "▶ Запустити":
    "Завантажити поточний URL, застосувати границі та сформувати результат.",
  "■ Зупинити": "Перервати активне завантаження або обробку черги.",
  "⚙ Налаштування": "Назва проєкту, адреса документа та тайм-аут завантаження.",
  "◇ Границі": "Редактор звичайних, повторюваних і вкладених границь парсингу.",
  "▤ Редактор шаблону":
    "Окреме вікно шаблону: макроси, редагування й попередній перегляд.",
  "◎ Вебсканер":
    "Зібрати посилання з HTML-сторінки або Sitemap і додати їх у чергу.",
  "▥ Звіт": "Статус, кількість рядків і час обробки кожного документа.",
  "HTTP Engine":
    "Методи запитів, заголовки, cookies, тайм-аути та перегляд відповіді.",
  Chromium: "Браузерна автоматизація, DOM-інспектор, JavaScript і запис дій.",
  Проксі: "Імпорт, перевірка, ротація та статистика проксі-профілів.",
  "Параметри програми":
    "Загальні налаштування, продуктивність, кодування, браузер і кеш.",
  "CSV ↓":
    "Зберегти результат у CSV із налаштованим роздільником і кодуванням.",
  "JSON ↓": "Зберегти отримані рядки у форматі JSON.",
  "Застосувати шаблон":
    "Оновити шаблон поточного проєкту. Новий результат з’явиться після виконання.",
  Згенерувати:
    "Підставити числа замість {num} з обраним кроком і додати унікальні адреси до черги.",
  "Застосувати список":
    "Перевірити URL та зберегти відредагований список у поточній черзі.",
  "▶ Обробити чергу":
    "Послідовно або паралельно обробити список URL згідно з налаштуваннями потоків.",
  Очистити: "Видалити всі адреси з поточної черги URL.",
  "Попередній перегляд":
    "Перевірити шаблон на останніх отриманих даних без нового HTTP-запиту.",
  Застосувати: "Перевірити й застосувати зміни до поточного проєкту.",
  "Застосувати й зберегти":
    "Застосувати зміни та записати окрему версію проєкту в локальне сховище.",
  URL: "Адреса HTTP або HTTPS документа для обробки.",
  "Черга URL":
    "Одна адреса в рядку. Список можна вставити вручну або отримати з вебсканера.",
  "Шаблон посилань":
    "Приклад: https://site.example/page/{num}. Замість {num} будуть підставлені числа.",
  "CSS або XPath":
    "CSS-селектор, наприклад #title, або XPath із префіксом xpath=.",
  RequestProfile:
    "Спільні параметри HTTP і браузера. Для облікових даних використовуйте ID захищеного секрету.",
};
export function TooltipLayer() {
  const [tip, setTip] = useState<{
    text: string;
    x: number;
    y: number;
    above: boolean;
  }>();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let anchor: Element | undefined;
    let described: string | null = null;
    const hide = () => {
      clearTimeout(timer);
      if (anchor) {
        if (described === null) anchor.removeAttribute("aria-describedby");
        else anchor.setAttribute("aria-describedby", described);
      }
      anchor = undefined;
      setTip(undefined);
    };
    const show = (event: Event) => {
      const el = (event.target as Element)?.closest?.(
        "[data-tooltip],button,input,textarea,select,[title]",
      );
      if (!el || el === anchor) return;
      hide();
      const label =
        el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "";
      const text =
        el.getAttribute("data-tooltip") ??
        hints[label] ??
        el.getAttribute("title");
      if (!text) return;
      anchor = el;
      described = el.getAttribute("aria-describedby");
      timer = setTimeout(
        () => {
          if (!el.isConnected) return;
          const r = el.getBoundingClientRect();
          const above = r.bottom > innerHeight - 100;
          el.setAttribute(
            "aria-describedby",
            [described, "udd-tooltip"].filter(Boolean).join(" "),
          );
          setTip({
            text,
            x: Math.max(
              16,
              Math.min(innerWidth - 306, r.left + r.width / 2 - 145),
            ),
            y: above ? r.top - 10 : r.bottom + 10,
            above,
          });
        },
        event.type === "focusin" ? 120 : 360,
      );
    };
    const leave = (event: Event) => {
      const next = (event as PointerEvent).relatedTarget;
      if (anchor && next instanceof Node && anchor.contains(next)) return;
      hide();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", hide);
    };
  }, []);
  return tip ? (
    <div
      id="udd-tooltip"
      role="tooltip"
      className={`tooltip ${tip.above ? "above" : ""}`}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  ) : null;
}
