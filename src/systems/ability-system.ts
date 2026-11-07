import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { IndividualGravity } from '../components/gravity';
import { CharacterStats } from '../components/character';
import { Inventory } from '../components/inventory';
import {
  AbilityDefinition,
  AbilitySlot,
  ActiveEffect,
  AbilityCombo,
  ProgressionData,
  ALL_ABILITIES,
  EffectType,
  AbilityBranch,
} from '../components/ability';

/**
 * AbilitySystem — модульная система способностей.
 *
 * Управляет:
 *   - активацией способностей из слотов (с коундауном и затратой энергии)
 *   - созданием ActiveEffect с длительностью
 *   - обнаружением синергий (комбинаций) между активными эффектами
 *   - применением эффектов к миру (сила, гравитация, щит и т.д.)
 *
 * Приоритет 35 — после GravitySystem (25) и MiningSystem (28),
 * до ConstructionSystem (40), чтобы эффекты способностей учитывались
 * перед строительством и физикой объектов.
 */
export class AbilitySystem extends System {
  readonly priority = 35;
  readonly required = [Transform];

  private worldRef!: World;

  // Реестр синергий: пара ID способностей → описание комбинации
  private comboRegistry = new Map<string, { comboType: string; multiplier: number }>();

  constructor(private eventBus: EventBus) {
    super();
    this.buildComboRegistry();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    // 1. Обрабатываем активации способностей (вход игрока обрабатывается InputSystem,
    //    которая пишет в AbilitySlot; здесь мы применяем эффекты)
    this.processAbilitySlots(world, dt);

    // 2. Обновляем активные эффекты (уменьшаем время, удаляем истёкшие)
    this.updateActiveEffects(world, dt);

    // 3. Обнаруживаем синергии между активными эффектами
    this.detectCombos(world);

    // 4. Применяем эффекты способностей к миру (сила, гравитация, щит)
    this.applyEffects(world, dt);
  }

  /* ── Публичный API ─────────────────────────────────────────── */

  /** Разблокировать способность для игрока (вызывается ProgressionSystem). */
  unlockAbility(entity: number, abilityId: string): void {
    const definition = this.getDefinition(abilityId);
    if (!definition) return;

    const progression = this.worldRef.getComponent(entity, ProgressionData as unknown as symbol) as {
      unlockedAbilities: string[];
      branchLevels: Record<string, number>;
      branchPoints: Record<string, number>;
    } | undefined;
    if (!progression) return;

    if (progression.unlockedAbilities.includes(abilityId)) return; // уже разблокирована

    // Проверка предварительных условий
    for (const prereq of definition.prerequisites) {
      if (!progression.unlockedAbilities.includes(prereq)) return;
    }
    if ((progression.branchLevels[definition.branch] ?? 0) < definition.requiredBranchLevel) return;

    // Разблокируем
    progression.unlockedAbilities.push(abilityId);
    this.worldRef.addComponent(entity, ProgressionData as unknown as symbol, progression);

    // Добавляем в пустой слот способности
    this.addAbilitySlot(entity, abilityId);

    this.eventBus.emit('ability:unlocked', { abilityId, branch: definition.branch, tier: definition.tier });
  }

  /** Активировать способность в слоте (вызывается InputSystem при нажатии клавиши). */
  activateAbility(entity: number, slotIndex: number): boolean {
    const slots = this.worldRef.getComponent(entity, AbilitySlot as unknown as symbol) as AbilitySlotData[] | undefined;
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as { energy: number } | undefined;
    if (!slots || !stats) return false;

    const slot = slots[slotIndex];
    if (!slot || slot.cooldownRemaining > 0 || slot.isActive) return false;

    const definition = this.getDefinition(slot.abilityId);
    if (!definition) return false;

    // Проверка энергии (суммируем затраты всех эффектов)
    const totalEnergyCost = definition.effects.reduce((sum, e) => sum + e.energyCost, 0);
    if (stats.energy < totalEnergyCost) {
      this.eventBus.emit('ability:no-energy', { entity, abilityId: slot.abilityId });
      return false;
    }

    // Тратим энергию
    stats.energy = Math.max(0, stats.energy - totalEnergyCost);
    this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);

    // Устанавливаем коундаун
    const maxCooldown = Math.max(...definition.effects.map((e) => e.cooldown));
    slot.cooldownRemaining = maxCooldown;
    slot.isActive = true;
    slot.activatedAt = Date.now();

    this.worldRef.addComponent(entity, AbilitySlot as unknown as symbol, slots);

