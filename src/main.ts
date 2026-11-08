/**
 * GRAVITY: VOID — MVP версия.
 * Исправленный билд: PixiJS v8 app.init(), текстуры вместо примитивов,
 * рабочая камера, добыча ресурсов по клавише E, инвентарь.
 */
import * as PIXI from 'pixi.js';
import * as Matter from 'matter-js';
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
import { TideConfig, TideState } from './components/event-state';

import { Vec2 } from './core/vec2';

// ============================================================================
// Текстуры (все кадры анимации предзагружаются)
// ============================================================================
const TEX = {
  // Игрок — кадры анимации (Idle, 2 кадра)
  playerIdle0: '/textures/player_idle_0.png',
  playerIdle1: '/textures/player_idle_1.png',
  // Игрок — кадры анимации (Run, 3 кадра)
  playerRun0: '/textures/player_run_0.png',
  playerRun1: '/textures/player_run_1.png',
  playerRun2: '/textures/player_run_2.png',
  // Игрок — прыжок и добыча
  playerJump: '/textures/player_jump.png',
  playerMine: '/textures/player_mine.png',
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
  // Существа (по 2 кадра движения)
  creature_scavenger: '/textures/creature_scavenger.png',
  creature_scavenger_1: '/textures/creature_scavenger.png',
  creature_predator: '/textures/creature_predator.png',
  creature_predator_1: '/textures/creature_predator.png',
  // UI
  bgSpace: '/textures/bg_space.png',
  uiSlot: '/textures/ui_slot.png',
} as const;

// Массивы кадров анимации для PlayerAnimationSystem
const PLAYER_IDLE_FRAMES = [
  TEX.playerIdle0,
  TEX.playerIdle1,
];

const PLAYER_RUN_FRAMES = [
  TEX.playerRun0,
  TEX.playerRun1,
  TEX.playerRun2,
];

