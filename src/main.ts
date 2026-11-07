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
import { GravitySystem } from './systems/gravity-system';
import { PhysicsSystem } from './systems/physics-system';
import { ConstructionSystem } from './systems/construction-system';
import { InventorySystem } from './systems/inventory-system';
import { EventSystem } from './systems/event-system';
import { RenderSystem } from './systems/render-system';
import { SaveSystem } from './systems/save-system';

import { Vec2 } from './core/vec2';
import { Transform } from './components/transform';
import { PhysicsBody } from './components/physics-body';
import { Renderable } from './components/renderable';
import { Player } from './components/player';
import { Material } from './components/material';
import {
  GravityZone,
  IndividualGravity,
  GravityForce,
  GlobalGravity,
} from './components/gravity';

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
world.registerComponent(IndividualGravity as unknown as symbol);
world.registerComponent(GravityForce as unknown as symbol);
world.registerComponent(GlobalGravity as unknown as symbol);
world.registerComponent(Material as unknown as symbol);

// 4. Базовые системы в порядке приоритета
world.addSystem(new InputSystem(input, eventBus));        // 10
world.addSystem(new AISystem(physics, eventBus));         // 20
const gravitySystem = new GravitySystem(physics, eventBus);
world.addSystem(gravitySystem);                           // 25  ← гравитация перед шагом физики
world.addSystem(new PhysicsSystem(physics, eventBus));    // 30
world.addSystem(new ConstructionSystem(physics, eventBus)); // 40
world.addSystem(new InventorySystem(eventBus));           // 50
world.addSystem(new EventSystem(eventBus));               // 60
const renderSystem = new RenderSystem(render);            // 90
world.addSystem(renderSystem);
world.addSystem(new SaveSystem(storage, eventBus));       // 100

// 5. Пример: создание игрока с нормальной гравитацией
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
world.addComponent(player, Material as unknown as symbol, {
  mass: 80, density: 950, strength: 5000, durability: 1,
  sailArea: 0.2, airResistance: 0.4, state: 'solid',
  temperature: 20, burnable: false, flammable: false, thermalConductivity: 0.2,
});

// 6. Глобальная гравитация мира (по умолчанию вниз, земная)
gravitySystem.setGlobalGravity(new Vec2(0, 9.81), 1, true);

// 7. Пример плагина модуля: биом «Пустота» с локальной невесомостью
// import { voidBiomePlugin } from './modules/biomes/void-biome';
// voidBiomePlugin.install(world, { physics, render, audio, storage, input, events: eventBus });

// 8. Игровой цикл: фиксированная физика + интерполированный рендер
const loop = new GameLoop(
  world,
  DEFAULT_GAME_CONFIG.fixedTimeStep,
  DEFAULT_GAME_CONFIG.maxSubSteps,
  (alpha) => renderSystem.draw(world, alpha),
);

loop.start();

console.log('GRAVITY: VOID started. Entities:', world.entityCount);
