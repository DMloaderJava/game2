import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Типы биомов / территорий мира.
 */
export type BiomeType =
  | 'surface'
  | 'caves'
  | 'complex'
  | 'floating_islands'
  | 'anomaly';

/**
 * Слои мира (вертикальное деление территории).
 */
export type WorldLayer = 'surface' | 'underground' | 'space';

/**
 * Типы тайлов в чанковой сетке.
 */
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

/**
 * Данные одного тайла в чанке.
 * Хранятся плоскими массивами внутри Chunk (не как отдельные ECS-сущности),
 * чтобы разрушение тысяч тайлов не раздувало мир.
 */
export interface TileData {
  x: number; // тайловая координата внутри чанка
  y: number;
  type: TileType;
  /** Прочность тайла (сопротивление добыче, 1.0 … 20.0). */
  hardness: number;
  /** Текущее здоровье тайла. При 0 — тайл разрушается. */
  health: number;
  maxHealth: number;
  /** Требует ли тайл опоры снизу (для физики осыпания). */
  supportRequired: boolean;
  /** При потере опоры тайл падает как физический обломок. */
  fallWhenUnsupported: boolean;
  /** Какой предмет-ресурс спавнится при разрушении. */
  resourceDrop: string | null;
  /** Количество dropped items. */
  dropAmount: number;
  /** Биом, к которому относится тайл (для генерации и визуализации). */
  biome: BiomeType;
}

/**
 * Чанк мира — фиксированная сетка тайлов (например, 32×32).
 * Чанк — это ECS-сущность, которую можно загружать/выгружать.
 */
export const Chunk = defineComponent<ChunkData>('Chunk');

export interface ChunkData {
  chunkX: number; // индекс чанка по X
  chunkY: number; // индекс чанка по Y
  tileSize: number; // размер одного тайла в пикселях
  width: number; // тайлов по X (например, 32)
  height: number; // тайлов по Y (например, 32)
  /** Плоский массив тайлов: индекс = y * width + x. */
  tiles: TileData[];
  loaded: boolean;
  /** Время последнего обновления чанка (для автосохранения). */
  lastModified: number;
}

/**
 * Биом — область мира с набором правил генерации ресурсов и гравитации.
 * Навешивается на сущность биома вместе с Transform (позиция + радиус области).
 */
export const Biome = defineComponent<BiomeData>('Biome');

export interface BiomeData {
  id: string;
  type: BiomeType;
  layer: WorldLayer;
  /** Радиус области действия биома (для круглых биомов). */
  radius: number;
  /** Гравитация внутри биома (переопределяет глобальную). */
  gravityVector: Vec2;
  gravityScale: number;
  /** Таблица распределения ресурсов: тип ресурса → вес (0.0 … 1.0). */
  resourceWeights: Record<string, number>;
  /** Вероятность образования жилы ресурса на чанк. */
  veinChance: number;
  /** Минимальный и максимальный размер жилы. */
  veinSizeMin: number;
  veinSizeMax: number;
}

/**
 * Слой мира — поверхность, подземное пространство, космос.
 * Влияет на доступность ресурсов и освещение.
 */
export const WorldLayerComp = defineComponent<WorldLayerData>('WorldLayer');

export interface WorldLayerData {
  layer: WorldLayer;
  /** Глубина от поверхности (для underground). */
  depth: number;
  /** Базовый вектор гравитации слоя. */
  gravity: Vec2;
}

/**
 * Предопределённые биомы для генерации мира.
 */
export const Biomes = {
  surface: (): BiomeData => ({
    id: 'surface',
    type: 'surface',
    layer: 'surface',
    radius: 0,
    gravityVector: new Vec2(0, 9.81),
    gravityScale: 1.0,
    resourceWeights: {
      stone: 0.6,
      ferrite_ore: 0.1,
      resonit_ore: 0.0,
      biovolume: 0.4,
      biogel: 0.05,
      ancient_fragment: 0.01,
    },
    veinChance: 0.15,
    veinSizeMin: 3,
    veinSizeMax: 12,
  }),
  caves: (): BiomeData => ({
    id: 'caves',
    type: 'caves',
    layer: 'underground',
    radius: 0,
    gravityVector: new Vec2(0, 9.81),
    gravityScale: 1.0,
    resourceWeights: {
      stone: 0.5,
      ferrite_ore: 0.5,
      resonit_ore: 0.15,
      biovolume: 0.3,
      biogel: 0.25,
      ancient_fragment: 0.05,
    },
    veinChance: 0.35,
    veinSizeMin: 4,
    veinSizeMax: 20,
  }),
  complex: (): BiomeData => ({
    id: 'complex',
    type: 'complex',
    layer: 'underground',
    radius: 0,
    gravityVector: new Vec2(0, 9.81),
    gravityScale: 1.0,
    resourceWeights: {
      stone: 0.2,
      ferrite_ore: 0.2,
      resonit_ore: 0.05,
      biovolume: 0.0,
      biogel: 0.0,
      ancient_fragment: 0.8,
    },
    veinChance: 0.1,
    veinSizeMin: 2,
    veinSizeMax: 8,
  }),
  floating_islands: (): BiomeData => ({
    id: 'floating_islands',
    type: 'floating_islands',
    layer: 'space',
    radius: 0,
    gravityVector: new Vec2(0, 2.0),
    gravityScale: 0.3,
    resourceWeights: {
      stone: 0.4,
      ferrite_ore: 0.1,
      resonit_ore: 0.5,
      biovolume: 0.3,
      biogel: 0.05,
      ancient_fragment: 0.2,
    },
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
    resourceWeights: {
      stone: 0.1,
      ferrite_ore: 0.2,
      resonit_ore: 0.7,
      biovolume: 0.0,
      biogel: 0.5,
      ancient_fragment: 0.6,
    },
    veinChance: 0.5,
    veinSizeMin: 5,
    veinSizeMax: 25,
  }),
};

/** Конфигурация чанка по умолчанию. */
export const DEFAULT_CHUNK_CONFIG = {
  tileSize: 32,
  width: 32,
  height: 32,
};
