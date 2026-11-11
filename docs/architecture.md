# Архітектура

`React renderer → вузький preload API → Electron main → Worker Thread → незалежне core`.

`CLI → core` працює без Electron. Core містить Zod-схеми, HTTP downloader, дерево границь, ordered pipeline, template registry, CSV/JSON і SQLite store. Worker запускає лише вбудовані операції; користувацький JavaScript відсутній. Worker Thread — механізм ізоляції ресурсів та зупинки, а не sandbox для недовіреного коду.

## Дані і семантика

Project v1 містить URL, timeoutMs, boundaries[], template. Кожна границя містить children[] і pipeline[]. Дочірня границя отримує значення батьківської після pipeline. Regex повертає першу групу або весь match. Between не включає маркери, використовує неперекривні входження. CSS повертає внутрішній HTML.

Вибір: знайти → reverse → skip → max (або перше для звичайної) → min → pipeline → children. Fallback/required виконуються на порожньому значенні, якщо збігів немає. Результати дерева зберігаються в BoundaryResult. JSON/CSV експортує плоскі рядки: кореневі scalar — спільні колонки, repeat roots — окремі набори рядків, дочірні repeat — декартів добуток sibling datasets. Дерево доступне в результаті ядра. Template VALUE — JSON поточного плоского рядка. ID глобально унікальні.

## Зберігання

SQLite DatabaseSync: параметризовані запити, WAL; кожне ручне збереження додає незмінну версію. Desktop зберігає БД у Electron userData, CLI — у каталозі експорту. Версія схеми проєкту — 1. Міграції БД та автоматичне відновлення черг ще відсутні.

## Межі безпеки

Renderer: contextIsolation, sandbox, nodeIntegration=false; без довільного IPC, навігації та нових вікон. Завантажений HTML показується як текст React, не виконується. CSP блокує зовнішню мережу renderer. HTTP виконується в worker: HTTP(S), timeout, 5 MiB, без автоматичного redirect. Немає UI для credentials, їх не слід вставляти в URL/конфігурацію. Сирі документи та trace можуть містити персональні дані: зберігаються/експортуються лише локально; автоматичного надсилання немає. Сховище секретів ще не реалізоване. Regex може бути дорогим: desktop має watchdog і memory limit; CLI призначено для власних перевірених правил.

## Розширення

Майбутній Workflow Engine: typed node specs, input/output schemas, explicit sequence/parallel/loop/condition, cancellation, retry та trace. Браузерний adapter через Playwright, DB adapters окремо, CDX1 parser → AST → interpreter. Monaco і React Flow додаються разом із працюючими редакторами відповідних операцій.

Офіційні джерела: https://www.electronjs.org/docs/latest/tutorial/security , https://www.electronjs.org/docs/latest/tutorial/context-isolation , https://nodejs.org/api/sqlite.html .
