import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { GravityForce } from '../components/gravity';
import { Material } from '../components/material';
import { Vec2 } from '../core/vec2';

/**
 * PhysicsSystem — шаг Matter.js, приложение сил гравитации, синхронизация тел с ECS.
 * Приоритет 30 — после GravitySystem (25).
 */
export class PhysicsSystem extends System {
  readonly priority = 30;
  readonly required = [Transform, PhysicsBody];

  private worldRef!: World;

  constructor(
    private physics: {
      step: (dt: number) => void;
      applyForce: (body: unknown, force: Vec2) => void;
      getBody: (e: number) => { position: { x: number; y: number }; angle: number } | undefined;
    },
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    // 1. Приложить силы гравитации к телам
    const actors = world.query(PhysicsBody, GravityForce, Material);
    for (const { entity, components } of actors) {
      const bodyData = components[0] as { body: unknown };
      const forceData = components[1] as { vector: Vec2; dirty: boolean };
      const material = components[2] as { mass: number };

      if (!forceData.dirty || !bodyData.body) continue;

      const force = forceData.vector.mul(material.mass);
      this.physics.applyForce(bodyData.body, force);

      forceData.dirty = false;
      world.addComponent(entity, GravityForce as unknown as symbol, forceData);
    }

    // 2. Один шаг физической симуляции
    this.physics.step(dt);

    // 3. Синхронизировать позиции тел в компоненты Transform
    const bodies = world.query(Transform, PhysicsBody);
    for (const { entity, components } of bodies) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const body = (components[1] as { body: { position: { x: number; y: number }; angle: number } | undefined }).body;

      if (body) {
        transform.x = body.position.x;
        transform.y = body.position.y;
        transform.rotation = body.angle;
      }
    }

    // 4. События коллизий (заглушка для будущего DamageSystem)
    // this.eventBus.emit('collision-start', { bodyA, bodyB });
  }
}
