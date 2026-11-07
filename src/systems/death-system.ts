import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { Dead, RespawnPoint } from '../components/character';
import { CharacterController, CharacterControllerData } from '../components/character';
import { IndividualGravity } from '../components/gravity';
import { Transform } from '../components/transform';

/**
 * DeathSystem — обработка смерти персонажа для обоих режимов (Softcore / Hardcore).
 *
 * Слушает событие `player:died` (эмитит CharacterSystem при health <= 0)
 * и `health:changed` (для обнаружения смерти другими системами).
 *
 * Приоритет 100 — срабатывает в конце кадра, после всех игровых систем.
 */
export class DeathSystem extends System {
  readonly priority = 100;
  readonly required = [CharacterStats, CharacterController];

  private worldRef!: World;

  // Конфигурация режима (устанавливается при старте игры)
  private gameMode: 'softcore' | 'hardcore' = 'softcore';

  // Софткор: данные для возрождения
  private respawnData: { entity: number; delay: number; timer: number; spawnPoint: Vec2 } | null = null;

  constructor(private eventBus: EventBus) {
    super();
  }

  /** Установить режим игры (вызывается при старте / загрузке сохранения). */
  setGameMode(mode: 'softcore' | 'hardcore'): void {
    this.gameMode = mode;
    this.eventBus.emit('game:mode-changed', { mode });
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    // Обработка отложенного возрождения (softcore)
    if (this.respawnData) {
      this.respawnData.timer -= dt;
      if (this.respawnData.timer <= 0) {
        this.performRespawn(this.respawnData.entity, this.respawnData.spawnPoint);
        this.respawnData = null;
      }
      return;
    }

    // Поиск только что умерших (estado Dead, но компонент Dead только что добавлен)
    const actors = world.query(CharacterStats, CharacterController);
    for (const { entity, components } of actors) {
      const stats = components[0] as CharacterStatsData;
      const ctrl = components[1] as CharacterControllerData;

      if (stats.health > 0) continue;
      if (ctrl.state === 'Dead') continue; // уже обрабатывается

      this.handleDeath(entity, stats);
    }
  }

  /* ── Обработка смерти ─────────────────────────────────────────── */

  private handleDeath(entity: number, stats: CharacterStatsData): void {
    const ctrl = this.worldRef.getComponent(entity, 'character-controller' as unknown as symbol) as { state: string } | undefined;
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    const deathPos = transform ? new Vec2(transform.x, transform.y) : new Vec2(0, 0);

    // Переход в состояние Dead
    this.worldRef.addComponent(entity, CharacterController as unknown as symbol, {
      ...ctrl,
      state: 'Dead',
      stateTime: 0,
    } as CharacterControllerData);

    this.worldRef.addComponent(entity, Dead as unknown as symbol, {
      time: Date.now(),
      mode: this.gameMode,
      deathPosition: deathPos,
    });

    this.eventBus.emit('player:died', { entity, mode: this.gameMode, position: deathPos });

    if (this.gameMode === 'hardcore') {
      this.handleHardcoreDeath(entity);
    } else {
      this.handleSoftcoreDeath(entity);
    }
  }

  private handleSoftcoreDeath(entity: number): void {
    // 1. Часть инвентаря дропается на месте смерти (сохраняется возможность собрать обратно)
    this.dropInventoryPartially(entity);

    // 2. Штраф к оборудованию
    this.applyEquipmentDamage(entity, 0.2);

    // 3. Дебафф истощения на 5 минут
    this.applyDebuff(entity, 'exhaustion', 300);

    // 4. Запланировать возрождение через 3 секунды на активном спавне
    const spawnPoint = this.findActiveSpawnPoint();
    this.respawnData = {
      entity,
      delay: 3.0,
      timer: 3.0,
      spawnPoint: spawnPoint ? spawnPoint.position : new Vec2(100, 100),
    };

    this.eventBus.emit('softcore:death', { entity, respawnIn: 3.0 });
  }

  private handleHardcoreDeath(entity: number): void {
    // 1. Перманентная смерть
    // 2. Весь инвентарь теряется (дропается, но персонаж не может его подобрать)
    this.dropAllInventory(entity);

    // 3. Блокировка сохранения
    this.lockSaving();

    // 4. Помечаем персонажа как мёртвого навсегда
    this.eventBus.emit('hardcore:death', { entity, permanent: true });

    // 5. Экран Game Over (UI система отреагирует на событие)
    this.eventBus.emit('game:over', { reason: 'hardcore-death', entity });
  }

  /* ── Возрождение (Softcore) ──────────────────────────────────── */

  private performRespawn(entity: number, spawnPoint: Vec2): void {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;

    // Восстановление параметров (частичное)
    if (stats) {
      stats.health = stats.maxHealth * 0.5; // возрождаемся с 50% здоровья
      stats.stamina = stats.maxStamina;
      stats.energy = stats.maxEnergy * 0.5;
      this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);
    }

    // Перемещение на точку спавна
    if (transform) {
      transform.x = spawnPoint.x;
      transform.y = spawnPoint.y;
      this.worldRef.addComponent(entity, Transform as unknown as symbol, transform);
    }

    // Сброс состояния Dead
    const ctrl = this.worldRef.getComponent(entity, CharacterController as unknown as symbol) as CharacterControllerData | undefined;
    if (ctrl) {
      this.worldRef.addComponent(entity, CharacterController as unknown as symbol, {
        ...ctrl,
        state: 'Grounded',
        stateTime: 0,
      } as CharacterControllerData);
    }

    this.worldRef.removeComponent(entity, Dead as unknown as symbol);

    this.eventBus.emit('player:respawned', { entity, position: spawnPoint });
  }

  /* ── Вспомогательное ─────────────────────────────────────────── */

  private findActiveSpawnPoint(): { position: Vec2 } | null {
    const spawns = this.worldRef.query(RespawnPoint as unknown as symbol);
    for (const { components } of spawns) {
      const data = components[0] as { position: Vec2; active: boolean };
      if (data.active) return { position: data.position };
    }
    return null;
  }

  private dropInventoryPartially(entity: number): void {
    // Логика дропа части инвентаря — реализуется InventorySystem через событие
    this.eventBus.emit('inventory:drop-on-death', { entity, keepPercentage: 0.7 }); // 30% теряется
  }

  private dropAllInventory(entity: number): void {
    this.eventBus.emit('inventory:drop-all-on-death', { entity });
  }

  private applyEquipmentDamage(entity: number, amount: number): void {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (stats) {
      stats.equipmentCondition = Math.max(0, stats.equipmentCondition - amount);
      this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);
    }
    this.eventBus.emit('equipment:damaged', { entity, amount });
  }

  private applyDebuff(entity: number, type: string, duration: number): void {
    this.eventBus.emit('debuff:apply', { entity, type, duration });
  }

  private lockSaving(): void {
    this.eventBus.emit('save:lock', { reason: 'hardcore-death' });
  }
}


