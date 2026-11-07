import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';

/**
 * AISystem — принимает решения за мобов и NPC.
 * Поведение регистрируется плагинами ИИ (src/modules/ai/*); ядро вызывает
 * только ai.update(entity, world, dt). Решения записываются в Intent- и
 * Command-компоненты, которые исполняют другие системы.
 */
export class AISystem extends System {
  readonly priority = 20;
  readonly required = [];

  private behaviors = new Map<string, (entity: number, world: World, dt: number) => void>();

  constructor(
    private physics: PhysicsService,
    private eventBus: EventBus,
  ) {
    super();
  }

  /** Плагин ИИ регистрирует свой тип поведения здесь. */
  registerBehavior(type: string, update: (entity: number, world: World, dt: number) => void): void {
    this.behaviors.set(type, update);
  }

  update(world: World, dt: number): void {
    // Пример: перебираем сущности с AI-компонентами (добавляются плагинами)
    // const mobs = world.query(AIController, AIState);
    // for (const { entity, components } of mobs) {
    //   const behavior = this.behaviors.get(components[0].type);
    //   if (behavior) behavior(entity, world, dt);
    // }
  }
}
