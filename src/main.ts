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
import { CharacterSystem } from './systems/character-system';
import { StaminaEnergySystem } from './systems/stamina-energy-system';
import { GrabThrowSystem } from './systems/grab-throw-system';
import { ConstructionSystem } from './systems/construction-system';
import { InventorySystem } from './systems/inventory-system';
import { CraftingSystem } from './systems/crafting-system';
import { EventSystem } from './systems/event-system';
import { RenderSystem } from './systems/render-system';
import { SaveSystem } from './systems/save-system';
import { DeathSystem } from './systems/death-system';
import { MiningSystem } from './systems/mining-system';
import { ChunkSystem } from './systems/chunk-system';
import { DeviceSystem } from './systems/device-system';
import { AbilitySystem } from './systems/ability-system';
import { ProgressionSystem } from './systems/progression-system';
import { ScanningSystem } from './systems/scanning-system';
import { GravityTideSystem } from './systems/gravity-tide-system';
import { WorldMutationSystem } from './systems/world-mutation-system';

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
import {
  CharacterController,
  CharacterStats,
  Dead,
  RespawnPoint,
} from './components/character';
import { Grabbing, Grabbed, Pushable } from './components/grab';
import { IntentMove } from './components/intent';
import { Chunk, Biome, WorldLayerComp } from './components/world';
import { MiningTool, Mineable, Deposit, Drill } from './components/mining';
import {
  ItemStack, Inventory, Equipment, UnlockedBlueprint, CraftingQueue, CraftingRecipe,
} from './components/inventory';
import {
  Structure, Buildable, SnapGrid, StructuralIntegrity, GravityAnchor, GhostPreview,
} from './components/construction';
import {
  Device, EnergyNode, EnergyCable, Conveyor, ItemRoute,
  PowerProducer, PowerConsumer, EnergyStorage,
} from './components/devices';
import {
  AbilityDefinition, AbilitySlot, ActiveEffect, AbilityCombo,
  SkillTreeNode, ProgressionData,
} from './components/ability';
import {
  Scanner, ScanKnowledge, BioSample, AncientFragmentKnowledge,
} from './components/scanning';
import {
  TideState,
  AnomalyZone,
  WorldMutation,
  MutationMarker,
  EnergyDome,
} from './components/event-state';
import { Vec2 } from './core/vec2';

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
world.registerComponent(CharacterController as unknown as symbol);
world.registerComponent(CharacterStats as unknown as symbol);
world.registerComponent(Dead as unknown as symbol);
world.registerComponent(RespawnPoint as unknown as symbol);
world.registerComponent(Grabbing as unknown as symbol);
world.registerComponent(Grabbed as unknown as symbol);
world.registerComponent(Pushable as unknown as symbol);
world.registerComponent(IntentMove as unknown as symbol);
world.registerComponent(Chunk as unknown as symbol);
world.registerComponent(Biome as unknown as symbol);
world.registerComponent(WorldLayerComp as unknown as symbol);
world.registerComponent(MiningTool as unknown as symbol);
world.registerComponent(Mineable as unknown as symbol);
world.registerComponent(Deposit as unknown as symbol);
world.registerComponent(Drill as unknown as symbol);

// Инвентарь, крафт, строительство, устройства
world.registerComponent(ItemStack as unknown as symbol);
world.registerComponent(Inventory as unknown as symbol);
world.registerComponent(Equipment as unknown as symbol);
world.registerComponent(UnlockedBlueprint as unknown as symbol);
world.registerComponent(CraftingQueue as unknown as symbol);
world.registerComponent(CraftingRecipe as unknown as symbol);
world.registerComponent(Structure as unknown as symbol);
world.registerComponent(Buildable as unknown as symbol);
world.registerComponent(SnapGrid as unknown as symbol);
world.registerComponent(StructuralIntegrity as unknown as symbol);
world.registerComponent(GravityAnchor as unknown as symbol);
world.registerComponent(GhostPreview as unknown as symbol);
world.registerComponent(Device as unknown as symbol);
world.registerComponent(EnergyNode as unknown as symbol);
world.registerComponent(EnergyCable as unknown as symbol);
world.registerComponent(Conveyor as unknown as symbol);
world.registerComponent(ItemRoute as unknown as symbol);
world.registerComponent(PowerProducer as unknown as symbol);
world.registerComponent(PowerConsumer as unknown as symbol);
world.registerComponent(EnergyStorage as unknown as symbol);

