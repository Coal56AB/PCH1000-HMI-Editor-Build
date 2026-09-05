# Проверка версии 1.2.0

- `node --check editor.js` — успешно;
- `node --check app-shell.js` — успешно;
- статическая проверка обязательных элементов и связей интерфейса — успешно;
- XML manifest/styles/FileProvider — корректный XML;
- `git diff --check` — ошибок нет;
- C99 renderer: сборка с `-Wall -Wextra -Werror` — успешно;
- полный рендер: 47/47 сцен, pixel diff = 0;
- dirty updates: все проверяемые переходы, pixel diff = 0.

Android `assembleDebug` должен выполняться workflow `Build APK` после отправки ветки в GitHub.
