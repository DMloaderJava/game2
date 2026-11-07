import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

export const ItemStack = defineComponent<ItemStackData>('ItemStack');

export interface ItemStackData {
  itemId: string;
  count: number;
  maxCount: number;
  quality?: number;
  tags: string[];
}

export const Inventory = defineComponent<InventoryData>('Inventory');

export interface InventoryData {
  slots: (ItemStackData | null)[];
  maxSlots: number;
  maxWeight: number;
  currentWeight: number;
  open: boolean;
}

export const Equipment = defineComponent<EquipmentData>('Equipment');

export interface EquipmentData {
  head: ItemStackData | null;
  chest: ItemStackData | null;
  hands: ItemStackData | null;
  legs: ItemStackData | null;
  tool: ItemStackData | null;
  backpack: ItemStackData | null;
}

export const UnlockedBlueprint = defineComponent<UnlockedBlueprintData>('UnlockedBlueprint');

export interface UnlockedBlueprintData {
  blueprintId: string;
  unlockedAt: number;
}

export const CraftingQueue = defineComponent<CraftingQueueData>('CraftingQueue');

export interface CraftingQueueData {
  recipeId: string;
  progress: number;
  startTime: number;
  stationEntity: number | null;
}

export const CraftingRecipe = defineComponent<CraftingRecipeData>('CraftingRecipe');

export interface CraftingRecipeData {
  id: string;
  name: string;
  description: string;
  inputs: Array<{ itemId: string; count: number }>;
  energyCost: number;
  craftTime: number;
  outputs: Array<{ itemId: string; count: number }>;
  unlockBlueprints: string[];
  unlockTechnologies: string[];
  station?: string;
  tags: string[];
}

export const StackLimits: Record<string, number> = {
  default: 64,
  ore: 256,
  building_material: 128,
  tool: 1,
  device: 1,
  food: 64,
  fragment: 16,
};
