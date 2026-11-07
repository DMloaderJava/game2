import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { Renderable } from '../components/renderable';
import { Material } from '../components/material';
import { CharacterController, CharacterControllerData } from '../components/character';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { Structure, StructureData, StructureType, StructureTemplates } from '../components/construction';
import { Buildable, BuildableData } from '../components/construction';
import { SnapGrid, SnapGridData } from '../components/construction';
import { StructuralIntegrity, StructuralIntegrityData } from '../components/construction';
import { GravityAnchor, GravityAnchorData } from '../components/construction';
import { GhostPreview, GhostPreviewData } from '../components/construction';
import { Inventory, InventoryData } from '../components/inventory';

/**
 * ConstructionSystem — размещение построек, снаппинг по сетке,
 * структурная целостность, взаимодействие с Гравитационным Якорем.
 *
 * Приоритет 40 — после GrabThrowSystem (22) и MiningSystem (28),
 * до EventSystem (60).
 */
export class ConstructionSystem extends System {
  readonly priority = 40;
  readonly required = [CharacterController, CharacterStats];

  private worldRef!: World;

  constructor(
    private physics: PhysicsService,
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const actors = world.query(CharacterController, CharacterStats);
    for (const { entity, components } of actors) {
      const ctrl = components[0] as CharacterControllerData;
      const stats = components[1] as CharacterStatsData;

      if (ctrl.state === 'Dead') continue;

      // Если режим строительства активен — обрабатываем размещение
      if (ctrl.interactPressed && ctrl.carriedEntity === null) {
        this.handlePlacement(entity, ctrl, stats);
      }

      // Проверка структурной целостности всех построек (раз в кадр или по таймеру)
      this.checkStructuralIntegrity(world);
    }
  }

  /* ── Размещение построек ────────────────────────────────────── */

  private handlePlacement(entity: number, ctrl: CharacterControllerData, stats: CharacterStatsData): void {
    const buildable = this.worldRef.getComponent(entity, Buildable as unknown as symbol) as BuildableData | undefined;
    if (!buildable) return;

    // Позиция размещения (перед игроком)
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number; rotation: number } | undefined;
    if (!transform) return;

    const dir = ctrl.inputDirection;
    let angle = transform.rotation;
    if (dir.x !== 0 || dir.y !== 0) {
      angle = Math.atan2(dir.y, dir.x);
    }
    const distance = 40; // радиус размещения
    const rawX = transform.x + Math.cos(angle) * distance;
    const rawY = transform.y + Math.sin(angle) * distance;

    // Снаппинг по сетке (grid) или свободное размещение (free)
    let placeX = rawX;
    let placeY = rawY;
    if (buildable.placementMode === 'grid') {
      const snap = this.worldRef.getComponent(entity, SnapGrid as unknown as symbol) as SnapGridData | undefined;
      const cell = snap ? snap.cellSize : 32;
      const ox = snap ? snap.origin.x : 0;
      const oy = snap ? snap.origin.y : 0;
      placeX = Math.round((rawX - ox) / cell) * cell + ox;
      placeY = Math.round((rawY - oy) / cell) * cell + oy;
    }

    buildable.position = new Vec2(placeX, placeY);

    // Проверка валидности места
    const valid = this.validatePlacement(buildable, placeX, placeY);
    buildable.isValid = valid;

    const preview: GhostPreviewData = {
      structureType: buildable.structureType,
      position: new Vec2(placeX, placeY),
      valid,
      color: valid ? 0x00ff00 : 0xff0000,
    };
    this.worldRef.addComponent(entity, GhostPreview as unknown as symbol, preview);
    this.worldRef.addComponent(entity, Buildable as unknown as symbol, buildable);

