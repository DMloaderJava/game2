/**
 * BuildingSystem — система строительства с превью-призраком и сеткой.
 * Выбор предмета в инвентаре → режим строительства → размещение по клику.
 */
import * as PIXI from 'pixi.js';
import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { RenderService } from '../services/render-service';
import { Inventory, InventoryData } from '../components/inventory';
import { ItemStack } from '../components/inventory';
import { CharacterController } from '../components/character';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { Renderable } from '../components/renderable';
import { Material } from '../components/material';
import { Mineable, MineableData } from '../components/mining';
import { TileType } from '../components/world';
import { Vec2 } from '../core/vec2';
import { GravityAnchor } from '../components/construction';

const GRID_SIZE = 64;

/** Предметы, которые можно построить. */
export interface BuildableItem {
  itemId: string;
  name: string;
  texture: string;
  width: number;
  height: number;
  physics: { width: number; height: number; isStatic: boolean; label: string };
  material: { mass: number; density: number; strength: number };
  mineable?: MineableData;
}

export const BUILDABLE_ITEMS: Record<string, BuildableItem> = {
  stone_wall: {
    itemId: 'stone_wall',
    name: 'Каменная стена',
    texture: 'src/assets/textures/block_stone_wall.png',
    width: 64,
    height: 64,
    physics: { width: 64, height: 64, isStatic: true, label: 'stone_wall' },
    material: { mass: 0, density: 5000, strength: 50000 },
    mineable: {
      tileType: 'stone',
      hardness: 1,
      health: 30,
      maxHealth: 30,
      resourceDrop: 'stone_slabs',
      dropAmount: 1,
      defaultEffectiveness: { dirt: 1.0, stone: 1.0, ferrite_ore: 1.0, resonit_ore: 1.0 },
    },
  },
  gravity_anchor: {
    itemId: 'gravity_anchor',
    name: 'Гравитационный якорь',
    texture: 'src/assets/textures/gravity_anchor.png',
    width: 64,
    height: 64,
    physics: { width: 32, height: 32, isStatic: true, label: 'gravity_anchor' },
    material: { mass: 0, density: 5000, strength: 50000 },
    mineable: {
      tileType: 'construction',
      hardness: 1,
      health: 100,
      maxHealth: 100,
      resourceDrop: 'gravity_anchor',
      dropAmount: 1,
      defaultEffectiveness: { construction: 1.0 },
    },
  },
};

export class BuildingSystem extends System {
  readonly priority = 55;
  readonly required = [Transform, CharacterController, Inventory];

  private worldRef!: World;
  private render: RenderService;
  private eventBus: EventBus;
  private physics: { createRectangleBody: (e: number, x: number, y: number, w: number, h: number, opts: any) => any } | null = null;

  private playerEntity: number | null = null;
  private selectedItemId: string | null = null;
  private ghostSprite: any = null;
  private ghostX = 0;
  private ghostY = 0;
  private ghostVisible = false;
  private mouseX = 0;
  private mouseY = 0;
  private cameraX = 0;
  private cameraY = 0;

  constructor(render: RenderService, eventBus: EventBus) {
    super();
    this.render = render;
    this.eventBus = eventBus;
    this.setupMouseHandlers();
  }

  private setupMouseHandlers(): void {
    window.addEventListener('mousemove', (e) => {
      // Преобразуем экранные координаты в мировые (с учётом камеры)
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // только левая кнопка
      if (!this.selectedItemId || !this.playerEntity) return;
      this.placeBuilding();
    });
  }

  /** Выбрать предмет для строительства (вызывается из InventorySystem или по клику на слот). */
  selectItem(itemId: string | null): void {
    this.selectedItemId = itemId;
    this.ghostVisible = !!itemId;
    if (this.ghostSprite) {
      this.ghostSprite.visible = !!itemId;
    }
    this.eventBus.emit('building:selection-changed', { itemId });
  }

  isBuildingMode(): boolean {
    return this.selectedItemId !== null;
  }

