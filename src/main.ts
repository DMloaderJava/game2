/**
 * GRAVITY: VOID — MVP версия.
 * Исправленный билд: PixiJS v8 app.init(), текстуры вместо примитивов,
 * рабочая камера, добыча ресурсов по клавише E, инвентарь.
 */
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

import { InputSystem } from './systems/input-system';
import { CharacterSystem } from './systems/character-system';
import { StaminaEnergySystem } from './systems/stamina-energy-system';
import { PhysicsSystem } from './systems/physics-system';
import { GravitySystem } from './systems/gravity-system';
import { RenderSystem } from './systems/render-system';
import { InventorySystem } from './systems/inventory-system';
import { MiningSystem } from './systems/mining-system';
import { PlayerAnimationSystem } from './systems/player-animation-system';

import { Vec2 } from './core/vec2';

// ============================================================================
// Текстуры (все кадры анимации предзагружаются)
// ============================================================================
const TEX = {
  // Игрок — базовые (для совместимости)
  playerIdle: 'src/assets/textures/player_idle.png',
  playerWalk: 'src/assets/textures/player_walk.png',
  playerJump: 'src/assets/textures/player_jump.png',
  // Игрок — кадры анимации (Idle)
  playerIdle0: 'src/assets/textures/player_idle_0.png',
  playerIdle1: 'src/assets/textures/player_idle_1.png',
  playerIdle2: 'src/assets/textures/player_idle_2.png',
  playerIdle3: 'src/assets/textures/player_idle_3.png',
  // Игрок — кадры анимации (Walk)
  playerWalk0: 'src/assets/textures/player_walk_0.png',
  playerWalk1: 'src/assets/textures/player_walk_1.png',
  playerWalk2: 'src/assets/textures/player_walk_2.png',
  playerWalk3: 'src/assets/textures/player_walk_3.png',
  playerWalk4: 'src/assets/textures/player_walk_4.png',
  playerWalk5: 'src/assets/textures/player_walk_5.png',
  // Блоки мира
  blockDirt: 'src/assets/textures/block_dirt.png',
  blockStone: 'src/assets/textures/block_stone.png',
  blockFerrite: 'src/assets/textures/block_ferrite.png',
  blockResonit: 'src/assets/textures/block_resonit.png',
  blockStoneWall: 'src/assets/textures/block_stone_wall.png',
  // Предметы
  itemStoneSlabs: 'src/assets/textures/item_stone_slabs.png',
  itemFerriteOre: 'src/assets/textures/item_ferrite_ore.png',
  itemResonit: 'src/assets/textures/item_resonit.png',
  itemBiovolume: 'src/assets/textures/item_biovolume.png',
  itemBiogel: 'src/assets/textures/item_biogel.png',
  itemAncientFragment: 'src/assets/textures/item_ancient_fragment.png',
  // Устройства
  gravityAnchor: 'src/assets/textures/gravity_anchor.png',
  gravityZone: 'src/assets/textures/gravity_zone.png',
  // UI
  bgSpace: 'src/assets/textures/bg_space.png',
  uiSlot: 'src/assets/textures/ui_slot.png',
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
// 1. Движок и сервисы (асинхронная инициализация PixiJS v8)
// ============================================================================
const physics = new PhysicsService();
const render = new RenderService();
const input = new InputService();
const eventBus = new EventBus();

async function bootstrap(): Promise<void> {
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
    background: 0x05050a,
  });

  // Предзагружаем текстуры
  await render.loadTextures(Object.values(TEX));

  // Фон космоса
  await render.setBackgroundTexture(TEX.bgSpace);

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

  // ============================================================================
  // 3. Игрок
  // ============================================================================
  const PLAYER_RADIUS = 20;
  const PLAYER_SPEED = 220;
  const PLAYER_JUMP = -750;

  const player = world.createEntity();
  world.addComponent(player, Transform as unknown as symbol, {
    x: 200, y: 300, rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(player, PhysicsBody as unknown as symbol, {
    body: physics.createCircleBody(player, 200, 300, PLAYER_RADIUS, {
      restitution: 0.1, friction: 0.5, density: 1, label: 'player',
    }),
    gravityScale: 1.0, isSleeping: false,
  });
  world.addComponent(player, Renderable as unknown as symbol, {
    texture: TEX.playerIdle0, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
  });
  // Анимированный спрайт персонажа (Idle кадры)
  const playerSprite = render.addSprite(player, TEX.playerIdle0, 10, true, 4, 0.15);
  if (playerSprite) {
    playerSprite.anchor.set(0.5, 0.5);
    playerSprite.width = PLAYER_RADIUS * 2;
    playerSprite.height = PLAYER_RADIUS * 2;
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
  const leftWallSprite = render.addSprite(leftWall, TEX.blockStoneWall, 5);
  if (leftWallSprite) {
    leftWallSprite.width = WALL_THICKNESS;
    leftWallSprite.height = GROUND_HEIGHT + 400;
  }
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
  const rightWallSprite = render.addSprite(rightWall, TEX.blockStoneWall, 5);
  if (rightWallSprite) {
    rightWallSprite.width = WALL_THICKNESS;
    rightWallSprite.height = GROUND_HEIGHT + 400;
  }
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
    body: physics.createRectangleBody(groundEntity, LEVEL_WIDTH / 2, GROUND_Y + GROUND_HEIGHT / 2, LEVEL_WIDTH, GROUND_HEIGHT, {
      isStatic: true, label: 'ground',
    }),
    gravityScale: 0, isSleeping: true,
  });
  world.addComponent(groundEntity, Renderable as unknown as symbol, {
    texture: TEX.blockDirt, tint: 0xffffff, alpha: 1, visible: true, layer: 5,
  });
  const groundSprite = render.addSprite(groundEntity, TEX.blockDirt, 5);
  if (groundSprite) {
    groundSprite.width = LEVEL_WIDTH;
    groundSprite.height = GROUND_HEIGHT;
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

    const offsetY = (Math.random() - 0.5) * 60; // вариация высоты ±30px
    const y = GROUND_Y - 64 + offsetY;

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
    const sprite = render.addSprite(entity, b.tex, 10);
    if (sprite) {
      sprite.width = b.w;
      sprite.height = b.h;
    }
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
  // 5. Системы
  // ============================================================================
  const staminaEnergySystem = new StaminaEnergySystem(eventBus);
  const inventorySystem = new InventorySystem(eventBus, render);
  inventorySystem.setPlayerEntity(player);
  const miningSystem = new MiningSystem(physics, input, eventBus, inventorySystem, render);
  const playerAnimationSystem = new PlayerAnimationSystem(render);
  playerAnimationSystem.setPlayerEntity(player, PLAYER_IDLE_FRAMES, PLAYER_WALK_FRAMES, [TEX.playerJump]);

  world.addSystem(new InputSystem(input, eventBus));           // 10
  world.addSystem(new CharacterSystem(eventBus));              // 12
  world.addSystem(staminaEnergySystem);                        // 18
  world.addSystem(new GravitySystem(physics, eventBus));       // 25
  world.addSystem(miningSystem);                               // 28 (добыча перед физикой)
  world.addSystem(new PhysicsSystem(physics, eventBus));       // 30
  world.addSystem(playerAnimationSystem);                      // 35 (анимация игрока)
  world.addSystem(inventorySystem);                            // 50 (инвентарь)
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
  });

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
    if (tideValEl) tideValEl.textContent = 'Стабильность';
  }

  setInterval(updateHUD, 100);
  updateHUD();

  // Слушаем события подбора предмета для тоста
  eventBus.on('inventory:item-picked-up', (e: any) => {
    showPickupToast(e.itemId, e.count);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap game:', err);
});
