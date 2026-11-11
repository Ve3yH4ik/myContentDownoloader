# Windows, Request Engines, Proxy Manager та M19 — 0.3.0

Дата: 2026-11-11. Цей етап розширює наявне робоче ядро. Не підтверджує сумісність із CDX1 і не завершує всі етапи початкового плану.

## Windows-запуск

`release/UniversalDataDownloader-0.3.0-Portable.exe` — Windows x64 portable із Electron та Chromium усередині. Для запуску не потрібні Node.js, npm, Python чи окремо встановлений Chrome. Розробницька збірка: `npm ci`, `npm run browser:install`, `npm run package:win`.

`release/win-unpacked/Universal Data Downloader.exe` запускається разом із файлами своєї папки. Portable-файл можна переносити окремо. Дані програми зберігаються в Electron userData поточного користувача Windows. Секрети захищені Windows DPAPI і не переносяться на інший обліковий запис простим копіюванням JSON.

Пакування: electron-builder, власний значок U, без сертифіката підпису коду. Chromium включено як extraResources. Вихідні файли — у Git; release/vendor/node_modules/дані користувача виключені. GitHub Actions збирає `.exe` і зберігає його як Windows-x64 артефакт на 14 днів.

## Спільна модель

`src/core/request-profile.ts`: URL/метод, звичайні заголовки, user agent, secret references для headers/cookies/body, proxyId, connect/read/total timeout, retries/backoff, retryUnsafe, followRedirects/maxRedirects, maxBytes, encoding, cache/saveResponse і browser intercept rules. Схема перевіряє параметри до виконання. Credentials у URL, відомі секретні заголовки та credential-bearing body відхиляються: використовуйте сховище секретів.

HTTP і Chromium читають одну модель. Браузерні дії та RequestProfile зберігаються в проєкті. Стандартний запуск документа/черги використовує HTTP-профіль. HTTP Inspector і Browser Automation можуть передати відповідь/HTML/JSON у той самий Parsing Workflow (`parseDocument`). Це інтеграція з чинним деревом границь; повний графовий Workflow Engine ще окремий етап.

## HTTP Engine

GET/POST/PUT/PATCH/DELETE; headers/user-agent; CookieJar; секрети підставляються лише перед запитом. Connect/headers deadline, read-idle timeout, total timeout, retry/backoff, обмеження повторів небезпечних методів. Керовані redirects із лімітом та видаленням sensitive headers при зміні origin; cookie scope залишається стандартним cookie domain/path scope.

Підтримані HTTP/HTTPS/SOCKS4/SOCKS5 proxies; ліміт raw та розпакованої відповіді; gzip/deflate/br; charset decoding (UTF-8, Windows-1251/1252, ISO-8859-1, UTF-16LE). Node URL виконує URL encoding. Inspector показує status, headers (секретні значення приховані), body preview, bytes, timing, attempts і redirects. Binary зберігається byte-for-byte через діалог, text може передаватися в parsing. Raw binary не передається до HTML parser.

Кеш GET opt-in, TTL/max size, encrypted на диску. Запити з секретами/проксі не кешуються. Є cache inspection/clear та clear-on-exit. CLI не має Electron vault: профілі із secret/proxy references потребують програмно переданих resolved secrets; небезпечний direct fallback вимкнено.

## Browser Automation

Playwright Chromium із вбудованим інтерактивним preview, visible/headless режимами. Preview — актуалізований знімок браузерної сторінки, не native WebContentsView; кліки, введення у фокус та wheel передаються в реальний Chromium. У visible режимі є також власне вікно Chromium.

DOM-список, CSS/XPath locator inspector, JS editor (код у page context без Node), мережевий status log, request interception block/mock та block images. Візуальний список сценарію з drag-and-drop/стрілками, параметрами дій і додатковим JSON-редагуванням. Дії: goto, click, fill, select, check, press, scroll, waitForSelector, waitForLoad, evaluate. Записує ручні кліки, change/input-values та scroll; password inputs не записуються. Для секретних значень у сценаріях є secretId.

Сесії cookies/localStorage зберігаються в зашифрованому vault, підтримуються імена й політика конфліктів. HTML і результат JS (JSON) передаються до Parsing Workflow. DOM доступний через inspector/JS; окремого JSONPath/XML adapter цей етап не додає. Браузер має action watchdog і мережевий byte budget. Повний browser profiling, streaming preview, frame/shadow-DOM recorder та download manager не заявляються реалізованими.

Chromium не підтримує SOCKS credentials напряму: для SOCKS використовується локальний loopback HTTP bridge; облікові дані залишаються в Node adapter. JS має доступ до даних відвіданої сторінки, тому запускайте лише власні перевірені сценарії.

## Proxy Manager

