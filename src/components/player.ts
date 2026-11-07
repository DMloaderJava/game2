import { defineComponent } from '../ecs/component';

/** Маркер игрока и его базовые характеристики. */
export const Player = defineComponent<PlayerData>('Player');

export interface PlayerData {
  health: number;
  maxHealth: number;
  speed: number;
  jumpForce: number;
  canDoubleJump: boolean;
}
