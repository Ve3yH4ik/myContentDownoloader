# Universal Data Downloader

Windows desktop-програма для завантаження й обробки даних. Власна реалізація за функціональним ТЗ; сумісність з Content Downloader X1 ще не підтверджена.

## Етап 1 — працюючий наскрізний сценарій

HTTP(S) URL → HTML → звичайні, повторювані й вкладені границі (between/Regex/CSS) → ordered post-processing → CSV/JSON/template. Electron UI показує таблицю, документ, trace і журнал, зберігає та відкриває версії проєкту в SQLite. Обробка працює у Worker Thread; доступна зупинка. Немає фіктивних кнопок майбутніх модулів.

## Запуск

Потрібні Node.js 24+ і npm; перевірено на Node 26 у Windows. Відкрийте PowerShell у папці проєкту:

```powershell
cd D:\AI\myContentDownoloader
npm.cmd ci
npm.cmd run build
npm.cmd run fixture
```

В іншому PowerShell:

```powershell
cd D:\AI\myContentDownoloader
npm.cmd start
```

Натисніть «Запустити»: приклад містить заголовок, повторювані товари й вкладені назву/ціну; Regex прибирає валюту. Очікуються два рядки з цінами 120.50 та 980. «Зберегти проєкт» додає версію; список версій → «Відкрити» відновлює всі налаштування. CSV/JSON відкривають системний діалог збереження. URL над JSON має пріоритет. Конфігурація редагується як JSON; спеціалізовані редактори — наступні етапи.

CLI без Electron (за працюючого fixture):

```powershell
npm.cmd run cli -- examples/products.json data/exports
```

CLI створить result.csv, result.json, run.json і projects.sqlite. `data/` виключено з Git. Desktop-БД зберігається в Electron userData, а не в репозиторії.

## Перевірки

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:ui
```

## Структура й обмеження

- `src/core`: схема, downloader, границі, pipeline, macros, exports, SQLite, CLI.
- `src/desktop`: Electron main/preload та worker.
- `src/renderer`: React UI; `examples`: локальний приклад; `tests`: Vitest + Electron/Playwright.
- `docs`: functional-map, macro-registry, architecture, implementation-plan, compatibility-matrix, test-plan.

HTTP наразі GET, UTF-8, без redirect/credentials, до 5 MiB. Desktop має worker deadline і memory limit; CLI слід запускати зі своїми перевіреними Regex. Trace зберігає сирі значення, які можуть містити приватні дані. Не вставляйте паролі/токени в URL чи конфігурації. Експортований CSV може містити формули з джерела; відкривайте такі файли як текстові дані. Повноцінний secure credential store ще відсутній.

Ще не реалізовано: повний Workflow Engine, браузерний recorder, Monaco/React Flow, CDX1 AST/оператори, усі макроси, DB adapters, pause/resume, autosave/recovery, переносний імпорт/експорт проєкту, Windows installer/portable EXE. План та критерії — у `docs/implementation-plan.md`. Успішний запуск цього етапу не означає готовність усієї програми.
