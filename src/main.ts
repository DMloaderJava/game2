/**
 * GRAVITY: VOID — MVP версия.
 * Рефакторенный билд: логика вынесена в системы, main.ts содержит только
 * инициализацию мира, спавн сущностей и игровой цикл.
 */
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
import { TileType } from './components/world';
import { MiningTool, Tools, Mineable } from './components/mining';
import { GravityAnchor } from './components/construction';
import { EnergyDome } from './components/event-state';
import { TideConfig, TideState } from './components/event-state';

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
import { QuestSystem } from './systems/quest-system';

import { Vec2 } from './core/vec2';

// ============================================================================
// Глобальные перехватчики ошибок
// ============================================================================
function showError(msg: string): void {
  let el = document.getElementById('debug-err');
  if (!el) {
    el = document.createElement('pre');
    el.id = 'debug-err';
    el.style.cssText = 'position:fixed;top:40%;left:5%;right:5%;background:#7f1d1d;color:#fff;padding:12px;z-index:99999;white-space:pre-wrap;font-size:14px;border:2px solid red;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  console.error(msg);
}

window.addEventListener('error', (e) => {
  showError('RUNTIME ERROR: ' + (e.error?.stack || e.message));
});

window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason?.stack || e.reason?.message || String(e.reason);
  showError('UNHANDLED REJECTION: ' + msg);
});

// ============================================================================
// Текстуры (все кадры анимации предзагружаются через createProceduralTexture)
// ============================================================================
const TEX = {
  playerIdle0: '/textures/player_idle_0.png',
  playerIdle1: '/textures/player_idle_1.png',
  playerRun0: '/textures/player_run_0.png',
  playerRun1: '/textures/player_run_1.png',
  playerRun2: '/textures/player_run_2.png',
  playerJump: '/textures/player_jump.png',
  playerMine: '/textures/player_mine.png',
  blockDirt: '/textures/block_dirt.png',
  blockStone: '/textures/block_stone.png',
  blockFerrite: '/textures/block_ferrite.png',
  blockResonit: '/textures/block_resonit.png',
  blockStoneWall: '/textures/block_stone_wall.png',
  itemStoneSlabs: '/textures/item_stone_slabs.png',
  itemFerriteOre: '/textures/item_ferrite_ore.png',
  itemResonit: '/textures/item_resonit.png',
  itemBiovolume: '/textures/item_biovolume.png',
  itemBiogel: '/textures/item_biogel.png',
  itemAncientFragment: '/textures/item_ancient_fragment.png',
  gravityAnchor: '/textures/gravity_anchor.png',
  gravityZone: '/textures/gravity_zone.png',
  energyDome: '/textures/energy_dome.png',
  creature_scavenger: '/textures/creature_scavenger.png',
  creature_predator: '/textures/creature_predator.png',
  bgSpace: '/textures/bg_space.png',
  uiSlot: '/textures/ui_slot.png',
} as const;

const PLAYER_IDLE_FRAMES = [TEX.playerIdle0, TEX.playerIdle1];
const PLAYER_RUN_FRAMES = [TEX.playerRun0, TEX.playerRun1, TEX.playerRun2];

// Быстрый цикл прилива для превью
TideConfig.stabilityDuration = { min: 20, max: 25 };
TideConfig.warningDuration = { min: 6, max: 6 };
TideConfig.catastropheDuration = { min: 15, max: 15 };
TideConfig.aftermathDuration = { min: 5, max: 5 };

// ============================================================================
// 1. Сервисы
// ============================================================================
const physics = new PhysicsService();
const render = new RenderService();
const input = new InputService();
const eventBus = new EventBus();

