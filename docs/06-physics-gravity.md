# GRAVITY: VOID — спецификация физической системы и механики гравитации

## 1. Общая модель гравитации

Гравитация — центральная система игры. Она влияет на игрока, объекты, существ, постройки и жидкости. Эффективная гравитация для любой сущности в мире вычисляется как комбинация трёх источников:

```
G_eff(entity, P) = G_base(P) * S_individual   (+ G_override, если задан)
```

где `P` — позиция сущности в мире.

### 1.1 Базовая гравитация в точке P

```
G_base(P) = G_global * W_global  +  Σ (G_zone_i * W_zone_i * F_i(P))
```

| Параметр | Описание |
|----------|----------|
| `G_global` | Глобальный вектор гравитации мира (по умолчанию `{0, 9.81}` — вниз) |
| `W_global` | Глобальный множитель силы (1.0 = земная гравитация, 0 = вселеннаяя невесомость) |
| `G_zone_i` | Вектор i-й локальной зоны, содержащей точку P |
| `W_zone_i` | Сила (множитель) i-й зоны |
| `F_i(P)` | Коэффициент затухания зоны в точке P (0.0 … 1.0) |

### 1.2 Локальные гравитационные зоны

Зона определяется формой (круг или AABB), центром, вектором гравитации, силой и типом затухания. Зоны накладываются аддитивно — если сущность находится сразу в нескольких зонах, их векторы суммируются.

**Поддерживаемые формы:**
- `circle` — круг с радиусом `radius` от центра
- `aabb` — осевыми гранями параллельный прямоугольник с `halfExtents`

**Типы затухания `falloff`:**
- `none` — силаzonны постоянна на всей площади (`F = 1.0`)
- `linear` — линейно убывает от 1.0 в `coreRadius` до 0.0 на границе
- `inverse-square` — убывает по квадрату расстояния от ядра

### 1.3 Индивидуальная гравитация сущности

Каждая сущность может иметь компонент `IndividualGravity`:

| Поле | Назначение |
|------|------------|
| `scale` | Множитель итогового вектора (0 = невесомость, 1 = норма, 2 = двойной вес) |
| `useOverride` | Если `true` — вектор `override` полностью заменяет вычисленную гравитацию |
| `override` | Жёсткий вектор гравитации (ходьба по стенам/потолку) |
| `orientation` | Угол «пола» сущности (радианы) — для анимации и_side-коллизий |

**Пример:** игрок на потолке получает `override = {0, -9.81}` — он «падает» вверх.

### 1.4 Итоговая формула

```
Если entity.useOverride:
    G_eff = override * scale
Иначе:
    G_eff = (G_global * W_global + Σ G_zone_i * W_zone_i * F_i(P)) * scale
```

## 2. Физические свойства объектов

Компонент `Material` описывает физические и материальные характеристики сущности. Используется GravitySystem (масса, парусность), DamageSystem (прочность), FluidSystem (плотность, состояние), WeatherSystem (ветровое воздействие).

| Поле | Тип | Описание |
|------|-----|----------|
| `mass` | number | Масса (кг). Используется в F = m * g при приложении силы гравитации |
| `density` | number | Плотность (кг/м³). Для плавучести в жидкостях |
| `strength` | number | Прочность — порог импульса удара, при превышении которого объект ломается |
| `durability` | number | Текущая целостность 0.0 … 1.0 |
| `sailArea` | number | Эффективная площадь парусности (м²). Для ветрового воздействия на лёгкие объекты |
| `airResistance` | number | Коэффициент лобового сопротивления 0.0 … 1.0 |
| `state` | `'solid' \| 'liquid' \| 'gas'` | Агрегатное состояние |
| `temperature` | number | Температура (°C). Для горения/охлаждения, фазовых переходов |
| `burnable` | boolean | Может ли гореть |
| `flammable` | boolean | Воспламеняется ли от внешнего огня |
| `thermalConductivity` | number | Теплопроводность |

### 2.1 Предопределённые материалы

```typescript
Materials.stone()   // масса 120 кг, прочность 8000, твёрдое
Materials.wood()    // масса 40 кг, горит, твёрдое
Materials.iron()    // масса 220 кг, прочность 15000, твёрдое
Materials.water()   // плотность 1000, жидкое, температура 20°C
Materials.lava()    // температура 1100°C, жидкое
Materials.gas()     // масса 0.02 кг, газовое состояние, большая парусность
```

## 3. Взаимодействие с окружением

| Возможность | Реализация |
|-------------|------------|
| **Разрушение материалов от ударов** | DamageSystem считает импульс удара `J = m * Δv`; если `J > strength`, объект переходит в состояние обломков (Debris с физикой) |
| **Течение воды по вектору гравитации** | FluidSystem применяет к жидкостям силу `F = m * G_eff` плюс диффузию по сосудам |
| **Ветер на лёгкие объекты** | WeatherSystem добавляет вектор ветра, умноженный на `sailArea * airResistance` |
| **Горение / охлаждение** | ThermalSystem меняет `temperature` в зависимости от окружения; при `temperature > ignition` и `burnable` → воспламенение |

## 4. Контроллер гравитации (GravitySystem)

### 4.1 Публичный API

```typescript
class GravitySystem {
  // Глобальная гравитация
  setGlobalGravity(vector: Vec2, scale = 1, active = true): void
  getGlobalGravity(): Vec2 | null

  // Индивидуальная гравитация сущности
  setEntityGravity(entity, scale = 1, override?: Vec2): void
  removeEntityGravity(entity): void

  // Локальные зоны (круг / AABB)
  addZone({ id, shape, center, vector, strength, falloff, radius, halfExtents, coreRadius }): void
  removeZone(id): void
  setZoneActive(id, active): void

  // Вычисление (доступно для внешних систем)
  computeEffectiveGravity(entity, pos: Vec2): Vec2

  // Приложение сил к телам (вызывается PhysicsSystem перед шагом Matter.js)
  applyForcesToBodies(dt: number): void
}
```

