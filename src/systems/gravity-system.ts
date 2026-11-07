import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import {
  GlobalGravity,
  IndividualGravity,
  GravityZone,
  GravityForce,
  ZoneShape,
  ZoneFalloff,
  type GlobalGravityData,
  type GravityZoneData,
  type IndividualGravityData,
  type GravityForceData,
} from '../components/gravity';
import { Material } from '../components/material';

/**
 * GravitySystem — контроллер гравитации.
 *
 * Вычисляет эффективный вектор гравитации для каждой сущности как комбинацию:
 *
 *   G_base(P)  = G_global * scale_global + Σ G_zone_i * strength_i * falloff_i(P)
 *   G_eff      = G_base(P) * scale_individual   (или override, если задан)
 *
 * Результат записывается в компонент GravityForce, который затем
 * consommруется PhysicsSystem для приложения силы к телу Matter.js.
 *
 * Приоритет 25 — работает после AI (20) и до Physics (30), чтобы сила
 * была применена перед шагом симуляции.
 */
export class GravitySystem extends System {
  readonly priority = 25;
  readonly required = [Transform];

  private zones = new Map<string, ZoneCache>();
  private globalEntity = -1;
  private global: GlobalGravityData | null = null;
  private worldRef!: World;

  constructor(
    private physics: PhysicsService,
    private eventBus: EventBus,
  ) {
    super();
  }

  /* ── Публичный API контроллера гравитации ───────────────────────── */

  /** Установить глобальную гравитацию мира. */
  setGlobalGravity(vector: Vec2, scale = 1, active = true): void {
    const entity = this.ensureGlobalEntity();
    this.worldRef.addComponent(entity, GlobalGravity as unknown as symbol, {
      vector: vector.clone(),
      scale,
      active,
    });
    this.global = this.worldRef.getComponent(
      entity,
      GlobalGravity as unknown as symbol,
    ) as GlobalGravityData;
    this.eventBus.emit('gravity:global-changed', {
      vector: vector.clone(),
      scale,
      active,
    });
  }

  /** Получить текущий эффективный глобальный вектор (включая scale). */
  getGlobalGravity(): Vec2 | null {
    return this.global?.vector.clone().mul(this.global.scale) ?? null;
  }

  /**
   * Установить индивидуальную гравитацию сущности.
   * @param entity — целевая сущность
   * @param scale — множитель итогового вектора (0 = невесомость, 1 = норма)
   * @param override — если передан, полностью заменяет вычисленную гравитацию
   * (ходьба по стенам/потолку)
   */
  setEntityGravity(entity: number, scale = 1, override?: Vec2): void {
    const data: IndividualGravityData = {
      scale,
      useOverride: !!override,
      override: override?.clone(),
      orientation: override ? override.angle() : 0,
    };
    if (this.worldRef.hasComponent(entity, IndividualGravity as unknown as symbol)) {
      this.worldRef.addComponent(entity, IndividualGravity as unknown as symbol, data);
    } else {
      this.worldRef.addComponent(entity, IndividualGravity as unknown as symbol, data);
    }
  }

  /** Вернуть сущность к расчёту гравитации по умолчанию. */
  removeEntityGravity(entity: number): void {
    this.worldRef.removeComponent(entity, IndividualGravity as unknown as symbol);
  }

  /**
   * Добавить локальную гравитационную зону.
   * Зона создаётся/обновляется как сущность с компонентами Transform + GravityZone.
   */
  addZone({
    id,
    shape,
    center,
    vector,
    strength = 1,
    falloff = 'none',
    radius,
    halfExtents,
    coreRadius,
  }: {
    id: string;
    shape: ZoneShape;
    center: Vec2;
    vector: Vec2;
    strength?: number;
    falloff?: ZoneFalloff;
    radius?: number;
    halfExtents?: Vec2;
    coreRadius?: number;
  }): void {
    let entity = this.findZoneEntity(id);
    if (entity === -1) {
      entity = this.worldRef.createEntity();
    }

    this.worldRef.addComponent(entity, Transform as unknown as symbol, {
      x: center.x,
      y: center.y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });

    this.worldRef.addComponent(entity, GravityZone as unknown as symbol, {
      id,
      shape,
      radius,
      halfExtents: halfExtents?.clone(),
      vector: vector.clone(),
      strength,
      falloff,
      coreRadius,
      active: true,
    });

    this.rebuildZoneCache();
    this.eventBus.emit('gravity:zone-added', { id, shape, center, vector, strength });
  }

  /** Удалить зону по id (и её сущность из мира). */
  removeZone(id: string): void {
    const entity = this.findZoneEntity(id);
    if (entity !== -1) {
      this.worldRef.destroyEntity(entity);
      this.rebuildZoneCache();
      this.eventBus.emit('gravity:zone-removed', { id });
    }
  }

  /** Включить/выключить зону. */
  setZoneActive(id: string, active: boolean): void {
    const entity = this.findZoneEntity(id);
    if (entity === -1) return;
    const data = this.worldRef.getComponent(
      entity,
      GravityZone as unknown as symbol,
    ) as GravityZoneData;
    data.active = active;
    this.worldRef.addComponent(entity, GravityZone as unknown as symbol, data);
    this.rebuildZoneCache();
  }

  /* ── ECS ───────────────────────────────────────────────────────── */

