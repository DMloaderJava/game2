import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { GravityZone } from '../components/gravity-zone';

/**
 * PhysicsSystem — шаг Matter.js, гравитационные зоны, синхронизация
 *_transform из физических тел обратно в ECS.
 */
export class PhysicsSystem extends System {
  readonly priority = 30;
  readonly required = [Transform, PhysicsBody];

  constructor(
    private physics: PhysicsService,
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    // 1. Применяем гравитационные зоны к телам (через PhysicsService)
    // const zones = world.query(GravityZone);
    // ...

    // 2. Один шаг симуляции
    this.physics.step(dt);

    // 3. Синхронизируем позиции тел в компоненты Transform
    const bodies = world.query(Transform, PhysicsBody);
    for (const { entity, components } of bodies) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const body = (components[1] as { body: unknown }).body;
      // transform.x = body.position.x;
      // transform.y = body.position.y;
      // transform.rotation = body.angle;
    }

    // 4. События коллизий -> EventBus (для урона, звуков, триггеров)
    // this.eventBus.emit('collision-start', { bodyA, bodyB });
  }
}