### 4.2 Порядок выполнения в игровом цикле

```
1. InputSystem  (10)   — Intent-компоненты
2. AISystem     (20)   — решения мобов
3. GravitySystem (25)  — вычисляет G_eff для всех сущностей → GravityForce
4. PhysicsSystem (30)  — F = m * G_eff → Matter.js Engine.update → синхрон Transform
5. ConstructionSystem (40)
6. InventorySystem (50)
7. EventSystem (60)    — катастрофы (гравитационные бури меняют G_global)
8. RenderSystem (90)
9. SaveSystem (100)
```

GravitySystem работает **перед** PhysicsSystem, чтобы вычисленная сила была применена к телу Matter.js до вызова `Engine.update`.

### 4.3 Псевдокод вычисления эффективной гравитации

```
function computeEffectiveGravity(entity, pos):
    base = Vec2(0, 0)
    if global.active:
        base += global.vector * global.scale

    for zone in zones:
        if not zone.active: continue
        if not zone.contains(pos): continue
        f = zone.falloffAt(pos)          // 0.0 .. 1.0
        if f <= 0: continue
        base += zone.vector * zone.strength * f

    indiv = entity.IndividualGravity
    if indiv and indiv.useOverride and indiv.override:
        return indiv.override * indiv.scale   // ходьба по стенам/потолку

    return base * (indiv?.scale ?? 1.0)       // обычная комбинация
```

### 4.4 Псевдокод проверки попадания в зону и затухания

```
function Zone.contains(point):
    if shape == 'circle':
        return distance(point, center) <= radius
    if shape == 'aabb':
        return point.x in [center.x - hx, center.x + hx] &&
               point.y in [center.y - hy, center.y + hy]

function Zone.falloffAt(point):
    if falloff == 'none': return 1.0
    d = distance(point, center)
    if d <= coreRadius: return 1.0
    maxDist = shape == 'circle' ? radius : max(hx, hy)
    if d >= maxDist: return 0.0
    t = (d - coreRadius) / max(maxDist - coreRadius, ε)
    if falloff == 'linear': return 1 - t
    if falloff == 'inverse-square': return 1 / (1 + t²)
```

### 4.5 Примеры использования

**Земная гравитация (по умолчанию):**
```typescript
gravitySystem.setGlobalGravity({ x: 0, y: 9.81 }, 1, true);
```

**Пониженная гравитация Луны:**
```typescript
gravitySystem.setGlobalGravity({ x: 0, y: 1.62 }, 1, true);
```

**Невесомость в биоме Пустоты:**
```typescript
gravitySystem.setGlobalGravity({ x: 0, y: 0 }, 1, true);
```

**Ходьба игрока по потолку:**
```typescript
gravitySystem.setEntityGravity(player, 1.0, { x: 0, y: -9.81 });
```

**Локальная зона притяжения (чёрная дыра):**
```typescript
gravitySystem.addZone({
  id: 'black-hole-1',
  shape: 'circle',
  center: { x: 500, y: 300 },
  vector: { x: 0, y: 0 },          // притяжение к центру реализуется отдельно через силу
  strength: 3.0,
  falloff: 'inverse-square',
  radius: 200,
  coreRadius: 20,
});
```

**Антигравитационная платформа (AABB):**
```typescript
gravitySystem.addZone({
  id: 'anti-grav-platform',
  shape: 'aabb',
  center: { x: 800, y: 400 },
  vector: { x: 0, y: -9.81 },      // вверх
  strength: 1.0,
  falloff: 'none',
  halfExtents: { x: 60, y: 10 },
});
```

## 5. События системы

GravitySystem эмитит события в `EventBus` для слабой связанности с другими модулями:

| Событие | Данные | Когда |
|---------|--------|-------|
| `gravity:global-changed` | `{ vector, scale, active } | При изменении глобальной гравитации (катастрофы) |
| `gravity:zone-added` | `{ id, shape, center, vector, strength }` | При добавлении локальной зоны |
| `gravity:zone-removed` | `{ id }` | При удалении зоны |

## 6. Интеграция сphysics-движком (Matter.js)

- Мировая гравитация Matter.js отключается (или ставится в ноль), так как все силы применяются вручную через `Body.applyForce(body, position, force)`.
- Сила гравитации на тело: `F = m * G_eff`, применяется в центре масс — без вращательного момента.
- После приложения всех сил вызывается `Engine.update(dt)`, затем позиции тел синхронизируются в компоненты `Transform`.

## 7. Структура кода

| Файл | Содержимое |
|------|------------|
| `src/core/vec2.ts` | Векторная математика 2D (сложение, длина, нормализация, угол, поворот) |
| `src/components/gravity.ts` | `GlobalGravity`, `GravityZone`, `IndividualGravity`, `GravityForce` |
| `src/components/material.ts` | `Material`, `AggregateState`, предустановки материалов |
| `src/systems/gravity-system.ts` | `GravitySystem` — контроллер гравитации (публичный API выше) |
| `src/systems/physics-system.ts` | Применение `F = m * G_eff`, шаг Matter.js, синхрон Transform |
| `src/services/physics-service.ts` | Обёртка Matter.js, метод `applyForce(body, force)` |
| `docs/06-physics-gravity.md` | Эта спецификация |