  update(world: World, dt: number): void {
    this.worldRef = world;
    this.rebuildZoneCache();

    const entities = world.query(Transform);
    for (const { entity, components } of entities) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const pos = new Vec2(transform.x, transform.y);

      const force = this.computeEffectiveGravity(entity, pos);

      const existing = world.getComponent(entity, GravityForce as unknown as symbol) as GravityForceData | undefined;
      if (existing) {
        existing.vector = force;
        existing.dirty = true;
        world.addComponent(entity, GravityForce as unknown as symbol, existing);
      } else {
        world.addComponent(entity, GravityForce as unknown as symbol, { vector: force, dirty: true });
      }
    }
  }

  /**
   * Приложить накопленные силы гравитации к телам Matter.js.
   * Вызывается PhysicsSystem перед шагом симуляции.
   * F = m * g, применяется в центре масс (без вращательного момента).
   */
  applyForcesToBodies(dt: number): void {
    const bodies = this.worldRef.query(PhysicsBody, GravityForce, Material);
    for (const { entity, components } of bodies) {
      const bodyData = components[0] as { body: unknown };
      const forceData = components[1] as GravityForceData;
      const material = components[2] as { mass: number };

      if (!forceData.dirty || !bodyData.body) continue;

      const force = forceData.vector.mul(material.mass);
      (this.physics as any).applyForce(bodyData.body, force);

      forceData.dirty = false;
      this.worldRef.addComponent(entity, GravityForce as unknown as symbol, forceData);
    }
  }

  /* ── Вычисления гравитации ────────────────────────────────────── */

  /**
   * Эффективная гравитация для сущности в точке pos.
   */
  computeEffectiveGravity(entity: number, pos: Vec2): Vec2 {
    // 1. Базовая гравитация в точке (глобальная + локальные зоны)
    let base = Vec2.zero();

    if (this.global?.active) {
      base = base.add(this.global.vector.mul(this.global.scale));
    }

    for (const zone of this.zones.values()) {
      if (!zone.active || !zone.contains(pos)) continue;
      const f = zone.falloffAt(pos);
      if (f <= 0) continue;
      base = base.add(zone.vector.mul(zone.strength * f));
    }

    // 2. Индивидуальный модификатор сущности
    const indiv = this.worldRef.getComponent(
      entity,
      IndividualGravity as unknown as symbol,
    ) as IndividualGravityData | undefined;

    if (indiv?.useOverride && indiv.override) {
      // Полное переопределение — ходьба по стенам/потолку
      return indiv.override.clone().mul(indiv.scale);
    }

    return base.mul(indiv?.scale ?? 1);
  }

  /* ── Внутренние helpers ───────────────────────────────────────── */

  private ensureGlobalEntity(): number {
    if (this.globalEntity !== -1) return this.globalEntity;
    const entity = this.worldRef.createEntity();
    this.worldRef.addComponent(entity, GlobalGravity as unknown as symbol, {
      vector: new Vec2(0, 9.81),
      scale: 1,
      active: true,
    });
    this.globalEntity = entity;
    this.global = this.worldRef.getComponent(
      entity,
      GlobalGravity as unknown as symbol,
    ) as GlobalGravityData;
    return entity;
  }

  private findZoneEntity(id: string): number {
    const zones = this.worldRef.query(GravityZone);
    for (const { entity, components } of zones) {
      const data = components[0] as GravityZoneData;
      if (data.id === id) return entity;
    }
    return -1;
  }

  private rebuildZoneCache(): void {
    this.zones.clear();
    const zones = this.worldRef.query(GravityZone, Transform);
    for (const { components } of zones) {
      const zone = components[0] as GravityZoneData;
      const transform = components[1] as { x: number; y: number };
      this.zones.set(zone.id, makeZoneCache({
        id: zone.id,
        shape: zone.shape,
        center: new Vec2(transform.x, transform.y),
        radius: zone.radius,
        halfExtents: zone.halfExtents?.clone(),
        vector: zone.vector.clone(),
        strength: zone.strength,
        falloff: zone.falloff,
        coreRadius: zone.coreRadius,
        active: zone.active,
      }));
    }
  }
}

/** Кэшированные данные зоны для быстрого обхода при вычислении гравитации. */
interface ZoneCache {
  id: string;
  shape: ZoneShape;
  center: Vec2;
  radius?: number;
  halfExtents?: Vec2;
  vector: Vec2;
  strength: number;
  falloff: ZoneFalloff;
  coreRadius?: number;
  active: boolean;
  contains(p: Vec2): boolean;
  falloffAt(p: Vec2): number;
}

function makeZoneCache(data: Omit<ZoneCache, 'contains' | 'falloffAt'>): ZoneCache {
  const contains = (p: Vec2): boolean => {
    if (data.shape === 'circle') {
      const r = data.radius ?? 0;
      return p.distanceSq(data.center) <= r * r;
    }
    const h = data.halfExtents ?? new Vec2(0, 0);
    return (
      p.x >= data.center.x - h.x &&
      p.x <= data.center.x + h.x &&
      p.y >= data.center.y - h.y &&
      p.y <= data.center.y + h.y
    );
  };

  const falloffAt = (p: Vec2): number => {
    if (data.falloff === 'none') return 1;
    const d = p.distance(data.center);
    const core = data.coreRadius ?? 0;
    if (d <= core) return 1;

    let maxDist: number;
    if (data.shape === 'circle') {
      maxDist = data.radius ?? 0;
    } else {
      const h = data.halfExtents ?? new Vec2(0, 0);
      maxDist = Math.max(h.x, h.y);
    }
    if (d >= maxDist) return 0;

    const t = (d - core) / Math.max(maxDist - core, 0.0001);
    if (data.falloff === 'linear') return 1 - t;
    if (data.falloff === 'inverse-square') return 1 / (1 + t * t);
    return 1 - t;
  };

  return { ...data, contains, falloffAt };
}
