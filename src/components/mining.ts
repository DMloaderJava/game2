import { defineComponent } from '../ecs/component';

/**
 * Инструмент добычи. Навешивается на сущность предмета в инвентаре
 * или на постройку (автоматическийбур).
 */
export const MiningTool = defineComponent<MiningToolData>('MiningTool');

export type ToolType =
  | 'stone_pickaxe'
  | 'iron_pickaxe'
  | 'laser_cutter'
  | 'hand_drill'
  | 'automatic_drill'
  | 'mining_drone';

export interface MiningToolData {
  type: ToolType;
  /** Базовый урон по тайлу за удар. */
  damage: number;
  /** Скорость работы (ударов в секунду). */
  speed: number;
  /** Расход выносливости в секунду. */
  staminaCostPerSecond: number;
  /** Расход энергии в секунду. */
  energyCostPerSecond: number;
  /** Фортуна — множитель количества dropped ресурсов (1.0 … 2.0). */
  fortune: number;
  /** Эффективность по материалам: тип тайла → множитель урона. */
  materialEffectiveness: Record<string, number>;
  /** Может ли инструмент добывать этот тип тайла (иначе урон = 0). */
  canMine: (tileType: string) => boolean;
}

/**
 * Маркер: сущность может быть добыта (имеет прочность, дропает ресурс).
 * Навешивается на тайлы-сущности или объекты мира.
 */
export const Mineable = defineComponent<MineableData>('Mineable');

export interface MineableData {
  tileType: string;
  hardness: number;
  health: number;
  maxHealth: number;
  resourceDrop: string;
  dropAmount: number;
  /** Эффективность инструментов по умолчанию (может переопределяться). */
  defaultEffectiveness: Record<string, number>;
}

/**
 * Месторождение ресурса — кластер связанных тайлов одного типа.
 * Навешивается на чанк при генерации.
 */
export const Deposit = defineComponent<DepositData>('Deposit');

export interface DepositData {
  id: string;
  resourceType: string;
  /** Тайлы месторождения (локальные координаты внутри чанка). */
  tiles: Array<{ x: number; y: number }>;
  /** Оставшееся здоровье месторождения (суммарное по всем тайлам). */
  health: number;
  exhausted: boolean;
}

/**
 * Автоматический бур / буровая установка.
 * Постоянно наносит урон по тайлу под собой, требует энергии/топлива.
 */
export const Drill = defineComponent<DrillData>('Drill');

export interface DrillData {
  /** Сущность целевого тайла (если тайл выделен как отдельная сущность). */
  targetTileEntity: number | null;
  /** Позиция буря в мировых координатах. */
  position: { x: number; y: number };
  /** Урон в секунду. */
  dps: number;
  /** Расход энергии в секунду. */
  energyPerSecond: number;
  active: boolean;
  fuel: number;
}

/** Предопределённые инструменты добычи. */
export const Tools = {
  stone_pickaxe: (): MiningToolData => ({
    type: 'stone_pickaxe',
    damage: 5,
    speed: 2.0,
    staminaCostPerSecond: 3.0,
    energyCostPerSecond: 0.0,
    fortune: 1.0,
    materialEffectiveness: {
      dirt: 1.2,
      stone: 1.0,
      ferrite_ore: 0.8,
      resonit_ore: 0.5,
      biovolume: 1.5,
      biogel: 1.0,
      ancient_fragment: 0.6,
      construction: 0.4,
    },
    canMine: (tileType: string) =>
      ['dirt', 'stone', 'ferrite_ore', 'biovolume', 'biogel', 'construction'].includes(tileType),
  }),
  iron_pickaxe: (): MiningToolData => ({
    type: 'iron_pickaxe',
    damage: 12,
    speed: 3.0,
    staminaCostPerSecond: 5.0,
    energyCostPerSecond: 0.0,
    fortune: 1.2,
    materialEffectiveness: {
      dirt: 1.5,
      stone: 1.4,
      ferrite_ore: 1.2,
      resonit_ore: 0.8,
      biovolume: 1.8,
      biogel: 1.2,
      ancient_fragment: 1.0,
      construction: 0.8,
    },
    canMine: () => true,
  }),
  laser_cutter: (): MiningToolData => ({
    type: 'laser_cutter',
    damage: 8,
    speed: 5.0,
    staminaCostPerSecond: 2.0,
    energyCostPerSecond: 8.0,
    fortune: 1.1,
    materialEffectiveness: {
      dirt: 0.6,
      stone: 0.8,
      ferrite_ore: 1.0,
      resonit_ore: 2.0,
      biovolume: 0.4,
      biogel: 0.5,
      ancient_fragment: 1.5,
      construction: 1.2,
    },
    canMine: () => true,
  }),
  hand_drill: (): MiningToolData => ({
    type: 'hand_drill',
    damage: 3,
    speed: 1.5,
    staminaCostPerSecond: 4.0,
    energyCostPerSecond: 2.0,
    fortune: 1.0,
    materialEffectiveness: {
      dirt: 1.3,
      stone: 0.7,
      ferrite_ore: 0.6,
      resonit_ore: 0.4,
      biovolume: 1.6,
      biogel: 1.1,
      ancient_fragment: 0.5,
      construction: 0.3,
    },
    canMine: (tileType: string) => ['dirt', 'stone', 'biovolume', 'biogel'].includes(tileType),
  }),
  automatic_drill: (): MiningToolData => ({
    type: 'automatic_drill',
    damage: 25,
    speed: 1.0,
    staminaCostPerSecond: 0.0,
    energyCostPerSecond: 15.0,
    fortune: 1.3,
    materialEffectiveness: {
      dirt: 1.0,
      stone: 1.0,
      ferrite_ore: 1.0,
      resonit_ore: 1.0,
      biovolume: 1.0,
      biogel: 1.0,
      ancient_fragment: 1.0,
      construction: 1.0,
    },
    canMine: () => true,
  }),
  mining_drone: (): MiningToolData => ({
    type: 'mining_drone',
    damage: 15,
    speed: 3.0,
    staminaCostPerSecond: 0.0,
    energyCostPerSecond: 10.0,
    fortune: 1.2,
    materialEffectiveness: {
      dirt: 1.0,
      stone: 1.0,
      ferrite_ore: 1.0,
      resonit_ore: 1.0,
      biovolume: 1.0,
      biogel: 1.0,
      ancient_fragment: 1.0,
      construction: 1.0,
    },
    canMine: () => true,
  }),
};
