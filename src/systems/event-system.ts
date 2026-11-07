import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';

/**
 * EventSystem — катастрофы и глобальные события мира:
 * гравитационные бури, обрушения пустот, метеоритные дожди.
 * Меняют физику (через PhysicsSystem) и данные сущностей.
 */
export class EventSystem extends System {
  readonly priority = 60;
  readonly required = [];

  private activeEvents = new Array<{
    type: string;
    startTime: number;
    duration: number;
    intensity: number;
  }>();

  constructor(private eventBus: EventBus) {
    super();
  }

  update(world: World, dt: number): void {
    // 1. Обновить таймеры активных событий
    // 2. Применить модификаторы (например, умножить гравитацию всех тел)
    // 3. Спавн объектов катастрофы (метеориты, обломки)
    // 4. Завершить события по истечении duration
  }
}