// ============================================================================
// Конфигурация Гравитационного Прилива (быстрый цикл для превью)
// ============================================================================
TideConfig.stabilityDuration = { min: 20, max: 25 };
TideConfig.warningDuration = { min: 6, max: 6 };
TideConfig.catastropheDuration = { min: 15, max: 15 };
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

  // Поверхность земли должна быть объявлена до использования при спавне игрока
  const GROUND_Y = 500;
  const GROUND_HEIGHT = 64;
  const GROUND_SURFACE_Y = GROUND_Y + GROUND_HEIGHT / 2 - (GROUND_HEIGHT * 4) / 2; // ~400

  // Железобетонная отрисовка земли через PIXI.Graphics (видимая под ногами)
  render.drawPlanetSurface(GROUND_SURFACE_Y, 3000);

  const player = world.createEntity();
  world.addComponent(player, Transform as unknown as symbol, {
    x: 500, y: GROUND_SURFACE_Y - 28, rotation: 0, scaleX: 1, scaleY: 1,
  });
  const playerBody = physics.createCircleBody(player, 500, GROUND_SURFACE_Y - 28, PLAYER_RADIUS, {
    restitution: 0.1, friction: 0.5, density: 1, label: 'player',
    inertia: Infinity, // космонавт не кувыркается при столкновениях и смене гравитации
  });
  Matter.Body.setAngle(playerBody, 0);
  world.addComponent(player, PhysicsBody as unknown as symbol, {
    body: playerBody,
    gravityScale: 1.0, isSleeping: false,
  });
  world.addComponent(player, Renderable as unknown as symbol, {
    texture: TEX.playerIdle0, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
  });
  // Анимированный спрайт персонажа (Idle кадры) — размер 48x56
  const playerSprite = render.addSprite(player, TEX.playerIdle0, 10, 48, 56, true, 2, 0.15);
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

  // Земля — сплошная платформа на всю ширину уровня, выровнена по GROUND_SURFACE_Y
  const groundEntity = world.createEntity();
  world.addComponent(groundEntity, Transform as unknown as symbol, {
    x: 1500, y: GROUND_SURFACE_Y + 128,
    rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(groundEntity, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(groundEntity, 1500, GROUND_SURFACE_Y + 128, 6000, 256, {
      isStatic: true, label: 'ground',
    }),
    gravityScale: 0, isSleeping: true,
  });
  world.addComponent(groundEntity, Material as unknown as symbol, {
    mass: 0, density: 2000, strength: 10000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
  });

  // ============================================================================
  // Гравитационный якорь на точке спавна (защита от бесконечной смерти в катастрофе)
  // ============================================================================
  const anchorEntity = world.createEntity();
  world.addComponent(anchorEntity, Transform as unknown as symbol, {
    x: 620, y: GROUND_SURFACE_Y - 24, rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(anchorEntity, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(anchorEntity, 620, GROUND_SURFACE_Y - 24, 60, 60, {
      isStatic: true, label: 'gravity-anchor-spawn',
    }),
    gravityScale: 0, isSleeping: true,
  });
  world.addComponent(anchorEntity, Renderable as unknown as symbol, {
    texture: TEX.gravityAnchor, tint: 0x4cc9f0, alpha: 1, visible: true, layer: 10,
  });
  render.addSprite(anchorEntity, TEX.gravityAnchor, 10, 60, 60);
  // Визуальный купол защиты вокруг якоря
  render.drawAnchorDome(620, GROUND_SURFACE_Y - 24, 250);
  world.addComponent(anchorEntity, GravityAnchor as unknown as symbol, {
    active: true,
    radius: 250,
    energyPerSecond: 0,
    anchoredEntities: [player],
  });
  world.addComponent(anchorEntity, Material as unknown as symbol, {
    mass: 0, density: 5000, strength: 50000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 2.0,
  });

  // ============================================================================
  // Предзагрузка текстур руды и блоков
  // ============================================================================
  await render.loadTexture(TEX.blockFerrite);
  await render.loadTexture(TEX.blockResonit);
  await render.loadTexture(TEX.blockStone);

  // ============================================================================
  // Парящие каменные острова над головой игрока (задерживают объекты при инверсии гравитации)
  // ============================================================================
  const islandY = GROUND_SURFACE_Y - 210;
  const islands = [
    { x: 300, w: 144, h: 44 }, // первый остров x=300..444
    { x: 660, w: 144, h: 44 }, // второй остров x=660..804
  ];
  islands.forEach((isl, i) => {
    const islandEntity = world.createEntity();
    world.addComponent(islandEntity, Transform as unknown as symbol, {
      x: isl.x + isl.w / 2, y: islandY, rotation: 0, scaleX: 1, scaleY: 1,
    });
    world.addComponent(islandEntity, PhysicsBody as unknown as symbol, {
      body: physics.createRectangleBody(islandEntity, isl.x + isl.w / 2, islandY, isl.w, isl.h, {
        isStatic: true, restitution: 0.3, friction: 0.6, label: `island-${i}`,
      }),
      gravityScale: 0, isSleeping: true,
    });
    world.addComponent(islandEntity, Renderable as unknown as symbol, {
      texture: TEX.blockStone, tint: 0xffffff, alpha: 1, visible: true, layer: 5,
    });
    render.addSprite(islandEntity, TEX.blockStone, 5, isl.w, isl.h);
    world.addComponent(islandEntity, Material as unknown as symbol, {
      mass: 0, density: 2000, strength: 10000, durability: 1,
      sailArea: 0, airResistance: 1, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
    });
  });

  // ============================================================================
  // Стартовые блоки ресурсов вокруг игрока (x 200..950)
  // ============================================================================
  const startBlocks: Array<{ x: number; type: TileType; tex: string }> = [
    // Слева от игрока — месторождение феррита и резонита
    { x: 280, type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite },
    { x: 328, type: 'resonit_ore' as TileType, tex: TEX.blockResonit },
    { x: 376, type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite },
    // Справа за куполом — второе месторождение
    { x: 750, type: 'stone' as TileType, tex: TEX.blockStone },
    { x: 798, type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite },
    { x: 846, type: 'resonit_ore' as TileType, tex: TEX.blockResonit },
  ];
  startBlocks.forEach((sb, i) => {
    const entity = world.createEntity();
    world.addComponent(entity, Transform as unknown as symbol, {
      x: sb.x + 24, y: GROUND_SURFACE_Y - 24 + 24, rotation: 0, scaleX: 1, scaleY: 1,
    });
    world.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: physics.createRectangleBody(entity, sb.x + 24, GROUND_SURFACE_Y - 24 + 24, 48, 48, {
        restitution: 0.3, friction: 0.6, density: 2, label: `start-block-${i}`,
        inertia: Infinity,
      }),
      gravityScale: 1.0, isSleeping: false,
    });
    world.addComponent(entity, Renderable as unknown as symbol, {
      texture: sb.tex, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
    });
    render.addSprite(entity, sb.tex, 10, 48, 48);
    world.addComponent(entity, Material as unknown as symbol, {
      mass: 20, density: 2000, strength: 8000, durability: 1,
      sailArea: 0.05, airResistance: 0.3, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
    });
    const dropForType: Record<string, { drop: string; amount: number; health: number }> = {
      stone: { drop: 'stone_slabs', amount: 1, health: 30 },
      ferrite_ore: { drop: 'ferrite_ore', amount: 1, health: 45 },
      resonit_ore: { drop: 'resonit', amount: 1, health: 60 },
    };
    const drop = dropForType[sb.type] ?? dropForType.stone;
    world.addComponent(entity, Mineable as unknown as symbol, {
      tileType: sb.type,
      hardness: 1,
      health: drop.health,
      maxHealth: drop.health,
      resourceDrop: drop.drop,
      dropAmount: drop.amount,
      defaultEffectiveness: { dirt: 1.0, stone: 1.0, ferrite_ore: 1.0, resonit_ore: 1.0 },
    });
  });

  // ============================================================================
  // Существа в стартовом кадре (patрулируют поверхность)
  // ============================================================================
  // Сборщик слева от игрока
  const scavengerEntity = world.createEntity();
  world.addComponent(scavengerEntity, Transform as unknown as symbol, {
    x: 430, y: GROUND_SURFACE_Y - 24, rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(scavengerEntity, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(scavengerEntity, 430, GROUND_SURFACE_Y - 24, 36, 32, {
      restitution: 0.1, friction: 0.5, density: 1, label: 'scavenger-start',
      inertia: Infinity,
    }),
    gravityScale: 1.0, isSleeping: false,
  });
  world.addComponent(scavengerEntity, Renderable as unknown as symbol, {
    texture: TEX.creature_scavenger, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
  });
  render.addSprite(scavengerEntity, TEX.creature_scavenger, 10, 48, 40);
  world.addComponent(scavengerEntity, Material as unknown as symbol, {
    mass: 5, density: 1000, strength: 2000, durability: 1,
    sailArea: 0.1, airResistance: 0.4, state: 'solid', temperature: 20,
    burnable: false, flammable: false, thermalConductivity: 1.0,
  });

  // Хищник справа от купола
  const predatorEntity = world.createEntity();
  world.addComponent(predatorEntity, Transform as unknown as symbol, {
    x: 880, y: GROUND_SURFACE_Y - 24, rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(predatorEntity, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(predatorEntity, 880, GROUND_SURFACE_Y - 24, 44, 36, {
      restitution: 0.1, friction: 0.5, density: 1, label: 'predator-start',
      inertia: Infinity,
    }),
    gravityScale: 1.0, isSleeping: false,
  });
  world.addComponent(predatorEntity, Renderable as unknown as symbol, {
    texture: TEX.creature_predator, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
  });
  render.addSprite(predatorEntity, TEX.creature_predator, 10, 52, 44);
  world.addComponent(predatorEntity, Material as unknown as symbol, {
    mass: 12, density: 1500, strength: 3000, durability: 1,
    sailArea: 0.15, airResistance: 0.5, state: 'solid', temperature: 20,
    burnable: false, flammable: false, thermalConductivity: 1.0,
  });

  // ============================================================================
  // 5. Системы
  // ============================================================================
  const staminaEnergySystem = new StaminaEnergySystem(eventBus);
  const inventorySystem = new InventorySystem(eventBus, render);
  inventorySystem.setPlayerEntity(player);
  const miningSystem = new MiningSystem(physics, input, eventBus, inventorySystem, render);
  const playerAnimationSystem = new PlayerAnimationSystem(render);
  playerAnimationSystem.setPlayerEntity(player, PLAYER_IDLE_FRAMES, PLAYER_RUN_FRAMES, [TEX.playerJump]);
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
        // Жёсткая синхронизация Transform игрока с телом Matter.js
        const playerTransform = world.getComponent(player, Transform as unknown as symbol) as { x: number; y: number; rotation?: number } | undefined;
        if (playerTransform) {
          playerTransform.x = playerBody.position.x;
          playerTransform.y = playerBody.position.y;
        }
        // Запрет вращения космонавта — всегда стоит вертикально
        Matter.Body.setAngle(playerBody, 0);
        Matter.Body.setAngularVelocity(playerBody, 0);
        const camPos = render.getCameraPosition();
        buildingSystem.setCameraPosition(camPos.x, camPos.y);

        // Killzone: смерть при вылете за границы карты
        if (playerTransform) {
          if (playerTransform.y > 2000 || playerTransform.y < -1500) {
            // Смерть игрока — респавн над поверхностью земли
            const spawnX = 500;
            const spawnY = GROUND_SURFACE_Y - 60; // над поверхностью земли
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

        // ----- Анимация космонавта (IDLE / RUN / JUMP / MINE) -----
        const ctrl = world.getComponent(player, CharacterController as unknown as symbol) as {
          state: string; inputDirection: { x: number; y: number };
        } | undefined;
        const stats = world.getComponent(player, CharacterStats as unknown as symbol) as {
          exhausted: boolean;
        } | undefined;
        const isAirborne = ctrl?.state === 'Airborne' || ctrl?.state === 'ZeroG';
        const isMoving = (ctrl?.inputDirection.x ?? 0) !== 0;
        const isMining = (window as any).__miningActive === true;

        if (isMining) {
          playerSprite.texture = render.getTexture(TEX.playerMine) ?? playerSprite.texture;
        } else if (isAirborne) {
          playerSprite.texture = render.getTexture(TEX.playerJump) ?? playerSprite.texture;
        } else if (isMoving) {
          // Циклически переключаем кадры бега
          const runFrame = Math.floor(Date.now() / 120) % 3;
          const runTex = [TEX.playerRun0, TEX.playerRun1, TEX.playerRun2][runFrame];
          playerSprite.texture = render.getTexture(runTex) ?? playerSprite.texture;
          // Разворот спрайта по направлению движения
          const dirX = ctrl?.inputDirection.x ?? 0;
          const dir = dirX > 0 ? 1 : dirX < 0 ? -1 : 1;
          playerSprite.scale.x = Math.abs(playerSprite.scale.x) * dir;
        } else {
          // Циклически переключаем кадры простоя
          const idleFrame = Math.floor(Date.now() / 400) % 2;
          const idleTex = [TEX.playerIdle0, TEX.playerIdle1][idleFrame];
          playerSprite.texture = render.getTexture(idleTex) ?? playerSprite.texture;
          playerSprite.scale.x = Math.abs(playerSprite.scale.x); // сброс зеркаливания
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
  // E — копирование/добыча ( копание при зажатой E для анимации )
  window.addEventListener('keydown', (e) => {
    if (e.key === 'e' || e.key === 'E') {
      (window as any).__miningActive = true;
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'e' || e.key === 'E') {
      (window as any).__miningActive = false;
    }
  });

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

  // ----- Панель ресурсов и статуса купола (HUD) -----
  const hudStats = document.getElementById('hud-stats');
  const domePanel = document.createElement('div');
  domePanel.className = 'stat-panel';
  domePanel.id = 'dome-panel';
  domePanel.innerHTML = `
    <div class="stat-label"><span>Защита купола</span><span class="stat-value" id="dome-val">—</span></div>
    <div class="stat-bar"><div class="stat-fill" id="dome-bar" style="width:100%"></div></div>
  `;
  const resPanel = document.createElement('div');
  resPanel.className = 'stat-panel';
  resPanel.id = 'res-panel';
  resPanel.innerHTML = `
    <div class="stat-label"><span>Ресурсы</span><span class="stat-value" id="res-val">—</span></div>
  `;
  if (hudStats) {
    hudStats.appendChild(domePanel);
    hudStats.appendChild(resPanel);
  }
  const domeValEl = document.getElementById('dome-val');
  const domeBarEl = document.getElementById('dome-bar');
  const resValEl = document.getElementById('res-val');

  // Счётчики ресурсов
  let resStone = 0;
  let resFerrite = 0;
  let resResonit = 0;
  let selectedBuild = 'stone_wall'; // 1=стена, 2=якорь, 3=купол

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
    // Фаза прилива с таймером в секундах
    const tidePhase = tideSystem.getCurrentPhase();
    const tidePhaseNames: Record<string, string> = {
      stability: 'Стабильность',
      warning: 'ПРЕДУПРЕЖДЕНИЕ',
      catastrophe: 'КАТАСТРОФА — ГРАВИТАЦИЯ ИНВЕРСИЯ',
      aftermath: 'Последствия',
    };
    // Время до конца фазы
    const tideEntities = world.query(TideState as unknown as symbol);
    let timeRemainingSec = 0;
    if (tideEntities.length > 0) {
      const tideData = tideEntities[0].components[0] as {
        phaseTimer: number;
        phaseDuration: number;
      };
      timeRemainingSec = Math.ceil(tideData.phaseDuration - tideData.phaseTimer);
    }
    const tideLabel = tidePhaseNames[tidePhase] || tidePhase;
    if (tideValEl) tideValEl.textContent = `${tideLabel} (${timeRemainingSec}с)`;
    if (tideValEl) {
      tideValEl.style.color = tidePhase === 'stability' ? '#7c93ff' : tidePhase === 'warning' ? '#ff9900' : '#ff3333';
    }

    // ----- Статус купола защиты -----
    const playerBodyHud = physics.getBody(player);
    const playerTransformHud = world.getComponent(player, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    let inDome = false;
    if (playerBodyHud && playerTransformHud) {
      const anchorEntities = world.query(GravityAnchor as unknown as symbol, Transform as unknown as symbol);
      for (const { components } of anchorEntities) {
        const anchorData = components[0] as { active: boolean; radius: number };
        const anchorTransform = components[1] as { x: number; y: number };
        if (anchorData.active && anchorTransform) {
          const dx = playerTransformHud.x - anchorTransform.x;
          const dy = playerTransformHud.y - anchorTransform.y;
          if (Math.hypot(dx, dy) <= anchorData.radius) {
            inDome = true;
            break;
          }
        }
      }
    }
    if (domeValEl) {
      domeValEl.textContent = inDome ? 'ЗАЩИТА АКТИВНА' : 'ВНЕ КУПОЛА: УГРОЗА ПРИЛИВА';
      domeValEl.style.color = inDome ? '#38bdf8' : '#f97316';
    }
    if (domeBarEl) {
      domeBarEl.style.background = inDome ? 'linear-gradient(90deg, #38bdf8, #0ea5e9)' : 'linear-gradient(90deg, #f97316, #ea580c)';
    }

    // ----- Счётчик ресурсов -----
    if (resValEl) {
      resValEl.textContent = `Камень: ${resStone} | Феррит: ${resFerrite} | Резонит: ${resResonit} | Постройка [1-3]: ${selectedBuild === 'stone_wall' ? 'Стена' : selectedBuild === 'gravity_anchor' ? 'Якорь' : 'Купол'}`;
    }
  }

  setInterval(updateHUD, 100);
  updateHUD();

  // Слушаем события подбора предмета для тоста и счёта ресурсов
  eventBus.on('inventory:item-picked-up', (e: any) => {
    showPickupToast(e.itemId, e.count);
    const id = e.itemId;
    const cnt = e.count ?? 1;
    if (id === 'stone_slabs') resStone += cnt;
    else if (id === 'ferrite_ore') resFerrite += cnt;
    else if (id === 'resonit') resResonit += cnt;
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
