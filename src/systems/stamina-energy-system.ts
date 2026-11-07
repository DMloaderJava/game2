import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { EventBus as EventBusClass } from '../core/event-bus';

/**
 * StaminaEnergySystem — расход и восстановление Выносливости и Энергии.
 * Приоритет 18.
 */
export class StaminaEnergySystem extends System {
  readonly priority = 18;
  readonly required = [CharacterStats];

  private worldRef!: World;

  private readonly COST = {
    walk: 2.0,
    sprint: 8.0,
    jump: 15.0,
    climb: 6.0,
    carryPerMass: 3.0,
    dig: 10.0,
    scan: 5.0,
    ability: 20.0,
    equipmentMaintenance: 2.0,
  };

  private readonly REGEN = {
    idle: 12.0,
    sitting: 20.0,
    energyBase: 4.0,
    energySource: 20.0,
  };

  constructor(private eventBus: EventBusClass) {
    super();
  }

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

  spendStamina(entity: number, amount: number, reason: string): void {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (!stats) return;
    stats.stamina = Math.max(0, stats.stamina - amount);
    this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);
    this.eventBus.emit('stamina:changed', { entity, stamina: stats.stamina, maxStamina: stats.maxStamina, reason });
  }

  spendEnergy(entity: number, amount: number, reason: string): boolean {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    if (!stats) return false;
    if (stats.energy < amount) return false;
    stats.energy = Math.max(0, stats.energy - amount);
    this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);
    this.eventBus.emit('energy:changed', { entity, energy: stats.energy, maxEnergy: stats.maxEnergy, reason });
    return true;
  }

  canSpendStamina(entity: number, amount: number): boolean {
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as CharacterStatsData | undefined;
    return stats ? stats.stamina >= amount : false;
  }

  private regenStamina(stats: CharacterStatsData, dt: number): void {
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

  bindEvents(_eventBus: EventBusClass): void {
    // Зарезервировано
  }
}
