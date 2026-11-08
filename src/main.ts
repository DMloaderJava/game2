/**
 * GRAVITY: VOID — MVP версия.
 * Исправленный билд: PixiJS v8 app.init(), текстуры вместо примитивов,
 * рабочая камера, добыча ресурсов по клавише E, инвентарь.
 */
import * as PIXI from 'pixi.js';
import { World } from './ecs/world';
import { EventBus } from './core/event-bus';
import { GameLoop } from './core/game-loop';
import { DEFAULT_GAME_CONFIG } from './core/types';

import { PhysicsService } from './services/physics-service';
import { RenderService } from './services/render-service';
import { InputService } from './services/input-service';

import { Transform } from './components/transform';
import { PhysicsBody } from './components/physics-body';
import { Renderable } from './components/renderable';
import { Player } from './components/player';
import { Material } from './components/material';
import { CharacterController } from './components/character';
import { CharacterStats } from './components/character';
import { IndividualGravity } from './components/gravity';
import { GravityForce } from './components/gravity';
import { IntentMove } from './components/intent';
import { Inventory } from './components/inventory';
import { ItemStack } from './components/inventory';
import { Chunk, DEFAULT_CHUNK_CONFIG, TileType } from './components/world';
import { MiningTool, Tools, Mineable } from './components/mining';
import { CharacterStatsData } from './components/character';
import { GravityAnchor } from './components/construction';
import { EnergyDome } from './components/event-state';

// Глобальный перехватчик ошибок игрового цикла (requestAnimationFrame)
// bootstrap().catch() НЕ ловит ошибки внутри GameLoop
window.addEventListener('error', (e) => {
  const el = document.getElementById('debug-err') ||
    document.body.appendChild(Object.assign(document.createElement('pre'), {
      id: 'debug-err',
      style: 'position:fixed;top:40%;left:5%;right:5%;background:#7f1d1d;color:#fff;padding:12px;z-index:99999;white-space:pre-wrap;font-size:14px;border:2px solid red;',
    }));
  el.textContent = 'RUNTIME ERROR: ' + (e.error?.stack || e.message);
});

import { InputSystem } from './systems/input-system';
import { CharacterSystem } from './systems/character-system';
import { StaminaEnergySystem } from './systems/stamina-energy-system';
import { PhysicsSystem } from './systems/physics-system';
import { GravitySystem } from './systems/gravity-system';
import { RenderSystem } from './systems/render-system';
import { InventorySystem } from './systems/inventory-system';
import { MiningSystem } from './systems/mining-system';
import { PlayerAnimationSystem } from './systems/player-animation-system';
import { CraftingSystem } from './systems/crafting-system';
import { BuildingSystem } from './systems/building-system';
import { GravityTideSystem } from './systems/gravity-tide-system';
import { TideConfig } from './components/event-state';

import { Vec2 } from './core/vec2';

// ============================================================================
// Текстуры (все кадры анимации предзагружаются)
// ============================================================================
const TEX = {
  // Игрок — базовые (для совместимости)
  playerIdle: '/textures/player_idle.png',
  playerWalk: '/textures/player_walk.png',
  playerJump: '/textures/player_jump.png',
  // Игрок — кадры анимации (Idle)
  playerIdle0: '/textures/player_idle_0.png',
  playerIdle1: '/textures/player_idle_1.png',
  playerIdle2: '/textures/player_idle_2.png',
  playerIdle3: '/textures/player_idle_3.png',
  // Игрок — кадры анимации (Walk)
  playerWalk0: '/textures/player_walk_0.png',
  playerWalk1: '/textures/player_walk_1.png',
  playerWalk2: '/textures/player_walk_2.png',
  playerWalk3: '/textures/player_walk_3.png',
  playerWalk4: '/textures/player_walk_4.png',
  playerWalk5: '/textures/player_walk_5.png',
  // Блоки мира
  blockDirt: '/textures/block_dirt.png',
  blockStone: '/textures/block_stone.png',
  blockFerrite: '/textures/block_ferrite.png',
  blockResonit: '/textures/block_resonit.png',
  blockStoneWall: '/textures/block_stone_wall.png',
  // Предметы
  itemStoneSlabs: '/textures/item_stone_slabs.png',
  itemFerriteOre: '/textures/item_ferrite_ore.png',
  itemResonit: '/textures/item_resonit.png',
  itemBiovolume: '/textures/item_biovolume.png',
  itemBiogel: '/textures/item_biogel.png',
  itemAncientFragment: '/textures/item_ancient_fragment.png',
  // Устройства
  gravityAnchor: '/textures/gravity_anchor.png',
  gravityZone: '/textures/gravity_zone.png',
  energyDome: '/textures/energy_dome.png',
  // Существа
  creature_scavenger: '/textures/creature_scavenger.png',
  creature_predator: '/textures/creature_predator.png',
  // UI
  bgSpace: '/textures/bg_space.png',
  uiSlot: '/textures/ui_slot.png',
} as const;