// Способности, прогрессия, сканирование
world.registerComponent(AbilityDefinition as unknown as symbol);
world.registerComponent(AbilitySlot as unknown as symbol);
world.registerComponent(ActiveEffect as unknown as symbol);
world.registerComponent(AbilityCombo as unknown as symbol);
world.registerComponent(SkillTreeNode as unknown as symbol);
world.registerComponent(ProgressionData as unknown as symbol);
world.registerComponent(Scanner as unknown as symbol);
world.registerComponent(ScanKnowledge as unknown as symbol);
world.registerComponent(BioSample as unknown as symbol);
world.registerComponent(AncientFragmentKnowledge as unknown as symbol);

// Гравитационный прилив и мутация мира
world.registerComponent(TideState as unknown as symbol);
world.registerComponent(AnomalyZone as unknown as symbol);
world.registerComponent(WorldMutation as unknown as symbol);
world.registerComponent(MutationMarker as unknown as symbol);
world.registerComponent(EnergyDome as unknown as symbol);

// 4. Сервисы и системы с зависимостями
const staminaEnergySystem = new StaminaEnergySystem(eventBus);
const craftingSystem = new CraftingSystem(eventBus);
const abilitySystem = new AbilitySystem(eventBus);
abilitySystem.setPhysicsService(physics);
const progressionSystem = new ProgressionSystem(eventBus, {
  unlockAbility: (entity: number, abilityId: string) => {
    abilitySystem.unlockAbility(entity, abilityId);
  },
});
const scanningSystem = new ScanningSystem(eventBus, {
  addExperience: (entity: number, amount: number, branch?: string) => {
    return progressionSystem.addExperience(entity, amount, branch as any);
  },
  addBranchPoints: (entity: number, branch: string, points: number) => {
    progressionSystem.addBranchPoints(entity, branch as any, points);
  },
});
const gravitySystem = new GravitySystem(physics, eventBus);
const gravityTideSystem = new GravityTideSystem(eventBus, physics);
const worldMutationSystem = new WorldMutationSystem(eventBus);

// 5. Адаптер stamina/energy для GrabThrowSystem
const staminaEnergy = {
  spendStamina: (entity: number, amount: number, reason: string) => {
    staminaEnergySystem.spendStamina(entity, amount, reason);
  },
  canSpendStamina: (entity: number, amount: number) => {
    return staminaEnergySystem.canSpendStamina(entity, amount);
  },
  spendEnergy: (entity: number, amount: number, reason: string) => {
    return staminaEnergySystem.spendEnergy(entity, amount, reason);
  },
};

// 6. Базовые системы в порядке приоритета (сортировка по приоритету внутри World.addSystem)
world.addSystem(new ChunkSystem(eventBus));                              // 8
world.addSystem(new InputSystem(input, eventBus));                       // 10
world.addSystem(scanningSystem);                                         // 16
world.addSystem(new CharacterSystem(eventBus));                          // 12
world.addSystem(staminaEnergySystem);                                    // 18
world.addSystem(new AISystem(physics, eventBus));                        // 20
world.addSystem(new GrabThrowSystem(physics, eventBus, staminaEnergy));  // 22
world.addSystem(new MiningSystem(physics, eventBus));                    // 28
world.addSystem(gravitySystem);                                          // 25
world.addSystem(gravityTideSystem);                                      // 70
world.addSystem(worldMutationSystem);                                    // 75
world.addSystem(abilitySystem);                                          // 35
world.addSystem(new PhysicsSystem(physics, eventBus));                   // 30
world.addSystem(new ConstructionSystem(physics, eventBus));              // 40
world.addSystem(new InventorySystem(eventBus));                          // 50
world.addSystem(craftingSystem);                                         // 52
world.addSystem(new DeviceSystem(eventBus));                             // 55
world.addSystem(new EventSystem(eventBus));                              // 60
world.addSystem(progressionSystem);                                      // 65
const renderSystem = new RenderSystem(render);                           // 90
world.addSystem(renderSystem);
const deathSystem = new DeathSystem(eventBus);
world.addSystem(deathSystem);                                            // 100
world.addSystem(new SaveSystem(storage, eventBus));                      // 100

