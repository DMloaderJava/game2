import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { RenderService } from '../services/render-service';
import { Transform } from '../components/transform';
import { Renderable } from '../components/renderable';
import { PhysicsBody } from '../components/physics-body';

/**
 * RenderSystem — отрисовка PixiJS. ТОЛЬКО ЧТЕНИЕ компонентов.
 * Синхронизирует позиции спрайтов с физическими телами.
 */
export class RenderSystem extends System {
  readonly priority = 40;
  readonly required = [Transform, Renderable];

  private worldRef!: World;

  constructor(
    private render: RenderService,
    private physics: { getBody: (e: number) => { position: { x: number; y: number }; angle: number } | undefined },
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const entities = world.query(Transform, Renderable, PhysicsBody);
    for (const { entity, components } of entities) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const renderable = components[1] as { visible: boolean };
      const bodyData = components[2] as { body: { position: { x: number; y: number }; angle: number } | undefined };

      if (!renderable.visible) continue;

      // Синхронизируем позицию из физического тела, если есть
      if (bodyData.body) {
        transform.x = bodyData.body.position.x;
        transform.y = bodyData.body.position.y;
        transform.rotation = bodyData.body.angle;
      }

      this.render.updateSprite(entity, transform.x, transform.y, transform.rotation);
    }
  }

  /** Отрисовать кадр с интерполяцией alpha. */
  draw(world: World, alpha: number): void {
    // Интерполяция для плавности между фиксированными шагами физики
    const entities = world.query(Transform, Renderable, PhysicsBody);
    for (const { entity, components } of entities) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const renderable = components[1] as { visible: boolean };
      if (!renderable.visible) continue;
      this.render.updateSprite(entity, transform.x, transform.y, transform.rotation);
    }
  }
}
