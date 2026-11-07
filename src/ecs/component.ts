/**
 * Регистрация типа компонента.
 *
 * Компонент — это чистые данные (POJO) без методов.
 * Тип компонентаidentifies by Symbol, что даёт O(1) поиск в World.
 */
export type ComponentType = symbol;

/**
 * Создаёт уникальный тип компонента.
 * @example
 * export const Transform = defineComponent<TransformData>('Transform');
 */
export function defineComponent<T = unknown>(name: string): ComponentType {
  return Symbol(name);
}
