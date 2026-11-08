import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Фазы Гравитационного Прилива.
 */
export type TidePhase = 'stability' | 'warning' | 'catastrophe' | 'aftermath';

/**
 * Глобальное состояние прилива — хранится на одной служебной сущности «мировой конфиг».
 */
export const TideState = defineComponent<TideStateData>('TideState');

export interface TideStateData {
  phase: TidePhase;
  phaseTimer: number;      // секунд в текущей фазе
  phaseDuration: number;   // запланированная длительность текущей фазы
  cycleCount: number;      // сколько полных циклов приливов уже произошло
  globalGravityVector: Vec2;
  nextGravityVector: Vec2; // вектор, который установится в фазе 3
  isSaveLocked: boolean;   // сохранение заблокировано (фаза 3)
  warningSignal: boolean;  // сигнал сканера активен (фаза 2)
}

/**
 * Конфигурация цикла прилива (баланс).
 */
export const TideConfig = {
  stabilityDuration: { min: 20, max: 25 },        // 20–25 сек
  warningDuration: { min: 6, max: 6 },            // 6 сек
  catastropheDuration: { min: 15, max: 15 },      // 15 сек
  aftermathDuration: { min: 5, max: 5 },          // 5 сек
  gravityChangeDamagePerSecond: 0.4,              // урон целостности в сек без защиты
  anomalySpawnChance: 0.3,                        // шанс спавна аномалии за прилив
};

/**
 * Опасная аномальная зона, созданная приливом.
 * Навешивается на сущность зоны вместе с Transform и GravityZone.
 */
export const AnomalyZone = defineComponent<AnomalyZoneData>('AnomalyZone');

export type AnomalyType = 'zero_gravity' | 'inverted_gravity' | 'gravity_vortex' | 'crush_zone';

export interface AnomalyZoneData {
  id: string;
  type: AnomalyType;
  position: Vec2;
  radius: number;
  strength: number;
  spawnedAt: number;
  expiresAt: number | null; // null = постоянная до следующего прилива
}

/**
 * Предстоящая мутация мира (фаза 4).
 * Описывает одно изменение карты, которое WorldMutationSystem применит.
 */
export const WorldMutation = defineComponent<WorldMutationData>('WorldMutation');

export type MutationType =
  | 'spawn_ore_vein'
  | 'open_cave_passage'
  | 'shift_floating_island'
  | 'expose_complex'
  | 'spawn_anomaly_zone';

export interface WorldMutationData {
  id: string;
  type: MutationType;
  chunkX: number;
  chunkY: number;
  position?: Vec2;        // центр мутации в мировых координатах
  radius?: number;        // радиус воздействия (пиксели)
  resourceType?: string;  // для spawn_ore_vein
  veinSize?: number;      // для spawn_ore_vein
  tiles?: Array<{ x: number; y: number; type: string }>; // для open_cave_passage / expose_complex
  newChunkX?: number;     // для shift_floating_island
  newChunkY?: number;     // для shift_floating_island
  applied: boolean;       // применена ли мутация
}

/**
 * Маркер мутированного тайла — отслеживает изменённые тайлы для сохранения.
 */
export const MutationMarker = defineComponent<MutationMarkerData>('MutationMarker');

export interface MutationMarkerData {
  chunkX: number;
  chunkY: number;
  tileX: number;
  tileY: number;
  oldType: string;
  newType: string;
  mutatedAt: number;
}

/**
 * Энергетический купол — защита от смены гравитации в фазе 3.
 * Навешивается на постройку-устройство (купол/стабилизатор).
 */
export const EnergyDome = defineComponent<EnergyDomeData>('EnergyDome');

export interface EnergyDomeData {
  active: boolean;
  radius: number;                 // радиус защиты (пиксели)
  energyPerSecond: number;        // базовое потребление энергии/сек
  energyDrainPerStructure: number; // доп. потребление на каждую защищённую постройку/сек
  storedEnergy: number;           // текущая энергия купола
  maxStored: number;              // максимум энергии купола
  protectedEntities: number[];    // ID под защитой построек
}
