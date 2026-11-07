import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Технологическое устройство (генератор, турель, конвейер, сканер и т.д.).
 */
export const Device = defineComponent<DeviceData>('Device');

export type DeviceType =
  | 'energy_generator'
  | 'gravity_anchor'
  | 'stabilizer'
  | 'scanner'
  | 'drone'
  | 'turret'
  | 'conveyor'
  | 'elevator'
  | 'gravity_trap'
  | 'storage';

export interface DeviceData {
  type: DeviceType;
  active: boolean;
  /** Потребление энергии в секунду (0 для производителей). */
  energyConsumptionPerSecond: number;
  /** Производство энергии в секунду (0 для потребителей). */
  energyProductionPerSecond: number;
  /** Радиус связи с другими устройствами (в пикселях). */
  linkRadius: number;
  /** Связанные устройства (ID сущностей). */
  linkedEntities: number[];
}

/**
 * Узел энергетической сети. Устройства с энергией объединяются в сеть.
 */
export const EnergyNode = defineComponent<EnergyNodeData>('EnergyNode');

export interface EnergyNodeData {
  entity: number;
  type: 'producer' | 'consumer' | 'battery' | 'anchor';
  powerOutput: number;    // ЭД/сек (для производителей)
  powerConsumption: number; // ЭД/сек (для потребителей)
  storedEnergy: number;   // для батарей
  maxStored: number;      // для батарей
  connectedNodes: number[]; // ID связанных узлов
}

/**
 * Сетевой кабель — соединяет устройства для передачи энергии.
 */
export const EnergyCable = defineComponent<EnergyCableData>('EnergyCable');

export interface EnergyCableData {
  fromEntity: number;
  toEntity: number;
  active: boolean;
}

/**
 * Конвейер — транспортирует предметы между устройствами.
 */
export const Conveyor = defineComponent<ConveyorData>('Conveyor');

export interface ConveyorData {
  direction: Vec2; // направление транспортировки
  speed: number;   // предметов в секунду
  maxLoad: number; // максимальное количество предметов в пути
  currentLoad: number;
  targetEntity: number | null; // приёмник (хранилище, верстак и т.д.)
}

/**
 * Маршрут транспортировки предмета.
 */
export const ItemRoute = defineComponent<ItemRouteData>('ItemRoute');

export interface ItemRouteData {
  fromEntity: number;
  toEntity: number;
  itemId: string;
  maxRate: number; // предметов в секунду
  currentLoad: number;
}

/**
 * Производитель энергии (генератор).
 */
export const PowerProducer = defineComponent<PowerProducerData>('PowerProducer');

export interface PowerProducerData {
  fuelType: string | null; // тип топлива (biogel, coal, ...)
  fuelAmount: number;      // текущее топливо
  maxFuel: number;
  outputPerSecond: number;
}

/**
 * Потребитель энергии (турель, сканер, бур и т.д.).
 */
export const PowerConsumer = defineComponent<PowerConsumerData>('PowerConsumer');

export interface PowerConsumerData {
  priority: number; // приоритет отключения при дефиците (1 = первый выключается)
  requiredPerSecond: number;
  isOperational: boolean;
}

/**
 * Аккумулятор энергии.
 */
export const EnergyStorage = defineComponent<EnergyStorageData>('EnergyStorage');

export interface EnergyStorageData {
  capacity: number;
  stored: number;
  chargeRate: number;
  dischargeRate: number;
}
