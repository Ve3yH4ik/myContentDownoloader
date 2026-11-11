# Дизайн 0.4 — Windows desktop

Оновлено за запитом користувача: сучасніший вигляд, ефекти відкриття вікон, підказки та готовий EXE. Ядро обробки, браузер, HTTP та проксі збережені.

## Вигляд і взаємодія

- Графітова тема з бірюзовим акцентом; повна світла тема. Вибір зберігається локально й використовується новими вікнами/наступним запуском.
- Ліва панель інструментів з власними SVG-піктограмами; окремі зони запуску, джерела, границь, редактора, результатів і черги.
- Єдині кольори/контраст для HTTP, browser, settings, proxy, template та інших вікон; кодові поля, таблиці, скролбари, focus/hover/disabled states.
- Інтегрований заголовок Windows із нативними системними кнопками. Нативне меню доступне через Alt, клавіші Ctrl+N/O/S збережені.
- Вікна показуються після готовності вмісту; сцени, панелі й діалог мають короткі анімації появи. Системне prefers-reduced-motion вимикає анімації та зайві переходи.
- Контекстні підказки для наведення мишею та фокуса клавіатури, з aria-describedby, Escape і захистом від виходу за край екрана.
- Довідка за F1 або кнопкою «Підказки»: три кроки роботи, гарячі клавіші, модальний focus trap. Escape закриває довідку та повертає фокус до попереднього елемента.

## Файли

Нові: src/renderer/ui.tsx, tests/ui/design.spec.ts, цей документ.

Оновлено: src/renderer/style.css і main.tsx; desktop main/preload, shared API (appearance); package/lock; portable smoke script та README. Нових залежностей для дизайну немає. SVG-піктограми власні, зовнішні шрифти/мережеві ресурси не використовуються.

## Перевірка

- 45 core/integration tests для наявних функцій.
- 4 Playwright/Electron tests: нові theme persistence, hints з мишею/клавіатурою, F1/Escape/focus, окремі вікна, reduced motion, ширина 1100 px; чинні parsing/queue/HTTP/browser/proxy/settings сценарії.
- TypeScript і production build; візуальна перевірка dark/light/help/settings/compact screenshots.
- Windows portable збирається в release/UniversalDataDownloader-0.4.0-Portable.exe, включає Chromium. Packaged runtime та portable launcher перевіряються перед передаванням.

Цей етап змінює оформлення й доступ до існуючих функцій. Обмеження FTP/SFTP/CAPTCHA, CDX1 та повного Workflow Engine лишаються описаними в engines-settings-report.md.

Фактичний результат: 45 core/integration tests пройшли; 4 Playwright/Electron tests на зібраному Windows runtime пройшли; TypeScript/production build пройшли. Portable launcher відкрився й виконав HTTP + bundled Chromium з PATH без Node/npm. Знімки dark/light/help/settings/compact переглянуто. Перевірка виконана на поточному Windows ПК.
