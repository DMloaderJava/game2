import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { InputService } from '../services/input-service';
import { Player, PlayerData } from '../components/player';
import { IntentMove, IntentJump, IntentAttack, IntentInteract } from '../components/intent';

/**
 * InputSystem — читает InputService и пишет Intent-компоненты.
 * Не знает о других системах; Intent-компоненты подхватят PhysicsSystem,
 * ConstructionSystem, InventorySystem и т.д. через World.
 */
export class InputSystem extends System {
  readonly priority = 10;
  readonly required = [Player];

  constructor(
    private input: InputService,
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    const players = world.query(Player);
    for (const { entity } of players) {
      // Убираем старые намерения кадра
      world.removeComponent(entity, IntentMove as unknown as symbol);
      world.removeComponent(entity, IntentJump as unknown as symbol);

      const dx = (this.input.isActionPressed('right') ? 1 : 0) - (this.input.isActionPressed('left') ? 1 : 0);
      const dy = (this.input.isActionPressed('down') ? 1 : 0) - (this.input.isActionPressed('up') ? 1 : 0);

      if (dx !== 0 || dy !== 0) {
        world.addComponent(entity, IntentMove as unknown as symbol, { dx, dy });
      }
      if (this.input.isActionPressed('jump')) {
        world.addComponent(entity, IntentJump as unknown as symbol, undefined);
      }
    }
  }
}
