import { defineComponent } from '../ecs/component';

export const MiningTool = defineComponent<MiningToolData>('MiningTool');

export type ToolType = 'stone_pickaxe' | 'iron_pickaxe' | 'laser_cutter' | 'hand_drill' | 'automatic_drill' | 'mining_drone';

export interface MiningToolData {
  type: ToolType;
  damage: number;
  speed: number;
  staminaCostPerSecond: number;
  energyCostPerSecond: number;
  fortune: number;
  materialEffectiveness: Record<string, number>;
  canMine: (tileType: string) => boolean;
}

export const Mineable = defineComponent<MineableData>('Mineable');

export interface MineableData {
  tileType: string;
  hardness: number;
  health: number;
  maxHealth: number;
  resourceDrop: string;
  dropAmount: number;
  defaultEffectiveness: Record<string, number>;
}

export const Deposit = defineComponent<DepositData>('Deposit');

export interface DepositData {
  id: string;
  resourceType: string;
  tiles: Array<{ x: number; y: number }>;
  health: number;
  exhausted: boolean;
}

export const Drill = defineComponent<DrillData>('Drill');

export interface DrillData {
  targetTileEntity: number | null;
  position: { x: number; y: number };
  dps: number;
  energyPerSecond: number;
  active: boolean;
  fuel: number;
}

export const Tools = {
  stone_pickaxe: (): MiningToolData => ({
    type: 'stone_pickaxe',
    damage: 15,
    speed: 2.0,
    staminaCostPerSecond: 3.0,
    energyCostPerSecond: 0.0,
    fortune: 1.0,
    materialEffectiveness: { dirt: 1.2, stone: 1.0, ferrite_ore: 0.8, resonit_ore: 0.5, biovolume: 1.5, biogel: 1.0, ancient_fragment: 0.6, construction: 0.4 },
    canMine: (tileType: string) => ['dirt', 'stone', 'ferrite_ore', 'biovolume', 'biogel', 'construction'].includes(tileType),
  }),
  iron_pickaxe: (): MiningToolData => ({
    type: 'iron_pickaxe',
    damage: 30,
    speed: 3.0,
    staminaCostPerSecond: 5.0,
    energyCostPerSecond: 0.0,
    fortune: 1.2,
    materialEffectiveness: { dirt: 1.5, stone: 1.4, ferrite_ore: 1.2, resonit_ore: 0.8, biovolume: 1.8, biogel: 1.2, ancient_fragment: 1.0, construction: 0.8 },
    canMine: () => true,
  }),
  laser_cutter: (): MiningToolData => ({
    type: 'laser_cutter',
    damage: 25,
    speed: 5.0,
    staminaCostPerSecond: 2.0,
    energyCostPerSecond: 8.0,
    fortune: 1.1,
    materialEffectiveness: { dirt: 0.6, stone: 0.8, ferrite_ore: 1.0, resonit_ore: 2.0, biovolume: 0.4, biogel: 0.5, ancient_fragment: 1.5, construction: 1.2 },
    canMine: () => true,
  }),
  hand_drill: (): MiningToolData => ({
    type: 'hand_drill',
    damage: 10,
    speed: 1.5,
    staminaCostPerSecond: 4.0,
    energyCostPerSecond: 2.0,
    fortune: 1.0,
    materialEffectiveness: { dirt: 1.3, stone: 0.7, ferrite_ore: 0.6, resonit_ore: 0.4, biovolume: 1.6, biogel: 1.1, ancient_fragment: 0.5, construction: 0.3 },
    canMine: (tileType: string) => ['dirt', 'stone', 'biovolume', 'biogel'].includes(tileType),
  }),
  automatic_drill: (): MiningToolData => ({
    type: 'automatic_drill',
    damage: 50,
    speed: 1.0,
    staminaCostPerSecond: 0.0,
    energyCostPerSecond: 15.0,
    fortune: 1.3,
    materialEffectiveness: { dirt: 1.0, stone: 1.0, ferrite_ore: 1.0, resonit_ore: 1.0, biovolume: 1.0, biogel: 1.0, ancient_fragment: 1.0, construction: 1.0 },
    canMine: () => true,
  }),
  mining_drone: (): MiningToolData => ({
    type: 'mining_drone',
    damage: 35,
    speed: 3.0,
    staminaCostPerSecond: 0.0,
    energyCostPerSecond: 10.0,
    fortune: 1.2,
    materialEffectiveness: { dirt: 1.0, stone: 1.0, ferrite_ore: 1.0, resonit_ore: 1.0, biovolume: 1.0, biogel: 1.0, ancient_fragment: 1.0, construction: 1.0 },
    canMine: () => true,
  }),
};