    // Создаём ActiveEffect для каждого эффекта способности
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    const casterPos = transform ? new Vec2(transform.x, transform.y) : new Vec2(0, 0);

    const activeEffects: ActiveEffectData[] = [];
    for (const effect of definition.effects) {
      activeEffects.push({
        abilityId: slot.abilityId,
        effectType: effect.type,
        casterEntity: entity,
        power: effect.power,
        duration: effect.duration ?? 0,
        timeRemaining: effect.duration ?? 0,
        position: casterPos.clone(),
        radius: effect.radius,
        vector: effect.vector?.clone(),
        targetEntities: [],
      });
    }

    this.worldRef.addComponent(entity, ActiveEffect as unknown as symbol, activeEffects);

    this.eventBus.emit('ability:activated', { abilityId: slot.abilityId, slot: slotIndex, entity });
    return true;
  }

  /** Добавить способность в первый пустой слот игрока. */
  private addAbilitySlot(entity: number, abilityId: string): void {
    let slots = this.worldRef.getComponent(entity, AbilitySlot as unknown as symbol) as AbilitySlotData[] | undefined;
    if (!slots) {
      slots = [];
      this.worldRef.addComponent(entity, AbilitySlot as unknown as symbol, slots);
    }

    // Находим пустой слот
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) {
        slots[i] = {
          abilityId,
          cooldownRemaining: 0,
          isActive: false,
          activatedAt: null,
        };
        this.worldRef.addComponent(entity, AbilitySlot as unknown as symbol, slots);
        return;
      }
    }

    // Все слоты заняты — добавляем новый
    slots.push({
      abilityId,
      cooldownRemaining: 0,
      isActive: false,
      activatedAt: null,
    });
    this.worldRef.addComponent(entity, AbilitySlot as unknown as symbol, slots);
  }

  /** Обновить коундауны способностей. */
  private processAbilitySlots(world: World, dt: number): void {
    const actors = world.query(AbilitySlot as unknown as symbol);
    for (const { entity, components } of actors) {
      const slots = components[0] as AbilitySlotData[];
      let changed = false;

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot) continue;

        if (slot.cooldownRemaining > 0) {
          slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - dt);
          changed = true;
        }

        // Если способность была активна, проверяем, есть ли ещё активные эффекты
        if (slot.isActive && slot.activatedAt !== null) {
          const hasActive = this.hasActiveEffect(entity, slot.abilityId);
          if (!hasActive) {
            slot.isActive = false;
            slot.activatedAt = null;
            changed = true;
          }
        }
      }

      if (changed) {
        world.addComponent(entity, AbilitySlot as unknown as symbol, slots);
      }
    }
  }

  /** Обновить активные эффекты (уменьшить время, удалить истёкшие). */
  private updateActiveEffects(world: World, dt: number): void {
    const actors = world.query(ActiveEffect as unknown as symbol);
    for (const { entity, components } of actors) {
      const effects = components[0] as ActiveEffectData[];
      let changed = false;

      for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        effect.timeRemaining -= dt;
        if (effect.timeRemaining <= 0) {
          effects.splice(i, 1);
          changed = true;
          this.eventBus.emit('ability:deactivated', { abilityId: effect.abilityId, entity });
        }
      }

      if (changed) {
        if (effects.length === 0) {
          world.removeComponent(entity, ActiveEffect as unknown as symbol);
        } else {
          world.addComponent(entity, ActiveEffect as unknown as symbol, effects);
        }
      }
    }
  }

  /** Обнаружение синергий между активными эффектами. */
  private detectCombos(world: World): void {
    const actors = world.query(ActiveEffect as unknown as symbol);
    for (const { entity, components } of actors) {
      const effects = components[0] as ActiveEffectData[];

      // Проверяем все пары эффектов на этой сущности
      for (let i = 0; i < effects.length; i++) {
        for (let j = i + 1; j < effects.length; j++) {
          const a = effects[i];
          const b = effects[j];

          const comboKey = this.comboKey(a.abilityId, b.abilityId);
          const combo = this.comboRegistry.get(comboKey);
          if (!combo) continue;

          // Создаём компонент AbilityCombo
          const comboEntity = world.createEntity();
          world.addComponent(comboEntity, AbilityCombo as unknown as symbol, {
            id: `combo_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            comboType: combo.comboType,
            multiplier: combo.multiplier,
            involvedAbilityIds: [a.abilityId, b.abilityId],
            sourceEntities: [a.casterEntity, b.casterEntity],
            targetEntity: entity,
            timeRemaining: Math.min(a.timeRemaining, b.timeRemaining),
          });

          this.eventBus.emit('ability:combo', {
            comboType: combo.comboType,
            abilities: [a.abilityId, b.abilityId],
            multiplier: combo.multiplier,
            target: entity,
          });
        }
      }
    }
  }

  /** Применение эффектов способностей к миру. */
  private applyEffects(world: World, dt: number): void {
    const actors = world.query(ActiveEffect as unknown as symbol);
    for (const { entity, components } of actors) {
      const effects = components[0] as ActiveEffectData[];

      for (const effect of effects) {
        switch (effect.effectType) {
          case 'modify_gravity': {
            // Меняем индивидуальную гравитацию кастера
            const indiv = world.getComponent(entity, IndividualGravity as unknown as symbol) as {
              scale: number;
              useOverride: boolean;
              override?: Vec2;
              orientation: number;
            } | undefined;
            if (indiv) {
              indiv.scale = effect.power;
              indiv.useOverride = true;
              indiv.override = effect.vector ?? new Vec2(0, effect.power * 9.81);
              indiv.orientation = effect.vector ? effect.vector.angle() : 0;
              world.addComponent(entity, IndividualGravity as unknown as symbol, indiv);
            }
            break;
          }

          case 'create_zone': {
            // Создаём гравитационную зону через событие (GravitySystem обработает)
            this.eventBus.emit('gravity:zone-added', {
              id: `ability_zone_${entity}_${effect.abilityId}`,
              shape: 'circle',
              center: effect.position,
              vector: effect.vector ?? new Vec2(0, 0),
              strength: effect.power,
              falloff: 'linear',
              radius: effect.radius ?? 6,
              coreRadius: 1,
            });
            break;
          }

          case 'impulse': {
            // Импульс — применить силу к телу кастера в направлении вектора
            const body = world.getComponent(entity, PhysicsBody as unknown as symbol) as { body: unknown } | undefined;
            if (body && body.body && effect.vector) {
              const force = effect.vector.clone().mul(effect.power);
              (this.physics as any).applyForce(body.body, force);
            }
            break;
          }

          case 'apply_force': {
            // Сила к целям в радиусе
            this.eventBus.emit('ability:force-applied', {
              caster: entity,
              position: effect.position,
              power: effect.power,
              radius: effect.radius ?? 8,
              vector: effect.vector,
            });
            break;
          }

          default:
            break;
        }
      }
    }
  }

  /* ── Вспомогательное ─────────────────────────────────────── */

  private hasActiveEffect(entity: number, abilityId: string): boolean {
    const effects = this.worldRef.getComponent(entity, ActiveEffect as unknown as symbol) as ActiveEffectData[] | undefined;
    return effects ? effects.some((e) => e.abilityId === abilityId && e.timeRemaining > 0) : false;
  }

  private getDefinition(abilityId: string): { effects: Array<any>; prerequisites: string[]; branch: AbilityBranch; tier: number; requiredBranchLevel: number } | undefined {
    const factory = ALL_ABILITIES[abilityId];
    return factory ? factory() : undefined;
  }

  private comboKey(a: string, b: string): string {
    return [a, b].sort().join(':');
  }

  private buildComboRegistry(): void {
    // Притяжение + Грави-рывок
    this.comboRegistry.set('gravity_dash:gravity_pull', { comboType: 'pull_dash', multiplier: 1.5 });
    // Притяжение + Отталкивание
    this.comboRegistry.set('gravity_pull:gravity_push', { comboType: 'compress', multiplier: 2.0 });
    // Невесомость + Отталкивание
    this.comboRegistry.set('gravity_push:zero_gravity', { comboType: 'zero_repulse', multiplier: 2.0 });
    // Импульс + Щит
    this.comboRegistry.set('energy_pulse:energy_shield', { comboType: 'shield_burst', multiplier: 1.8 });
  }

  private physics: any;

  /** Для доступа к PhysicsService (устанавливается в main.ts). */
  setPhysicsService(physics: any): void {
    this.physics = physics;
  }
}

// Внутренние типы для компонентов (совместимость с существующими определениями)
interface AbilitySlotData {
  abilityId: string;
  cooldownRemaining: number;
  isActive: boolean;
  activatedAt: number | null;
}

interface ActiveEffectData {
  abilityId: string;
  effectType: EffectType;
  casterEntity: number;
  power: number;
  duration: number;
  timeRemaining: number;
  position: Vec2;
  radius?: number;
  vector?: Vec2;
  targetEntities: number[];
}
