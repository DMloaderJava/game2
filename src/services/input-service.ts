/**
 * InputService — нормализация ввода с клавиатуры, мыши, тача и геймпада.
 */
export class InputService {
  private keys = new Set<string>();
  private actionMap = new Map<string, string>();

  bindAction(action: string, key: string): void {
    this.actionMap.set(action, key);
  }

  isActionPressed(action: string): boolean {
    const key = this.actionMap.get(action);
    return key ? this.keys.has(key) : false;
  }

  getWorldPointer(): { x: number; y: number } {
    return { x: 0, y: 0 };
  }

  onKeyDown(key: string): void {
    this.keys.add(key.toLowerCase());
  }

  onKeyUp(key: string): void {
    this.keys.delete(key.toLowerCase());
  }

  /** Проверка по коду клавиши (для проверки ввода без маппинга). */
  isKeyDown(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }
}
