import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';

/**
 * ConstructionSystem — размещение и удаление построек (sandbox-часть).
 * Проверяет валидность места (сетка, опора), создаёт тела через PhysicsService,
 * показывает призрачное préвью (GhostPreview).
 */
export class ConstructionSystem extends System {
  readonly priority = 40;
  readonly required = [];

  constructor(
    private physics: PhysicsService,
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    // Пример 흐름:
    // 1. Найти IntentBuild на игроке
    // 2. Проверить Buildable + SnapGrid (сетка, опора, коллизии)
    // 3. Если валидно — создать Structure-сущность + тело в Matter.js
    // 4. Если инвалидно — показать GhostPreview красным
    // 5. EventBus.emit('structure-placed', { entity, structureId })
  }
}
