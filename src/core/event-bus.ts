/**
 * Централизованная шина событий (pub/sub).
 * Системы обмениваются событиями, не зная друг о друге напрямую.
 */
export class EventBus {
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  /** Подписаться на событие. Возвращает функцию отписки. */
  on<T extends unknown>(type: string, listener: (event: T) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener as (event: unknown) => void);

    return () => {
      set?.delete(listener as (event: unknown) => void);
      if (set?.size === 0) {
        this.listeners.delete(type);
      }
    };
  }

  /** Отписаться от события. */
  off(type: string, listener: (event: unknown) => void): void {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(type);
    }
  }

  /** Опубликовать событие всем подписчикам. */
  emit<T extends unknown>(type: string, event: T): void {
    const set = this.listeners.get(type);
    if (!set) return;
    // Копируем, чтобы подписчик не мог сломать итерацию, отписавшись или подписавшись
    for (const listener of [...set]) {
      listener(event);
    }
  }

  /** Очистить все подписки (используется при перезагрузке/смене сцены). */
  clear(): void {
    this.listeners.clear();
  }
}
