import { Entity, NULL_ENTITY } from './entity';
import { ComponentType } from './component';
import { World } from './world';

/**
 * Результат запроса: массив записей [сущность, компонент1, компонент2, ...].
 * Используется системами для итерации только по нужным сущностям.
 */
export type QueryResult<T extends ComponentType[]> = Array<{
  entity: Entity;
  components: { [K in keyof T]: unknown };
}>;
