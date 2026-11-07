import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Состояние контроллера персонажа. Стейт-машина управляется CharacterSystem.
 */
export const CharacterController = defineComponent<CharacterControllerData>('CharacterController');

export type CharacterState =
  | 'Grounded'
  | 'Airborne'
  | 'Climbing'
  | 'Carrying'
  | 'ZeroG'
  | 'Pushing'
  | 'Dead';

export interface CharacterControllerData {
  state: CharacterState;
  previousState: CharacterState;
  /** Время в текущем состоянии (секунды). */
  stateTime: number;
  /** Направление движения ввода (-1..1 по X и Y). */
  inputDirection: Vec2;
  /** Бег зажат. */
  isSprinting: boolean;
  /** Нажата кнопка прыжка в этом кадре. */
  jumpPressed: boolean;
  /** Нажата кнопка взаимодействия/захвата. */
  interactPressed: boolean;
  /** Нажата кнопка копания. */
  digPressed: boolean;
  /** Нажата кнопка сканирования. */
  scanPressed: boolean;
  /** Граница касания поверхности (нормаль поверхности под ногами). */
  groundNormal: Vec2 | null;
  /** Сущность поверхности, которой касается персонаж. */
  groundEntity: number | null;
  /** Сущность, которую тащит/толкает персонаж (если есть). */
  carriedEntity: number | null;
  /** Максимальная масса для переноса (кг). */
  maxCarryMass: number;
  /** Радиус досягаемости для захвата. */
  grabRadius: number;
  /** Текущая сила прыжка (м/с). */
  jumpForce: number;
  /** Базовая скорость перемещения (ед./сек). */
  moveSpeed: number;
  /** Множитель бега. */
  sprintMultiplier: number;
  /** Может ли персонаж двойной прыжок. */
  canDoubleJump: boolean;
  /** Использован ли двойной прыжок в текущем полёте. */
  hasDoubleJumped: boolean;
}

/** Маркер смерти. */
export const Dead = defineComponent<DeadData>('Dead');

export interface DeadData {
  time: number; // timestamp смерти
  mode: 'softcore' | 'hardcore';
  /** Позиция смерти (для дропа инвентаря и возможного возврата). */
  deathPosition: Vec2;
}

/** Точка возрождения / спавн. */
export const RespawnPoint = defineComponent<RespawnPointData>('RespawnPoint');

export interface RespawnPointData {
  position: Vec2;
  /** Является ли точка активным спавном (последняя кровать/база). */
  active: boolean;
}

/**
 * Параметры выживания персонажа. Управляются StaminaEnergySystem и DeathSystem.
 */
export const CharacterStats = defineComponent<CharacterStatsData>('CharacterStats');

export interface CharacterStatsData {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  energy: number;
  maxEnergy: number;
  equipmentCondition: number; // 0..1
  /** Штраф к скорости при wounded/critical (0..1, 1 = без штрафа). */
  speedPenalty: number;
  /** Блокировка бега/прыжка при exhausted. */
  exhausted: boolean;
  /** Последний время приёма пищи/стимулятора. */
  lastMealTime: number | null;
}
