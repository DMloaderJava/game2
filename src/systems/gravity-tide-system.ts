import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { PhysicsService } from '../services/physics-service';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { Material } from '../components/material';
import {
  TideState,
  TidePhase,
  TideConfig,
  AnomalyZone,
  AnomalyType,
  EnergyDome,
} from '../components/event-state';
import { Structure, StructuralIntegrity } from '../components/construction';
import { GravityAnchor } from '../components/construction';

/**
 * GravityTideSystem — глобальный менеджер состояний события «Гравитационный прилив».
 *
 * Реализует стейт-машину из 4 фаз:
 *   Stability → Warning → Catastrophe → Aftermath → Stability
 *
 * Управляет:
 *   - переключением фаз по таймеру
 *   - сменой вектора глобальной гравитации в фазе 3
 *   - защитой построек через Гравитационные якори и Энергетические купола
 *   - Zerstörung незащищённых построек в фазе 3
 *   - спавном опасных существ и аномалий
 *   - блокировкой сохранения в фазе 3
 *
 * Приоритет 70 — после EventSystem (60) и ProgressionSystem (65),
 * до RenderSystem (90).
 */
export class GravityTideSystem extends System {
  readonly priority = 70;
  readonly required = [Transform];

  private worldRef!: World;

  private tideEntity: number | null = null;
  private tide: TideStateData | null = null;
  private _lastSpawnTime = 0;

  constructor(
    private eventBus: EventBus,
    private physics: PhysicsService,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    this.ensureTideEntity(world);
    if (!this.tide) return;

    this.tide.phaseTimer += dt;

    // Проверка перехода в следующую фазу
    if (this.tide.phaseTimer >= this.tide.phaseDuration) {
      this.advanceToNextPhase(world);
      return;
    }

    // Логика внутри фазы
    switch (this.tide.phase) {
      case 'warning':
        this.updateWarningPhase(dt);
        break;
      case 'catastrophe':
        this.updateCatastrophePhase(world, dt);
        break;
      case 'aftermath':
        this.updateAftermathPhase(world, dt);
        break;
      case 'stability':
        // Обычный геймплей, никаких специальных эффектов
        break;
    }

    // Сохраняем обновлённое состояние
    this.worldRef.addComponent(this.tideEntity!, TideState as unknown as symbol, this.tide!);
  }

  /* ── Инициализация ─────────────────────────────────────────── */

  private ensureTideEntity(world: World): void {
    if (this.tideEntity !== null) return;

    const tideEntities = world.query(TideState as unknown as symbol);
    if (tideEntities.length > 0) {
      this.tideEntity = tideEntities[0].entity;
      this.tide = tideEntities[0].components[0] as TideStateData;
      return;
    }

    this.tideEntity = world.createEntity();
    this.tide = {
      phase: 'stability',
      phaseTimer: 0,
      phaseDuration: this.randomRange(TideConfig.stabilityDuration.min, TideConfig.stabilityDuration.max),
      cycleCount: 0,
      globalGravityVector: new Vec2(0, 9.81),
      nextGravityVector: this.randomGravityVector(),
      isSaveLocked: false,
      warningSignal: false,
    };
    world.addComponent(this.tideEntity, TideState as unknown as symbol, this.tide);
  }

  /* ── Переход фаз ───────────────────────────────────────────── */

  private advanceToNextPhase(world: World): void {
    if (!this.tide) return;

    const oldPhase = this.tide.phase;

    switch (oldPhase) {
      case 'stability':
        this.tide.phase = 'warning';
        this.tide.phaseDuration = this.randomRange(TideConfig.warningDuration.min, TideConfig.warningDuration.max);
        this.tide.warningSignal = true;
        this.eventBus.emit('tide:warning-start', { timeRemaining: this.tide.phaseDuration });
        break;

      case 'warning':
        this.tide.phase = 'catastrophe';
        this.tide.phaseDuration = this.randomRange(TideConfig.catastropheDuration.min, TideConfig.catastropheDuration.max);
        this.tide.warningSignal = false;
        this.tide.isSaveLocked = true;
        this.eventBus.emit('tide:catastrophe-start', { gravityVector: this.tide.nextGravityVector.clone() });
        break;

      case 'catastrophe':
        this.tide.phase = 'aftermath';
        this.tide.phaseDuration = this.randomRange(TideConfig.aftermathDuration.min, TideConfig.aftermathDuration.max);
        this.tide.isSaveLocked = false;
        this.tide.cycleCount += 1;
        this.eventBus.emit('tide:catastrophe-end', { cycleCount: this.tide.cycleCount });
        break;

      case 'aftermath':
        this.tide.phase = 'stability';
        this.tide.phaseDuration = this.randomRange(TideConfig.stabilityDuration.min, TideConfig.stabilityDuration.max);
        this.tide.globalGravityVector = this.tide.nextGravityVector.clone();
        this.tide.nextGravityVector = this.randomGravityVector();
        this.eventBus.emit('tide:phase-changed', {
          from: oldPhase,
          to: this.tide.phase,
          cycleCount: this.tide.cycleCount,
          phaseDuration: this.tide.phaseDuration,
        });
        break;
    }

    this.tide.phaseTimer = 0;

    this.eventBus.emit('tide:phase-changed', {
      from: oldPhase,
      to: this.tide.phase,
      cycleCount: this.tide.cycleCount,
      phaseDuration: this.tide.phaseDuration,
    });

    // При смене гравитации в фазу катастрофы — применяем эффекты
    if (this.tide.phase === 'catastrophe') {
      this.applyGravityChange(world);
    }
  }