  getSelectedItemId(): string | null {
    return this.selectedItemId;
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const actors = world.query(Transform, CharacterController, Inventory);
    for (const { entity, components } of actors) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const ctrl = components[1] as CharacterControllerData;
      const inv = components[2] as InventoryData;

      if (ctrl.state === 'Dead') continue;

      this.playerEntity = entity;

      // Если в режиме строительства, обновляем позицию призрака
      if (this.selectedItemId && this.ghostVisible) {
        this.updateGhostPosition(transform, inv);
      }
    }
  }

  private updateGhostPosition(transform: { x: number; y: number }, inv: InventoryData): void {
    const item = BUILDABLE_ITEMS[this.selectedItemId!];
    if (!item) return;

    // Проверяем, есть ли предмет в инвентаре
    let hasItem = false;
    for (const slot of inv.slots) {
      if (slot && slot.itemId === item.itemId) {
        hasItem = true;
        break;
      }
    }
    if (!hasItem) {
      this.selectItem(null);
      return;
    }

    // Вычисляем позицию пришествия относительно игрока (перед ним)
    const dirX = this.mouseX - window.innerWidth / 2;
    const dirY = this.mouseY - window.innerHeight / 2;
    const angle = Math.atan2(dirY, dirX);
    const distance = 120;

    // Мировая позиция с учётом камеры
    const worldMouseX = this.mouseX + this.cameraX;
    const worldMouseY = this.mouseY + this.cameraY;

    // Сетка: привязываем к GRID_SIZE
    const gridX = Math.round(worldMouseX / GRID_SIZE) * GRID_SIZE;
    const gridY = Math.round(worldMouseY / GRID_SIZE) * GRID_SIZE;

    this.ghostX = gridX;
    this.ghostY = gridY;

    // Обновляем спрайт призрака
    if (this.ghostSprite) {
      this.ghostSprite.x = gridX;
      this.ghostSprite.y = gridY;
      // Цвет призрака: зелёный если можно построить, красный если нет
      const canPlace = this.canPlaceAt(gridX, gridY, item);
      this.ghostSprite.tint = canPlace ? 0x00ff00 : 0xff0000;
      this.ghostSprite.alpha = 0.5;
    } else {
      // Создаём спрайт призрака
      const texture = this.render.getTexture(item.texture);
      if (texture) {
        this.ghostSprite = new PIXI.Sprite(texture);
        this.ghostSprite.anchor.set(0.5, 0.5);
        this.ghostSprite.width = item.width;
        this.ghostSprite.height = item.height;
        this.ghostSprite.x = gridX;
        this.ghostSprite.y = gridY;
        this.ghostSprite.tint = 0x00ff00;
        this.ghostSprite.alpha = 0.5;
        const layer = this.render as any;
        const container = layer.layers?.get(20) ?? layer.stage;
        container.addChild(this.ghostSprite);
      }
    }
  }

  private canPlaceAt(x: number, y: number, item: BuildableItem): boolean {
    // Проверяем, не перекрываем ли мы игрока или другие постройки
    // Упрощённая проверка: всегда можно, если не на игроке
    if (!this.playerEntity) return true;
    const playerTransform = this.worldRef.getComponent(this.playerEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (playerTransform) {
      const dist = Math.hypot(x - playerTransform.x, y - playerTransform.y);
      if (dist < 60) return false;
    }
    return true;
  }

  private placeBuilding(): void {
    if (!this.selectedItemId || !this.playerEntity) return;

    const item = BUILDABLE_ITEMS[this.selectedItemId];
    if (!item) return;

    const inv = this.worldRef.getComponent(this.playerEntity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return;

    // Проверяем наличие предмета
    let hasItem = false;
    let itemSlotIndex = -1;
    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      if (slot && slot.itemId === item.itemId) {
        hasItem = true;
        itemSlotIndex = i;
        break;
      }
    }
    if (!hasItem) {
      this.selectItem(null);
      return;
    }

    // Проверяем можно ли разместить
    if (!this.canPlaceAt(this.ghostX, this.ghostY, item)) return;

    // Списываем предмет
    inv.slots[itemSlotIndex]!.count -= 1;
    if (inv.slots[itemSlotIndex]!.count <= 0) inv.slots[itemSlotIndex] = null;
    this.worldRef.addComponent(this.playerEntity, Inventory as unknown as symbol, inv);

    // Создаём сущность постройки
    const entity = this.worldRef.createEntity();
    this.worldRef.addComponent(entity, Transform as unknown as symbol, {
      x: this.ghostX,
      y: this.ghostY,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });

    // Физическое тело
    const body = this.createPhysicsBody(entity, item);
    if (body) {
      this.worldRef.addComponent(entity, PhysicsBody as unknown as symbol, {
        body,
        gravityScale: 0,
        isSleeping: true,
      });
    }

    // Рендер
    this.worldRef.addComponent(entity, Renderable as unknown as symbol, {
      texture: item.texture,
      tint: 0xffffff,
      alpha: 1,
      visible: true,
      layer: 10,
    });
    const sprite = this.render.addSprite(entity, item.texture, 10);
    if (sprite) {
      sprite.anchor.set(0.5, 0.5);
      sprite.width = item.width;
      sprite.height = item.height;
    }

    // Материал
    this.worldRef.addComponent(entity, Material as unknown as symbol, {
      mass: item.material.mass,
      density: item.material.density,
      strength: item.material.strength,
      durability: 1,
      sailArea: 0.05,
      airResistance: 0.3,
      state: 'solid',
      temperature: 20,
      burnable: false,
      flammable: false,
      thermalConductivity: 1.5,
    });

    // Mineable (для возможности разрушить постройку)
    if (item.mineable) {
      this.worldRef.addComponent(entity, Mineable as unknown as symbol, item.mineable);
    }

    // Гравитационный якорь — добавляем компонент с радиусом защиты
    if (item.itemId === 'gravity_anchor') {
      this.worldRef.addComponent(entity, GravityAnchor as unknown as symbol, {
        active: true,
        radius: 250,
        energyPerSecond: 0,
        anchoredEntities: [],
      });
    }

    // Событие
    this.eventBus.emit('building:placed', {
      entity,
      itemId: item.itemId,
      x: this.ghostX,
      y: this.ghostY,
    });

    // Выходим из режима строительства после размещения
    this.selectItem(null);
  }

  private createPhysicsBody(entity: number, item: BuildableItem): any {
    if (!this.physics) return null;
    return this.physics.createRectangleBody(
      entity,
      this.ghostX,
      this.ghostY,
      item.physics.width,
      item.physics.height,
      {
        isStatic: item.physics.isStatic,
        label: item.physics.label,
      }
    );
  }

  /** Установить PhysicsService (вызывается из main.ts). */
  setPhysicsService(physics: { createRectangleBody: (e: number, x: number, y: number, w: number, h: number, opts: any) => any }): void {
    this.physics = physics;
  }

  /** Установить позицию камеры для пересчёта мировых координат. */
  setCameraPosition(x: number, y: number): void {
    this.cameraX = x;
    this.cameraY = y;
  }
}

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
