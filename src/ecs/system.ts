import { ComponentType } from './component';
import { World } from './world';

/**
 * Базовый класс любой системы.
 * Система работает со всеми сущностями, у которых есть все компоненты из `required`.
 * `priority` определяет порядок выполнения в GameLoop (чем меньше, тем раньше).
 */
export abstract class System {
  /** Приоритет системы (0 = первая, чем больше — тем позже выполняется). */
  abstract readonly priority: number;
  /** Типы компонентов, которые должна иметь сущность, чтобы попасть под эту систему. */
  abstract readonly required: ComponentType[];

  /** Можно отключить систему без удаления из мира. */
  enabled = true;

  /** Вызывается GameLoop каждый кадр. */
  abstract update(world: World, dt: number): void;
}
