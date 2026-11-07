import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { CharacterStats } from '../components/character';
import { Inventory, InventoryData } from '../components/inventory';
import { ItemStack, ItemStackData, StackLimits } from '../components/inventory';
import { CraftingRecipe, CraftingRecipeData } from '../components/inventory';
import { CraftingQueue, CraftingQueueData } from '../components/inventory';
import { UnlockedBlueprint } from '../components/inventory';

/**
 * CraftingSystem — рецепты крафта, проверка разблокировки, процесс изготовления.
 *
 * Рецепты регистрируются плагинами предметов через registerRecipe и добавляются
 * в мир как отдельные сущности с компонентом CraftingRecipe.
 *
 * Приоритет 52 — после InventorySystem (50), чтобы инвентарь был актуален
 * при проверке ингредиентов.
 */
export class CraftingSystem extends System {
  readonly priority = 52;
  readonly required = [CharacterStats, Inventory];

  private worldRef!: World;
  private recipes = new Map<string, CraftingRecipeData>();

  constructor(private eventBus: EventBus) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    // Пересобираем кэш рецептов
    this.recipes.clear();
    const recipeEntities = world.query(CraftingRecipe);
    for (const { components } of recipeEntities) {
      const recipe = components[0] as CraftingRecipeData;
      this.recipes.set(recipe.id, recipe);
    }

    const actors = world.query(CharacterStats, Inventory, CraftingQueue);
    for (const { entity, components } of actors) {
      const stats = components[0] as CharacterStatsData;
      const inv = components[1] as InventoryData;
      const queue = components[2] as CraftingQueueData;

      if (queue.progress >= 1) {
        this.completeCraft(entity, inv, queue);
        world.removeComponent(entity, CraftingQueue as unknown as symbol);
        continue;
      }

      const recipe = this.recipes.get(queue.recipeId);
      if (!recipe) continue;

      const energyCostPerSecond = recipe.energyCost / recipe.craftTime;
      const energyToSpend = energyCostPerSecond * dt;

      if (stats.energy >= energyToSpend) {
        stats.energy = Math.max(0, stats.energy - energyToSpend);
        queue.progress = Math.min(1, queue.progress + dt / recipe.craftTime);
        world.addComponent(entity, CharacterStats as unknown as symbol, stats);
        world.addComponent(entity, CraftingQueue as unknown as symbol, queue);
      } else {
        this.eventBus.emit('crafting:paused', { entity, recipeId: queue.recipeId, reason: 'no_energy' });
      }
    }
  }

  /* ── Публичный API ───────────────────────────────────────────── */

  /** Зарегистрировать рецепт в мире (вызывается плагинами предметов при установке). */
  registerRecipe(world: World, recipe: CraftingRecipeData): void {
    const entity = world.createEntity();
    world.addComponent(entity, CraftingRecipe as unknown as symbol, recipe);
    this.recipes.set(recipe.id, recipe);
    this.eventBus.emit('crafting:recipe-registered', { recipeId: recipe.id });
  }

  /** Проверить, доступен ли рецепт для крафта. */
  canCraft(entity: number, recipeId: string): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return false;

    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
    const blueprints = this.worldRef.getComponent(entity, UnlockedBlueprint as unknown as symbol) as Array<{ blueprintId: string }> | undefined;

    if (!stats || !inv) return false;

    // 1. Разблокировка чертежей
    for (const bp of recipe.unlockBlueprints) {
      if (!blueprints || !blueprints.some((b) => b.blueprintId === bp)) return false;
    }

    // 2. Ингредиенты
    for (const input of recipe.inputs) {
      if (!this.hasItemCount(inv, input.itemId, input.count)) return false;
    }

    // 3. Энергия
    if (stats.energy < recipe.energyCost) return false;

    // 4. Место в инвентаре для выходов
    if (!this.hasSpaceForOutputs(inv, recipe.outputs)) return false;

    return true;
  }

  /** Начать крафт рецепта. Возвращает false, если не удалось начать. */
  startCraft(entity: number, recipeId: string, stationEntity: number | null = null): boolean {
    if (!this.canCraft(entity, recipeId)) return false;

    const recipe = this.recipes.get(recipeId)!;
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData;
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData;

    // Списываем энергию
    stats.energy = Math.max(0, stats.energy - recipe.energyCost);
    this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);

    // Списываем ингредиенты
    for (const input of recipe.inputs) {
      this.removeItemCount(inv, input.itemId, input.count, entity);
    }

    // Создаём очередь крафта (упрощённо: только один рецепт одновременно)
    if (this.worldRef.hasComponent(entity, CraftingQueue as unknown as symbol)) {
      return false;
    }

    this.worldRef.addComponent(entity, CraftingQueue as unknown as symbol, {
      recipeId,
      progress: 0,
      startTime: Date.now(),
      stationEntity,
    });

    this.eventBus.emit('crafting:started', { entity, recipeId, stationEntity });
    return true;
  }

  /** Завершить крафт — выдать результаты в инвентарь. */
  private completeCraft(entity: number, inv: InventoryData, queue: CraftingQueueData): void {
    const recipe = this.recipes.get(queue.recipeId);
    if (!recipe) return;

    for (const output of recipe.outputs) {
      const existing = this.findSlotWithItem(inv, output.itemId);
      if (existing !== -1) {
        const slot = inv.slots[existing]!;
        slot.count += output.count;
        inv.slots[existing] = slot;
      } else {
        const emptySlot = inv.slots.findIndex((s) => !s);
        if (emptySlot !== -1) {
          inv.slots[emptySlot] = {
            itemId: output.itemId,
            count: output.count,
            maxCount: StackLimits.default,
            tags: [],
          };
        }
        // Если места нет — предмет теряется (в полной версии — выброс на землю)
      }
    }

    this.worldRef.addComponent(entity, Inventory as unknown as symbol, inv);
    this.eventBus.emit('crafting:completed', { entity, recipeId: queue.recipeId, outputs: recipe.outputs });
  }

  /* ── Вспомогательное ─────────────────────────────────────────── */

  private hasItemCount(inv: InventoryData, itemId: string, count: number): boolean {
    let total = 0;
    for (const slot of inv.slots) {
      if (slot && slot.itemId === itemId) total += slot.count;
      if (total >= count) return true;
    }
    return false;
  }

  private removeItemCount(inv: InventoryData, itemId: string, count: number, entity: number): void {
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
  }

  private hasSpaceForOutputs(inv: InventoryData, outputs: Array<{ itemId: string; count: number }>): boolean {
    const needed = new Map<string, number>();
    for (const out of outputs) {
      needed.set(out.itemId, (needed.get(out.itemId) ?? 0) + out.count);
    }

    for (const [itemId, count] of needed) {
      let space = 0;
      for (const slot of inv.slots) {
        if (!slot) { space += StackLimits.default; continue; }
        if (slot.itemId === itemId) space += slot.maxCount - slot.count;
      }
      if (space < count) return false;
    }
    return true;
  }

  private findSlotWithItem(inv: InventoryData, itemId: string): number {
    return inv.slots.findIndex((s) => s && s.itemId === itemId && s.count < s.maxCount);
  }
}

interface CharacterStatsData {
  energy: number;
}
