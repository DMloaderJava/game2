import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';

/**
 * InventorySystem — стек предметов, экипировка, крафт, перенос веса.
 * Рецепты предметов регистрируются плагинами (src/modules/items/*).
 */
export class InventorySystem extends System {
  readonly priority = 50;
  readonly required = [];

  constructor(private eventBus: EventBus) {
    super();
  }

  update(world: World, dt: number): void {
    // 1. Обработать IntentInteract + ближайший Item -> ItemStack в Inventory
    // 2. Проверить рецепты крафта (и ingredients, и вес)
    // 3. EventBus.emit('item-picked-up', ...)
  }
}
