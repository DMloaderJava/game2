import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus as EventBusClass } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { IndividualGravity } from '../components/gravity';
import { CharacterController, CharacterControllerData, CharacterState } from '../components/character';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { Material } from '../components/material';
import { IntentMove } from '../components/intent';

/**
 * CharacterSystem — стейт-машина персонажа.
 *
 * Управляет состояниями: Grounded, Airborne, Climbing, Carrying, ZeroG, Pushing, Dead.
 * Переходы зависят от гравитации (IndividualGravity), касания поверхности и действий ввода.
 * Вычисляет желаемое направление движения, но не применяет силу напрямую —
 * результат записывается в IntentMove (или GravityForce через GravitySystem).
 *
 * Приоритет 12 — сразу после InputSystem (10), чтобы состояние отражало ввод кадра.
 */
export class CharacterSystem extends System {
  readonly priority = 12;
  readonly required = [Transform, CharacterController, CharacterStats];

  private worldRef!: World;

  constructor(private eventBus: EventBusClass) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const entities = world.query(Transform, CharacterController, CharacterStats);
    for (const { entity, components } of entities) {
      const ctrl = components[1] as CharacterControllerData;
      const stats = components[2] as CharacterStatsData;

      // Мёртвый — никаких действий
      if (ctrl.state === 'Dead') continue;

      ctrl.stateTime += dt;

      // Сохраняем предыдущее состояние для отслеживания переходов
      const prev = ctrl.state;
      ctrl.previousState = prev;

      // 1. Определяем текущее состояние по гравитации и контакту
      this.determineState(entity, ctrl, stats, dt);

      // 2. Если состояние изменилось — эмитим событие
      if (ctrl.state !== prev) {
        this.eventBus.emit('character:state-changed', {
          entity,
          from: prev,
          to: ctrl.state,
          dt,
        });
      }

      // 3. Вычисляем желаемое направление движения для текущего состояния
      this.computeMovement(entity, ctrl, stats, dt);

      // 4. Сбрасываем флаги однократных действий
      ctrl.jumpPressed = false;
      ctrl.interactPressed = false;
      ctrl.digPressed = false;
      ctrl.scanPressed = false;
    }
  }

  /* ── Определение состояния ─────────────────────────────────────── */

  private determineState(
    entity: number,
    ctrl: CharacterControllerData,
    stats: CharacterStatsData,
    dt: number
  ): void {
    const indiv = this.worldRef.getComponent(
      entity,
      IndividualGravity as unknown as symbol
    ) as { scale: number; useOverride: boolean; override?: Vec2 } | undefined;

    // Невесомость: индивидуальная гравитация выключена или масштаб 0
    const inZeroG = indiv ? indiv.scale <= 0 : false;

    if (inZeroG) {
      ctrl.state = 'ZeroG';
      return;
    }

    // Мёртв
    if (stats.health <= 0) {
      ctrl.state = 'Dead';
      return;
    }

    // Толкание тяжёлого объекта
    if (ctrl.carriedEntity !== null && this.isPushableMass(ctrl, stats)) {
      ctrl.state = 'Pushing';
      return;
    }

    // Перенос предмета
    if (ctrl.carriedEntity !== null) {
      ctrl.state = 'Carrying';
      return;
    }

    // Касание земли
    const onGround = ctrl.groundEntity !== null && ctrl.groundNormal !== null;

    if (onGround) {
      ctrl.state = 'Grounded';
      ctrl.hasDoubleJumped = false; // сброс двойного прыжка при касании земли
      return;
    }

    // В воздухе
    ctrl.state = 'Airborne';
  }

  private isPushableMass(ctrl: CharacterControllerData, stats: CharacterStatsData): boolean {
    // Если персонаж толкает (не несёт) объект — масса объекта > maxCarryMass
    // carriedEntity здесь используется как цель взаимодействия
    return ctrl.carriedEntity !== null;
  }

  /* ── Вычисление движения ───────────────────────────────────────── */

  private computeMovement(
    entity: number,
    ctrl: CharacterControllerData,
    stats: CharacterStatsData,
    dt: number
  ): void {
    const dir = ctrl.inputDirection;
    const speed = ctrl.moveSpeed * (ctrl.isSprinting ? ctrl.sprintMultiplier : 1) * stats.speedPenalty;

    switch (ctrl.state) {
      case 'Grounded':
        this.handleGrounded(entity, ctrl, dir, speed);
        break;
      case 'Airborne':
        this.handleAirborne(entity, ctrl, dir, speed);
        break;
      case 'Climbing':
        this.handleClimbing(entity, ctrl, dir, speed);
        break;
      case 'Carrying':
        this.handleCarrying(entity, ctrl, dir, speed * 0.7); // штраф 30% к скорости
        break;
      case 'ZeroG':
        this.handleZeroG(entity, ctrl, dir, speed);
        break;
      case 'Pushing':
        this.handlePushing(entity, ctrl, dir, speed * 0.5); // штраф 50% к скорости
        break;
      case 'Dead':
        // никакого движения
        break;
    }
  }

  private handleGrounded(entity: number, ctrl: CharacterControllerData, dir: Vec2, speed: number): void {
    // Прыжок
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (ctrl.jumpPressed && stats && !stats.exhausted) {
      this.performJump(entity, ctrl);
      ctrl.state = 'Airborne';
      return;
    }

    // Карабканье к стене (если есть нормаль стены и не пол под ногами)
    if (ctrl.interactPressed && ctrl.groundNormal && !this.isFloorNormal(ctrl.groundNormal)) {
      ctrl.state = 'Climbing';
      return;
    }

    // Намерение движения записывается для InputSystem/PhysicsSystem
    this.setIntentMove(entity, dir.mul(speed));
  }

  private handleAirborne(entity: number, ctrl: CharacterControllerData, dir: Vec2, speed: number): void {
    const statsAir = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (ctrl.jumpPressed && ctrl.canDoubleJump && !ctrl.hasDoubleJumped && statsAir && !statsAir.exhausted) {
      this.performJump(entity, ctrl);
      ctrl.hasDoubleJumped = true;
      return;
    }

    // В воздухе управление ослаблено (air control)
    this.setIntentMove(entity, dir.mul(speed * 0.4));
  }

  private handleClimbing(entity: number, ctrl: CharacterControllerData, dir: Vec2, speed: number): void {
    // Карабканье вдоль поверхности. Направление перпендикулярно гравитации персонажа.
    // В упрощённой модели — движение по входу, но ограничено поверхностью.
    this.setIntentMove(entity, dir.mul(speed * 0.6));
  }

  private handleCarrying(entity: number, ctrl: CharacterControllerData, dir: Vec2, speed: number): void {
    this.setIntentMove(entity, dir.mul(speed));
  }

  private handleZeroG(entity: number, ctrl: CharacterControllerData, dir: Vec2, speed: number): void {
    // В невесомости движение в любом направлении без эффекта "пола"
    this.setIntentMove(entity, dir.mul(speed));
  }

  private handlePushing(entity: number, ctrl: CharacterControllerData, dir: Vec2, speed: number): void {
    // Толкание — медленное движение, сила прикладывается к толкаемому объекту в GrabThrowSystem
    this.setIntentMove(entity, dir.mul(speed));
  }

  /* ── Действия ──────────────────────────────────────────────────── */

  private performJump(entity: number, ctrl: CharacterControllerData): void {
    const indiv = this.worldRef.getComponent(
      entity,
      IndividualGravity as unknown as symbol
    ) as { scale: number; useOverride: boolean; override?: Vec2 } | undefined;

    // Прыжок против вектора гравитации персонажа
    let jumpDir: Vec2;
    if (indiv?.useOverride && indiv.override) {
      // Инвертируем вектор гравитации — прыгаем "от пола"
      jumpDir = indiv.override.clone().mul(-1).normalize();
    } else if (ctrl.groundNormal) {
      jumpDir = ctrl.groundNormal.clone();
    } else {
      jumpDir = new Vec2(0, -1); // по умолчанию вверх
    }

    const impulse = jumpDir.mul(ctrl.jumpForce * (indiv?.scale ?? 1));
    // Записываем как однократный импульс — PhysicsSystem применит его к телу
    this.eventBus.emit('character:jump', { entity, impulse, force: ctrl.jumpForce });

    // Расход стамины обрабатывается StaminaEnergySystem через событие
    this.eventBus.emit('stamina:spend', { entity, amount: 15, reason: 'jump' });
  }

  /** Установить намерение движения (пишется в IntentMove, читается PhysicsSystem). */
  private setIntentMove(entity: number, velocity: Vec2): void {
    const existing = this.worldRef.getComponent(entity, IntentMove as unknown as symbol) as { dx: number; dy: number } | undefined;
    if (existing) {
      existing.dx = velocity.x;
      existing.dy = velocity.y;
      this.worldRef.addComponent(entity, IntentMove as unknown as symbol, existing);
    } else {
      this.worldRef.addComponent(entity, IntentMove as unknown as symbol, { dx: velocity.x, dy: velocity.y });
    }
  }

  /** Является ли нормаль поверхности "полом" (почти совпадает с инвертом гравитации). */
  private isFloorNormal(normal: Vec2): boolean {
    const up = new Vec2(0, -1);
    return Math.abs(normal.dot(up)) > 0.7;
  }
}
