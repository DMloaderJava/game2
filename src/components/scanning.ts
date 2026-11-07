import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Знание, полученное при сканировании объекта мира.
 */
export const ScanKnowledge = defineComponent<ScanKnowledgeData>('ScanKnowledge');

export interface ScanKnowledgeData {
  entityId: number;       // сущность, которую сканировали
  scanType: string;       // тип сканированного объекта (creature, ruin, anomaly, ore, ...)
  scanData: Record<string, unknown>; // свойства объекта (масса, тип гравитации и т.д.)
  scannedAt: number;
}

/**
 * Био-образец — получен при сканировании существа. Используется для ветки Биология.
 */
export const BioSample = defineComponent<BioSampleData>('BioSample');

export interface BioSampleData {
  speciesId: string;
  speciesName: string;
  properties: Record<string, number>; // 속ности существа (скорость, урон, гравиторезист и т.д.)
  quantity: number;
}

/**
 * Знание о Древнем фрагменте — получено при сканировании руин. Ветка Технологии.
 */
export const AncientFragmentKnowledge = defineComponent<AncientFragmentKnowledgeData>('AncientFragmentKnowledge');

export interface AncientFragmentKnowledgeData {
  fragmentId: string;
  technologyType: string; // gravity, movement, energy, biology, technology
  quantity: number;
}

/**
 * Сканер — устройство для сканирования мира (ручной или установленный).
 */
export const Scanner = defineComponent<ScannerData>('Scanner');

export interface ScannerData {
  scanRadius: number;     // радиус сканирования (пиксели)
  energyCostPerScan: number; // затрата энергии за сканирование
  scanCooldown: number;   // коундаун между сканированиями
  cooldownRemaining: number;
  active: boolean;
}
