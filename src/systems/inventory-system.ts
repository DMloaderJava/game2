/**
 * InventorySystem — рабочая логика инвентаря с PixiJS UI.
 * Подбор предметов, сетка слотов, отображение иконок и счетчиков стаков.
 */
import * as PIXI from 'pixi.js';
import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { RenderService } from '../services/render-service';
import {
  Inventory, InventoryData,
  ItemStack, ItemStackData, StackLimits,
} from '../components/inventory';
import { Transform } from '../components/transform';
import { CharacterController } from '../components/character';

export class InventorySystem extends System {
  readonly priority = 50;
  readonly required = [Inventory];

  private worldRef!: World;
  private playerEntity: number | null = null;
  private uiContainer: any = null;
  private slotSprites: Array<{ bg: any; count: any; x: number; y: number; slotSize: number }> = [];
  private slotIcons: Array<any> = [];

  constructor(private eventBus: EventBus, private render: RenderService) {
    super();
    this.buildUI();
  }

  private buildUI(): void {
    // Контейнер инвентаря (скрыт по умолчанию)
    this.uiContainer = new PIXI.Container();
    this.uiContainer.visible = false;
    this.uiContainer.x = 50;
    this.uiContainer.y = 100;

    // Фон инвентаря (UI — графика допустима, это не игровой объект)
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, 420, 320);
    bg.fill(0x1a1a2e);
    bg.stroke({ width: 3, color: 0x4cc9f0 });
    this.uiContainer.addChild(bg);

    // Заголовок
    const title = new PIXI.Text({ text: 'ИНВЕНТАРЬ (I)', style: {
      fontFamily: 'monospace',
      fontSize: 20,
      fill: 0x4cc9f0,
    } });
    title.x = 10;
    title.y = 10;
    this.uiContainer.addChild(title);

    // Сетка слотов 5x4
    const slotSize = 64;
    const gap = 8;
    const startX = 10;
    const startY = 40;

    for (let i = 0; i < 20; i++) {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const x = startX + col * (slotSize + gap);
      const y = startY + row * (slotSize + gap);

      const slotBg = new PIXI.Graphics();
      slotBg.rect(0, 0, slotSize, slotSize);
      slotBg.fill(0x2a2a3e);
      slotBg.stroke({ width: 2, color: 0x3a3a5e });
      slotBg.x = x;
      slotBg.y = y;
      this.uiContainer.addChild(slotBg);

      const countText = new PIXI.Text({ text: '', style: {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xffffff,
      } });
      countText.x = x + slotSize - 20;
      countText.y = y + slotSize - 20;
      this.uiContainer.addChild(countText);

      this.slotSprites.push({ bg: slotBg, count: countText, x, y, slotSize });
    }

