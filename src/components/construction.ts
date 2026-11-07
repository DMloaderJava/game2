import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Построечный элемент (стена, фундамент, потолок, дверь и т.д.).
 * Навешивается на сущность постройки.
 */
export const Structure = defineComponent<StructureData>('Structure');

export type StructureType =
  | 'foundation'
  | 'wall'
  | 'ceiling'
  | 'door'
  | 'ladder'
  | 'platform'
  | 'storage'
  | 'protection'
  | 'cable';

export interface StructureData {
  type: StructureType;
  /** Требует ли элемент опоры снизу (стены, потолки — да, фундамент — нет). */
  requiresSupport: boolean;
  /** Может ли элемент служить опорой для других. */
  canSupport: boolean;
  /** Масса элемента (кг). */
  mass: number;
  /** Прочность (порог импульса разрушения). */
  strength: number;
  /** Текущая целостность 0.0 … 1.0. */
  integrity: number;
  /** Глобальный ID элемента в графе связей постройки. */
  structureId: string;
}

/**
 * Размещаемый объект (призрачное превью перед постройкой).
 * Навешивается на сущность-курсор во время режима строительства.
 */
export const Buildable = defineComponent<BuildableData>('Buildable');

export interface BuildableData {
  structureType: StructureType;
  /** Режим размещения: 'grid' (снап по сетке) или 'free' (свободный). */
  placementMode: 'grid' | 'free';
  /** Размер элемента в тайлах (для grid-режима). */
  tileSize: number;
  /** Требуемая опора снизу. */
  requiresSupport: boolean;
  /** Ресурсы для постройки. */
  cost: Array<{ itemId: string; count: number }>;
  /** Валидно ли текущее место размещения. */
  isValid: boolean;
  /** Мировая позиция размещения. */
  position: Vec2;
}

/**
 * Сетка размещения (Grid Snap) — привязка построек к тайловой сетке чанков.
 */
export const SnapGrid = defineComponent<SnapGridData>('SnapGrid');

export interface SnapGridData {
  cellSize: number; // размер клетки в пикселях (обычно размер тайла чанка)
  origin: Vec2;     // начало сетки в мировых координатах
}

/**
 * Структурная целостность постройки — цепочка соединений до опоры.
 */
export const StructuralIntegrity = defineComponent<StructuralIntegrityData>('StructuralIntegrity');

export interface StructuralIntegrityData {
  integrity: number;        // 0.0 … 1.0 (1.0 = целая)
  anchored: boolean;        // закреплена ли на фундаменте с Гравитационным Якорем
  supportedBy: number[];    // ID сущностей-опор
  supports: number[];       // ID сущностей, которые эта постройка держит
  lastChecked: number;      // время последней проверки целостности
}

/**
 * Гравитационный якорь — удерживает постройки и объекты при смене гравитации.
 * Навешивается на фундамент или отдельное устройство-якорь.
 */
export const GravityAnchor = defineComponent<GravityAnchorData>('GravityAnchor');

export interface GravityAnchorData {
  active: boolean;
  /** Радиус действия якоря (в пикселях). */
  radius: number;
  /** Потребление энергии в секунду. */
  energyPerSecond: number;
  /** Сущности, удерживаемые этим якорем. */
  anchoredEntities: number[];
}

/**
 * Призрачное превью постройки (отображается под курсором).
 */
export const GhostPreview = defineComponent<GhostPreviewData>('GhostPreview');

export interface GhostPreviewData {
  structureType: StructureType;
  position: Vec2;
  valid: boolean; // зелёный — можно ставить, красный — нельзя
  color: number;  // 0xRRGGBB
}

/** Предопределённые параметры строительных элементов. */
export const StructureTemplates: Record<StructureType, Partial<StructureData>> = {
  foundation: {
    type: 'foundation',
    requiresSupport: false,
    canSupport: true,
    mass: 50,
    strength: 10000,
    integrity: 1,
  },
  wall: {
    type: 'wall',
    requiresSupport: true,
    canSupport: true,
    mass: 30,
    strength: 6000,
    integrity: 1,
  },
  ceiling: {
    type: 'ceiling',
    requiresSupport: true,
    canSupport: true,
    mass: 40,
    strength: 8000,
    integrity: 1,
  },
  door: {
    type: 'door',
    requiresSupport: true,
    canSupport: false,
    mass: 20,
    strength: 4000,
    integrity: 1,
  },
  ladder: {
    type: 'ladder',
    requiresSupport: true,
    canSupport: false,
    mass: 15,
    strength: 3000,
    integrity: 1,
  },
  platform: {
    type: 'platform',
    requiresSupport: true,
    canSupport: true,
    mass: 35,
    strength: 7000,
    integrity: 1,
  },
  storage: {
    type: 'storage',
    requiresSupport: true,
    canSupport: false,
    mass: 60,
    strength: 5000,
    integrity: 1,
  },
  protection: {
    type: 'protection',
    requiresSupport: true,
    canSupport: false,
    mass: 45,
    strength: 12000,
    integrity: 1,
  },
  cable: {
    type: 'cable',
    requiresSupport: false,
    canSupport: false,
    mass: 1,
    strength: 500,
    integrity: 1,
  },
};
