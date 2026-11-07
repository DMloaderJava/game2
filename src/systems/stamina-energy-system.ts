import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus as EventBusClass } from '../core/event-bus';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { Material } from '../components/material';

/**
 * StaminaEnergySystem — расход и восстановление Выносливости и Энергии.
 *
 * Слушает события:
 *   stamina:spend   — потратить выносливость (прыжок, карабканье, перенос, копание)
 *   energy:spend    — потратить энергию (сканирование, способности)
 *
 * Приоритет 18 — после CharacterSystem (12), до GravitySystem (25),
 * чтобы exhausted-статус был актуален перед применением сил.
 */
export class StaminaEnergySystem extends System {
  readonly priority = 18;
  readonly required = [CharacterStats];

  private worldRef!: World;

  constructor(private eventBus: EventBusClass) {
    super();
  }

  // Константы расхода (ед. в секунду)
  private readonly COST = {
    walk: 2.0,
    sprint: 8.0,
    jump: 15.0,      // разово (событие)
    climb: 6.0,
    carryPerMass: 3.0, // за единицу отношения mass/maxCarryMass
    dig: 10.0,
    scan: 5.0,
    ability: 20.0,
    equipmentMaintenance: 2.0,
  };

  // Константы восстановления (ед. в секунду)
  private readonly REGEN = {
    idle: 12.0,
    sitting: 20.0,
    energyBase: 4.0,
    energySource: 20.0,
  };

  update(world: World, dt: number): void {
    this.worldRef = world;

    const entities = world.query(CharacterStats);
    for (const { entity, components } of entities) {
      const stats = components[0] as CharacterStatsData;

      this.regenStamina(stats, dt);
      this.regenEnergy(stats, dt);

      this.applyClamps(stats);
      this.updateExhausted(stats);

      world.addComponent(entity, CharacterStats as unknown as symbol, stats);
    }
  }

  /* ── Публичное API для событий ─────────────────────────────────── */

  /** Потратить выносливость. Вызывается извне (CharacterSystem, GrabThrowSystem и др.). */
  spendStamina(entity: number, amount: number, reason: string): void {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (!stats) return;
    stats.stamina = Math.max(0, stats.stamina - amount);
    this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);
    this.eventBus.emit('stamina:changed', { entity, stamina: stats.stamina, maxStamina: stats.maxStamina, reason });
  }

  /** Потратить энергию. */
  spendEnergy(entity: number, amount: number, reason: string): boolean {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (!stats) return false;
    if (stats.energy < amount) return false; // недостаточно энергии
    stats.energy = Math.max(0, stats.energy - amount);
    this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);
    this.eventBus.emit('energy:changed', { entity, energy: stats.energy, maxEnergy: stats.maxEnergy, reason });
    return true;
  }

  /** Есть ли достаточно выносливости для действия. */
  canSpendStamina(entity: number, amount: number): boolean {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    return stats ? stats.stamina >= amount : false;
  }

  /* ── Восстановление ───────────────────────────────────────────── */

  private regenStamina(stats: CharacterStatsData, dt: number): void {
    // Восстановление только если не exhausted完全 (даже exhausted восстанавливается медленно)
    const regenRate = stats.exhausted ? this.REGEN.idle * 0.5 : this.REGEN.idle;
    stats.stamina = Math.min(stats.maxStamina, stats.stamina + regenRate * dt);
  }

  private regenEnergy(stats: CharacterStatsData, dt: number): void {
    stats.energy = Math.min(stats.maxEnergy, stats.energy + this.REGEN.energyBase * dt);
  }

  private applyClamps(stats: CharacterStatsData): void {
    stats.health = Math.min(stats.maxHealth, Math.max(0, stats.health));
    stats.stamina = Math.min(stats.maxStamina, Math.max(0, stats.stamina));
    stats.energy = Math.min(stats.maxEnergy, Math.max(0, stats.energy));
    stats.equipmentCondition = Math.min(1, Math.max(0, stats.equipmentCondition));
  }

  private updateExhausted(stats: CharacterStatsData): void {
    stats.exhausted = stats.stamina <= 0;
  }

  /* ── Обработка событий (подписка в main.ts / через EventBus) ───── */

  /** Подписать систему на шину событий (зарезервировано для будущей декларативной подписки). */
  bindEvents(_eventBus: EventBusClass): void {
    // Подписки выполняются через прямые вызовы spendStamina/spendEnergy,
    // чтобы не создавать циклических зависимостей.
  }
}
