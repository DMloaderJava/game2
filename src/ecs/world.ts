import { Entity, NULL_ENTITY } from './entity';
import { ComponentType } from './component';
import { System } from './system';

/**
 * World — контейнер всего игрового состояния.
 * Хранит сущности, их компоненты и системы. Единая точка доступа для всех систем.
 */
export class World {
  private entities = new Set<Entity>();
  private nextEntityId = 1;

  // componentType -> Map<entity, componentData>
  private componentMaps = new Map<ComponentType, Map<Entity, unknown>>();
  // entity -> Set<componentType> (для быстрого удаления всех компонентов сущности)
  private entityComponents = new Map<Entity, Set<ComponentType>>();

  private systems = new Array<System>();
  private isRunning = false;

  /** Создаёт новую пустую сущность и возвращает её ID. */
  createEntity(): Entity {
    const id = this.nextEntityId++;
    this.entities.add(id);
    this.entityComponents.set(id, new Set());
    return id;
  }

  /** Удаляет сущность и все её компоненты. */
  destroyEntity(entity: Entity): void {
    if (!this.entities.has(entity)) return;

    const types = this.entityComponents.get(entity);
    if (types) {
      for (const type of types) {
        const map = this.componentMaps.get(type);
        map?.delete(entity);
      }
      this.entityComponents.delete(entity);
    }
    this.entities.delete(entity);
  }

  /** Регистрирует тип компонента в мире (обязательно перед первым использованием). */
  registerComponent<T>(type: ComponentType): void {
    if (!this.componentMaps.has(type)) {
      this.componentMaps.set(type, new Map());
    }
  }

  /** Добавляет компонент сущности. */
  addComponent<T>(entity: Entity, type: ComponentType, data: T): void {
    if (!this.entities.has(entity)) {
      throw new Error(`World.addComponent: entity ${entity} does not exist`);
    }
    let map = this.componentMaps.get(type);
    if (!map) {
      map = new Map();
      this.componentMaps.set(type, map);
    }
    map.set(entity, data);

    let types = this.entityComponents.get(entity);
    if (!types) {
      types = new Set();
      this.entityComponents.set(entity, types);
    }
    types.add(type);
  }

  /** Удаляет компонент у сущности. */
  removeComponent(entity: Entity, type: ComponentType): void {
    const map = this.componentMaps.get(type);
    map?.delete(entity);
    const types = this.entityComponents.get(entity);
    types?.delete(type);
  }

  /** Возвращает компонент сущности или undefined. */
  getComponent<T>(entity: Entity, type: ComponentType): T | undefined {
    return this.componentMaps.get(type)?.get(entity) as T | undefined;
  }

  /** Проверяет, есть ли у сущности компонент данного типа. */
  hasComponent(entity: Entity, type: ComponentType): boolean {
    const types = this.entityComponents.get(entity);
    return types ? types.has(type) : false;
  }

  /**
   * Добавляет систему в мир. Системы сортируются по priority при запуске.
   * Возвращает саму систему для удобной цепочки вызовов.
   */
  addSystem(system: System): this {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /** Удаляет систему из мира. */
  removeSystem(system: System): void {
    const index = this.systems.indexOf(system);
    if (index !== -1) this.systems.splice(index, 1);
  }

  /**
   * Возвращает все сущности, обладающие указанными компонентами,
   * вместе с данными этих компонентов.
   */
  query<T extends ComponentType[]>(...types: T): Array<{
    entity: Entity;
    components: { [K in keyof T]: unknown };
  }> {
    if (types.length === 0) return [];

    // Начинаем с наименьшего набора — оптимизация перебора
    const maps = types.map((t) => this.componentMaps.get(t));
    if (maps.some((m) => !m)) return [];

    const baseMap = maps.reduce((min, m) => (m!.size < min!.size ? m : min), maps[0])!;
    const baseType = types[maps.indexOf(baseMap)];

    const result: Array<{ entity: Entity; components: unknown[] }> = [];
    for (const [entity] of baseMap) {
      let ok = true;
      const components: unknown[] = [];
      for (let i = 0; i < types.length; i++) {
        const data = this.componentMaps.get(types[i])!.get(entity);
        if (data === undefined) {
          ok = false;
          break;
        }
        components.push(data);
      }
      if (ok) {
        result.push({ entity, components });
      }
    }
    return result as Array<{ entity: Entity; components: { [K in keyof T]: unknown } }>;
  }

  /** Выполняет все включенные системы по порядку приоритета. */
  update(dt: number): void {
    this.isRunning = true;
    for (const system of this.systems) {
      if (system.enabled) {
        system.update(this, dt);
      }
    }
    this.isRunning = false;
  }

  get entityCount(): number {
    return this.entities.size;
  }
}
