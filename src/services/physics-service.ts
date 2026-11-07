/**
 * PhysicsService — обёртка над Matter.js.
 * Системы не вызывают Matter.js напрямую: через сервис проще заменить движок
 * и тестировать физику без отрисовки.
 */
export class PhysicsService {
  // matter.Engine и matter.World создаются при инициализации в main.ts
  engine: unknown = null;
  world: unknown = null;

  /** Создать rigid body и зарегистрировать его в симуляции. */
  createBody(options: unknown): unknown {
    // return Matter.Bodies.rectangle(x, y, w, h, options)
    throw new Error('PhysicsService.createBody: инициализируйте Matter.js в main.ts');
  }

  /** Удалить тело из симуляции. */
  removeBody(body: unknown): void {
    // Matter.Composite.remove(this.world, body)
  }

  /** Установить гравитацию для всего мира. */
  setGravity(x: number, y: number): void {
    // this.engine.gravity = { x, y }
  }

  /** Один шаг симуляции. */
  step(delta: number): void {
    // Matter.Engine.update(this.engine, delta, 1)
  }

  /** Найти все тела в точке (для подбора/строительства). */
  queryPoint(x: number, y: number): unknown[] {
    // Matter.Query.point(this.world.bodies, { x, y })
    return [];
  }

  /** Raycast для проверки видимости ИИ. */
  raycast(start: { x: number; y: number }, end: { x: number; y: number }): unknown[] {
    return [];
  }
}
