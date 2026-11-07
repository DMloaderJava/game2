import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Стек предмета в ячейке инвентаря.
 */
export const ItemStack = defineComponent<ItemStackData>('ItemStack');

export interface ItemStackData {
  itemId: string;          // ID предмета (stone_slabs, ferrite_ore, resonit, ...)
  count: number;           // количество в стаке
  maxCount: number;        // максимум в стаке (зависит от предмета)
  quality?: number;        // качество/прочность (0..1, для инструментов и оборудования)
  tags: string[];          // теги (ore, building_material, food, tool, device, ...)
}

/**
 * Инвентарь сущности (игрок, хранилище, дрон, верстак).
 * Слотовая система: каждый индекс в массиве — отдельная ячейка.
 */
export const Inventory = defineComponent<InventoryData>('Inventory');

export interface InventoryData {
  slots: (ItemStackData | null)[]; // ячейки, null = пустая
  maxSlots: number;                // размер инвентаря
  maxWeight: number;               // максимальный переносимый вес (кг)
  currentWeight: number;           // текущий вес (вычисляется системами)
}

/**
 * Экипировка персонажа (отдельные слоты для одежды и инструментов).
 */
export const Equipment = defineComponent<EquipmentData>('Equipment');

export interface EquipmentData {
  head: ItemStackData | null;
  chest: ItemStackData | null;
  hands: ItemStackData | null;
  legs: ItemStackData | null;
  tool: ItemStackData | null;    // активный инструмент добычи
  backpack: ItemStackData | null; // бонус к maxSlots / maxWeight
}

/**
 * Чертеж/технология, открытый игроком.
 */
export const UnlockedBlueprint = defineComponent<UnlockedBlueprintData>('UnlockedBlueprint');

export interface UnlockedBlueprintData {
  blueprintId: string;
  unlockedAt: number;
}

/**
 * Очередь крафта — рецепт в процессе изготовления.
 */
export const CraftingQueue = defineComponent<CraftingQueueData>('CraftingQueue');

export interface CraftingQueueData {
  recipeId: string;
  progress: number;      // 0 … 1
  startTime: number;
  stationEntity: number | null;
}

/**
 * Рецепт крафта (данные, регистрируются плагинами предметов).
 */
export const CraftingRecipe = defineComponent<CraftingRecipeData>('CraftingRecipe');

export interface CraftingRecipeData {
  id: string;
  name: string;
  description: string;
  inputs: Array<{ itemId: string; count: number }>;
  energyCost: number;    // затрата энергии на крафт (ЕД)
  craftTime: number;     // время крафта (секунды)
  outputs: Array<{ itemId: string; count: number }>;
  unlockBlueprints: string[]; // необходимые чертежи
  unlockTechnologies: string[]; // необходимые технологии
  station?: string;      // требуемая станция крафта
  tags: string[];        // теги рецепта (building, device, tool, ...)
}

/**
 * Предопределённые максимальные размеры стаков по типам предметов.
 */
export const StackLimits: Record<string, number> = {
  default: 64,
  ore: 256,
  building_material: 128,
  tool: 1,
  device: 1,
  food: 64,
  fragment: 16,
};
