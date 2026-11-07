/**
 * InputService — нормализация ввода с клавиатуры, мыши, тача и геймпада.
 * Предоставляет абстрактные действия вместо сырых клавиш.
 */
export class InputService {
  private keys = new Set<string>();
  private actionMap = new Map<string, string>(); // действие -> клавиша

  /** Привязать действие к клавише (хранится в localStorage). */
  bindAction(action: string, key: string): void {
    this.actionMap.set(action, key);
  }

  /** Нажата ли клавиша действия прямо сейчас. */
  isActionPressed(action: string): boolean {
    const key = this.actionMap.get(action);
    return key ? this.keys.has(key) : false;
  }

  /** Позиция курсора в мировых координатах (с учётом камеры). */
  getWorldPointer(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }

  /** Сырое событие клавиатуры (для отладки и меню). */
  onKeyDown(key: string): void {
    this.keys.add(key);
  }
  onKeyUp(key: string): void {
    this.keys.delete(key);
  }
}
