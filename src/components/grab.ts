import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Персонаж держит объект. Находится на сущности персонажа.
 */
export const Grabbing = defineComponent<GrabbingData>('Grabbing');

export interface GrabbingData {
  /** Сущность объекта в руках. */
  targetEntity: number;
  /** Смещение объекта относительно центра персонажа. */
  offset: Vec2;
  /** Масса объекта на момент захвата. */
  mass: number;
  /** Время захвата. */
  grabbedAt: number;
}

/**
 * Объект удерживается персонажем. Находится на сущности объекта.
 * Тело становится kinematic и следует за рукой персонажа.
 */
export const Grabbed = defineComponent<GrabbedData>('Grabbed');

export interface GrabbedData {
  /** Сущность персонажа, держащего объект. */
  holderEntity: number;
}

/**
 * Объект слишком тяжёл для переноса, но может толкаться.
 * Находится на сущности объекта.
 */
export const Pushable = defineComponent<PushableData>('Pushable');

export interface PushableData {
  /** Минимальная сила персонажа для толкания (кг эквивалент). */
  minPushMass: number;
  /** Текущий толкающий персонаж (если есть). */
  pusherEntity: number | null;
}
