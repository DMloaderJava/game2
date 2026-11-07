import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus as EventBusClass } from '../core/event-bus';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { Renderable } from '../components/renderable';
import { Material } from '../components/material';
import { Inventory, InventoryData } from '../components/inventory';
import { ItemStack, ItemStackData, StackLimits } from '../components/inventory';
import { CharacterStats } from '../components/character';

/**
 * InventorySystem — операции с инвентарём: добавление, извлечение,
 * перенос между слотами, расчёт веса, выброс предметов в мир.
 *
 * Приоритет 50 (после ConstructionSystem 40, до EventSystem 60).
 */
export class InventorySystem extends System {
  readonly priority = 50;
  readonly required = [Inventory];

  private worldRef!: World;

  constructor(private eventBus: EventBusClass) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const inventories = world.query(Inventory);
    for (const { entity, components } of inventories) {
      const inv = components[0] as InventoryData;

      // Пересчитываем текущий вес из материалов предметов
      let weight = 0;
      for (const slot of inv.slots) {
        if (!slot) continue;
        // Материал предмета — через глобальный реестр (упрощённо: фиксированная масса)
        const mass = this.getItemMass(slot.itemId);
        weight += mass * slot.count;
      }
      inv.currentWeight = weight;
      world.addComponent(entity, Inventory as unknown as symbol, inv);

      // Проверка избыточного веса для персонажа
      const stats = world.getComponent(entity, CharacterStats as unknown as symbol) as { speedPenalty: number } | undefined;
      if (stats && weight > inv.maxWeight) {
        stats.speedPenalty = 0.5; // -50% скорость при перегрузе
        world.addComponent(entity, CharacterStats as unknown as symbol, stats);
      } else if (stats) {
        stats.speedPenalty = 1.0;
        world.addComponent(entity, CharacterStats as unknown as symbol, stats);
      }
    }
  }

  /* ── Публичный API ───────────────────────────────────────────── */

  /** Добавить предмет в инвентарь. Возвращает остаток, который не поместился. */
  addItem(entity: number, itemId: string, count: number, quality?: number): number {
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return count;

    let remaining = count;
    const tags = this.getItemTags(itemId);
    const maxCount = StackLimits[tags.includes('ore') ? 'ore' : tags.includes('building_material') ? 'building_material' : tags.includes('tool') || tags.includes('device') ? 'tool' : 'default'];

    // 1. Добиваем существующие стаки того же предмета
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

    // 2. Заполняем пустые ячейки новыми стаками
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
      if (!inv.slots[i]) {
        const add = Math.min(maxCount, remaining);
        inv.slots[i] = {
          itemId,
          count: add,
          maxCount,
          quality,
          tags,
        };
        remaining -= add;
      }
    }

    this.worldRef.addComponent(entity, Inventory as unknown as symbol, inv);
    this.eventBus.emit('inventory:item-added', { entity, itemId, count: count - remaining });
    return remaining;
  }

  /** Извлечь предмет из инвентаря. Возвращает фактически извлечённое количество. */
  removeItem(entity: number, itemId: string, count: number): number {
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
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

    this.worldRef.addComponent(entity, Inventory as unknown as symbol, inv);
    this.eventBus.emit('inventory:item-removed', { entity, itemId, count: count - remaining });
    return count - remaining;
  }

  /** Проверить наличие достаточного количества предмета. */
  hasItem(entity: number, itemId: string, count: number): boolean {
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return false;

    let total = 0;
    for (const slot of inv.slots) {
      if (slot && slot.itemId === itemId) total += slot.count;
      if (total >= count) return true;
    }
    return false;
  }

  /** Переместить предмет между ячейками одного инвентаря. */
  transfer(entity: number, fromSlot: number, toSlot: number, count: number): boolean {
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return false;
    if (fromSlot < 0 || fromSlot >= inv.slots.length || toSlot < 0 || toSlot >= inv.slots.length) return false;

    const source = inv.slots[fromSlot];
    const target = inv.slots[toSlot];
    if (!source) return false;

    const toMove = Math.min(count, source.count);

    if (target && target.itemId === source.itemId && target.count < target.maxCount) {
      const space = target.maxCount - target.count;
      const add = Math.min(space, toMove);
      target.count += add;
      source.count -= add;
      inv.slots[toSlot] = target;
      if (source.count <= 0) inv.slots[fromSlot] = null;
      else inv.slots[fromSlot] = source;
    } else if (!target) {
      inv.slots[toSlot] = { ...source, count: toMove };
      source.count -= toMove;
      if (source.count <= 0) inv.slots[fromSlot] = null;
      else inv.slots[fromSlot] = source;
    } else {
      return false; // цель занята другим предметом
    }

    this.worldRef.addComponent(entity, Inventory as unknown as symbol, inv);
    this.eventBus.emit('inventory:item-moved', { entity, fromSlot, toSlot, count: toMove });
    return true;
  }

  /** Выбросить предмет из инвентаря в мир (спавн Item-сущности). */
  dropItem(entity: number, slotIndex: number, count: number, worldPos: { x: number; y: number }): boolean {
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return false;

    const slot = inv.slots[slotIndex];
    if (!slot) return false;

    const dropCount = Math.min(count, slot.count);
    slot.count -= dropCount;
    if (slot.count <= 0) inv.slots[slotIndex] = null;
    else inv.slots[slotIndex] = slot;

    this.worldRef.addComponent(entity, Inventory as unknown as symbol, inv);

    // Спавним предмет-сущность в мире
    const itemEntity = this.worldRef.createEntity();
    this.worldRef.addComponent(itemEntity, Transform as unknown as symbol, {
      x: worldPos.x, y: worldPos.y, rotation: 0, scaleX: 1, scaleY: 1,
    });
    this.worldRef.addComponent(itemEntity, PhysicsBody as unknown as symbol, {
      body: null, gravityScale: 1.0, isSleeping: false,
    });
    this.worldRef.addComponent(itemEntity, Renderable as unknown as symbol, {
      texture: `item_${slot.itemId}`,
      tint: 0xffffff, alpha: 1, visible: true, layer: 15,
    });
    this.worldRef.addComponent(itemEntity, Material as unknown as symbol, {
      mass: this.getItemMass(slot.itemId), density: 500, strength: 100, durability: 1,
      sailArea: 0.05, airResistance: 0.8, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 0.2,
    });
    this.worldRef.addComponent(itemEntity, ItemStack as unknown as symbol, {
      itemId: slot.itemId, count: dropCount, maxCount: slot.maxCount, quality: slot.quality, tags: slot.tags,
    });

    this.eventBus.emit('inventory:item-dropped', { entity, itemEntity, itemId: slot.itemId, count: dropCount, x: worldPos.x, y: worldPos.y });
    return true;
  }

  /** Получить максимальный стак для предмета по тегам. */
  private getItemMaxCount(itemId: string, tags: string[]): number {
    if (tags.includes('ore')) return StackLimits.ore;
    if (tags.includes('building_material')) return StackLimits.building_material;
    if (tags.includes('tool') || tags.includes('device')) return StackLimits.tool;
    if (tags.includes('food')) return StackLimits.food;
    if (tags.includes('fragment')) return StackLimits.fragment;
    return StackLimits.default;
  }

  private getItemMass(itemId: string): number {
    // Упрощённый реестр масс предметов (в полной версии — из данных материалов)
    const masses: Record<string, number> = {
      dirt: 1,
      stone_slabs: 5,
      ferrite_ore: 2,
      ferrite_ingot: 2.5,
      resonit: 3,
      biovolume: 0.5,
      biogel: 0.2,
      ancient_fragment: 1,
      construction_materials: 4,
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
}
