import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { IndividualGravity } from '../components/gravity';
import { CharacterController, CharacterControllerData, CharacterState } from '../components/character';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { Material } from '../components/material';
import { IntentMove } from '../components/intent';

/**
 * CharacterSystem — стейт-машина персонажа (Grounded, Airborne, ZeroG, Dead).
 * Читает CharacterController.inputDirection (пишет InputSystem) и groundEntity
 * (пишет PhysicsSystem после шага физики). Управляет состоянием и пишет IntentMove.
 * Приоритет 12 — сразу после InputSystem (10).
 */
export class CharacterSystem extends System {
  readonly priority = 12;
  readonly required = [Transform, CharacterController, CharacterStats];

  private worldRef!: World;

  constructor(private eventBus: EventBus) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const entities = world.query(Transform, CharacterController, CharacterStats);
    for (const { entity, components } of entities) {
      const ctrl = components[1] as CharacterControllerData;
      const stats = components[2] as CharacterStatsData;

      if (ctrl.state === 'Dead') continue;

      ctrl.stateTime += dt;
      const prev = ctrl.state;
      ctrl.previousState = prev;

      this.determineState(entity, ctrl, stats);
      this.computeMovement(entity, ctrl, stats, dt);

      // Сбрасываем фреймовые флаги в конце кадра
      ctrl.jumpPressed = false;
      ctrl.interactPressed = false;
      ctrl.digPressed = false;
      ctrl.scanPressed = false;

      if (ctrl.state !== prev) {
        this.eventBus.emit('character:state-changed', {
          entity, from: prev, to: ctrl.state, dt,
        });
      }
    }
  }

  private determineState(
    entity: number,
    ctrl: CharacterControllerData,
    stats: CharacterStatsData,
  ): void {
    const indiv = this.worldRef.getComponent(entity, IndividualGravity as unknown as symbol) as {
      scale: number;
      useOverride: boolean;
      override?: Vec2;
    } | undefined;

    const inZeroG = indiv ? indiv.scale <= 0 : false;
    if (inZeroG) {
      ctrl.state = 'ZeroG';
      return;
    }

    if (stats.health <= 0) {
      ctrl.state = 'Dead';
      return;
    }

    const onGround = ctrl.groundEntity !== null && ctrl.groundNormal !== null;
    if (onGround) {
      ctrl.state = 'Grounded';
      ctrl.hasDoubleJumped = false;
      return;
    }

    ctrl.state = 'Airborne';
  }

  private computeMovement(
    entity: number,
    ctrl: CharacterControllerData,
    stats: CharacterStatsData,
    dt: number,
  ): void {
    const dir = ctrl.inputDirection;
    const speed = ctrl.moveSpeed * (ctrl.isSprinting ? ctrl.sprintMultiplier : 1) * stats.speedPenalty;

    switch (ctrl.state) {
      case 'Grounded':
        this.handleGrounded(entity, ctrl, dir, speed, stats.exhausted);
        break;
      case 'Airborne':
        this.handleAirborne(entity, ctrl, dir, speed, stats.exhausted);
        break;
      case 'ZeroG':
        this.handleZeroG(entity, ctrl, dir, speed);
        break;
      case 'Dead':
        break;
    }
  }

  private handleGrounded(
    entity: number,
    ctrl: CharacterControllerData,
    dir: Vec2,
    speed: number,
    exhausted: boolean,
  ): void {
    if (ctrl.jumpPressed && !exhausted) {
      this.performJump(entity, ctrl);
      ctrl.state = 'Airborne';
      return;
    }

    this.setIntentMove(entity, dir.mul(speed));
  }

  private handleAirborne(
    entity: number,
    ctrl: CharacterControllerData,
    dir: Vec2,
    speed: number,
    exhausted: boolean,
  ): void {
    if (ctrl.jumpPressed && ctrl.canDoubleJump && !ctrl.hasDoubleJumped && !exhausted) {
      this.performJump(entity, ctrl);
      ctrl.hasDoubleJumped = true;
      return;
    }
    this.setIntentMove(entity, dir.mul(speed * 0.4));
  }

  private handleZeroG(
    entity: number,
    ctrl: CharacterControllerData,
    dir: Vec2,
    speed: number,
  ): void {
    this.setIntentMove(entity, dir.mul(speed));
  }

  private performJump(entity: number, ctrl: CharacterControllerData): void {
    const indiv = this.worldRef.getComponent(entity, IndividualGravity as unknown as symbol) as {
      scale: number;
      useOverride: boolean;
      override?: Vec2;
    } | undefined;

    let jumpDir: Vec2;
    if (indiv?.useOverride && indiv.override) {
      jumpDir = indiv.override.clone().mul(-1).normalize();
    } else if (ctrl.groundNormal) {
      jumpDir = ctrl.groundNormal.clone();
    } else {
      jumpDir = new Vec2(0, -1);
    }

    const impulse = jumpDir.mul(ctrl.jumpForce * (indiv?.scale ?? 1));
    this.eventBus.emit('character:jump', { entity, impulse, force: ctrl.jumpForce });
    this.eventBus.emit('stamina:spend', { entity, amount: 15, reason: 'jump' });
  }

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
}
