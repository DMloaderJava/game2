import { defineComponent } from '../ecs/component';

/** Физическое тело Matter.js, привязанное к сущности. */
export const PhysicsBody = defineComponent<PhysicsBodyData>('PhysicsBody');

export interface PhysicsBodyData {
  /** Ссылка на Matter.Body (хранится в PhysicsService). */
  body: unknown;
  /** Множитель гравитации для этого тела (1.0 = обычное, 0 = невесомость, <0 = антигравитация). */
  gravityScale: number;
  /** Тело спит и не участвует в симуляции, пока не будет разбужено. */
  isSleeping: boolean;
}
