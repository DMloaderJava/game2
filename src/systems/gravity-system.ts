import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import {
  GlobalGravity,
  IndividualGravity,
  GravityZone,
  GravityForce,
} from '../components/gravity';
import { Material } from '../components/material';

/**
 * GravitySystem — контроллер гравитации.
 * Вычисляет эффективную гравитацию для каждой сущности и записывает в GravityForce.
 * Приоритет 25 — перед PhysicsSystem (30).
 */
export class GravitySystem extends System {
  readonly priority = 25;
  readonly required = [Transform];

  private worldRef!: World;
  private zones = new Map<string, any>();
  private globalEntity = -1;
  private global: { vector: Vec2; scale: number; active: boolean } | null = null;

  constructor(
    private world: World,
    private physics: { applyForce: (body: unknown, force: Vec2) => void },
    private eventBus: EventBus,
  ) {
    super();
    this.worldRef = world;
    // Гарантируем существование глобальной сущности гравитации ещё до вызова setGlobalGravity
    this.ensureGlobalEntity();
  }

  setGlobalGravity(vector: Vec2, scale = 1, active = true): void {
    const entity = this.ensureGlobalEntity();
    this.worldRef.addComponent(entity, GlobalGravity as unknown as symbol, {
      vector: vector.clone(),
      scale,
      active,
    });
    this.global = { vector: vector.clone(), scale, active };
    this.eventBus.emit('gravity:global-changed', { vector: vector.clone(), scale, active });
  }

  getGlobalGravity(): Vec2 | null {
    return this.global?.vector.clone().mul(this.global.scale) ?? null;
  }

  setEntityGravity(entity: number, scale = 1, override?: Vec2): void {
    const data = {
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

  removeEntityGravity(entity: number): void {
    this.worldRef.removeComponent(entity, IndividualGravity as unknown as symbol);
  }

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
    shape: 'circle' | 'aabb';
    center: Vec2;
    vector: Vec2;
    strength?: number;
    falloff?: 'none' | 'linear' | 'inverse-square';
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

  removeZone(id: string): void {
    const entity = this.findZoneEntity(id);
    if (entity !== -1) {
      this.worldRef.destroyEntity(entity);
      this.rebuildZoneCache();
      this.eventBus.emit('gravity:zone-removed', { id });
    }
  }

  update(world: World, dt: number): void {
    this.worldRef = world;
    this.rebuildZoneCache();

    const entities = world.query(Transform);
    for (const { entity, components } of entities) {
      const transform = components[0] as { x: number; y: number; rotation: number };
      const pos = new Vec2(transform.x, transform.y);

      const force = this.computeEffectiveGravity(entity, pos);

      const existing = world.getComponent(entity, GravityForce as unknown as symbol) as { vector: Vec2; dirty: boolean } | undefined;
      if (existing) {
        existing.vector = force;
        existing.dirty = true;
        world.addComponent(entity, GravityForce as unknown as symbol, existing);
      } else {
        world.addComponent(entity, GravityForce as unknown as symbol, { vector: force, dirty: true });
      }
    }
  }

  computeEffectiveGravity(entity: number, pos: Vec2): Vec2 {
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

    const indiv = this.worldRef.getComponent(entity, IndividualGravity as unknown as symbol) as {
      scale: number;
      useOverride: boolean;
      override?: Vec2;
    } | undefined;

    if (indiv?.useOverride && indiv.override) {
      return indiv.override.clone().mul(indiv.scale);
    }

    return base.mul(indiv?.scale ?? 1);
  }

  applyForcesToBodies(dt: number): void {
    const bodies = this.worldRef.query(PhysicsBody, GravityForce, Material);
    for (const { entity, components } of bodies) {
      const bodyData = components[0] as { body: unknown };
      const forceData = components[1] as { vector: Vec2; dirty: boolean };
      const material = components[2] as { mass: number };

      if (!forceData.dirty || !bodyData.body) continue;

      // Ограничиваем силу гравитации, чтобы не выстреливать тела в космос
    const rawForce = forceData.vector.mul(material.mass);
    const clampedForce = new Vec2(
      Math.max(-500, Math.min(500, rawForce.x)),
      Math.max(-500, Math.min(500, rawForce.y)),
    );
    this.physics.applyForce(bodyData.body, clampedForce);

    forceData.dirty = false;
    this.worldRef.addComponent(entity, GravityForce as unknown as symbol, forceData);
    }
  }

  private ensureGlobalEntity(): number {
    if (this.globalEntity !== -1) return this.globalEntity;
    const entity = this.worldRef.createEntity();
    this.worldRef.addComponent(entity, GlobalGravity as unknown as symbol, {
      vector: new Vec2(0, 9.81 * 60),
      scale: 1,
      active: true,
    });
    this.globalEntity = entity;
    this.global = { vector: new Vec2(0, 9.81 * 60), scale: 1, active: true };
    return entity;
  }

  private findZoneEntity(id: string): number {
    const zones = this.worldRef.query(GravityZone);
    for (const { entity, components } of zones) {
      const data = components[0] as { id: string };
      if (data.id === id) return entity;
    }
    return -1;
  }

  private rebuildZoneCache(): void {
    this.zones.clear();
    const zones = this.worldRef.query(GravityZone, Transform);
    for (const { components } of zones) {
      const zone = components[0] as any;
      const transform = components[1] as { x: number; y: number };
      this.zones.set(zone.id, this.makeZoneCache({
        id: zone.id,
        shape: zone.shape,
        center: new Vec2(transform.x, transform.y),
        radius: zone.radius,
        halfExtents: zone.halfExtents,
        vector: zone.vector,
        strength: zone.strength,
        falloff: zone.falloff,
        coreRadius: zone.coreRadius,
        active: zone.active,
      }));
    }
  }

  private makeZoneCache(data: any): any {
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

}
