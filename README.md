# Universal Data Downloader

Windows desktop-програма для завантаження й обробки даних. Власна реалізація за функціональним ТЗ; сумісність з Content Downloader X1 ще не підтверджена.

## Windows 0.4 — оновлений дизайн

Відкрийте **UniversalDataDownloader-0.4.0-Portable.exe** у папці `release`. Node.js, npm і встановлений Chrome не потрібні — Electron та Chromium включені. Результати CI-збірки також доступні в GitHub Actions як артефакт UniversalDataDownloader-Windows-x64 (14 днів).

Новий вигляд: графітова/світла теми, ліва навігація, SVG-піктограми, м’яка поява вікон і панелей, підказки для миші/клавіатури. Кнопка сонця/місяця перемикає тему; F1 відкриває коротку довідку; Alt показує меню Windows. Системне зменшення руху враховується. Деталі — docs/design-0.4.md.

Нові вікна панелі інструментів: **HTTP Engine**, **Chromium**, **Проксі**, **Параметри програми**. HTTP і браузер працюють зі спільним RequestProfile та передають дані до наявного Parsing Workflow. Браузер має DOM/CSS/XPath inspector, JS editor, запис/редагування/виконання дій і захищені сесії. Менеджер проксі підтримує HTTP/HTTPS/SOCKS4/SOCKS5, auth, import/check/schedule/rotation/origin binding/stats. Application Settings має 12 вкладок, typed schema, defaults/validation/migration/import/export/reset/source.

Credentials — через ID у секції «Захищені секрети Windows». Паролі/токени не слід вставляти у звичайні URL, заголовки, browser actions чи JS. FTP/SFTP, CAPTCHA та політики ще відсутніх scheduler/dependency модулів зараз зберігають конфігурацію; їхні runtime-адаптери не реалізовані. Preview Chromium використовує інтерактивні знімки; streaming/native embedded tab — не частина цього етапу. Детальна матриця: `docs/engines-settings-report.md`.

Для розробки Windows: `npm.cmd ci`, `npm.cmd run browser:install`, `npm.cmd run build`, `npm.cmd start`. Portable-збірка: `npm.cmd run package:win`. Тести: `npm.cmd test`, `npm.cmd run test:ui`. Для packaged runtime встановіть UDD_TEST_EXECUTABLE у шлях до release/win-unpacked/Universal Data Downloader.exe; portable smoke: `node scripts/smoke-portable.mjs`.

## Версія 0.2 — робоче місце й окремі вікна

Інтерфейс організовано за наданим прикладом: нативне меню й панель інструментів угорі; дерево границь ліворуч; шаблон і результати в центрі; інструменти праворуч; генератор та черга URL внизу.

Налаштування HTTP/проєкту, редактор шаблону, редактор границь, вебсканер, звіт і збережені версії відкриваються в окремих вікнах Electron. Повторний виклик активує вже відкрите вікно. Шаблон має вставлення макросів і preview без повторного HTTP-запиту. Границі поки редагуються як JSON-дерево з перевіркою схеми.

Вебсканер отримує посилання з однієї HTML-сторінки або XML Sitemap, нормалізує URL, видаляє дублікати/фрагменти, за потреби обмежує origin і додає адреси до черги. Sitemap index повертає адреси дочірніх карт; автоматичного рекурсивного обходу немає. Генератор розгортає `{num}` за діапазоном та кроком (до 10000 URL).

Черга обробляється послідовно, продовжує роботу після HTTP-помилок і підтримує зупинку. CSV/JSON об'єднує рядки успішних документів із колонкою `_url`. Шаблон застосовується до кожного документа окремо: COUNT/INDEX_ID рахуються всередині документа. Перегляд документа, дерева границь і trace стосується останнього успішного документа; таблиця та експорт — усієї черги. Звіт поточного сеансу містить останні 1000 документів, статус, кількість рядків, час і помилки; доступний CSV.

HTTP, границі, шаблон, черга, параметри генератора/сканера зберігаються у версії проєкту. Черга й звіт не відновлюють прогрес після перезапуску. Деталі: `docs/workspace-report.md`.

## Основа — працюючий наскрізний сценарій

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

Натисніть «Запустити»: приклад містить заголовок, повторювані товари й вкладені назву/ціну; Regex прибирає валюту. Очікуються два рядки з цінами 120.50 та 980. «Зберегти проєкт» додає версію; «Проєкти» → виберіть версію → «Відкрити» відновлює налаштування. CSV/JSON відкривають системний діалог збереження. Редагуйте HTTP, шаблон або границі через відповідні кнопки панелі інструментів. У вікнах редакторів «Застосувати» оновлює поточний проєкт, «Застосувати й зберегти» додатково записує версію в SQLite.

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

Початкові приклади лишаються GET/UTF-8 із лімітом 5 MiB; RequestProfile розширює методи, redirects, proxy/secret references, encodings і resource limits. Desktop має worker deadline і memory limit; CLI слід запускати зі своїми перевіреними Regex. Trace і отримані документи можуть містити приватні дані. Експортований CSV може містити формули з джерела; відкривайте такі файли як текстові дані. Windows credential store реалізовано через DPAPI, прикладні секрети не входять у проєкт/експорт налаштувань.

Ще не реалізовано: повний графовий Workflow Engine, Monaco/React Flow, CDX1 AST/оператори, усі макроси, DB/FTP/SFTP/CAPTCHA adapters, pause/resume, autosave/recovery, переносний імпорт/експорт проєкту. Browser recorder та Windows portable EXE додано у 0.3. План та критерії — у `docs/implementation-plan.md`. Успішний запуск цього етапу не означає готовність усієї програми.
