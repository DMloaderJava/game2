/**
 * StorageService — сохранения в IndexedDB (обёртка idb / Dexie.js).
 * Настройки пользователя хранятся в localStorage, миры — в IndexedDB.
 */
export class StorageService {
  /** Сохранить слот в IndexedDB. Данные предварительно сжимаются (LZ-string). */
  async saveSlot(slotId: string, data: unknown): Promise<void> {
    // await db.slots.put({ id: slotId, data: compress(JSON.stringify(data)), version: 1 })
  }

  /** Загрузить слот. */
  async loadSlot(slotId: string): Promise<unknown> {
    // const row = await db.slots.get(slotId);
    // return row ? decompressAndParse(row.data) : null;
    return null;
  }

  /** Список доступных слотов с метаданными (время, версия, имя мира). */
  async listSlots(): Promise<Array<{ id: string; savedAt: number }>> {
    return [];
  }

  /** Удалить слот. */
  async deleteSlot(slotId: string): Promise<void> {}

  /** Настройки пользователя (клавиши, громкость) — localStorage. */
  getSetting<T>(key: string, defaultValue: T): T {
    return defaultValue;
  }
  setSetting(key: string, value: unknown): void {}
}
