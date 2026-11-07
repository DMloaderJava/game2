import { defineComponent } from '../ecs/component';

/** Позиция, вращение и масштаб сущности в мире. */
export const Transform = defineComponent<TransformData>('Transform');

export interface TransformData {
  x: number;
  y: number;
  rotation: number; // радианы
  scaleX: number;
  scaleY: number;
}
