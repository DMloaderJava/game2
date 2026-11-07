/**
 * Глобальные типы игры.
 */
export interface GameConfig {
  /** Фиксированный шаг физики в секундах (по умолчанию 60 FPS). */
  fixedTimeStep: number;
  /** Максимальное число шагов физики за кадр (защита от spiral of death). */
  maxSubSteps: number;
  /** Включить ли отладочную отрисовку физики (только dev). */
  debugPhysics: boolean;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  fixedTimeStep: 1 / 60,
  maxSubSteps: 5,
  debugPhysics: false,
};

/** Плагин модуля — биома, способности, предмета или типа ИИ. */
export interface Plugin {
  name: string;
  version: string;
  /** Вызывается при установке плагина в мир. */
  install(world: WorldLike, services: ServiceLocator): void;
}

/** Минимальный интерфейс мира для плагинов (без привязки к полной реализации). */
export interface WorldLike {
  registerComponent(type: symbol): void;
  addComponent<T>(entity: number, type: symbol, data: T): void;
  getComponent<T>(entity: number, type: symbol): T | undefined;
  addSystem(system: {
    priority: number;
    required: symbol[];
    update: (world: unknown, dt: number) => void;
  }): void;
}

/** Реестр сервисов, передаваемый плагинам при установке. */
export interface ServiceLocator {
  physics: unknown;
  render: unknown;
  audio: unknown;
  storage: unknown;
  input: unknown;
  events: unknown;
}
