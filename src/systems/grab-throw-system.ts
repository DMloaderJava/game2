import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { CharacterController, CharacterControllerData } from '../components/character';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { Material } from '../components/material';
import { Grabbing, GrabbingData, Grabbed, Pushable } from '../components/grab';
import type { PushableData } from '../components/grab';
import { IndividualGravity } from '../components/gravity';
import { IntentMove } from '../components/intent';

/**
 * GrabThrowSystem — захват, перенос, бросок и толкание объектов.
 *
 * Взаимодействует с CharacterSystem через компонент CharacterController.carriedEntity
 * и с GravitySystem через массу объекта (при переносе масса прибавляется к персонажу
 * при расчёте F = m * G_eff).
 *
 * Приоритет 22 — после CharacterSystem (12) и StaminaEnergySystem (18),
 * до GravitySystem (25), чтобы масса переносимого объекта учлась при гравитации.
 */
export class GrabThrowSystem extends System {
  readonly priority = 22;
  readonly required = [Transform, CharacterController, CharacterStats];

  private worldRef!: World;

  // Константы
  private readonly THROW_BASE_FORCE = 500; // Н·с
  private readonly GRAB_STAMINA_COST = 5;   // порог старта захвата
  private readonly THROW_STAMINA_BASE = 10; // базовый расход стамины на бросок

  constructor(
    private physics: PhysicsService,
    private eventBus: EventBus,
    private staminaEnergy: { spendStamina: (e: number, a: number, r: string) => void; canSpendStamina: (e: number, a: number) => boolean; spendEnergy: (e: number, a: number, r: string) => boolean }
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const actors = world.query(Transform, CharacterController, CharacterStats);
    for (const { entity, components } of actors) {
      const ctrl = components[1] as CharacterControllerData;
      const stats = components[2] as CharacterStatsData;

      // Если персонаж мёртв — сбросить захват
      if (ctrl.state === 'Dead') {
        this.releaseGrab(entity, ctrl);
        continue;
      }

      // Начало захвата
      if (ctrl.interactPressed && ctrl.carriedEntity === null) {
        this.tryGrab(entity, ctrl, stats);
      }

      // Брос / постановка
      if (ctrl.interactPressed && ctrl.carriedEntity !== null) {
        this.tryThrowOrRelease(entity, ctrl, stats);
      }

      // Если несёшь объект — поддерживать Grabbed-компонент и позицию
      if (ctrl.carriedEntity !== null) {
        this.maintainGrab(entity, ctrl, dt);
      }
    }
  }

  /* ── Захват ───────────────────────────────────────────────────── */

  private tryGrab(entity: number, ctrl: CharacterControllerData, stats: CharacterStatsData): void {
    // Поиск объектов в радиусе досягаемости
    const pos = this.getEntityPosition(entity);
    const candidates = this.physics.queryPoint(pos.x, pos.y);

    let best: { entity: number; mass: number; dist: number } | null = null;

    for (const body of candidates) {
      const targetEntity = (body as any).entity;
      if (targetEntity === entity) continue;

      const material = this.worldRef.getComponent(targetEntity, Material as unknown as symbol) as { mass: number } | undefined;
      if (!material) continue;

      const targetPos = this.getEntityPosition(targetEntity);
      const dist = pos.distance(targetPos);
      if (dist > ctrl.grabRadius) continue;

      if (!best || dist < best.dist) {
        best = { entity: targetEntity, mass: material.mass, dist };
      }
    }

    if (!best) return;

    const { entity: target, mass } = best;

    // Если слишком тяжело — только толкание
    if (mass > ctrl.maxCarryMass) {
      this.startPush(entity, target, ctrl, stats);
      return;
    }

    // Проверка стамины
    if (!this.staminaEnergy.canSpendStamina(entity, this.GRAB_STAMINA_COST)) return;

    // Совершаем захват
    this.staminaEnergy.spendStamina(entity, this.GRAB_STAMINA_COST, 'grab');

    const offset = new Vec2(0.8, -0.4); // смещение "руки" персонажа
    this.worldRef.addComponent(entity, Grabbing as unknown as symbol, {
      targetEntity: target,
      offset,
      mass,
      grabbedAt: Date.now(),
    } as GrabbingData);

    this.worldRef.addComponent(target, Grabbed as unknown as symbol, {
      holderEntity: entity,
    });

    ctrl.carriedEntity = target;
    ctrl.state = 'Carrying';

    this.eventBus.emit('grab:start', { holder: entity, target, mass });
  }

  private startPush(entity: number, target: number, ctrl: CharacterControllerData, stats: CharacterStatsData): void {
    const pushable = this.worldRef.getComponent(target, 'pushable' as unknown as symbol) as { minPushMass: number; pusherEntity: number | null } | undefined;
    if (!pushable || pushable.pusherEntity !== null) return;

    this.worldRef.addComponent(target, Pushable as unknown as symbol, {
      minPushMass: 0,
      pusherEntity: entity,
    } as PushableData);

    ctrl.carriedEntity = target;
    ctrl.state = 'Pushing';

    this.eventBus.emit('push:start', { pusher: entity, target });
  }

