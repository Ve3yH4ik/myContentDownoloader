# План реалізації

Уточнення 2026-11-11: за новими скриншотами й прямим запитом користувача частину desktop UX виконано раніше: робоче місце, native menus, окремі вікна, template preview, HTTP scanner/generator/queue/report. Це не змінює статус невиконаних етапів. Деталі й перевірки — workspace-report.md.

1. **Поточний етап: перший наскрізний сценарій.** Документація, Electron/React/TS shell, незалежне ядро й CLI, HTTP, scalar/repeat/nested boundaries, Regex/Replace, CSV/JSON/template, trace, SQLite versions. Gate: typecheck, unit/integration, production build, Electron UI test.
2. **Advanced Text Processing.** Повний ordered pipeline, transliterate/shuffle з контрольованою випадковістю, AST, оператори з підтвердженою граматикою, Monaco suggestions/validation/step preview/history. Непідтверджені CDX1 оператори лишаються unsupported.
3. **Workflow Engine.** Вузли, drag-and-drop React Flow, order, scopes, loops, conditions, parallel, retry, pause/resume, breakpoints. Gate: deterministic execution, cancellation/recovery tests.
4. **Браузер.** Playwright Chromium, actions, sessions/cookies, recorder, editable steps, network/browser logs. Gate: локальні HTML fixtures та реальні дозволені сценарії.
5. **Формати та інтеграції.** JSONPath/XPath, XML/CSV/API/files, MySQL/MariaDB/PostgreSQL/SQLite adapters, mappings, preview, transactions, backups. Gate: test DB containers і rollback cases.
6. **Повний desktop UX і надійність.** Переміщувані панелі, меню, URL library/queues/generator, visual output designer, autosave, recovery, encrypted credentials, Windows packaging. Gate: acceptance matrix, clean Windows smoke install.

Не переходити до наступного великого етапу, доки поточний не запускається й не проходить перевірки. Повна сумісність із Content Downloader X1 потребує доступних скриншотів, документації та контрольного запуску оригіналу. Наявність однойменної операції не є доказом сумісності.
