import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

export type BiomeType = 'surface' | 'caves' | 'complex' | 'floating_islands' | 'anomaly';
export type WorldLayer = 'surface' | 'underground' | 'space';

export type TileType =
  | 'air'
  | 'dirt'
  | 'stone'
  | 'ferrite_ore'
  | 'resonit_ore'
  | 'biovolume'
  | 'biogel'
  | 'ancient_fragment'
  | 'construction'
  | 'debris';

export interface TileData {
  x: number;
  y: number;
  type: TileType;
  hardness: number;
  health: number;
  maxHealth: number;
  supportRequired: boolean;
  fallWhenUnsupported: boolean;
  resourceDrop: string | null;
  dropAmount: number;
  biome: BiomeType;
}

export const Chunk = defineComponent<ChunkData>('Chunk');

export interface ChunkData {
  chunkX: number;
  chunkY: number;
  tileSize: number;
  width: number;
  height: number;
  tiles: TileData[];
  loaded: boolean;
  lastModified: number;
}

export const Biome = defineComponent<BiomeData>('Biome');

export interface BiomeData {
  id: string;
  type: BiomeType;
  layer: WorldLayer;
  radius: number;
  gravityVector: Vec2;
  gravityScale: number;
  resourceWeights: Record<string, number>;
  veinChance: number;
  veinSizeMin: number;
  veinSizeMax: number;
}

export const WorldLayerComp = defineComponent<WorldLayerData>('WorldLayer');

export interface WorldLayerData {
  layer: WorldLayer;
  depth: number;
  gravity: Vec2;
}

export const Biomes = {
  surface: (): BiomeData => ({
    id: 'surface',
    type: 'surface',
    layer: 'surface',
    radius: 0,
    gravityVector: new Vec2(0, 9.81 * 60),
    gravityScale: 1.0,
    resourceWeights: { stone: 0.6, ferrite_ore: 0.1, resonit_ore: 0.0, biovolume: 0.4, biogel: 0.05, ancient_fragment: 0.01 },
    veinChance: 0.15,
    veinSizeMin: 3,
    veinSizeMax: 12,
  }),
  caves: (): BiomeData => ({
    id: 'caves',
    type: 'caves',
    layer: 'underground',
    radius: 0,
    gravityVector: new Vec2(0, 9.81 * 60),
    gravityScale: 1.0,
    resourceWeights: { stone: 0.5, ferrite_ore: 0.5, resonit_ore: 0.15, biovolume: 0.3, biogel: 0.25, ancient_fragment: 0.05 },
    veinChance: 0.35,
    veinSizeMin: 4,
    veinSizeMax: 20,
  }),
  complex: (): BiomeData => ({
    id: 'complex',
    type: 'complex',
    layer: 'underground',
    radius: 0,
    gravityVector: new Vec2(0, 9.81 * 60),
    gravityScale: 1.0,
    resourceWeights: { stone: 0.2, ferrite_ore: 0.2, resonit_ore: 0.05, biovolume: 0.0, biogel: 0.0, ancient_fragment: 0.8 },
    veinChance: 0.1,
    veinSizeMin: 2,
    veinSizeMax: 8,
  }),
  floating_islands: (): BiomeData => ({
    id: 'floating_islands',
    type: 'floating_islands',
    layer: 'space',
    radius: 0,
    gravityVector: new Vec2(0, 2.0 * 60),
    gravityScale: 0.3,
    resourceWeights: { stone: 0.4, ferrite_ore: 0.1, resonit_ore: 0.5, biovolume: 0.3, biogel: 0.05, ancient_fragment: 0.2 },
    veinChance: 0.25,
    veinSizeMin: 3,
    veinSizeMax: 15,
  }),
  anomaly: (): BiomeData => ({
    id: 'anomaly',
    type: 'anomaly',
    layer: 'space',
    radius: 400,
    gravityVector: new Vec2(0, 0),
    gravityScale: 0.0,
    resourceWeights: { stone: 0.1, ferrite_ore: 0.2, resonit_ore: 0.7, biovolume: 0.0, biogel: 0.5, ancient_fragment: 0.6 },
    veinChance: 0.5,
    veinSizeMin: 5,
    veinSizeMax: 25,
  }),
};

export const DEFAULT_CHUNK_CONFIG = { tileSize: 64, width: 16, height: 16 };
