import { defineComponent } from '../ecs/component';

/** Данные отрисовки PixiJS: текстура, цвет, слой. */
export const Renderable = defineComponent<RenderableData>('Renderable');

export interface RenderableData {
  texture: string; // ключ текстуры в RenderService
  tint: number; // 0xRRGGBB
  alpha: number;
  visible: boolean;
  layer: number; // слой отрисовки: 0 фон, 10 мир, 20 частицы, 30 UI
}