  /* ── Фаза 2: Предупреждение ───────────────────────────────── */

  private updateWarningPhase(dt: number): void {
    if (!this.tide) return;

    const timeRemaining = this.tide.phaseDuration - this.tide.phaseTimer;

    // Периодический сигнал сканера (каждые 5 секунд)
    const currentSecond = Math.floor(this.tide.phaseTimer);
    const previousSecond = Math.floor(this.tide.phaseTimer - dt);
    if (currentSecond % 5 === 0 && previousSecond % 5 !== 0) {
      this.eventBus.emit('tide:warning-pulse', { timeRemaining });
    }
  }

  /* ── Фаза 3: Катастрофа ───────────────────────────────────── */

  private applyGravityChange(world: World): void {
    if (!this.tide) return;

    const oldVector = this.tide.globalGravityVector.clone();
    const newVector = this.tide.nextGravityVector.clone();

    this.tide.globalGravityVector = newVector;

    this.eventBus.emit('tide:gravity-changed', { oldVector, newVector });

    // Применяем импульс ко всем физическим телам
    const bodies = world.query(PhysicsBody, Transform, Material);
    for (const { entity, components } of bodies) {
      const bodyData = components[0] as { body: unknown };
      const material = components[2] as { mass: number };

      if (!bodyData.body) continue;

      const impulseForce = newVector.clone().mul(material.mass * 0.5);
      (this.physics as any).applyForce(bodyData.body, impulseForce);
    }
  }

  private updateCatastrophePhase(world: World, dt: number): void {
    if (!this.tide) return;

    // Проверка целостности построек — защита через якоря и купола
    this.checkStructureIntegrity(world, dt);

    // Спавн опасных существ (периодически)
    this.spawnCatastropheEntities(world, dt);

    // Жидкости текут по новому вектору гравитации
    this.applyFluidFlow(world, dt);
  }

  /**
   * Проверяет целостность построек при смене гравитации.
   * Постройки без Гравитационного Яоря и без Энергетического Купола разрушаются.
   */
  private checkStructureIntegrity(world: World, dt: number): void {
    if (!this.tide) return;

    const anchors = world.query(GravityAnchor);
    const domes = world.query(EnergyDome);
    const structures = world.query(Structure, Transform, StructuralIntegrity);

    // Кэшируем активные якоря с их позициями
    const anchorDataList: Array<{ entity: number; data: GravityAnchorData; transform: { x: number; y: number } }> = [];
    for (const { entity, components } of anchors) {
      const anchorData = components[0] as GravityAnchorData;
      const anchorTransform = world.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
      if (anchorData.active && anchorTransform) {
        anchorDataList.push({ entity, data: anchorData, transform: anchorTransform });
      }
    }

    // Активные купола
    const activeDomes: Array<{ entity: number; data: EnergyDomeData; transform: { x: number; y: number } }> = [];
    for (const { entity, components } of domes) {
      const domeData = components[0] as EnergyDomeData;
      const domeTransform = world.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
      if (domeData.active && domeData.storedEnergy > 0 && domeTransform) {
        activeDomes.push({ entity, data: domeData, transform: domeTransform });
      }
    }

    for (const { entity, components } of structures) {
      const integrity = components[2] as StructuralIntegrityData;
      const transform = components[1] as { x: number; y: number };
      if (!integrity || integrity.integrity <= 0) continue;

      if (integrity.anchored) continue; // якорь защищает

      // Проверка расстояния до активных якорей
      let protectedByAnchor = false;
      for (const anchor of anchorDataList) {
        const dx = transform.x - anchor.transform.x;
        const dy = transform.y - anchor.transform.y;
        if (Math.hypot(dx, dy) <= anchor.data.radius) {
          protectedByAnchor = true;
          break;
        }
      }

      if (protectedByAnchor) continue;

      // Проверка Энергетического Купола
      let protectedByDome = false;
      for (const dome of activeDomes) {
        const dx = transform.x - dome.transform.x;
        const dy = transform.y - dome.transform.y;
        if (Math.hypot(dx, dy) <= dome.data.radius) {
          protectedByDome = true;
          dome.data.storedEnergy = Math.max(0, dome.data.storedEnergy - dome.data.energyDrainPerStructure * dt);
          world.addComponent(dome.entity, EnergyDome as unknown as symbol, dome.data);
          break;
        }
      }

      if (!protectedByDome) {
        // Постройка не защищена — теряет целостность
        integrity.integrity = Math.max(0, integrity.integrity - TideConfig.gravityChangeDamagePerSecond * dt);
        world.addComponent(entity, StructuralIntegrity as unknown as symbol, integrity);

        this.eventBus.emit('structure:at-risk', {
          entity,
          anchor: integrity.anchored,
          dome: protectedByDome,
        });

        if (integrity.integrity <= 0) {
          this.collapseStructure(entity);
        }
      }
    }
  }