    // Если подтверждена постройка (в упрощённой модели — повторное нажатие interact)
    if (valid && ctrl.interactPressed) {
      this.confirmBuild(entity, buildable, stats);
    }
  }

  private validatePlacement(buildable: BuildableData, x: number, y: number): boolean {
    // 1. Проверка коллизий с существующими физическими телами
    const bodies = this.physics.queryPoint(x, y);
    if (bodies.length > 0) return false;

    // 2. Проверка опоры (для элементов с requiresSupport)
    const template = StructureTemplates[buildable.structureType];
    if (template?.requiresSupport) {
      const hasSupport = this.checkSupportAt(x, y, buildable.tileSize);
      if (!hasSupport) return false;
    }

    // 3. Проверка ресурсов игрока (упрощённо: достаточно ли в инвентаре)
    // В полной версии — через InventorySystem
    return true;
  }

  private checkSupportAt(x: number, y: number, tileSize: number): boolean {
    // Проверяем, есть ли поддержка снизу (физическое тело или земля)
    const below = this.physics.queryPoint(x, y + tileSize / 2 + 5);
    return below.length > 0;
  }

  private confirmBuild(entity: number, buildable: BuildableData, stats: CharacterStatsData): void {
    const template = StructureTemplates[buildable.structureType];
    if (!template) return;

    // Списываем ресурсы (упрощённо — через событие, InventorySystem обработает)
    this.eventBus.emit('construction:resources-spent', {
      holder: entity,
      cost: buildable.cost,
    });

    // Создаём сущность постройки
    const structureEntity = this.worldRef.createEntity();
    this.worldRef.addComponent(structureEntity, Transform as unknown as symbol, {
      x: buildable.position.x,
      y: buildable.position.y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    this.worldRef.addComponent(structureEntity, Structure as unknown as symbol, {
      ...template,
      structureId: `struct_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    } as StructureData);
    this.worldRef.addComponent(structureEntity, PhysicsBody as unknown as symbol, {
      body: null, // инициализируется PhysicsService
      gravityScale: 1.0,
      isSleeping: false,
    });
    this.worldRef.addComponent(structureEntity, Renderable as unknown as symbol, {
      texture: `struct_${buildable.structureType}`,
      tint: 0xffffff,
      alpha: 1,
      visible: true,
      layer: 10,
    });
    this.worldRef.addComponent(structureEntity, Material as unknown as symbol, {
      mass: template.mass ?? 30,
      density: 2000,
      strength: template.strength ?? 5000,
      durability: 1,
      sailArea: 0.1,
      airResistance: 0.4,
      state: 'solid',
      temperature: 20,
      burnable: false,
      flammable: false,
      thermalConductivity: 1.0,
    });
    this.worldRef.addComponent(structureEntity, StructuralIntegrity as unknown as symbol, {
      integrity: 1,
      anchored: false,
      supportedBy: [],
      supports: [],
      lastChecked: Date.now(),
    });

    this.eventBus.emit('structure:placed', { entity: structureEntity, type: buildable.structureType, x: buildable.position.x, y: buildable.position.y });

    // Убираем превью
    this.worldRef.removeComponent(entity, GhostPreview as unknown as symbol);
    this.worldRef.removeComponent(entity, Buildable as unknown as symbol);
  }

  /* ── Структурная целостность ───────────────────────────────── */

  /**
   * Проверяет целостность всех построек. Если постройка потеряла опору
   * и не закреплена Гравитационным Якорем — она обрушается (debris).
   */
  private checkStructuralIntegrity(world: World): void {
    const structures = world.query(Structure, Transform, StructuralIntegrity);
    for (const { entity, components } of structures) {
      const integrity = components[2] as StructuralIntegrityData;
      const transform = components[1] as { x: number; y: number };

      // Если уже разрушена — пропускаем
      if (integrity.integrity <= 0) continue;

      // Проверяем якорь
      if (integrity.anchored) continue; // якорь держит — целостность не падает

      // Проверяем, есть ли поддерживающие постройки nearby
      const hasSupport = integrity.supportedBy.length > 0;
      if (!hasSupport) {
        // Потеря опоры — медленное разрушение
        integrity.integrity = Math.max(0, integrity.integrity - 0.1); // 10% за проверку
        world.addComponent(entity, StructuralIntegrity as unknown as symbol, integrity);

        if (integrity.integrity <= 0) {
          this.collapseStructure(entity);
        }
      }
    }
  }

  private collapseStructure(entity: number): void {
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!transform) return;

    // Превращаем постройку в обломок (debris) с физикой
    this.worldRef.removeComponent(entity, Structure as unknown as symbol);
    this.worldRef.removeComponent(entity, StructuralIntegrity as unknown as symbol);
    this.worldRef.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: null,
      gravityScale: 1.0,
      isSleeping: false,
    });
    this.worldRef.addComponent(entity, Renderable as unknown as symbol, {
      texture: 'debris_rubble',
      tint: 0x888888,
      alpha: 1,
      visible: true,
      layer: 10,
    });

    this.eventBus.emit('structure:collapsed', { entity, x: transform.x, y: transform.y });
  }

  /* ── Гравитационный якорь ──────────────────────────────────── */

  /**
   * Привязать постройку к Гравитационному Якорю.
   * Якорь делает постройку невосприимчивой к изменениям вектора гравитации.
   */
  anchorToGravityAnchor(structureEntity: number, anchorEntity: number): void {
    const integrity = this.worldRef.getComponent(structureEntity, StructuralIntegrity as unknown as symbol) as StructuralIntegrityData | undefined;
    if (!integrity) return;

    integrity.anchored = true;
    if (!integrity.supportedBy.includes(anchorEntity)) {
      integrity.supportedBy.push(anchorEntity);
    }
    this.worldRef.addComponent(structureEntity, StructuralIntegrity as unknown as symbol, integrity);

    const anchor = this.worldRef.getComponent(anchorEntity, GravityAnchor as unknown as symbol) as GravityAnchorData | undefined;
    if (anchor) {
      if (!anchor.anchoredEntities.includes(structureEntity)) {
        anchor.anchoredEntities.push(structureEntity);
        this.worldRef.addComponent(anchorEntity, GravityAnchor as unknown as symbol, anchor);
      }
    }

    this.eventBus.emit('structure:anchored', { structureEntity, anchorEntity });
  }

  /** Отвязать постройку от якоря. */
  unanchorFromGravityAnchor(structureEntity: number, anchorEntity: number): void {
    const integrity = this.worldRef.getComponent(structureEntity, StructuralIntegrity as unknown as symbol) as StructuralIntegrityData | undefined;
    if (!integrity) return;

    integrity.anchored = false;
    integrity.supportedBy = integrity.supportedBy.filter((id) => id !== anchorEntity);
    this.worldRef.addComponent(structureEntity, StructuralIntegrity as unknown as symbol, integrity);

    const anchor = this.worldRef.getComponent(anchorEntity, GravityAnchor as unknown as symbol) as GravityAnchorData | undefined;
    if (anchor) {
      anchor.anchoredEntities = anchor.anchoredEntities.filter((id) => id !== structureEntity);
      this.worldRef.addComponent(anchorEntity, GravityAnchor as unknown as symbol, anchor);
    }
  }

  /** Изменить вектор гравитации для незакреплённых построек (вызывается GravitySystem при изменении global gravity). */
  onGravityChanged(newVector: Vec2): void {
    const structures = this.worldRef.query(Structure, StructuralIntegrity, Transform);
    for (const { entity, components } of structures) {
      const integrity = components[1] as StructuralIntegrityData;
      if (integrity.anchored) continue; // якорь держит

      // Незакреплённые постройки проверяют путь к якорю через supportedBy
      // Если пути нет — начинают разрушаться
      if (integrity.supportedBy.length === 0) {
        integrity.integrity = Math.max(0, integrity.integrity - 0.3);
        this.worldRef.addComponent(entity, StructuralIntegrity as unknown as symbol, integrity);
        if (integrity.integrity <= 0) {
          this.collapseStructure(entity);
        }
      }
    }
  }
}