async function bootstrap(): Promise<void> {
  console.log('GRAVITY: VOID — bootstrap started');

  physics.init({
    width: window.innerWidth,
    height: window.innerHeight,
    gravityX: 0,
    gravityY: 0, // гравитация применяется только через GravitySystem
  });

  await render.init({
    width: window.innerWidth,
    height: window.innerHeight,
    background: 0x111827,
  });

  // Предзагружаем все процедурные текстуры
  await render.loadTextures(Object.values(TEX));
  console.log('Textures loaded:', render.getTexture(TEX.playerIdle0) ? 'OK' : 'MISSING');

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
  world.registerComponent(GravityAnchor as unknown as symbol);

  // ============================================================================
  // 3. Игрок — спавн прямо на поверхности земли
  // ============================================================================
  const PLAYER_RADIUS = 28;
  const PLAYER_SPEED = 220;
  const PLAYER_JUMP = -750;

  const GROUND_Y = 500;
  const GROUND_HEIGHT = 64;
  const GROUND_SURFACE_Y = GROUND_Y + GROUND_HEIGHT / 2 - (GROUND_HEIGHT * 4) / 2; // ~400

  // Отрисовка поверхности планеты
  render.drawPlanetSurface(GROUND_SURFACE_Y, 3000);

  const player = world.createEntity();
  // Спавним игрока прямо над поверхностью земли
  const spawnX = 500;
  const spawnY = GROUND_SURFACE_Y - 28;

  world.addComponent(player, Transform as unknown as symbol, {
    x: spawnX, y: spawnY, rotation: 0, scaleX: 1, scaleY: 1,
  });

  const playerBody = physics.createCircleBody(player, spawnX, spawnY, PLAYER_RADIUS, {
    restitution: 0.1, friction: 0.5, density: 1, label: 'player',
    inertia: Infinity,
  });
  Matter.Body.setAngle(playerBody, 0);

  world.addComponent(player, PhysicsBody as unknown as symbol, {
    body: playerBody,
    gravityScale: 1.0, isSleeping: false,
  });

  world.addComponent(player, Renderable as unknown as symbol, {
    texture: TEX.playerIdle0, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
  });

  const playerSprite = render.addSprite(player, TEX.playerIdle0, 10, 48, 56, true, 2, 0.15);
  if (!playerSprite) {
    showError('ERROR: playerSprite is null — render.addSprite failed');
  }

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
  world.addComponent(player, Inventory as unknown as symbol, {
    slots: Array(20).fill(null), maxSlots: 20, maxWeight: 200,
    currentWeight: 0, open: false,
  });
  world.addComponent(player, MiningTool as unknown as symbol, Tools.stone_pickaxe());

  // ============================================================================
  // 4. Уровень: стены, земля, якорь, блоки, существа
  // ============================================================================
  const LEVEL_WIDTH = 3000;
  const WALL_THICKNESS = 80;

  // Левая стена
  const leftWall = world.createEntity();
  world.addComponent(leftWall, Transform as unknown as symbol, {
    x: -WALL_THICKNESS / 2, y: GROUND_Y + GROUND_HEIGHT / 2, rotation: 0, scaleX: 1, scaleY: 1,
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
  render.addSprite(leftWall, TEX.blockStoneWall, 5, WALL_THICKNESS, GROUND_HEIGHT + 400);
  world.addComponent(leftWall, Material as unknown as symbol, {
    mass: 0, density: 5000, strength: 50000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 2.0,
  });

  // Правая стена
  const rightWall = world.createEntity();
  world.addComponent(rightWall, Transform as unknown as symbol, {
    x: LEVEL_WIDTH + WALL_THICKNESS / 2, y: GROUND_Y + GROUND_HEIGHT / 2, rotation: 0, scaleX: 1, scaleY: 1,
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
  render.addSprite(rightWall, TEX.blockStoneWall, 5, WALL_THICKNESS, GROUND_HEIGHT + 400);
  world.addComponent(rightWall, Material as unknown as symbol, {
    mass: 0, density: 5000, strength: 50000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 2.0,
  });

  // Земля — платформа 6000x256, верхняя грань ровно на GROUND_SURFACE_Y
  const groundEntity = world.createEntity();
  world.addComponent(groundEntity, Transform as unknown as symbol, {
    x: 1500, y: GROUND_SURFACE_Y + 128, rotation: 0, scaleX: 1, scaleY: 1,
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

  // Гравитационный якорь — физическая защита от инверсии гравитации
  const anchorX = 620;
  const anchorY = GROUND_SURFACE_Y - 24;
  const anchorEntity = world.createEntity();
  world.addComponent(anchorEntity, Transform as unknown as symbol, {
    x: anchorX, y: anchorY, rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(anchorEntity, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(anchorEntity, anchorX, anchorY, 60, 60, {
      isStatic: true, label: 'gravity-anchor-spawn',
    }),
    gravityScale: 0, isSleeping: true,
  });
  world.addComponent(anchorEntity, Renderable as unknown as symbol, {
    texture: TEX.gravityAnchor, tint: 0x4cc9f0, alpha: 1, visible: true, layer: 10,
  });
  render.addSprite(anchorEntity, TEX.gravityAnchor, 10, 60, 60);
  render.drawAnchorDome(anchorX, anchorY, 250);
  world.addComponent(anchorEntity, GravityAnchor as unknown as symbol, {
    active: true, radius: 250, energyPerSecond: 0, anchoredEntities: [player],
  });
  world.addComponent(anchorEntity, Material as unknown as symbol, {
    mass: 0, density: 5000, strength: 50000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 2.0,
  });

  // Предзагрузка текстур блоков
  await render.loadTexture(TEX.blockFerrite);
  await render.loadTexture(TEX.blockResonit);
  await render.loadTexture(TEX.blockStone);

  // Парящие каменные острова (задерживают объекты при инверсии гравитации)
  const islandY = GROUND_SURFACE_Y - 210;
  const islands = [
    { x: 300, w: 144, h: 44 },
    { x: 660, w: 144, h: 44 },
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

  // Стартовые блоки ресурсов вокруг игрока
  const startBlocks: Array<{ x: number; type: TileType; tex: string }> = [
    { x: 280, type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite },
    { x: 328, type: 'resonit_ore' as TileType, tex: TEX.blockResonit },
    { x: 376, type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite },
    { x: 750, type: 'stone' as TileType, tex: TEX.blockStone },
    { x: 798, type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite },
    { x: 846, type: 'resonit_ore' as TileType, tex: TEX.blockResonit },
  ];
  startBlocks.forEach((sb, i) => {
    const entity = world.createEntity();
    const bx = sb.x + 24;
    const by = GROUND_SURFACE_Y - 24 + 24;
    world.addComponent(entity, Transform as unknown as symbol, {
      x: bx, y: by, rotation: 0, scaleX: 1, scaleY: 1,
    });
    world.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: physics.createRectangleBody(entity, bx, by, 48, 48, {
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
      tileType: sb.type, hardness: 1, health: drop.health, maxHealth: drop.health,
      resourceDrop: drop.drop, dropAmount: drop.amount,
      defaultEffectiveness: { dirt: 1.0, stone: 1.0, ferrite_ore: 1.0, resonit_ore: 1.0 },
    });
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
  gravitySystem.setGlobalGravity(new Vec2(0, 9.81 * 60), 1, true);
  const tideSystem = new GravityTideSystem(eventBus, physics, gravitySystem, render);
  tideSystem.setNextGravityVector(0, -9.81 * 60); // инверсия гравитации вверх
  const questSystem = new QuestSystem(eventBus);
  questSystem.setPlayerEntity(player);

  world.addSystem(new InputSystem(input, eventBus));           // 10
  world.addSystem(new CharacterSystem(eventBus));              // 12
  world.addSystem(staminaEnergySystem);                        // 18
  world.addSystem(gravitySystem);                              // 25
  world.addSystem(miningSystem);                               // 28
  world.addSystem(new PhysicsSystem(physics, eventBus));       // 30
  world.addSystem(playerAnimationSystem);                      // 35
  world.addSystem(craftingSystem);                             // 45
  world.addSystem(buildingSystem);                             // 55
  world.addSystem(inventorySystem);                            // 50
  world.addSystem(tideSystem);                                 // 70
  world.addSystem(questSystem);                                // 60
  const renderSystem = new RenderSystem(render, physics);      // 40
  world.addSystem(renderSystem);

  // ============================================================================
  // 6. Камера и игровой цикл
  // ============================================================================
  const loop = new GameLoop(
    world,
    DEFAULT_GAME_CONFIG.fixedTimeStep,
    DEFAULT_GAME_CONFIG.maxSubSteps,
    (alpha) => {
      const playerBodyLoop = physics.getBody(player);
      if (!playerBodyLoop) return;

      // Жёсткая синхронизация камеры с игроком
      render.follow(playerBodyLoop.position.x, playerBodyLoop.position.y, 0.12);
      Matter.Body.setAngle(playerBodyLoop, 0);
      Matter.Body.setAngularVelocity(playerBodyLoop, 0);

      const camPos = render.getCameraPosition();
      buildingSystem.setCameraPosition(camPos.x, camPos.y);

      // Killzone: респавн при вылете за границы
      const playerTransform = world.getComponent(player, Transform as unknown as symbol) as { x: number; y: number; rotation?: number } | undefined;
      if (playerTransform && (playerTransform.y > 2000 || playerTransform.y < -1500)) {
        const respawnX = 500;
        const respawnY = GROUND_SURFACE_Y - 28;
        playerTransform.x = respawnX;
        playerTransform.y = respawnY;
        playerTransform.rotation = 0;
        Matter.Body.setPosition(playerBodyLoop, { x: respawnX, y: respawnY });
        Matter.Body.setVelocity(playerBodyLoop, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(playerBodyLoop, 0);
        showError('Респавн: выход за границы карты');
        setTimeout(() => showError(''), 3000);
      }

      renderSystem.draw(world, alpha);
      render.render();
    },
  );

  loop.start();

  // ============================================================================
  // 7. HUD и события
  // ============================================================================
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
  const questValEl = document.getElementById('quest-text');

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
  const hudStats = document.getElementById('hud-stats');
  if (hudStats) {
    hudStats.appendChild(domePanel);
    hudStats.appendChild(resPanel);
  }
  const domeValEl = document.getElementById('dome-val');
  const domeBarEl = document.getElementById('dome-bar');
  const resValEl = document.getElementById('res-val');

  let resStone = 0;
  let resFerrite = 0;
  let resResonit = 0;

  function updateHUD(): void {
    const stats = world.getComponent(player, CharacterStats as unknown as symbol) as {
      health: number; maxHealth: number;
      stamina: number; maxStamina: number;
      energy: number; maxEnergy: number;
      exhausted: boolean;
    } | undefined;
    if (stats) {
      const hpPct = Math.floor((stats.health / stats.maxHealth) * 100);
      if (hpValEl) hpValEl.textContent = Math.floor(stats.health).toString();
      if (hpBarEl) hpBarEl.style.width = `${hpPct}%`;
      const enPct = Math.floor((stats.energy / stats.maxEnergy) * 100);
      if (enValEl) enValEl.textContent = Math.floor(stats.energy).toString();
      if (enBarEl) enBarEl.style.width = `${enPct}%`;
      const stPct = Math.floor((stats.stamina / stats.maxStamina) * 100);
      if (stValEl) stValEl.textContent = Math.floor(stats.stamina).toString();
      if (stBarEl) stBarEl.style.width = `${stPct}%`;
    }

    const tidePhase = tideSystem.getCurrentPhase();
    const tidePhaseNames: Record<string, string> = {
      stability: 'Стабильность', warning: 'ПРЕДУПРЕЖДЕНИЕ',
      catastrophe: 'КАТАСТРОФА — ГРАВИТАЦИЯ ИНВЕРСИЯ', aftermath: 'Последствия',
    };
    const tideEntities = world.query(TideState as unknown as symbol);
    let timeRemainingSec = 0;
    if (tideEntities.length > 0) {
      const tideData = tideEntities[0].components[0] as { phaseTimer: number; phaseDuration: number };
      timeRemainingSec = Math.ceil(tideData.phaseDuration - tideData.phaseTimer);
    }
    if (tideValEl) {
      tideValEl.textContent = `${tidePhaseNames[tidePhase] || tidePhase} (${timeRemainingSec}с)`;
      tideValEl.style.color = tidePhase === 'stability' ? '#7c93ff' : tidePhase === 'warning' ? '#ff9900' : '#ff3333';
    }

    if (questValEl) questValEl.textContent = questSystem.getStageText();

    const playerTransformHud = world.getComponent(player, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    let inDome = false;
    if (playerTransformHud) {
      const anchors = world.query(GravityAnchor as unknown as symbol, Transform as unknown as symbol);
      for (const { components } of anchors) {
        const anchorData = components[0] as { active: boolean; radius: number };
        const anchorTransform = components[1] as { x: number; y: number };
        if (anchorData.active && anchorTransform) {
          const dx = playerTransformHud.x - anchorTransform.x;
          const dy = playerTransformHud.y - anchorTransform.y;
          if (Math.hypot(dx, dy) <= anchorData.radius) { inDome = true; break; }
        }
      }
    }
    if (domeValEl) {
      domeValEl.textContent = inDome ? 'ЗАЩИТА АКТИВНА' : 'ВНЕ КУПОЛА: УГРОЗА ПРИЛИВА';
      domeValEl.style.color = inDome ? '#38bdf8' : '#f97316';
    }

    if (resValEl) {
      resValEl.textContent = `Камень: ${resStone} | Феррит: ${resFerrite} | Резонит: ${resResonit}`;
    }
  }

  setInterval(updateHUD, 100);
  updateHUD();

  // События подбора
  eventBus.on('inventory:item-picked-up', (e: any) => {
    const id = e.itemId;
    const cnt = e.count ?? 1;
    if (id === 'stone_slabs') resStone += cnt;
    else if (id === 'ferrite_ore') resFerrite += cnt;
    else if (id === 'resonit') resResonit += cnt;
    questSystem.onBlockMined(id);
  });

  eventBus.on('tide:catastrophe-start', () => {
    showError('КАТАСТРОФА: гравитация инвертирована! Найдите укрытие у Якоря!');
    setTimeout(() => showError(''), 5000);
  });

  eventBus.on('quest:stage-changed', (e: any) => {
    showError('Квест: ' + questSystem.getStageText());
    setTimeout(() => showError(''), 3000);
  });

  // Кнопки действий снизу
  const btnMine = document.getElementById('btn-mine');
  const btnInv = document.getElementById('btn-inv');
  const btnCraft = document.getElementById('btn-craft');

  if (btnMine) btnMine.addEventListener('click', () => {
    (window as any).__miningActive = true;
    setTimeout(() => { (window as any).__miningActive = false; }, 300);
  });
  if (btnInv) btnInv.addEventListener('click', () => {
    const inv = world.getComponent(player, Inventory as unknown as symbol) as { open: boolean };
    if (inv) { inv.open = !inv.open; world.addComponent(player, Inventory as unknown as symbol, inv); }
  });
  if (btnCraft) btnCraft.addEventListener('click', () => craftingSystem.toggle());

  // Клик мышкой по блоку руды
  const canvasEl = document.querySelector('canvas');
  if (canvasEl) {
    canvasEl.addEventListener('mousedown', (e) => {
      const rect = canvasEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const camPos = render.getCameraPosition();
      const worldX = camPos.x * -1 + mx + window.innerWidth / 2;
      const worldY = camPos.y * -1 + my + window.innerHeight / 2;
      const pt = world.getComponent(player, Transform as unknown as symbol) as { x: number; y: number } | undefined;
      if (!pt) return;
      const distToPlayer = Math.hypot(worldX - pt.x, worldY - pt.y);
      if (distToPlayer > 180) return;
      const miningBodies = world.query(PhysicsBody, Transform, Material, Mineable);
      for (const { entity, components } of miningBodies) {
        const bodyData = components[0] as { body: { x: number; y: number; isStatic: boolean } };
        const transformData = components[1] as { x: number; y: number };
        const mineable = components[3] as { tileType: string; health: number } | undefined;
        if (!mineable || mineable.health <= 0) continue;
        const dx = transformData.x - worldX;
        const dy = transformData.y - worldY;
        if (Math.hypot(dx, dy) <= 40) {
          mineable.health -= 20;
          world.addComponent(entity, Mineable as unknown as symbol, mineable);
          (window as any).__miningActive = true;
          setTimeout(() => { (window as any).__miningActive = false; }, 300);
          if (mineable.health <= 0) {
            const dropForType: Record<string, { drop: string; amount: number }> = {
              stone: { drop: 'stone_slabs', amount: 1 },
              ferrite_ore: { drop: 'ferrite_ore', amount: 1 },
              resonit_ore: { drop: 'resonit', amount: 1 },
            };
            const drop = dropForType[mineable.tileType] ?? dropForType.stone;
            if (drop.drop === 'ferrite_ore') resFerrite += drop.amount;
            else if (drop.drop === 'resonit') resResonit += drop.amount;
            else resStone += drop.amount;
            questSystem.onBlockMined(mineable.tileType);
            physics.removeBody(entity);
            world.removeComponent(entity, PhysicsBody as unknown as symbol);
            world.removeComponent(entity, Renderable as unknown as symbol);
            render.removeSprite(entity);
          }
          break;
        }
      }
    });
  }
}

bootstrap().catch((err) => {
  showError('BOOTSTRAP ERROR:\n' + (err?.stack || err?.message || String(err)));
  console.error('Failed to bootstrap game:', err);
});
