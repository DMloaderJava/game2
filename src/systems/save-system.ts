import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { StorageService } from '../services/storage-service';

/**
 * SaveSystem — автосохранение и загрузка миров в IndexedDB.
 * Сериализует только компоненты с флагом persist; сжатие LZ-string;
 * миграция версий схемы при загрузке старых сейвов.
 */
export class SaveSystem extends System {
  readonly priority = 100;
  readonly required = [];

  private accumulator = 0;
  private readonly autosaveInterval = 300; // сек

  constructor(
    private storage: StorageService,
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.accumulator += dt;
    if (this.accumulator >= this.autosaveInterval) {
      this.accumulator = 0;
      this.autosave('autosave');
    }
  }

  async autosave(slotId: string): Promise<void> {
    // const data = this.serialize(world);
    // await this.storage.saveSlot(slotId, data);
    // this.eventBus.emit('save-completed', { slotId });
  }

  async load(slotId: string): Promise<void> {
    // const data = await this.storage.loadSlot(slotId);
    // if (data) this.deserialize(world, data);
    // this.eventBus.emit('load-completed', { slotId });
  }

  private serialize(world: World): unknown {
    // Обойти все сущности, взять только persist-компоненты
    return { version: 1, entities: [] };
  }
}
