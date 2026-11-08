import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { InputService } from '../services/input-service';
import { CharacterController } from '../components/character';
import { IntentMove } from '../components/intent';

/**
 * InputSystem — читает InputService и пишет в CharacterController.inputDirection,
 * jumpPressed, interactPressed. Также создаёт IntentMove для PhysicsSystem.
 * Приоритет 10.
 */
export class InputSystem extends System {
  readonly priority = 10;
  readonly required = [CharacterController];

  constructor(
    private input: InputService,
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    const actors = world.query(CharacterController);
    for (const { entity, components } of actors) {
      const ctrl = components[0] as {
        inputDirection: { x: number; y: number };
        jumpPressed: boolean;
        interactPressed: boolean;
        digPressed: boolean;
        scanPressed: boolean;
      };

      // Сброс фреймовых флагов
      ctrl.jumpPressed = false;
      ctrl.interactPressed = false;
      ctrl.digPressed = false;
      ctrl.scanPressed = false;

      // Направление движения
      const dx =
        (this.input.isActionPressed('right') ? 1 : 0) -
        (this.input.isActionPressed('left') ? 1 : 0);
      const dy =
        (this.input.isActionPressed('down') ? 1 : 0) -
        (this.input.isActionPressed('up') ? 1 : 0);

      ctrl.inputDirection.x = dx;
      ctrl.inputDirection.y = dy;

      // Прыжок — только по фронту нажатия (edge detection)
      if (this.input.isActionPressed('jump')) {
        ctrl.jumpPressed = true;
      }
      if (this.input.isActionPressed('interact')) {
        ctrl.interactPressed = true;
      }
      if (this.input.isActionPressed('dig')) {
        ctrl.digPressed = true;
      }
      if (this.input.isActionPressed('scan')) {
        ctrl.scanPressed = true;
      }

      // Пишем IntentMove для PhysicsSystem (горизонтальная скорость)
      const existing = world.getComponent(entity, IntentMove as unknown as symbol) as { dx: number; dy: number } | undefined;
      const intent = { dx: dx * 220, dy: 0 }; // скорость задаётся здесь, CharacterSystem может скорректировать
      if (existing) {
        existing.dx = intent.dx;
        existing.dy = intent.dy;
        world.addComponent(entity, IntentMove as unknown as symbol, existing);
      } else {
        world.addComponent(entity, IntentMove as unknown as symbol, intent);
      }
    }
  }
}