    if (this.render.stage) {
      this.render.stage.addChild(this.uiContainer);
    }
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const inventories = world.query(Inventory);
    for (const { entity, components } of inventories) {
      const inv = components[0] as InventoryData;

      // Пересчитываем вес
      let weight = 0;
      for (const slot of inv.slots) {
        if (!slot) continue;
        weight += this.getItemMass(slot.itemId) * slot.count;
      }
      inv.currentWeight = weight;
      world.addComponent(entity, Inventory as unknown as symbol, inv);

      // Рендерим UI если инвентарь открыт и у сущности есть контроллер (игрок)
      const isPlayer = world.hasComponent(entity, CharacterController as unknown as symbol);
      if (isPlayer && inv.open) {
        this.playerEntity = entity;
        this.uiContainer.visible = true;
        this.renderInventoryUI(entity, inv);
      } else if (isPlayer && !inv.open && this.uiContainer) {
        this.uiContainer.visible = false;
      }
    }
  }

  private renderInventoryUI(entity: number, inv: InventoryData): void {
    if (!this.uiContainer) return;
    this.uiContainer.visible = true;

    // Удаляем старые иконки
    for (const icon of this.slotIcons) {
      icon.parent?.removeChild(icon);
      if (typeof icon.destroy === 'function') icon.destroy();
    }
    this.slotIcons = [];

    for (let i = 0; i < inv.slots.length; i++) {
      const slot = inv.slots[i];
      const slotInfo = this.slotSprites[i];
      if (!slot || !slotInfo) continue;

      const textureUrl = this.getItemTextureUrl(slot.itemId);
      const texture = this.render.getTexture(textureUrl);

      let icon: any;
      if (texture) {
        icon = new PIXI.Sprite(texture);
        icon.width = slotInfo.slotSize - 8;
        icon.height = slotInfo.slotSize - 8;
        icon.x = slotInfo.x + 4;
        icon.y = slotInfo.y + 4;
      } else {
        // Фоллбэк — цветной квадрат
        icon = new PIXI.Graphics();
        icon.rect(0, 0, slotInfo.slotSize - 8, slotInfo.slotSize - 8);
        icon.fill(0x4cc9f0);
        icon.x = slotInfo.x + 4;
        icon.y = slotInfo.y + 4;
      }

      if (this.uiContainer) {
        this.uiContainer.addChild(icon);
      }
      this.slotIcons.push(icon);

      // Счетчик стака
      if (slot.count > 1) {
        slotInfo.count.text = slot.count.toString();
      } else {
        slotInfo.count.text = '';
      }
    }
  }

  /* ── Публичный API ───────────────────────────────────────────── */

  addItem(world: World, itemId: string, count: number, quality?: number): number {
    if (!this.playerEntity) return count;
    const inv = world.getComponent(this.playerEntity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return count;

    let remaining = count;
    const tags = this.getItemTags(itemId);
    const maxCount = StackLimits[tags.includes('ore') ? 'ore' : tags.includes('building_material') ? 'building_material' : tags.includes('tool') || tags.includes('device') ? 'tool' : 'default'];

    // Добиваем существующие стаки
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
      const slot = inv.slots[i];
      if (slot && slot.itemId === itemId && slot.count < slot.maxCount) {
        const space = slot.maxCount - slot.count;
        const add = Math.min(space, remaining);
        slot.count += add;
        remaining -= add;
        inv.slots[i] = slot;
      }
    }

    // Новые стаки
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
      if (!inv.slots[i]) {
        const add = Math.min(maxCount, remaining);
        inv.slots[i] = { itemId, count: add, maxCount, quality, tags };
        remaining -= add;
      }
    }

    world.addComponent(this.playerEntity, Inventory as unknown as symbol, inv);
    this.eventBus.emit('inventory:item-added', { entity: this.playerEntity, itemId, count: count - remaining });
    return remaining;
  }

  removeItem(world: World, itemId: string, count: number): number {
    if (!this.playerEntity) return 0;
    const inv = world.getComponent(this.playerEntity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return 0;

    let remaining = count;
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
      const slot = inv.slots[i];
      if (slot && slot.itemId === itemId) {
        const remove = Math.min(slot.count, remaining);
        slot.count -= remove;
        remaining -= remove;
        if (slot.count <= 0) inv.slots[i] = null;
        else inv.slots[i] = slot;
      }
    }

    world.addComponent(this.playerEntity, Inventory as unknown as symbol, inv);
    this.eventBus.emit('inventory:item-removed', { entity: this.playerEntity, itemId, count: count - remaining });
    return count - remaining;
  }

  hasItem(world: World, itemId: string, count: number): boolean {
    if (!this.playerEntity) return false;
    const inv = world.getComponent(this.playerEntity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return false;

    let total = 0;
    for (const slot of inv.slots) {
      if (slot && slot.itemId === itemId) total += slot.count;
      if (total >= count) return true;
    }
    return false;
  }

  /** Подобрать все предметы лута в радиусе вокруг игрока. */
  pickupNearby(world: World, playerX: number, playerY: number, radius: number = 70): number {
    if (!this.playerEntity) return 0;

    let pickedUp = 0;
    const lootEntities = world.query(ItemStack, Transform);
    for (const { entity, components } of lootEntities) {
      const itemStack = components[0] as ItemStackData;
      const transform = components[1] as { x: number; y: number };

      const dist = Math.hypot(transform.x - playerX, transform.y - playerY);
      if (dist > radius) continue;

      const added = this.addItem(world, itemStack.itemId, itemStack.count, itemStack.quality);
      if (added > 0) {
        world.destroyEntity(entity);
        pickedUp++;
        this.eventBus.emit('inventory:item-picked-up', {
          entity: this.playerEntity, itemId: itemStack.itemId, count: itemStack.count, x: transform.x, y: transform.y,
        });
      }
    }
    return pickedUp;
  }

  /** Установить игрока (вызывается из main.ts после создания). */
  setPlayerEntity(entity: number): void {
    this.playerEntity = entity;
  }

  /* ── Вспомогательное ─────────────────────────────────────────── */

  private getItemMass(itemId: string): number {
    const masses: Record<string, number> = {
      dirt: 1, stone_slabs: 5, ferrite_ore: 2, ferrite_ingot: 2.5, resonit: 3,
      biovolume: 0.5, biogel: 0.2, ancient_fragment: 1, construction_materials: 4,
    };
    return masses[itemId] ?? 1;
  }

  private getItemTags(itemId: string): string[] {
    const tagMap: Record<string, string[]> = {
      stone_slabs: ['building_material'],
      ferrite_ore: ['ore'],
      ferrite_ingot: ['ore'],
      resonit: ['ore'],
      biovolume: ['building_material'],
      biogel: ['food'],
      ancient_fragment: ['fragment'],
      construction_materials: ['building_material'],
    };
    return tagMap[itemId] ?? [];
  }

  private getItemTextureUrl(itemId: string): string {
    const map: Record<string, string> = {
      stone_slabs: '/textures/item_stone_slabs.png',
      ferrite_ore: '/textures/item_ferrite_ore.png',
      resonit: '/textures/item_resonit.png',
      biovolume: '/textures/item_biovolume.png',
      biogel: '/textures/item_biogel.png',
      ancient_fragment: '/textures/item_ancient_fragment.png',
      stone_wall: '/textures/block_stone_wall.png',
      gravity_anchor: '/textures/gravity_anchor.png',
      energy_dome: '/textures/energy_dome.png',
    };
    return map[itemId] ?? '/textures/item_stone_slabs.png';
  }
}