  private collapseStructure(entity: number): void {
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!transform) return;

    this.worldRef.removeComponent(entity, Structure as unknown as symbol);
    this.worldRef.removeComponent(entity, StructuralIntegrity as unknown as symbol);
    this.worldRef.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: null,
      gravityScale: 1.0,
      isSleeping: false,
    });
    this.worldRef.addComponent(entity, Material as unknown as symbol, {
      mass: 30, density: 2000, strength: 1000, durability: 1,
      sailArea: 0.1, airResistance: 0.4, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.0,
    });

    this.eventBus.emit('structure:collapsed', { entity, x: transform.x, y: transform.y });
  }

  private spawnCatastropheEntities(world: World, dt: number): void {
    const time = Date.now();
    if (!this._lastSpawnTime || time - this._lastSpawnTime > 8000) {
      this._lastSpawnTime = time;
      this.eventBus.emit('tide:spawn-dangerous-entities', {
        gravityVector: this.tide!.globalGravityVector.clone(),
        cycleCount: this.tide!.cycleCount,
      });
    }
  }

  private applyFluidFlow(world: World, dt: number): void {
    this.eventBus.emit('tide:fluid-flow', {
      vector: this.tide!.globalGravityVector.clone(),
      dt,
    });
  }

  /* ── Фаза 4: Последствия ─────────────────────────────────── */

  private updateAftermathPhase(world: World, dt: number): void {
    if (!this.tide) return;

    if (this.tide.phaseTimer < 0.1) {
      const mutations = world.query('world-mutation' as unknown as symbol);
      const mutationList = mutations.map(({ components }) => components[0] as { id: string; type: string; applied: boolean });
      const pending = mutationList.filter((m) => !m.applied);

      if (pending.length > 0) {
        this.eventBus.emit('tide:aftermath-start', { mutations: pending, cycleCount: this.tide.cycleCount });
      }
    }
  }

  /* ── Публичное API ───────────────────────────────────────── */

  /** Заблокировано ли сохранение (фаза 3). */
  isSaveLocked(): boolean {
    return this.tide?.isSaveLocked ?? false;
  }

  /** Получить текущий вектор глобальной гравитации. */
  getGlobalGravityVector(): Vec2 {
    return this.tide?.globalGravityVector.clone() ?? new Vec2(0, 9.81);
  }

  /** Получить текущую фазу прилива. */
  getCurrentPhase(): TidePhase {
    return this.tide?.phase ?? 'stability';
  }

  /** Вручную сменить фазу (для отладки или скриптовых событий). */
  setPhase(phase: TidePhase, duration: number): void {
    if (!this.tide) return;
    this.tide.phase = phase;
    this.tide.phaseDuration = duration;
    this.tide.phaseTimer = 0;
    this.eventBus.emit('tide:phase-changed', {
      from: this.tide.phase,
      to: phase,
      cycleCount: this.tide.cycleCount,
      phaseDuration: duration,
    });
  }

  /* ── Вспомогательное ─────────────────────────────────────── */

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private randomGravityVector(): Vec2 {
    const directions = [
      new Vec2(0, 9.81),
      new Vec2(0, -9.81),
      new Vec2(9.81, 0),
      new Vec2(-9.81, 0),
      new Vec2(6.94, 6.94),
    ];
    return directions[Math.floor(Math.random() * directions.length)].clone();
  }
}

// Внутренние типы для совместимости с существующими компонентами
interface GravityAnchorData {
  active: boolean;
  radius: number;
  energyPerSecond: number;
  anchoredEntities: number[];
}

interface StructuralIntegrityData {
  integrity: number;
  anchored: boolean;
  supportedBy: number[];
  supports: number[];
}

interface TideStateData {
  phase: TidePhase;
  phaseTimer: number;
  phaseDuration: number;
  cycleCount: number;
  globalGravityVector: Vec2;
  nextGravityVector: Vec2;
  isSaveLocked: boolean;
  warningSignal: boolean;
}

interface EnergyDomeData {
  active: boolean;
  radius: number;
  energyPerSecond: number;
  energyDrainPerStructure: number;
  storedEnergy: number;
  maxStored: number;
  protectedEntities: number[];
}
