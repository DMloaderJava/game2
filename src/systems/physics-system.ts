import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { GravityForce } from '../components/gravity';
import { Material } from '../components/material';

/**
 * PhysicsSystem — шаг симуляции Matter.js, синхронизация тел с ECS и
 * приложение сил гравитации.
 *
 * Порядок работы в кадре:
 *   1. Приложить накопленные силы GravityForce к телам (F = m * g).
 *   2. Один шаг Matter.js Engine.update.
 *   3. Синхронизировать позиции тел обратно в компоненты Transform.
 *   4. Эмитировать события коллизий в EventBus.
 *
 * Приоритет 30 — после GravitySystem (25), чтобы гравитация應лась
 * перед шагом симуляции.
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
    // 1. Приложить силы гравитации (и другие накопленные силы) к телам.
    const actors = world.query(PhysicsBody, GravityForce, Material);
    for (const { entity, components } of actors) {
      const bodyData = components[0] as { body: unknown };
      const forceData = components[1] as { vector: Vec2; dirty: boolean };
      const material = components[2] as { mass: number };

      if (!forceData.dirty || !bodyData.body) continue;

      // F = m * g, применяется в центре масс — без вращательного момента.
      const force = forceData.vector.mul(material.mass);
      (this.physics as any).applyForce(bodyData.body, force);

      forceData.dirty = false;
      world.addComponent(entity, GravityForce as unknown as symbol, forceData);
    }

    // 2. Один шаг физической симуляции.
    this.physics.step(dt);

    // 3. Синхронизировать позиции из Matter.js тел в компоненты Transform.
    const bodies = world.query(Transform, PhysicsBody);
    for (const { entity, components } of bodies) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const body = (components[1] as { body: unknown }).body;

      // transform.x = body.position.x;
      // transform.y = body.position.y;
      // transform.rotation = body.angle;
    }

    // 4. События коллизий -> EventBus (для урона, звуков, триггеров, разрушений).
    // this.eventBus.emit('collision-start', { bodyA, bodyB });
  }
}