// Массивы кадров анимации для PlayerAnimationSystem
const PLAYER_IDLE_FRAMES = [
  TEX.playerIdle0,
  TEX.playerIdle1,
  TEX.playerIdle2,
  TEX.playerIdle3,
];

const PLAYER_WALK_FRAMES = [
  TEX.playerWalk0,
  TEX.playerWalk1,
  TEX.playerWalk2,
  TEX.playerWalk3,
  TEX.playerWalk4,
  TEX.playerWalk5,
];

// ============================================================================
// Конфигурация Гравитационного Прилива (таймер 45+15+60 секунд)
// ============================================================================
TideConfig.stabilityDuration = { min: 45, max: 45 };
TideConfig.warningDuration = { min: 15, max: 15 };
TideConfig.catastropheDuration = { min: 60, max: 60 };
TideConfig.aftermathDuration = { min: 5, max: 5 };

// ============================================================================
// 1. Движок и сервисы (асинхронная инициализация PixiJS v8)
// ============================================================================
const physics = new PhysicsService();
const render = new RenderService();
const input = new InputService();
const eventBus = new EventBus();

async function bootstrap(): Promise<void> {
  console.log('GRAVITY: VOID — NEW BUILD LOADED (textures: canvas-based, systems: fixed)');

  // Инициализируем физику
  physics.init({
    width: window.innerWidth,
    height: window.innerHeight,
    gravityX: 0,
    gravityY: 9.81 * 60,
  });

  // Инициализируем рендер (PixiJS v8 async init)
  await render.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: 0x111827,
  });

  // Предзагружаем текстуры
  await render.loadTextures(Object.values(TEX));

  // ============================================================================
  // 2. Мир ECS
  // ============================================================================
  const world = new World();

  world.registerComponent(Transform as unknown as symbol);
  world.registerComponent(PhysicsBody as unknown as symbol);
  world.registerComponent(Renderable as unknown as symbol);
  world.registerComponent(Player as unknown as symbol);
  world.registerComponent(Material as unknown as symbol);
  world.registerComponent(CharacterController as unknown as symbol);
  world.registerComponent(CharacterStats as unknown as symbol);
  world.registerComponent(IndividualGravity as unknown as symbol);
  world.registerComponent(GravityForce as unknown as symbol);
  world.registerComponent(IntentMove as unknown as symbol);
  world.registerComponent(Inventory as unknown as symbol);
  world.registerComponent(ItemStack as unknown as symbol);
  world.registerComponent(Mineable as unknown as symbol);
  world.registerComponent(EnergyDome as unknown as symbol);

  // ============================================================================
  // 3. Игрок
  // ============================================================================
  const PLAYER_RADIUS = 28;
  const PLAYER_SPEED = 220;
  const PLAYER_JUMP = -750;

  const player = world.createEntity();
  world.addComponent(player, Transform as unknown as symbol, {
    x: 200, y: 400, rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(player, PhysicsBody as unknown as symbol, {
    body: physics.createCircleBody(player, 200, 400, PLAYER_RADIUS, {
      restitution: 0.1, friction: 0.5, density: 1, label: 'player',
    }),
    gravityScale: 1.0, isSleeping: false,
  });
  world.addComponent(player, Renderable as unknown as symbol, {
    texture: TEX.playerIdle0, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
  });
  // Анимированный спрайт персонажа (Idle кадры) — размер 48x56
  const playerSprite = render.addSprite(player, TEX.playerIdle0, 10, 48, 56, true, 4, 0.15);
  world.addComponent(player, Player as unknown as symbol, {
    health: 100, maxHealth: 100, speed: PLAYER_SPEED, jumpForce: PLAYER_JUMP, canDoubleJump: false,
  });
  world.addComponent(player, Material as unknown as symbol, {
    mass: 80, density: 1000, strength: 5000, durability: 1,
    sailArea: 0.2, airResistance: 0.4, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 0.2,
  });
  world.addComponent(player, CharacterController as unknown as symbol, {
    state: 'Grounded', previousState: 'Grounded', stateTime: 0,
    inputDirection: new Vec2(0, 0), isSprinting: false,
    jumpPressed: false, interactPressed: false, digPressed: false, scanPressed: false,
    groundNormal: null, groundEntity: null, carriedEntity: null,
    maxCarryMass: 60, grabRadius: 2.5, jumpForce: PLAYER_JUMP,
    moveSpeed: PLAYER_SPEED, sprintMultiplier: 1.6,
    canDoubleJump: false, hasDoubleJumped: false,
  });
  world.addComponent(player, CharacterStats as unknown as symbol, {
    health: 100, maxHealth: 100, stamina: 100, maxStamina: 100,
    energy: 100, maxEnergy: 100, equipmentCondition: 1,
    speedPenalty: 1, exhausted: false, lastMealTime: null,
  });
  world.addComponent(player, IndividualGravity as unknown as symbol, {
    scale: 1, useOverride: false, override: undefined, orientation: 0,
  });
  world.addComponent(player, GravityForce as unknown as symbol, {
    vector: new Vec2(0, 9.81 * 60), dirty: true,
  });

  // Инвентарь игрока
  world.addComponent(player, Inventory as unknown as symbol, {
    slots: Array(20).fill(null),
    maxSlots: 20,
    maxWeight: 200,
    currentWeight: 0,
    open: false,
  });

  // Инструмент по умолчанию — каменная кирка
  world.addComponent(player, MiningTool as unknown as symbol, Tools.stone_pickaxe());

// ============================================================================
// 4. Уровень: широкий мир 3000px со стенами, рельефом и залежами руды
// ============================================================================
  const LEVEL_WIDTH = 3000;
  const GROUND_Y = 500;
  const GROUND_HEIGHT = 64;
  const WALL_THICKNESS = 80;

  // Левая граница мира (стена)
  const leftWall = world.createEntity();
  world.addComponent(leftWall, Transform as unknown as symbol, {
    x: -WALL_THICKNESS / 2, y: GROUND_Y + GROUND_HEIGHT / 2,
    rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(leftWall, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(leftWall, -WALL_THICKNESS / 2, GROUND_Y + GROUND_HEIGHT / 2, WALL_THICKNESS, GROUND_HEIGHT + 400, {
      isStatic: true, label: 'leftWall',
    }),
    gravityScale: 0, isSleeping: true,
  });
  world.addComponent(leftWall, Renderable as unknown as symbol, {
    texture: TEX.blockStoneWall, tint: 0xffffff, alpha: 1, visible: true, layer: 5,
  });
  const leftWallSprite = render.addSprite(leftWall, TEX.blockStoneWall, 5, WALL_THICKNESS, GROUND_HEIGHT + 400);
  world.addComponent(leftWall, Material as unknown as symbol, {
    mass: 0, density: 5000, strength: 50000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 2.0,
  });

  // Правая граница мира (стена)
  const rightWall = world.createEntity();
  world.addComponent(rightWall, Transform as unknown as symbol, {
    x: LEVEL_WIDTH + WALL_THICKNESS / 2, y: GROUND_Y + GROUND_HEIGHT / 2,
    rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(rightWall, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(rightWall, LEVEL_WIDTH + WALL_THICKNESS / 2, GROUND_Y + GROUND_HEIGHT / 2, WALL_THICKNESS, GROUND_HEIGHT + 400, {
      isStatic: true, label: 'rightWall',
    }),
    gravityScale: 0, isSleeping: true,
  });
  world.addComponent(rightWall, Renderable as unknown as symbol, {
    texture: TEX.blockStoneWall, tint: 0xffffff, alpha: 1, visible: true, layer: 5,
  });
  const rightWallSprite = render.addSprite(rightWall, TEX.blockStoneWall, 5, WALL_THICKNESS, GROUND_HEIGHT + 400);
  world.addComponent(rightWall, Material as unknown as symbol, {
    mass: 0, density: 5000, strength: 50000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 2.0,
  });

  // Земля — сплошная платформа на всю ширину уровня
  const groundEntity = world.createEntity();
  world.addComponent(groundEntity, Transform as unknown as symbol, {
    x: LEVEL_WIDTH / 2, y: GROUND_Y + GROUND_HEIGHT / 2,
    rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(groundEntity, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(groundEntity, LEVEL_WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, LEVEL_WIDTH, GROUND_HEIGHT * 4, {
      isStatic: true, label: 'ground',
    }),
    gravityScale: 0, isSleeping: true,
  });
  // Отрисовываем землю рядом тайлов 64x64 вдоль всей поверхности (2 слоя вглубь)
  const groundTopY = GROUND_Y - GROUND_HEIGHT * 2; // верхняя поверхность земли
  for (let gx = 0; gx < LEVEL_WIDTH; gx += 64) {
    const tileEntity = world.createEntity();
    world.addComponent(tileEntity, Transform as unknown as symbol, {
      x: gx + 32, y: groundTopY + 32, rotation: 0, scaleX: 1, scaleY: 1,
    });
    world.addComponent(tileEntity, Renderable as unknown as symbol, {
      texture: TEX.blockDirt, tint: 0xffffff, alpha: 1, visible: true, layer: 5,
    });
    render.addSprite(tileEntity, TEX.blockDirt, 5, 64, 64);
    // Статическое тело для каждого тайла (땅 не должна падать или улетать)
    world.addComponent(tileEntity, PhysicsBody as unknown as symbol, {
      body: physics.createRectangleBody(tileEntity, gx + 32, groundTopY + 32, 64, 64, {
        isStatic: true, label: `ground-tile-${gx}`,
      }),
      gravityScale: 0, isSleeping: true,
    });
    world.addComponent(tileEntity, Material as unknown as symbol, {
      mass: 0, density: 2000, strength: 10000, durability: 1,
      sailArea: 0, airResistance: 1, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
    });
  }
  world.addComponent(groundEntity, Material as unknown as symbol, {
    mass: 0, density: 2000, strength: 10000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
  });

  // Каменные блоки и руды — равномерно распределены по уровню
  const blocks: Array<{ x: number; y: number; w: number; h: number; type: TileType; tex: string }> = [];
  const oreTypes: Array<{ type: TileType; tex: string; weight: number }> = [
    { type: 'stone' as TileType, tex: TEX.blockStone, weight: 5 },
    { type: 'stone' as TileType, tex: TEX.blockStone, weight: 5 },
    { type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite, weight: 2 },
    { type: 'resonit_ore' as TileType, tex: TEX.blockResonit, weight: 1 },
  ];

  // Генерируем блоки каждые ~200px с вариацией высоты
  for (let bx = 200; bx < LEVEL_WIDTH - 200; bx += 200) {
    const roll = Math.floor(Math.random() * 12);
    let ore: { type: TileType; tex: string } | null = null;
    if (roll < 2) ore = oreTypes[2]; // ferrite_ore
    else if (roll < 3) ore = oreTypes[3]; // resonit_ore
    else ore = oreTypes[Math.floor(Math.random() * 2)]; // stone

    const offsetY = (Math.random() - 0.5) * 30; // вариация высоты ±15px
    const y = groundTopY - 32 + offsetY; // блоки стоят НА поверхности земли

    blocks.push({
      x: bx + 40 + Math.random() * 120, // вариация по X внутри ячейки
      y,
      w: 64, h: 64,
      type: ore.type,
      tex: ore.tex,
    });
  }

  blocks.forEach((b, i) => {
    const entity = world.createEntity();
    world.addComponent(entity, Transform as unknown as symbol, {
      x: b.x + b.w / 2, y: b.y + b.h / 2, rotation: 0, scaleX: 1, scaleY: 1,
    });
    world.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: physics.createRectangleBody(entity, b.x + b.w / 2, b.y + b.h / 2, b.w, b.h, {
        restitution: 0.3, friction: 0.6, density: 2, label: `block-${i}`,
      }),
      gravityScale: 1.0, isSleeping: false,
    });
    world.addComponent(entity, Renderable as unknown as symbol, {
      texture: b.tex, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
    });
    const sprite = render.addSprite(entity, b.tex, 10, b.w, b.h);
    world.addComponent(entity, Material as unknown as symbol, {
      mass: 20, density: 2000, strength: 8000, durability: 1,
      sailArea: 0.05, airResistance: 0.3, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
    });
    // Блок можно добывать — Mineable задаёт прочность и лут
    const dropForType: Record<string, { drop: string; amount: number; health: number }> = {
      stone: { drop: 'stone_slabs', amount: 1, health: 30 },
      ferrite_ore: { drop: 'ferrite_ore', amount: 1, health: 45 },
      resonit_ore: { drop: 'resonit', amount: 1, health: 60 },
    };
    const drop = dropForType[b.type] ?? dropForType.stone;
    world.addComponent(entity, Mineable as unknown as symbol, {
      tileType: b.type,
      hardness: 1,
      health: drop.health,
      maxHealth: drop.health,
      resourceDrop: drop.drop,
      dropAmount: drop.amount,
      defaultEffectiveness: { dirt: 1.0, stone: 1.0, ferrite_ore: 1.0, resonit_ore: 1.0 },
    });
  });

  // ============================================================================
  // Существа на уровне (3 сборщика, 2 хищника)
  // ============================================================================
  const creatureTypes: Array<{ tex: string; w: number; h: number }> = [
    { tex: TEX.creature_scavenger, w: 48, h: 40 },
    { tex: TEX.creature_predator, w: 52, h: 44 },
  ];
  const creatureSpawnX = [600, 1100, 1600]; // сборщики
  const predatorSpawnX = [900, 1400]; // хищники

  creatureSpawnX.forEach((sx, i) => {
    const entity = world.createEntity();
    const cy = groundTopY - 20;
    world.addComponent(entity, Transform as unknown as symbol, { x: sx, y: cy, rotation: 0, scaleX: 1, scaleY: 1 });
    world.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: physics.createRectangleBody(entity, sx, cy, 36, 32, {
        restitution: 0.1, friction: 0.5, density: 1, label: `scavenger-${i}`,
      }),
      gravityScale: 1.0, isSleeping: false,
    });
    world.addComponent(entity, Renderable as unknown as symbol, { texture: TEX.creature_scavenger, tint: 0xffffff, alpha: 1, visible: true, layer: 10 });
    render.addSprite(entity, TEX.creature_scavenger, 10, 48, 40);
    world.addComponent(entity, Material as unknown as symbol, { mass: 5, density: 1000, strength: 2000, durability: 1, sailArea: 0.1, airResistance: 0.4, state: 'solid', temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.0 });
  });

  predatorSpawnX.forEach((px, i) => {
    const entity = world.createEntity();
    const cy = groundTopY - 22;
    world.addComponent(entity, Transform as unknown as symbol, { x: px, y: cy, rotation: 0, scaleX: 1, scaleY: 1 });
    world.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: physics.createRectangleBody(entity, px, cy, 44, 36, {
        restitution: 0.1, friction: 0.5, density: 1, label: `predator-${i}`,
      }),
      gravityScale: 1.0, isSleeping: false,
    });
    world.addComponent(entity, Renderable as unknown as symbol, { texture: TEX.creature_predator, tint: 0xffffff, alpha: 1, visible: true, layer: 10 });
    render.addSprite(entity, TEX.creature_predator, 10, 52, 44);
    world.addComponent(entity, Material as unknown as symbol, { mass: 12, density: 1500, strength: 3000, durability: 1, sailArea: 0.15, airResistance: 0.5, state: 'solid', temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.0 });
  });

  // ============================================================================
  // 5. Системы
  // ============================================================================
  const staminaEnergySystem = new StaminaEnergySystem(eventBus);
  const inventorySystem = new InventorySystem(eventBus, render);
  inventorySystem.setPlayerEntity(player);
  const miningSystem = new MiningSystem(physics, input, eventBus, inventorySystem, render);
  const playerAnimationSystem = new PlayerAnimationSystem(render);
  playerAnimationSystem.setPlayerEntity(player, PLAYER_IDLE_FRAMES, PLAYER_WALK_FRAMES, [TEX.playerJump]);
  const craftingSystem = new CraftingSystem(eventBus, render);
  craftingSystem.setPlayerEntity(player);
  const buildingSystem = new BuildingSystem(render, eventBus);
  buildingSystem.setPhysicsService(physics);
  const gravitySystem = new GravitySystem(world, physics, eventBus);
  // Инициализируем глобальную гравитацию — иначе игрок будет парить в воздухе
  // Значения подобраны так, чтобы сила гравитации была адекватной (не выстреливала игрока в космос)
  gravitySystem.setGlobalGravity(new Vec2(0, 1), 0.001, true);
  const tideSystem = new GravityTideSystem(eventBus, physics, gravitySystem, render);
  tideSystem.setNextGravityVector(0, -0.4); // инверсия гравитации вверх при прилив (0.4x от нормы)

  world.addSystem(new InputSystem(input, eventBus));           // 10
  world.addSystem(new CharacterSystem(eventBus));              // 12
  world.addSystem(staminaEnergySystem);                        // 18
  world.addSystem(gravitySystem);
  world.addSystem(miningSystem);                               // 28 (добыча перед физикой)
  world.addSystem(new PhysicsSystem(physics, eventBus));       // 30
  world.addSystem(playerAnimationSystem);                      // 35 (анимация игрока)
  world.addSystem(craftingSystem);                             // 45 (крафт)
  world.addSystem(buildingSystem);                             // 55 (строительство)
  world.addSystem(inventorySystem);                            // 50 (инвентарь)
  world.addSystem(tideSystem);                                 // 70 (гравитационный прилив)
  const renderSystem = new RenderSystem(render, physics);      // 40 (отрисовка после физики)
  world.addSystem(renderSystem);

  // ============================================================================
  // 6. Камера и игровой цикл
  // ============================================================================
  const loop = new GameLoop(
    world,
    DEFAULT_GAME_CONFIG.fixedTimeStep,
    DEFAULT_GAME_CONFIG.maxSubSteps,
    (alpha) => {
      const playerBody = physics.getBody(player);
      if (playerBody) {
        render.follow(playerBody.position.x, playerBody.position.y, 0.12);
        const camPos = render.getCameraPosition();
        buildingSystem.setCameraPosition(camPos.x, camPos.y);

        // Killzone: смерть при вылете за границы карты
        const playerTransform = world.getComponent(player, Transform as unknown as symbol) as { x: number; y: number; rotation?: number } | undefined;
        if (playerTransform) {
          if (playerTransform.y > 2000 || playerTransform.y < -1500) {
            // Смерть игрока — респавн над поверхностью земли
            const spawnX = 500;
            const spawnY = GROUND_Y - GROUND_HEIGHT * 2 - 60; // над толстым полом
            playerTransform.x = spawnX;
            playerTransform.y = spawnY;
            if (playerTransform.rotation !== undefined) {
              playerTransform.rotation = 0;
            }
            // Восстанавливаем характеристики
            const stats = world.getComponent(player, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
            if (stats) {
              stats.health = stats.maxHealth;
              stats.stamina = stats.maxStamina;
              stats.energy = stats.maxEnergy;
              stats.exhausted = false;
              world.addComponent(player, CharacterStats as unknown as symbol, stats);
            }
            // Сбрасываем скорость, угловую скорость и позицию тела Matter.js
            physics.setVelocity(playerBody, 0, 0);
            physics.setAngularVelocity(playerBody, 0);
            physics.setPosition(playerBody, spawnX, spawnY);
            showPickupToast('Смерть: выход за границы карты', 0);
          }
        }
      }
      renderSystem.draw(world, alpha);
      render.render();
    },
  );

  loop.start();

  console.log('GRAVITY: VOID MVP started. Entities:', world.entityCount);
  console.log('Controls: WASD/Arrows = move, Space = jump, E = mine/pickup, I = inventory');

  // ============================================================================
  // 7. Обработчики событий
  // ============================================================================
  window.addEventListener('resize', () => {
    physics.setGravity(physics.engine.gravity.x, physics.engine.gravity.y);
    render.resize();
  });

  window.addEventListener('keydown', (e) => input.onKeyDown(e.key));
  window.addEventListener('keyup', (e) => input.onKeyUp(e.key));

  input.bindAction('left', 'a');
  input.bindAction('right', 'd');
  input.bindAction('up', 'w');
  input.bindAction('down', 's');
  input.bindAction('jump', ' ');
  // E — только копирование/добыча (подбор ресурса происходит автоматически при приближении)

  // Инвентарь по клавишам I или Tab
  function toggleInventory(): void {
    const inv = world.getComponent(player, Inventory as unknown as symbol) as { open: boolean };
    if (inv) {
      inv.open = !inv.open;
      world.addComponent(player, Inventory as unknown as symbol, inv);
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I' || e.key === 'Tab') {
      if (e.key === 'Tab') e.preventDefault();
      toggleInventory();
    }
    if (e.key === 'c' || e.key === 'C') {
      craftingSystem.toggle();
    }
    // Выбор предмета для строительства
    if (e.key === '1') {
      buildingSystem.selectItem('stone_wall');
    }
    if (e.key === '2') {
      buildingSystem.selectItem('gravity_anchor');
    }
    if (e.key === '3') {
      buildingSystem.selectItem('energy_dome');
    }
    if (e.key === 'Escape') {
      buildingSystem.selectItem(null);
    }
    // Способности гравитации
    const stats = world.getComponent(player, CharacterStats as unknown as symbol) as { energy: number; maxEnergy: number; exhausted: boolean } | undefined;
    const playerBody = physics.getBody(player);
    const playerTransform = world.getComponent(player, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!playerBody || !playerTransform || !stats || stats.exhausted) return;

    const abilityCost = 15;
    const abilityRadius = 250;
    const abilityForce = 400;

    if (e.key === 'q' || e.key === 'Q') {
      if (stats.energy < abilityCost) return;
      stats.energy -= abilityCost;
      world.addComponent(player, CharacterStats as unknown as symbol, stats);
      // Притяжение — все динамические объекты в радиусе тянутся к игроку
      const actors = world.query(PhysicsBody, Transform, Material);
      for (const { entity, components } of actors) {
        if (entity === player) continue;
        const bodyData = components[0] as { body: { isStatic: boolean } };
        const bodyTransform = components[1] as { x: number; y: number };
        if (bodyData.body.isStatic) continue; // статические объекты не двигаем
        const dx = playerTransform.x - bodyTransform.x;
        const dy = playerTransform.y - bodyTransform.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist <= abilityRadius) {
          const forceX = (dx / dist) * abilityForce;
          const forceY = (dy / dist) * abilityForce;
          physics.applyForce(bodyData.body, new Vec2(forceX, forceY));
        }
      }
      showAbilityWave(playerTransform.x, playerTransform.y, 0x4cc9f0);
    }
    if (e.key === 'f' || e.key === 'F') {
      if (stats.energy < abilityCost) return;
      stats.energy -= abilityCost;
      world.addComponent(player, CharacterStats as unknown as symbol, stats);
      // Отталкивание — все динамические объекты в радиусе отбрасываются от игрока
      const actors2 = world.query(PhysicsBody, Transform, Material);
      for (const { entity, components } of actors2) {
        if (entity === player) continue;
        const bodyData = components[0] as { body: { isStatic: boolean } };
        const bodyTransform = components[1] as { x: number; y: number };
        if (bodyData.body.isStatic) continue;
        const dx = bodyTransform.x - playerTransform.x;
        const dy = bodyTransform.y - playerTransform.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist <= abilityRadius) {
          const forceX = (dx / dist) * abilityForce;
          const forceY = (dy / dist) * abilityForce;
          physics.applyForce(bodyData.body, new Vec2(forceX, forceY));
        }
      }
      showAbilityWave(playerTransform.x, playerTransform.y, 0xff6600);
    }
  });

  // Визуальная волна способности (круг на 0.3 сек)
  function showAbilityWave(cx: number, cy: number, color: number): void {
    const wave = new PIXI.Graphics();
    wave.lineStyle(4, color, 0.8);
    wave.drawCircle(0, 0, 60);
    wave.x = cx;
    wave.y = cy;
    wave.zIndex = 100;
    const cameraLayer = render as any;
    const container = cameraLayer.layers?.get(30) ?? cameraLayer.stage;
    container.addChild(wave);
    setTimeout(() => {
      wave.parent?.removeChild(wave);
      wave.destroy();
    }, 300);
  }

  // HUD обновление — стилизованные элементы
  const hpValEl = document.getElementById('hp-val');
  const hpBarEl = document.getElementById('hp-bar');
  const hpPanelEl = document.getElementById('hp-panel');
  const enValEl = document.getElementById('en-val');
  const enBarEl = document.getElementById('en-bar');
  const enPanelEl = document.getElementById('en-panel');
  const stValEl = document.getElementById('st-val');
  const stBarEl = document.getElementById('st-bar');
  const stPanelEl = document.getElementById('st-panel');
  const tideValEl = document.getElementById('tide-val');

  const toastEl = document.getElementById('pickup-toast');
  let toastTimeout: number | null = null;

  function showPickupToast(itemId: string, count: number): void {
    if (!toastEl) return;
    toastEl.style.display = 'block';
    toastEl.innerHTML = `
      <div class="toast-item">+${count} ${itemId.replace(/_/g, ' ')}</div>
    `;
    if (toastTimeout !== null) clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      toastEl.style.display = 'none';
      toastTimeout = null;
    }, 2500);
  }

  function updateHUD(): void {
    const stats = world.getComponent(player, CharacterStats as unknown as symbol) as {
      health: number; maxHealth: number;
      stamina: number; maxStamina: number;
      energy: number; maxEnergy: number;
      exhausted: boolean;
    } | undefined;
    if (stats) {
      // Здоровье
      const hpPct = Math.floor((stats.health / stats.maxHealth) * 100);
      if (hpValEl) hpValEl.textContent = Math.floor(stats.health).toString();
      if (hpBarEl) hpBarEl.style.width = `${hpPct}%`;
      if (hpPanelEl) {
        hpPanelEl.className = 'stat-panel' + (hpPct < 25 ? ' danger' : hpPct < 50 ? ' warn' : '');
        if (hpBarEl) hpBarEl.className = 'stat-fill' + (hpPct < 25 ? ' danger' : hpPct < 50 ? ' warn' : '');
      }
      // Энергия
      const enPct = Math.floor((stats.energy / stats.maxEnergy) * 100);
      if (enValEl) enValEl.textContent = Math.floor(stats.energy).toString();
      if (enBarEl) enBarEl.style.width = `${enPct}%`;
      if (enPanelEl) {
        enPanelEl.className = 'stat-panel' + (enPct < 25 ? ' danger' : enPct < 50 ? ' warn' : '');
        if (enBarEl) enBarEl.className = 'stat-fill' + (enPct < 25 ? ' danger' : enPct < 50 ? ' warn' : '');
      }
      // Выносливость
      const stPct = Math.floor((stats.stamina / stats.maxStamina) * 100);
      if (stValEl) stValEl.textContent = Math.floor(stats.stamina).toString();
      if (stBarEl) stBarEl.style.width = `${stPct}%`;
      if (stPanelEl) {
        stPanelEl.className = 'stat-panel' + (stats.exhausted ? ' danger' : stPct < 25 ? ' warn' : '');
        if (stBarEl) stBarEl.className = 'stat-fill' + (stats.exhausted ? ' danger' : stPct < 25 ? ' warn' : '');
      }
    }
    // Фаза прилива
    const tidePhase = tideSystem.getCurrentPhase();
    const tidePhaseNames: Record<string, string> = {
      stability: 'Стабильность',
      warning: 'ПРЕДУПРЕЖДЕНИЕ',
      catastrophe: 'КАТАСТРОФА — ГРАВИТАЦИЯ ИНВЕРСИЯ',
      aftermath: 'Последствия',
    };
    if (tideValEl) tideValEl.textContent = tidePhaseNames[tidePhase] || tidePhase;
    if (tideValEl) {
      tideValEl.style.color = tidePhase === 'stability' ? '#7c93ff' : tidePhase === 'warning' ? '#ff9900' : '#ff3333';
    }
  }

  setInterval(updateHUD, 100);
  updateHUD();

  // Слушаем события подбора предмета для тоста
  eventBus.on('inventory:item-picked-up', (e: any) => {
    showPickupToast(e.itemId, e.count);
  });

  // Слушаем события прилива для HUD
  eventBus.on('tide:phase-changed', (e: any) => {
    showPickupToast(`Прилив: ${e.to}`, 0);
  });
  eventBus.on('tide:warning-start', (e: any) => {
    showPickupToast(`Внимание: гравитационный прилив через ${Math.floor(e.timeRemaining)}с`, 0);
  });
  eventBus.on('tide:catastrophe-start', (e: any) => {
    showPickupToast('КАТАСТРОФА: гравитация инвертирована! Найдите укрытие у Якоря!', 0);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap game:', err);
  const errDiv = document.createElement('pre');
  errDiv.style.cssText = 'position:fixed;top:50%;left:10%;right:10%;background:#7f1d1d;color:#fff;padding:16px;z-index:99999;white-space:pre-wrap;font-size:14px;border:2px solid red;';
  errDiv.textContent = 'BOOTSTRAP ERROR:\n' + (err?.stack || err?.message || String(err));
  document.body.appendChild(errDiv);
});
