import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Глобальная гравитация мира. Является синглетоном — достаточно одного
 * экземпляра в мире (обычно на служебной сущности "world-settings").
 */
export const GlobalGravity = defineComponent<GlobalGravityData>('GlobalGravity');

export interface GlobalGravityData {
  /** Базовый вектор гравитации мира (по умолчанию {0, 9.81} — вниз). */
  vector: Vec2;
  /** Глобальный множитель силы (1.0 = нормальная гравитация, 0 = невесомость мира). */
  scale: number;
  /** Активна ли глобальная гравитация. */
  active: boolean;
}

/**
 * Локальная гравитационная зона (круг или AABB).
 * Навешивается на сущность зоны вместе с Transform (позиция = центр зоны).
 */
export const GravityZone = defineComponent<GravityZoneData>('GravityZone');

export type ZoneShape = 'circle' | 'aabb';
export type ZoneFalloff = 'none' | 'linear' | 'inverse-square';

export interface GravityZoneData {
  id: string;
  shape: ZoneShape;
  /** Для circle — радиус; для aabb — half-extents (полуширина/полувысота). */
  radius?: number;
  halfExtents?: Vec2;
  /** Вектор гравитации внутри зоны. */
  vector: Vec2;
  /** Множитель силы зоны (1.0 = полная сила, 0 = выключена). */
  strength: number;
  /** Тип затухания от центра/края зоны к её boundaries. */
  falloff: ZoneFalloff;
  /** Радиус ядра (для linear/inverse-square), внутри которого falloff = 1.0. */
  coreRadius?: number;
  active: boolean;
}

/**
 * Индивидуальная гравитация сущности (игрок, объект, существо).
 * Позволяет ходить по стенам/потолку, менять вес, полностью отключать гравитацию.
 */
export const IndividualGravity = defineComponent<IndividualGravityData>('IndividualGravity');

export interface IndividualGravityData {
  /** Множитель итогового вектора гравитации (0 = невесомость, 1 = норма, 2 = двойной вес). */
  scale: number;
  /** Если true — вектор override полностью заменяет вычисленную гравитацию. */
  useOverride: boolean;
  /** Переопределённый вектор (используется только если useOverride = true). */
  override?: Vec2;
  /** Угол "пола" сущности (радианы), используется для анимации и_side-коллизий. */
  orientation: number;
}

/**
 * Вычисленная эффективная гравитация для сущности.
 * Записывается GravitySystem, читается PhysicsSystem для приложения силы к телу.
 */
export const GravityForce = defineComponent<GravityForceData>('GravityForce');

export interface GravityForceData {
  /** Итоговый вектор ускорения гравитации (м/с² в игровых единицах). */
  vector: Vec2;
  /** Был ли пересчитан в этом кадре. */
  dirty: boolean;
}
