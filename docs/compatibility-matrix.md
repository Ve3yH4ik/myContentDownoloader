# Матриця сумісності

| Функція | Власна реалізація | CDX1 compatibility |
|---|---|---|
| HTTP GET / HTML | Реалізовано, UTF-8, без redirect | Не перевірено |
| Звичайні/повторювані/вкладені границі | Реалізовано для between/Regex/CSS | Не перевірено |
| Regex/Replace і ordered pipeline | JSON-операції, trace | Не є CDX1 grammar |
| VALUE/COUNT/INDEX_ID | Власна документована семантика | Не перевірено |
| CSV/JSON | Плоскі рядки, екран і локальні файли | Не перевірено |
| Збереження/повторне відкриття | SQLite versions | Власний формат |
| Головне вікно й окремі вікна інструментів | Реалізовано 0.2 за наданою структурою | Візуальна організація, не підтвердження поведінки CDX1 |
| HTTP вебсканер / Sitemap / генератор / черга / звіт | Реалізовано 0.2, обмеження в README | Не перевірено на оригіналі |
| CDX1 project import | Відсутній | Немає специфікації формату |
| skip/get/case_down/reset_if_nil/break_if_nil/SETVARIABLE | Не реалізовано | Очікуються reference fixtures |
| FILTERSTRINGS/LINEMODE/HTML-aware/nested replace AST | Не реалізовано | Очікуються reference fixtures |
| Макроси умов, HTTP, cookies, threads, document management | Не реалізовано | Очікуються reference fixtures |

Рівні для майбутнього: specified → implemented → internally tested → compared with original → verified. Зараз жодна функція не має статусу verified CDX1. Захищений код/ресурси оригіналу не використовуються.
