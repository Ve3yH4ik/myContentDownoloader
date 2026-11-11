# План перевірки

## Поточний етап

- Vitest: локальний HTTP fixture → HTML → scalar/repeat/nested → Regex/Replace → JSON/CSV/template/trace.
- SQLite: save, close, reopen, version history, повторний parsing з відкритої конфігурації.
- Вкладені звичайні/повторювані границі у всіх комбінаціях; intermediate pipeline values, order, CSS, reverse/skip/max, min, fallback/required.
- Валідація duplicate ID, unknown fields, bad regex, unsupported macros; CSV quotes/commas/newlines.
- HTTP 403, timeout, abort, redirect rejection.
- Playwright Electron: відкриття production UI, HTTP-запуск, результат/trace, save/open і screenshot.
- TypeScript strict і production build.

## Наступні етапи

CDX1 golden cases: skip із кількома входженнями; get/capture; case_down; reset/break if nil; FILTERSTRINGS; LINEMODE; SETVARIABLE; HTML-aware; nested rules. Фіксувати AST, вхід, проміжні значення, порядок і результат оригіналу. Без оригіналу відмічати лише internally tested.

Workflow: parallel determinism, scopes, retry, pause/resume/stop, timeout/resource exhaustion. Browser: cookies/session expiry, recorded actions, network errors. DB: mapping preview, transactions/rollback, backup/recovery, credential redaction. Desktop: screen scaling, panel layouts, keyboard, accessibility, clean Windows packaging. Обов'язкові негативні тести на oversize documents і ворожі Regex/HTML перед production release.

Команди: `npm test`, `npm run check`, `npm run build`, `npm run test:ui`. UI-тест сам запускає локальний сервер і використовує тимчасовий Electron userData.
