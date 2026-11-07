/**
 * GRAVITY: VOID — точка входа.
 * Собирает мир ECS, сервисы и системы, запускает игровой цикл.
 * Плагины модулей (биомы, способности, предметы, ИИ) подключаются здесь
 * без изменения ядра.
 */
import { World } from './ecs/world';
import { EventBus } from './core/event-bus';
import { GameLoop } from './core/game-loop';
import { DEFAULT_GAME_CONFIG } from './core/types';

import { PhysicsService } from './services/physics-service';
import { RenderService } from './services/render-service';
import { InputService } from './services/input-service';
import { AudioService } from './services/audio-service';
import { StorageService } from './services/storage-service';

import { InputSystem } from './systems/input-system';
import { AISystem } from './systems/ai-system';
import { PhysicsSystem } from './systems/physics-system';
import { ConstructionSystem } from './systems/construction-system';
import { InventorySystem } from './systems/inventory-system';
import { EventSystem } from './systems/event-system';
import { RenderSystem } from './systems/render-system';
import { SaveSystem } from './systems/save-system';

import { Transform } from './components/transform';
import { PhysicsBody } from './components/physics-body';
import { Renderable } from './components/renderable';
import { Player } from './components/player';
import { GravityZone } from './components/gravity-zone';

// 1. Сервисы (DI)
const physics = new PhysicsService();
const render = new RenderService();
const input = new InputService();
const audio = new AudioService();
const storage = new StorageService();
const eventBus = new EventBus();

// 2. Мир ECS
const world = new World();

// 3. Регистрация базовых компонентов
world.registerComponent(Transform as unknown as symbol);
world.registerComponent(PhysicsBody as unknown as symbol);
world.registerComponent(Renderable as unknown as symbol);
world.registerComponent(Player as unknown as symbol);
world.registerComponent(GravityZone as unknown as symbol);

// 4. Базовые системы в порядке приоритета
world.addSystem(new InputSystem(input, eventBus));        // 10
world.addSystem(new AISystem(physics, eventBus));         // 20
world.addSystem(new PhysicsSystem(physics, eventBus));    // 30
world.addSystem(new ConstructionSystem(physics, eventBus)); // 40
world.addSystem(new InventorySystem(eventBus));           // 50
world.addSystem(new EventSystem(eventBus));               // 60
const renderSystem = new RenderSystem(render);            // 90
world.addSystem(renderSystem);
world.addSystem(new SaveSystem(storage, eventBus));       // 100

// 5. Пример: создание игрока
const player = world.createEntity();
world.addComponent(player, Transform as unknown as symbol, {
  x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1,
});
world.addComponent(player, PhysicsBody as unknown as symbol, {
  body: null, gravityScale: 1.0, isSleeping: false,
});
world.addComponent(player, Renderable as unknown as symbol, {
  texture: 'player', tint: 0xffffff, alpha: 1, visible: true, layer: 10,
});
world.addComponent(player, Player as unknown as symbol, {
  health: 100, maxHealth: 100, speed: 200, jumpForce: 450, canDoubleJump: false,
});

// 6. Пример плагина модуля (биома Пустоты) — подключается без изменения ядра:
// import { voidBiomePlugin } from './modules/biomes/void-biome';
// voidBiomePlugin.install(world, { physics, render, audio, storage, input, events: eventBus });

// 7. Игровой цикл: фиксированная физика + интерполированный рендер
const loop = new GameLoop(
  world,
  DEFAULT_GAME_CONFIG.fixedTimeStep,
  DEFAULT_GAME_CONFIG.maxSubSteps,
  (alpha) => renderSystem.draw(world, alpha),
);

loop.start();

console.log('GRAVITY: VOID started. Entities:', world.entityCount);
