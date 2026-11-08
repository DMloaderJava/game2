/**
 * PhysicsService — обёртка над Matter.js.
 * Все типы Matter.js — any (без 선언ных типов).
 */
import * as Matter from 'matter-js';
import { Vec2 } from '../core/vec2';

export class PhysicsService {
  engine: any = null;
  world: any = null;

  private bodies = new Map<number, any>();

  init(options: {
    width: number;
    height: number;
    gravityX: number;
    gravityY: number;
  }): void {
    this.engine = Matter.Engine.create({
      gravity: { x: 0, y: 0 },
      enableSleeping: true,
    });
    this.world = this.engine.world;

    const { width, height } = options;
    const wallThickness = 40;

    const floor = Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, {
      isStatic: true,
      label: 'floor',
    });
    const ceiling = Matter.Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, {
      isStatic: true,
      label: 'ceiling',
    });
    const leftWall = Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, {
      isStatic: true,
      label: 'leftWall',
    });
    const rightWall = Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, {
      isStatic: true,
      label: 'rightWall',
    });

    Matter.World.add(this.world, [floor, ceiling, leftWall, rightWall]);
  }

  step(delta: number): void {
    if (this.engine) {
      Matter.Engine.update(this.engine, delta * 1000, 1);

      // ЖЕСТКОЕ ОГРАНИЧЕНИЕ вертикальной скорости — защита от туннелирования сквозь пол
      const maxFallSpeed = 10;
      const maxRiseSpeed = 8;
      for (const body of this.world.bodies) {
        if (body.velocity.y > maxFallSpeed) {
          Matter.Body.setVelocity(body, { x: body.velocity.x, y: maxFallSpeed });
        } else if (body.velocity.y < -maxRiseSpeed) {
          Matter.Body.setVelocity(body, { x: body.velocity.x, y: -maxRiseSpeed });
        }
      }
    }
  }

  createRectangleBody(
    entity: number,
    x: number,
    y: number,
    width: number,
    height: number,
    options: any = {},
  ): any {
    if (!this.world) throw new Error('Physics world not initialized');
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      ...options,
      label: options.label || `entity-${entity}`,
    });
    Matter.World.add(this.world, body);
    this.bodies.set(entity, body);
    return body;
  }

  createCircleBody(
    entity: number,
    x: number,
    y: number,
    radius: number,
    options: any = {},
  ): any {
    if (!this.world) throw new Error('Physics world not initialized');
    const body = Matter.Bodies.circle(x, y, radius, {
      ...options,
      label: options.label || `entity-${entity}`,
    });
    Matter.World.add(this.world, body);
    this.bodies.set(entity, body);
    return body;
  }

  removeBody(entity: number): void {
    const body = this.bodies.get(entity);
    if (body && this.world) {
      Matter.World.remove(this.world, body);
    }
    this.bodies.delete(entity);
  }

  getBody(entity: number): any {
    return this.bodies.get(entity);
  }

  applyForce(body: any, force: Vec2): void {
    Matter.Body.applyForce(body, body.position, { x: force.x, y: force.y });
  }

  setGravity(x: number, y: number): void {
    if (this.engine) {
      this.engine.gravity.x = x;
      this.engine.gravity.y = y;
    }
  }

  queryPoint(x: number, y: number): any[] {
    if (!this.world) return [];
    return Matter.Query.point(this.world.bodies, { x, y });
  }

  setVelocity(body: any, vx: number, vy: number): void {
    Matter.Body.setVelocity(body, { x: vx, y: vy });
  }

  setPosition(body: any, x: number, y: number): void {
    Matter.Body.setPosition(body, { x, y });
  }

  getVelocity(body: any): Vec2 {
    return new Vec2(body.velocity.x, body.velocity.y);
  }

  setAngularVelocity(body: any, velocity: number): void {
    Matter.Body.setAngularVelocity(body, velocity);
  }

  destroy(): void {
    if (this.engine) {
      Matter.World.clear(this.engine.world);
      Matter.Engine.clear(this.engine);
      this.engine = null;
      this.world = null;
    }
    this.bodies.clear();
  }
}
