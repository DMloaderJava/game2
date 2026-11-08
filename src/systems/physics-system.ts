import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { GravityForce } from '../components/gravity';
import { Material } from '../components/material';
import { Vec2 } from '../core/vec2';
import { CharacterController } from '../components/character';
import { IntentMove } from '../components/intent';
import { GravityAnchor } from '../components/construction';

/**
 * PhysicsSystem — шаг Matter.js, применение сил гравитации и IntentMove,
 * синхронизация тел с ECS, обнаружение земли под персонажем.
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
      setVelocity: (body: unknown, vx: number, vy: number) => void;
      setBodyMass: (body: unknown, mass: number) => void;
      getEntityFromBody: (body: unknown) => number | undefined;
      queryPoint: (x: number, y: number) => any[];
    },
    private eventBus: EventBus,
  ) {
    super();
    this.eventBus.on('character:jump', (e: any) => this.handleJumpEvent(e.entity, e.impulse));
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    // 1. Применить IntentMove к телам (горизонтальная скорость)
    const intents = world.query(PhysicsBody, IntentMove);
    for (const { entity, components } of intents) {
      const bodyData = components[0] as { body: unknown };
      const intent = components[1] as { dx: number; dy: number };
      if (!bodyData.body) continue;
      const bodyAny = bodyData.body as { velocity: { y: number } };
      this.physics.setVelocity(bodyData.body, intent.dx, bodyAny.velocity.y);
      world.removeComponent(entity, IntentMove as unknown as symbol);
    }

    // 2. Применить силы гравитации к телам (через body.mass, а не Material.mass)
    const actors = world.query(PhysicsBody, GravityForce);
    for (const { entity, components } of actors) {
      const bodyData = components[0] as { body: unknown };
      const forceData = components[1] as { vector: Vec2; dirty: boolean };
      if (!forceData.dirty || !bodyData.body) continue;

      // gravityForce — ускорение (м/с²), сила = ускорение * масса тела
      const bodyMass = (bodyData.body as any).mass ?? 1;
      const force = forceData.vector.mul(bodyMass);
      this.physics.applyForce(bodyData.body, force);

      forceData.dirty = false;
      world.addComponent(entity, GravityForce as unknown as symbol, forceData);
    }

    // 3. Компенсация якоря: если тело внутри активного GravityAnchor, приложить
    //    противоположную силу, компенсирующую инвертированную гравитацию
    this.applyAnchorCompensation(world, dt);

    // 4. Один шаг физической симуляции
    this.physics.step(dt);

    // 5. Синхронизировать позиции тел в компоненты Transform
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

    // 6. Обнаружение земли для сущностей с CharacterController
    this.detectGround(world);

    // 7. События коллизий (заглушка для будущего DamageSystem)
  }

  /**
   * Компенсация якоря: если глобальная гравитация инвертирована (y < 0),
   * приложить силу вниз ко всем телам внутри активного якоря, чтобы удержать их.
   */
  private applyAnchorCompensation(world: World, dt: number): void {
    const anchors = world.query(GravityAnchor as unknown as symbol, Transform as unknown as symbol);
    if (anchors.length === 0) return;

    // Собираем активные якоря с позициями и радиусами
    const activeAnchors: Array<{ x: number; y: number; radius: number }> = [];
    for (const { components } of anchors) {
      const anchorData = components[0] as { active: boolean; radius: number };
      const anchorTransform = components[1] as { x: number; y: number };
      if (anchorData.active && anchorTransform) {
        activeAnchors.push({ x: anchorTransform.x, y: anchorTransform.y, radius: anchorData.radius });
      }
    }
    if (activeAnchors.length === 0) return;

    const gravForceEntities = world.query(PhysicsBody, GravityForce);
    for (const { entity, components } of gravForceEntities) {
      const bodyData = components[0] as { body: unknown };
      const forceData = components[1] as { vector: Vec2; dirty: boolean };
      const body = bodyData.body as { position: { x: number; y: number }; mass: number } | undefined;
      if (!body || !forceData.dirty) continue;

      const bodyPos = body.position;
      let insideAnyAnchor = false;
      for (const anchor of activeAnchors) {
        const dx = bodyPos.x - anchor.x;
        const dy = bodyPos.y - anchor.y;
        if (Math.hypot(dx, dy) <= anchor.radius) {
          insideAnyAnchor = true;
          break;
        }
      }
      if (!insideAnyAnchor) continue;

      // Если гравитация инвертирована (влево/вверх), компенсируем силой вниз
      const g = forceData.vector;
      if (g.y < 0) {
        // Сила вниз, компенсирующая инвертированную гравитацию
        const compensation = new Vec2(0, -g.y * body.mass * 1.1);
        this.physics.applyForce(body, compensation);
      } else if (g.x !== 0) {
        // Боковая гравитация — компенсируем горизонтально
        const compensation = new Vec2(-g.x * body.mass * 1.1, 0);
        this.physics.applyForce(body, compensation);
      }
    }
  }

  /**
   * Обнаружение земли: для сущностей с CharacterController проверяем точку
   * прямо под телом. Если есть статическое тело — выставляем groundEntity и groundNormal.
   */
  private detectGround(world: World): void {
    const actors = world.query(PhysicsBody, Transform, CharacterController);
    for (const { entity, components } of actors) {
      const bodyData = components[0] as { body: { position: { x: number; y: number }; mass: number } | undefined };
      const transform = components[1] as { x: number; y: number };
      const ctrl = components[2] as {
        groundEntity: number | null;
        groundNormal: { x: number; y: number } | null;
      };

      const body = bodyData.body;
      if (!body) continue;

      // Точка чуть ниже низа тела (радиус/полувысота + небольшой отступ)
      const probeY = body.position.y + 30;
      const hits = this.physics.queryPoint(body.position.x, probeY);

      let groundFound = false;
      for (const hit of hits) {
        const hitEntity = this.physics.getEntityFromBody(hit.body);
        if (hitEntity === undefined || hitEntity === entity) continue;
        if (hit.body.isStatic) {
          groundFound = true;
          ctrl.groundEntity = hitEntity;
          ctrl.groundNormal = { x: 0, y: -1 };
          break;
        }
      }

      if (!groundFound) {
        ctrl.groundEntity = null;
        ctrl.groundNormal = null;
      }

      world.addComponent(entity, CharacterController as unknown as symbol, ctrl);
    }
  }

  /** Служит обработчиком события character:jump — применяет вертикальный импульс. */
  handleJumpEvent(entity: number, impulse: Vec2): void {
    const bodyData = this.worldRef.getComponent(entity, PhysicsBody as unknown as symbol) as { body: unknown } | undefined;
    if (!bodyData?.body) return;
    this.physics.applyForce(bodyData.body, impulse);
  }
}
