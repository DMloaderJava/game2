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

import { Vec2 } from './core/vec2';

// ============================================================================
// Текстуры
// ============================================================================
const TEX = {
  playerIdle: 'src/assets/textures/player_idle.png',
  playerWalk: 'src/assets/textures/player_walk.png',
  playerJump: 'src/assets/textures/player_jump.png',
  blockDirt: 'src/assets/textures/block_dirt.png',
  blockStone: 'src/assets/textures/block_stone.png',
  blockFerrite: 'src/assets/textures/block_ferrite.png',
  blockResonit: 'src/assets/textures/block_resonit.png',
  itemStoneSlabs: 'src/assets/textures/item_stone_slabs.png',
  itemFerriteOre: 'src/assets/textures/item_ferrite_ore.png',
  itemResonit: 'src/assets/textures/item_resonit.png',
  itemBiovolume: 'src/assets/textures/item_biovolume.png',
  itemBiogel: 'src/assets/textures/item_biogel.png',
  itemAncientFragment: 'src/assets/textures/item_ancient_fragment.png',
  bgSpace: 'src/assets/textures/bg_space.png',
  uiSlot: 'src/assets/textures/ui_slot.png',
} as const;

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
    texture: TEX.playerIdle, tint: 0xffffff, alpha: 1, visible: true, layer: 10,
  });
  // Анимированный спрайт персонажа
  const playerSprite = render.addSprite(player, TEX.playerIdle, 10, false, 1, 0.1);
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
  // 4. Уровень: земя и блоки (только спрайты с текстурами)
  // ============================================================================
  const GROUND_Y = 500;
  const GROUND_HEIGHT = 64;

  const groundEntity = world.createEntity();
  world.addComponent(groundEntity, Transform as unknown as symbol, {
    x: window.innerWidth / 2, y: GROUND_Y + GROUND_HEIGHT / 2,
    rotation: 0, scaleX: 1, scaleY: 1,
  });
  world.addComponent(groundEntity, PhysicsBody as unknown as symbol, {
    body: physics.createRectangleBody(groundEntity, window.innerWidth / 2, GROUND_Y + GROUND_HEIGHT / 2, window.innerWidth, GROUND_HEIGHT, {
      isStatic: true, label: 'ground',
    }),
    gravityScale: 0, isSleeping: true,
  });
  world.addComponent(groundEntity, Renderable as unknown as symbol, {
    texture: TEX.blockDirt, tint: 0xffffff, alpha: 1, visible: true, layer: 5,
  });
  const groundSprite = render.addSprite(groundEntity, TEX.blockDirt, 5);
  if (groundSprite) {
    groundSprite.width = window.innerWidth;
    groundSprite.height = GROUND_HEIGHT;
  }
  world.addComponent(groundEntity, Material as unknown as symbol, {
    mass: 0, density: 2000, strength: 10000, durability: 1,
    sailArea: 0, airResistance: 1, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
  });

  // Каменные блоки
  const blocks = [
    { x: 300, y: GROUND_Y - 64, w: 64, h: 64, type: 'stone' as TileType, tex: TEX.blockStone },
    { x: 420, y: GROUND_Y - 128, w: 64, h: 64, type: 'ferrite_ore' as TileType, tex: TEX.blockFerrite },
    { x: 560, y: GROUND_Y - 64, w: 64, h: 64, type: 'stone' as TileType, tex: TEX.blockStone },
    { x: 700, y: GROUND_Y - 192, w: 64, h: 64, type: 'resonit_ore' as TileType, tex: TEX.blockResonit },
    { x: 840, y: GROUND_Y - 64, w: 64, h: 64, type: 'stone' as TileType, tex: TEX.blockStone },
  ];

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

  world.addSystem(new InputSystem(input, eventBus));           // 10
  world.addSystem(new CharacterSystem(eventBus));              // 12
  world.addSystem(staminaEnergySystem);                        // 18
  world.addSystem(new GravitySystem(physics, eventBus));       // 25
  world.addSystem(miningSystem);                               // 28 (добыча перед физикой)
  world.addSystem(new PhysicsSystem(physics, eventBus));       // 30
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
  input.bindAction('interact', 'e');

  // Инвентарь по клавише I
  window.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I') {
      const inv = world.getComponent(player, Inventory as unknown as symbol) as { open: boolean };
      if (inv) {
        inv.open = !inv.open;
        world.addComponent(player, Inventory as unknown as symbol, inv);
      }
    }
  });

  // HUD обновление
  const hpEl = document.getElementById('hp');
  const enEl = document.getElementById('en');
  const stEl = document.getElementById('st');
  const tideEl = document.getElementById('tide');

  function updateHUD(): void {
    const stats = world.getComponent(player, CharacterStats as unknown as symbol) as {
      health: number; maxHealth: number;
      stamina: number; maxStamina: number;
      energy: number; maxEnergy: number;
    } | undefined;
    if (stats) {
      if (hpEl) hpEl.textContent = Math.floor(stats.health).toString();
      if (enEl) enEl.textContent = Math.floor(stats.energy).toString();
      if (stEl) stEl.textContent = Math.floor(stats.stamina).toString();
    }
    if (tideEl) tideEl.textContent = 'Стабильность';
  }

  setInterval(updateHUD, 100);
  updateHUD();
}

bootstrap().catch((err) => {
  console.error('Failed to bootstrap game:', err);
});
