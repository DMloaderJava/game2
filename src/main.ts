/**
 * GRAVITY: VOID — MVP версия.
 * Игровой вход: инициализация движка, ECS-мир, системы, игрок, уровень, игровой цикл.
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

import { InputSystem } from './systems/input-system';
import { CharacterSystem } from './systems/character-system';
import { StaminaEnergySystem } from './systems/stamina-energy-system';
import { PhysicsSystem } from './systems/physics-system';
import { GravitySystem } from './systems/gravity-system';
import { RenderSystem } from './systems/render-system';

import { Vec2 } from './core/vec2';

// ============================================================================
// 1. Движок и сервисы
// ============================================================================
const physics = new PhysicsService();
physics.init({
  width: window.innerWidth,
  height: window.innerHeight,
  gravityX: 0,
  gravityY: 9.81 * 60,
});

const render = new RenderService();
render.init({
  width: window.innerWidth,
  height: window.innerHeight,
  background: 0x05050a,
});

const input = new InputService();
const eventBus = new EventBus();

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

// ============================================================================
// 3. Игрок
// ============================================================================
const PLAYER_RADIUS = 16;
const PLAYER_SPEED = 250;
const PLAYER_JUMP = -700;

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
  texture: '', tint: 0x4cc9f0, alpha: 1, visible: true, layer: 10,
});
render.addColorBlock(player, PLAYER_RADIUS * 2, PLAYER_RADIUS * 2, 0x4cc9f0, 10);
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

// ============================================================================
// 4. Уровень: земя и блоки
// ============================================================================
const GROUND_Y = 500;
const GROUND_HEIGHT = 100;

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
  texture: '', tint: 0x5d4037, alpha: 1, visible: true, layer: 5,
});
render.addColorBlock(groundEntity, window.innerWidth, GROUND_HEIGHT, 0x5d4037, 5);
world.addComponent(groundEntity, Material as unknown as symbol, {
  mass: 0, density: 2000, strength: 10000, durability: 1,
  sailArea: 0, airResistance: 1, state: 'solid',
  temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
});

const blocks = [
  { x: 300, y: GROUND_Y - 60, w: 60, h: 60 },
  { x: 420, y: GROUND_Y - 120, w: 60, h: 60 },
  { x: 560, y: GROUND_Y - 60, w: 60, h: 60 },
  { x: 700, y: GROUND_Y - 180, w: 60, h: 60 },
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
    texture: '', tint: 0x8d6e63, alpha: 1, visible: true, layer: 10,
  });
  render.addColorBlock(entity, b.w, b.h, 0x8d6e63, 10);
  world.addComponent(entity, Material as unknown as symbol, {
    mass: 20, density: 2000, strength: 8000, durability: 1,
    sailArea: 0.05, airResistance: 0.3, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
  });
});

// ============================================================================
// 5. Системы
// ============================================================================
const staminaEnergySystem = new StaminaEnergySystem(eventBus);

world.addSystem(new InputSystem(input, eventBus));           // 10
world.addSystem(new CharacterSystem(eventBus));              // 12
world.addSystem(staminaEnergySystem);                        // 18
world.addSystem(new GravitySystem(physics, eventBus));       // 25
world.addSystem(new PhysicsSystem(physics, eventBus));       // 30
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
    const playerBody = physics.getBody(player);
    if (playerBody) {
      render.follow(playerBody.position.x, playerBody.position.y, 0.15);
    }
    renderSystem.draw(world, alpha);
    render.render();
  },
);

loop.start();

console.log('GRAVITY: VOID MVP started. Entities:', world.entityCount);
console.log('Controls: WASD/Arrows = move, Space = jump');

window.addEventListener('resize', () => {
  physics.setGravity(physics.engine!.gravity.x, physics.engine!.gravity.y);
  render.resize();
});

window.addEventListener('keydown', (e) => input.onKeyDown(e.key));
window.addEventListener('keyup', (e) => input.onKeyUp(e.key));

input.bindAction('left', 'a');
input.bindAction('right', 'd');
input.bindAction('up', 'w');
input.bindAction('down', 's');
input.bindAction('jump', ' ');
