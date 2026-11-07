import { defineComponent } from '../ecs/component';

/** Намерение движения (пишет InputSystem или AISystem, читает PhysicsSystem). */
export const IntentMove = defineComponent<IntentMoveData>('IntentMove');
export interface IntentMoveData { dx: number; dy: number; }

/** Намерение прыжка. */
export const IntentJump = defineComponent('IntentJump');

/** Намерение атаковать. */
export const IntentAttack = defineComponent<IntentAttackData>('IntentAttack');
export interface IntentAttackData { targetEntity: number; }

/** Намерение построить/разместить объект. */
export const IntentBuild = defineComponent<IntentBuildData>('IntentBuild');
export interface IntentBuildData { structureId: string; x: number; y: number; }

/** Намерение взаимодействовать (подбор предмета, открытие инвентаря). */
export const IntentInteract = defineComponent('IntentInteract');