// 7. Пример: создание игрока
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
world.addComponent(player, CharacterController as unknown as symbol, {
  state: 'Grounded',
  previousState: 'Grounded',
  stateTime: 0,
  inputDirection: new Vec2(0, 0),
  isSprinting: false,
  jumpPressed: false,
  interactPressed: false,
  digPressed: false,
  scanPressed: false,
  groundNormal: null,
  groundEntity: null,
  carriedEntity: null,
  maxCarryMass: 60,
  grabRadius: 2.5,
  jumpForce: 450,
  moveSpeed: 200,
  sprintMultiplier: 1.6,
  canDoubleJump: false,
  hasDoubleJumped: false,
});
world.addComponent(player, CharacterStats as unknown as symbol, {
  health: 100, maxHealth: 100,
  stamina: 100, maxStamina: 100,
  energy: 100, maxEnergy: 100,
  equipmentCondition: 1,
  speedPenalty: 1,
  exhausted: false,
  lastMealTime: null,
});
world.addComponent(player, IndividualGravity as unknown as symbol, {
  scale: 1, useOverride: false, orientation: 0,
});
world.addComponent(player, GravityForce as unknown as symbol, {
  vector: new Vec2(0, 9.81), dirty: true,
});

// Инвентарь игрока
world.addComponent(player, Inventory as unknown as symbol, {
  slots: Array(20).fill(null),
  maxSlots: 20,
  maxWeight: 200,
  currentWeight: 0,
});
world.addComponent(player, Equipment as unknown as symbol, {
  head: null, chest: null, hands: null, legs: null, tool: null, backpack: null,
});

// Прогрессия игрока
world.addComponent(player, ProgressionData as unknown as symbol, {
  level: 1,
  experience: 0,
  experienceToNext: 100,
  branchPoints: { gravity: 0, movement: 0, energy: 0, biology: 0, technology: 0 },
  branchLevels: { gravity: 0, movement: 0, energy: 0, biology: 0, technology: 0 },
  unlockedNodes: [],
  unlockedAbilities: [],
});

// Сканер игрока (стартовое оборудование)
world.addComponent(player, Scanner as unknown as symbol, {
  scanRadius: 150,
  energyCostPerScan: 10,
  scanCooldown: 2,
  cooldownRemaining: 0,
  active: true,
});

// 8. Глобальная гравитация мира (по умолчанию вниз, земная)
gravitySystem.setGlobalGravity(new Vec2(0, 9.81), 1, true);

// 9. Режим игры (загружается из сохранения в SaveSystem)
// deathSystem.setGameMode('softcore'); // или 'hardcore'

// 10. Точка спавна
const spawn = world.createEntity();
world.addComponent(spawn, Transform as unknown as symbol, { x: 100, y: 100, rotation: 0, scaleX: 1, scaleY: 1 });
world.addComponent(spawn, RespawnPoint as unknown as symbol, { position: new Vec2(100, 100), active: true });

// 11. Игровой цикл: фиксированная физика + интерполированный рендер
const loop = new GameLoop(
  world,
  DEFAULT_GAME_CONFIG.fixedTimeStep,
  DEFAULT_GAME_CONFIG.maxSubSteps,
  (alpha) => renderSystem.draw(world, alpha),
);

loop.start();

console.log('GRAVITY: VOID started. Entities:', world.entityCount);
