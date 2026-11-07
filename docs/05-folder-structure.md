# GRAVITY: VOID — структура папок проекта

```
gravity-void/
├── index.html                      # Точка входа браузера (подключает bundle)
├── vite.config.ts                  # Конфигурация Vite
├── tsconfig.json                   # Строгий TypeScript
├── package.json
├── pnpm-lock.yaml
├── README.md
├── docs/                           # Архитектурная документация (см. файлы 01–05)
│   ├── 01-tech-stack.md
│   ├── 02-architecture.md
│   ├── 03-systems.md
│   ├── 04-interaction.md
│   └── 05-folder-structure.md
├── src/
│   ├── main.ts                     # Bootstrap: создаёт World, сервисы, системы, запускает GameLoop
│   ├── core/
│   │   ├── game-loop.ts            # Фиксированный шаг 60 FPS + интерполированный рендер
│   │   ├── event-bus.ts            # Централизованная шина событий (pub/sub)
│   │   ├── container.ts            # Простой DI-контейнер для сервисов
│   │   └── types.ts                # Глобальные типы (GameConfig, Plugin, …)
│   ├── ecs/                        # Ядро ECS (не меняется при добавлении модулей)
│   │   ├── entity.ts               # Entity = number
│   │   ├── component.ts            # Декоратор/регистрация компонентов
│   │   ├── world.ts                # World: сущности, компоненты, системы, query
│   │   ├── system.ts               # Базовый класс System с порядком выполнения
│   │   └── query.ts                # Поиск сущностей по набору компонентов
│   ├── components/                 # Чистые данные (никакой логики)
│   │   ├── transform.ts            # {x, y, rotation, scale}
│   │   ├── physics-body.ts         # {matterBody, gravityScale, restitution}
│   │   ├── renderable.ts           # {texture, tint, visible, layer}
│   │   ├── sprite-animation.ts     # frames, fps, currentFrame
│   │   ├── player.ts               # {health, speed, jumpForce}
│   │   ├── inventory.ts            # slots, maxWeight
│   │   ├── item-stack.ts           # {itemId, count}
│   │   ├── equipment.ts            # {head, chest, hands, …}
│   │   ├── ai-controller.ts        # {state, target, path}
│   │   ├── gravity-zone.ts         # {vector, strength, radius}
│   │   ├── buildable.ts            # {gridSize, snap, supportRequired}
│   │   ├── ghost-preview.ts        # {visible, validColor, invalidColor}
│   │   ├── active-event.ts         # {type, startTime, duration, intensity}
│   │   └── intent-*.ts             # IntentMove, IntentBuild, IntentAttack и т.п.
│   ├── systems/                    # Игровая логика (порядок важен)
│   │   ├── input-system.ts
│   │   ├── ai-system.ts
│   │   ├── physics-system.ts
│   │   ├── construction-system.ts
│   │   ├── inventory-system.ts
│   │   ├── event-system.ts         # катастрофы
│   │   ├── render-system.ts
│   │   └── save-system.ts
│   ├── services/                   # Обёртки над внешними библиотеками
│   │   ├── physics-service.ts      # Matter.js Engine/World
│   │   ├── render-service.ts       # PixiJS Application + слои + камера
│   │   ├── audio-service.ts        # Howler.js
│   │   ├── storage-service.ts      # IndexedDB (idb / Dexie.js)
│   │   └── input-service.ts        # клавиатура / мышь / тач / геймпад
│   ├── save/                       # Схемы и миграции сохранений
│   │   ├── schema.ts               # Тип SaveData + версия схемы
│   │   ├── migrations.ts           # миграторы v1 → v2 → …
│   │   └── serializer.ts           # JSON + LZ-string, только persist-компоненты
│   ├── ui/                         # HUD, меню, инвентарь (над RenderService)
│   │   ├── hud.ts
│   │   ├── inventory-ui.ts
│   │   ├── main-menu.ts
│   │   └── event-alert.ts          # предупреждение о катастрофе
│   ├── modules/                    # Плагины — подключаются без изменения ядра
│   │   ├── biomes/                 # void-biome, forest-biome и т.д.
│   │   ├── abilities/              # teleport, dash, gravity-well
│   │   ├── items/                  # ore-vantablack, torch, sword и рецепты
│   │   └── ai/                     # hunter-ai, wanderer-ai, boss-ai
│   └── assets/
│       ├── textures/               # спрайты, тайлы, частицы
│       ├── audio/                  # sfx, музыка
│       ├── data/                   # JSON конфиги баланса (веса, урон, рецепты)
│       └── fonts/
└── tests/                          # Vitest: юнит-тесты систем без PixiJS/Matter.js
    ├── ecs/
    └── systems/
```

### Правила размещения кода

- **`src/ecs/`** — ядро. Изменяется редко, только при рефакторинге архитектуры.
- **`src/components/`** — только данные. Любой плагин может добавить свой компонент здесь.
- **`src/systems/`** — базовые системы игры. Плагины не должны править эти файлы; они регистрируют дополнительные системы через `world.addSystem()`.
- **`src/modules/`** — биомы, способности, предметы, ИИ. Каждый модуль — отдельная папка с `index.ts`, который экспортирует объект `Plugin`.
- **`src/services/`** — замена любой внешней библиотеки затрагивает только этот слой.