Імпорт по рядку: protocol://host:port або protocol://user:pass@host:port; протоколи HTTP/HTTPS/SOCKS4/SOCKS5. Username/password вилучаються із server і шифруються; у proxies.json тільки credentialId. Є enable/disable/edit/delete, тестування на власному test URL, періодичні перевірки (30..86400 с), збереження/відновлення розкладу, lastChecked, successes/failures, usage log.

RequestProfile.proxyId: порожній — пряме підключення; ID — конкретний профіль; rotate — round-robin серед enabled профілів, що підходять до origins джерела. Немає відповідного проксі — явна помилка, без мовчазного обходу. Статистика перевірок/HTTP/browser запусків і останні 1000 usage events. Ротація застосовується при створенні запиту/браузерної сесії, не змінює proxy посеред живої браузерної сесії.

## M19: Application Settings

12 вкладок: General, Performance & Threads, CSV Delimiters, FTP / SFTP, CAPTCHA Services, Regular Expressions, Defaults, Project Policies, Encodings, Editor Highlighting, Browser Settings, Cache Management.

Zod schema v1, defaults, strict validation, v0→v1 migration, atomic settings save, JSON import/export без секретів, reset group/parameter, source default/user. Налаштування читаються при наступній операції; розмір/font/tab/highlight шаблону оновлюються через IPC. Browser options діють при відкритті нового контексту. Окремого перезапуску програми поточні активні параметри не потребують.

Застосовуються: threads для worker-черги (1..8, збереження порядку результатів), worker memory, queue row budget; CSV delimiter/line ending/BOM/export encoding; HTTP defaults; browser headless/viewport/action timeout/image policy; cache TTL/size/clear; tray; proxy-reference save policy; preview history backend; Parsing/Regex watchdog у Worker. HTTP/browser parsing також винесено з main process у worker, щоб поганий Regex не блокував інтерфейс.

Project policies: keep/replace/merge/rename/ask мають окремий interpreter і тести; manual project opening, proxy import, browser session name conflicts підключені до поточних дій. Параметри scheduler, linked files та missing dependencies збережені й перевіряються схемою, але відповідних runtime-модулів ще немає. FTP/SFTP та CAPTCHA у цьому етапі — конфігурація/secret references; **адаптери передачі файлів і CAPTCHA API не реалізовані**. Повного Monaco syntax highlighting ще немає. Не слід трактувати наявність цих вкладок як готові інтеграції.

## Валідація

Локальний HTTP fixture: HTML, JSON, methods/body/headers, cookies, redirects/loops, connect/read timeout, retry, HTTP errors, binary, oversized, gzip, dynamic DOM/forms/API. Власні HTTP/HTTPS і SOCKS4/SOCKS5 тестові проксі, включно з auth. TLS fixture — синтетичний localhost certificate/key, не production credentials; перевірка TLS не вимкнена.

45 core/integration tests; Playwright/Electron UI scenarios для settings, vault ciphertext, HTTP, binary save, cache clear, settings import/export, proxies/schedule, browser inspector/JS/session/scenario, parsing та старих сценаріїв. Packaged runtime тестується окремо з UDD_TEST_EXECUTABLE. `scripts/smoke-portable.mjs` запускає саме portable launcher з PATH без Node/npm та перевіряє HTTP і bundled Chromium. Фактичні результати цієї збірки — в повідомленні про завершення, а не припущенням за наявністю тестів.

## Основні файли

Фінальна локальна перевірка 0.3.0: 45 core/integration tests — passed; 3 Playwright/Electron tests на packaged `win-unpacked` — passed; portable launcher smoke — passed (HTTP + bundled Chromium із PATH без Node/npm); TypeScript/production build — passed; npm audit для production dependencies — 0 відомих уразливостей. Це перевірка на поточному Windows ПК, не сертифікація всіх конфігурацій Windows. Виявлений у тесті конфлікт `cache`/`Cache` виправлено окремим `http-response-cache` namespace.

Нові: src/core/request-profile.ts, http.ts, browser.ts, proxy-bridge.ts, proxies.ts, settings.ts; src/desktop/services.ts, vault.ts; src/renderer/tools.tsx; electron-builder.yml; build/app.ico; scripts/install-browser.mjs, package-win.mjs, smoke-portable.mjs; tests/engines.test.ts, fixtures/server.ts, tls fixtures, ui/engines.spec.ts.

Оновлено main/preload/worker, project schema, parsing engine, renderer, shared API, package/lock, CI та документацію. Результати завантажень, секрети, кеш і збірки не комітяться у вихідний репозиторій.

Офіційні джерела: https://playwright.dev/docs/browsers , https://playwright.dev/docs/network , https://www.electronjs.org/docs/latest/api/safe-storage , https://www.electron.build/docs/nsis/ .