  /* ── Брос / постановка ────────────────────────────────────────── */

  private tryThrowOrRelease(entity: number, ctrl: CharacterControllerData, stats: CharacterStatsData): void {
    const carried = ctrl.carriedEntity;
    if (carried === null) return;

    const grabbing = this.worldRef.getComponent(entity, Grabbing as unknown as symbol) as GrabbingData | undefined;
    if (!grabbing) return;

    const mass = grabbing.mass;
    const staminaCost = this.THROW_STAMINA_BASE + mass * 2;

    // Пытаемся бросить (если достаточно стамины)
    if (this.staminaEnergy.canSpendStamina(entity, staminaCost)) {
      this.staminaEnergy.spendStamina(entity, staminaCost, 'throw');
      this.performThrow(entity, carried, grabbing);
    } else {
      // Иначе просто поставить на землю
      this.releaseGrab(entity, ctrl);
    }

    ctrl.carriedEntity = null;
  }

  private performThrow(holder: number, target: number, grabbing: GrabbingData): void {
    const holderTransform = this.worldRef.getComponent(holder, Transform as unknown as symbol) as { x: number; y: number; rotation: number } | undefined;
    if (!holderTransform) return;

    // Направление броска — взгляд персонажа + légèrement вверх
    const angle = holderTransform.rotation + 0.25; // ~15° вверх от взгляда
    const dir = Vec2.fromAngle(angle, 1);

    const staminaFactor = 1; // можно уточнить через текущую стамину holder
    const force = dir.mul((this.THROW_BASE_FORCE * (1 + staminaFactor)) / grabbing.mass);

    // Приложить импульс к телу объекта
    const body = this.worldRef.getComponent(target, PhysicsBody as unknown as symbol) as { body: unknown } | undefined;
    if (body && body.body) {
      (this.physics as any).applyForce(body.body, force);
    }

    this.eventBus.emit('grab:throw', { holder, target, force, mass: grabbing.mass });
  }

  private releaseGrab(entity: number, ctrl: CharacterControllerData): void {
    const carried = ctrl.carriedEntity;
    if (carried === null) return;

    // Убрать Grabbed с объекта
    this.worldRef.removeComponent(carried, Grabbed as unknown as symbol);

    // Убрать Grabbing с персонажа
    this.worldRef.removeComponent(entity, Grabbing as unknown as symbol);

    // Если был толчок — убрать Pushable.pusher
    const pushable = this.worldRef.getComponent(carried, Pushable as unknown as symbol) as PushableData | undefined;
    if (pushable && pushable.pusherEntity === entity) {
      this.worldRef.addComponent(carried, Pushable as unknown as symbol, {
        minPushMass: pushable.minPushMass,
        pusherEntity: null,
      } as PushableData);
    }

    ctrl.carriedEntity = null;
    if (ctrl.state === 'Carrying' || ctrl.state === 'Pushing') {
      // Вернуть состояние в Grounded/Airborne/ZeroG — CharacterSystem определит само
      ctrl.state = 'Grounded'; //emporary, CharacterSystem переопределит
    }

    this.eventBus.emit('grab:release', { holder: entity, target: carried });
  }

  /* ── Поддержание захвата ─────────────────────────────────────── */

  private maintainGrab(entity: number, ctrl: CharacterControllerData, dt: number): void {
    const carried = ctrl.carriedEntity;
    if (carried === null) return;

    const grabbing = this.worldRef.getComponent(entity, Grabbing as unknown as symbol) as GrabbingData | undefined;
    if (!grabbing) return;

    const holderTransform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number; rotation: number } | undefined;
    if (!holderTransform) return;

    // Позиция объекта — рука персонажа (смещение вращается с персонажем)
    const offsetRotated = grabbing.offset.rotate(holderTransform.rotation);
    const targetX = holderTransform.x + offsetRotated.x;
    const targetY = holderTransform.y + offsetRotated.y;

    const targetTransform = this.worldRef.getComponent(carried, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (targetTransform) {
      targetTransform.x = targetX;
      targetTransform.y = targetY;
      this.worldRef.addComponent(carried, Transform as unknown as symbol, targetTransform);
    }

    // Расход стамины на удержание (propotional к массе)
    const carryCost = this.COST_CARRY_PER_SECOND * grabbing.mass;
    if (carryCost > 0) {
      this.staminaEnergy.spendStamina(entity, carryCost * dt, 'carry');
    }

    // Если стамины кончилась — принудительный отпуск
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (stats && stats.stamina <= 0) {
      this.releaseGrab(entity, ctrl);
    }
  }

  private readonly COST_CARRY_PER_SECOND = 3.0;

  /* ── Вспомогательное ─────────────────────────────────────────── */

  private getEntityPosition(entity: number): Vec2 {
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    return transform ? new Vec2(transform.x, transform.y) : new Vec2(0, 0);
  }
}
