import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { RenderService } from '../services/render-service';
import { Transform } from '../components/transform';
import { Renderable } from '../components/renderable';

/**
 * RenderSystem — отрисовка PixiJS. ТОЛЬКО ЧТЕНИЕ компонентов.
 * Не меняет игровую логику. Слои, камера, каллинг, батчинг — в RenderService.
 */
export class RenderSystem extends System {
  readonly priority = 90;
  readonly required = [Transform, Renderable];

  constructor(private render: RenderService) {
    super();
  }

  update(world: World, dt: number): void {
    // Интерполяцию передаёт игровой цикл через draw(); здесь dt не нужен.
    this.draw(world, 0);
  }

  /** Отрисовать кадр с интерполяцией alpha в [0, 1] между фиксированными шагами физики. */
  draw(world: World, alpha: number): void {
    const entities = world.query(Transform, Renderable);

    // Сортировка по слоям для правильного наложения
    entities.sort((a, b) => {
      const la = (a.components[1] as { layer: number }).layer;
      const lb = (b.components[1] as { layer: number }).layer;
      return la - lb;
    });

    for (const { entity, components } of entities) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const renderable = components[1] as { texture: string; tint: number; visible: boolean };

      if (!renderable.visible) continue;
      // render.updateSprite(entity, transform.x, transform.y, transform.rotation);
    }
  }
}
