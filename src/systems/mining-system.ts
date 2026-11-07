/**
 * MiningSystem — рабочая логика добычи ресурсов.
 * Разрушение блоков по клавише E, спавн лута-спрайта, подбор в инвентарь.
 */
import * as PIXI from 'pixi.js';
import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';
import { RenderService } from '../services/render-service';
import { InputService } from '../services/input-service';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { Renderable } from '../components/renderable';
import { CharacterController } from '../components/character';
import { CharacterStats } from '../components/character';
import { Material } from '../components/material';
import { Mineable, MineableData } from '../components/mining';
import { ItemStack } from '../components/inventory';
import { MiningTool, MiningToolData } from '../components/mining';
import { InventorySystem } from './inventory-system';

export class MiningSystem extends System {
  readonly priority = 28;
  readonly required = [Transform, CharacterController, CharacterStats];

  private worldRef!: World;
  private inventorySystem!: InventorySystem;
  private lastMineTime = 0;

  constructor(
    private physics: PhysicsService,
    private input: InputService,
    private eventBus: EventBus,
    inventorySystem: InventorySystem,
    private render: RenderService,
  ) {
    super();
    this.inventorySystem = inventorySystem;
  }

  /** Связать с экземпляром InventorySystem (вызывается из main.ts). */
  bindInventory(inventorySystem: InventorySystem): void {
    this.inventorySystem = inventorySystem;
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const actors = world.query(Transform, CharacterController, CharacterStats);
    for (const { entity, components } of actors) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const ctrl = components[1] as CharacterControllerData;
      const stats = components[2] as CharacterStatsData;

      if (ctrl.state === 'Dead') continue;

      // --- Автоподбор лута при приближении игрока (каждый кадр) ---
      this.inventorySystem.pickupNearby(transform.x, transform.y, 70);

      // --- Добыча блока только при нажатии E ---
      const ePressed = this.input.isKeyDown('e');
      if (!ePressed) continue;

      const now = Date.now();
      const tool = this.worldRef.getComponent(entity, MiningTool as unknown as symbol) as MiningToolData | undefined;
      if (!tool) continue;

      const hitInterval = 1000 / tool.speed;
      if (now - this.lastMineTime < hitInterval) continue;

      const staminaCost = tool.staminaCostPerSecond * dt;
      const energyCost = tool.energyCostPerSecond * dt;
      if (stats.stamina < staminaCost || stats.energy < energyCost) continue;

      stats.stamina = Math.max(0, stats.stamina - staminaCost);
      stats.energy = Math.max(0, stats.energy - energyCost);
      world.addComponent(entity, CharacterStats as unknown as symbol, stats);

      this.lastMineTime = now;

      // Целевая позиция — перед игроком
      const dir = ctrl.inputDirection;
      let angle = transform.rotation;
      if (dir.x !== 0 || dir.y !== 0) {
        angle = Math.atan2(dir.y, dir.x);
      }
      const distance = 80;
      const targetX = transform.x + Math.cos(angle) * distance;
      const targetY = transform.y + Math.sin(angle) * distance;

      this.mineTile(entity, targetX, targetY, tool);
    }
  }

  private mineTile(minerEntity: number, worldX: number, worldY: number, tool: MiningToolData): void {
    // Находим тела в точке удара
    const bodies = this.physics.queryPoint(worldX, worldY);
    let target: { entity: number; dist: number } | null = null;

    for (const body of bodies) {
      const targetEntity = (body as any).entity;
      if (targetEntity === minerEntity) continue;

      const material = this.worldRef.getComponent(targetEntity, Material as unknown as symbol) as { mass: number } | undefined;
      if (!material) continue;

      const tTransform = this.worldRef.getComponent(targetEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
      if (!tTransform) continue;

      const dist = Math.hypot(worldX - tTransform.x, worldY - tTransform.y);
      if (dist > 80) continue;

      if (!target || dist < target.dist) {
        target = { entity: targetEntity, dist };
      }
    }

    if (!target) return;

    // Наносим урон блоку (если есть Mineable компонент)
    const mineable = this.worldRef.getComponent(target.entity, Mineable as unknown as symbol) as MineableData | undefined;

    if (mineable) {
      const effectiveness = tool.materialEffectiveness[mineable.tileType] ?? 1.0;
      const damage = tool.damage * effectiveness;
      mineable.health = Math.max(0, mineable.health - damage);

      this.eventBus.emit('tile:damaged', { entity: target.entity, health: mineable.health, maxHealth: mineable.maxHealth, damage });

      if (mineable.health <= 0) {
        this.destroyTile(target.entity, mineable, tool);
      }
    } else {
      // Обычный блок без Mineable — ломается за один удар
      this.destroyTile(target.entity, {
        tileType: 'stone',
        health: 0, maxHealth: 0,
        resourceDrop: 'stone_slabs',
        dropAmount: 1,
        defaultEffectiveness: {},
      } as MineableData, tool);
    }
  }

  private destroyTile(entity: number, mineable: MineableData, tool: MiningToolData): void {
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!transform) return;

    // Удаляем из физики, рендера и мира
    this.physics.removeBody(entity);
    this.render.removeSprite(entity);
    this.worldRef.destroyEntity(entity);

    // Спавним лут-спрайт
    if (mineable.resourceDrop && mineable.dropAmount > 0) {
      const dropAmount = Math.floor(mineable.dropAmount * tool.fortune);
      this.spawnLoot(mineable.resourceDrop, dropAmount, transform.x, transform.y);
    }

    this.eventBus.emit('tile:destroyed', {
      entity, resourceDrop: mineable.resourceDrop, dropAmount: mineable.dropAmount, x: transform.x, y: transform.y,
    });
  }

  private spawnLoot(itemId: string, amount: number, x: number, y: number): void {
    const lootEntity = this.worldRef.createEntity();
    this.worldRef.addComponent(lootEntity, Transform as unknown as symbol, { x, y, rotation: 0, scaleX: 1, scaleY: 1 });

    // Физическое тело лута (круг, небольшой, отскакивает)
    const body = this.physics.createCircleBody(lootEntity, x, y, 10, {
      restitution: 0.3, friction: 0.5, density: 0.5, label: 'loot',
    });
    this.worldRef.addComponent(lootEntity, PhysicsBody as unknown as symbol, {
      body, gravityScale: 1.0, isSleeping: false,
    });

    // Спрайт лута (только текстура, без Graphics)
    const textureUrl = this.getItemTexture(itemId);
    const lootSprite = this.render.addSprite(lootEntity, textureUrl, 15);
    if (lootSprite) {
      lootSprite.anchor.set(0.5, 0.5);
      lootSprite.width = 24;
      lootSprite.height = 24;
    }

    this.worldRef.addComponent(lootEntity, Renderable as unknown as symbol, {
      texture: textureUrl, tint: 0xffffff, alpha: 1, visible: true, layer: 15,
    });
    this.worldRef.addComponent(lootEntity, Material as unknown as symbol, {
      mass: 1, density: 500, strength: 100, durability: 1,
      sailArea: 0.05, airResistance: 0.8, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 0.2,
    });
    this.worldRef.addComponent(lootEntity, ItemStack as unknown as symbol, {
      itemId, count: amount, maxCount: 64, tags: [],
    });

    this.eventBus.emit('resource:spawned', { entity: lootEntity, itemId, amount, x, y });
  }

  private getItemTexture(itemId: string): string {
    const map: Record<string, string> = {
      stone_slabs: 'src/assets/textures/item_stone_slabs.png',
      ferrite_ore: 'src/assets/textures/item_ferrite_ore.png',
      resonit: 'src/assets/textures/item_resonit.png',
      biovolume: 'src/assets/textures/item_biovolume.png',
      biogel: 'src/assets/textures/item_biogel.png',
      ancient_fragment: 'src/assets/textures/item_ancient_fragment.png',
      stone_wall: 'src/assets/textures/block_stone_wall.png',
      gravity_anchor: 'src/assets/textures/gravity_anchor.png',
      energy_dome: 'src/assets/textures/energy_dome.png',
    };
    return map[itemId] ?? 'src/assets/textures/item_stone_slabs.png';
  }
}

/* ── Локальные типы для компонентов (альясы для читаемости) ── */

interface CharacterControllerData {
  state: string;
  previousState: string;
  stateTime: number;
  inputDirection: { x: number; y: number };
  isSprinting: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  digPressed: boolean;
  scanPressed: boolean;
  groundNormal: { x: number; y: number } | null;
  groundEntity: number | null;
  carriedEntity: number | null;
  maxCarryMass: number;
  grabRadius: number;
  jumpForce: number;
  moveSpeed: number;
  sprintMultiplier: number;
  canDoubleJump: boolean;
  hasDoubleJumped: boolean;
}

interface CharacterStatsData {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  energy: number;
  maxEnergy: number;
  equipmentCondition: number;
  speedPenalty: number;
  exhausted: boolean;
  lastMealTime: number | null;
}
