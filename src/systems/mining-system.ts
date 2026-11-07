import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { PhysicsService } from '../services/physics-service';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { Renderable } from '../components/renderable';
import { CharacterController, CharacterControllerData } from '../components/character';
import { CharacterStats, CharacterStatsData } from '../components/character';
import { MiningTool, MiningToolData, ToolType, Tools } from '../components/mining';
import { Chunk, ChunkData, TileData, TileType, DEFAULT_CHUNK_CONFIG } from '../components/world';
import { Material } from '../components/material';

/**
 * MiningSystem — механика добычи ресурсов и разрушения тайлов.
 *
 * Обрабатывает урон инструментов по тайлам чанков, destrucción тайлов,
 * спавн предметов-ресурсов и запуск проверки осыпания соседних тайлов.
 *
 * Приоритет 28 — после StaminaEnergySystem (18) и CharacterSystem (12),
 * до GravitySystem (25) — чтобы урон и спавн ресурсов учитывались перед
 * применением гравитационных сил.
 */
export class MiningSystem extends System {
  readonly priority = 28;
  readonly required = [Transform, CharacterController, CharacterStats];

  private worldRef!: World;

  // Время с последнего удара инструмента (для соблюдения speed)
  private lastHitTime = new Map<number, number>();

  constructor(
    private physics: PhysicsService,
    private eventBus: EventBus,
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const actors = world.query(Transform, CharacterController, CharacterStats);
    for (const { entity, components } of actors) {
      const ctrl = components[1] as CharacterControllerData;
      const stats = components[2] as CharacterStatsData;

      if (ctrl.state === 'Dead') continue;

      // Если не нажата кнопка взаимодействия — не добываем
      if (!ctrl.interactPressed) continue;

      // Находим инструмент в инвентаре (упрощённо: ищем MiningTool на ближайшем предмете)
      // В полной реализации инвентарь предоставляет активный инструмент.
      const tool = this.getActiveTool(entity);
      if (!tool) continue;

      // Проверяем скорость инструмента (ударов в секунду)
      const now = Date.now();
      const lastHit = this.lastHitTime.get(entity) ?? 0;
      const hitInterval = 1000 / tool.speed;
      if (now - lastHit < hitInterval) continue;

      // Тратим стамину/энергию
      const staminaCost = tool.staminaCostPerSecond * dt;
      const energyCost = tool.energyCostPerSecond * dt;
      if (stats.stamina < staminaCost || stats.energy < energyCost) continue;

      stats.stamina = Math.max(0, stats.stamina - staminaCost);
      stats.energy = Math.max(0, stats.energy - energyCost);
      this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);

      // Вычисляем целевую позицию (перед игроком в направлении ввода)
      const transform = components[0] as { x: number; y: number; rotation: number };
      const targetPos = this.getMiningTarget(transform, ctrl, tool);

      // Добываем тайл в целевой позиции
      this.mineTile(entity, targetPos, tool);

      this.lastHitTime.set(entity, now);
    }
  }

  /* ── Добыча тайла ─────────────────────────────────────────────── */

  private mineTile(minerEntity: number, worldPos: Vec2, tool: MiningToolData): void {
    // Находим чанк, содержащий эту позицию
    const chunkEntity = this.findChunkAt(worldPos);
    if (chunkEntity === -1) return;

    const chunk = this.worldRef.getComponent(chunkEntity, Chunk as unknown as symbol) as ChunkData | undefined;
    if (!chunk || !chunk.loaded) return;

    // Переводим мировые координаты в локальные координаты тайла внутри чанка
    const chunkPos = this.worldRef.getComponent(chunkEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!chunkPos) return;

    const tileX = Math.floor((worldPos.x - chunkPos.x) / chunk.tileSize);
    const tileY = Math.floor((worldPos.y - chunkPos.y) / chunk.tileSize);

    if (tileX < 0 || tileX >= chunk.width || tileY < 0 || tileY >= chunk.height) return;

    const tileIndex = tileY * chunk.width + tileX;
    const tile = chunk.tiles[tileIndex];
    if (!tile || tile.type === 'air') return;

    // Проверяем, может ли инструмент добывать этот тип тайла
    if (!tool.canMine(tile.type)) return;

    // Эффективность инструмента по материалу
    const effectiveness = tool.materialEffectiveness[tile.type] ?? 1.0;
    const damage = tool.damage * effectiveness;

    // Наносим урон
    tile.health = Math.max(0, tile.health - damage);
    chunk.tiles[tileIndex] = tile;
    this.worldRef.addComponent(chunkEntity, Chunk as unknown as symbol, chunk);

    this.eventBus.emit('tile:damaged', {
      chunkEntity,
      tileX,
      tileY,
      tileType: tile.type,
      health: tile.health,
      maxHealth: tile.maxHealth,
      damage,
    });

    // Если тайл destroyed — удаляем его и спавним ресурс
    if (tile.health <= 0) {
      this.destroyTile(chunkEntity, chunk, tileX, tileY, tile, tool);
    }
  }

  private destroyTile(
    chunkEntity: number,
    chunk: ChunkData,
    tileX: number,
    tileY: number,
    tile: TileData,
    tool: MiningToolData,
  ): void {
    const tileIndex = tileY * chunk.width + tileX;

    // 1. Удаляем тайл из чанка (становится воздухом)
    chunk.tiles[tileIndex] = {
      ...tile,
      type: 'air',
      health: 0,
      resourceDrop: null,
      dropAmount: 0,
    };
    this.worldRef.addComponent(chunkEntity, Chunk as unknown as symbol, chunk);

    // 2. Спавним предмет-ресурс в мире (если есть дроп)
    if (tile.resourceDrop && tile.dropAmount > 0) {
      const chunkPos = this.worldRef.getComponent(chunkEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
      if (chunkPos) {
        const dropAmount = Math.floor(tile.dropAmount * tool.fortune);
        const spawnX = chunkPos.x + (tileX + 0.5) * chunk.tileSize;
        const spawnY = chunkPos.y + (tileY + 0.5) * chunk.tileSize;
        this.spawnResourceItem(tile.resourceDrop, dropAmount, spawnX, spawnY);
      }
    }

    // 3. Проверяем осыпание соседних тайлов (физика обрушения)
    this.checkSupport(chunkEntity, chunk, tileX, tileY);

    // 4. Событие уничтожения тайла (звук, частицы, сохранение)
    this.eventBus.emit('tile:destroyed', {
      chunkEntity,
      tileX,
      tileY,
      tileType: tile.type,
      resourceDrop: tile.resourceDrop,
      dropAmount: tile.dropAmount,
    });
  }

  /* ── Физика опоры и осыпания ────────────────────────────────── */

  /**
   * Проверяет_support для тайла и его соседей после разрушения.
   * Если тайл с supportRequired теряет опору снизу — становится debris (падает).
   */
  private checkSupport(chunkEntity: number, chunk: ChunkData, destroyedX: number, destroyedY: number): void {
    // Проверяем тайлы над разрушенным и по бокам (они могли опираться на destroyed)
    const neighbors = [
      { x: destroyedX, y: destroyedY - 1 }, // над destroyed
      { x: destroyedX - 1, y: destroyedY }, // слева
      { x: destroyedX + 1, y: destroyedY }, // справа
      { x: destroyedX - 1, y: destroyedY - 1 }, // лево-вверх
      { x: destroyedX + 1, y: destroyedY - 1 }, // право-вверх
    ];

    for (const { x, y } of neighbors) {
      if (x < 0 || x >= chunk.width || y < 0 || y >= chunk.height) continue;
      const index = y * chunk.width + x;
      const tile = chunk.tiles[index];
      if (!tile || tile.type === 'air') continue;

      if (tile.supportRequired && !this.hasSupport(chunk, x, y)) {
        if (tile.fallWhenUnsupported) {
          this.makeTileDebris(chunkEntity, chunk, x, y, tile);
        }
      }
    }
  }

  private hasSupport(chunk: ChunkData, x: number, y: number): boolean {
    // Оpora снизу — тайл под текущим или земля/строительство
    if (y + 1 >= chunk.height) return true; // край чанка — считаем есть опора (границы мира)
    const below = chunk.tiles[(y + 1) * chunk.width + x];
    if (!below) return false;
    if (below.type === ('air' as TileType)) return false;
    // Твёрдые блоки дают опору
    return below.type !== ('air' as TileType) && below.type !== ('debris' as TileType);
  }

  private makeTileDebris(chunkEntity: number, chunk: ChunkData, x: number, y: number, tile: TileData): void {
    const chunkPos = this.worldRef.getComponent(chunkEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!chunkPos) return;

    const index = y * chunk.width + x;
    chunk.tiles[index] = { ...tile, type: 'air', health: 0, resourceDrop: null, dropAmount: 0 };
    this.worldRef.addComponent(chunkEntity, Chunk as unknown as symbol, chunk);

    const spawnX = chunkPos.x + (x + 0.5) * chunk.tileSize;
    const spawnY = chunkPos.y + (y + 0.5) * chunk.tileSize;

    // Создаём физический обломок (debris) как отдельную ECS-сущность
    const debrisEntity = this.worldRef.createEntity();
    this.worldRef.addComponent(debrisEntity, Transform as unknown as symbol, {
      x: spawnX,
      y: spawnY,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    this.worldRef.addComponent(debrisEntity, PhysicsBody as unknown as symbol, {
      body: null, // будет инициализирован PhysicsService
      gravityScale: 1.0,
      isSleeping: false,
    });
    this.worldRef.addComponent(debrisEntity, Renderable as unknown as symbol, {
      texture: `debris_${tile.type}`,
      tint: 0xffffff,
      alpha: 1,
      visible: true,
      layer: 10,
    });
    this.worldRef.addComponent(debrisEntity, Material as unknown as symbol, {
      mass: tile.hardness * 5,
      density: 1000,
      strength: 1000,
      durability: 1,
      sailArea: 0.1,
      airResistance: 0.5,
      state: 'solid',
      temperature: 20,
      burnable: false,
      flammable: false,
      thermalConductivity: 0.5,
    });

    this.eventBus.emit('tile:became-debris', { entity: debrisEntity, tileType: tile.type, x: spawnX, y: spawnY });
  }

  /* ── Вспомогательное ─────────────────────────────────────────── */

  private getActiveTool(_entity: number): MiningToolData | null {
    // В упрощённой модели возвращаем кирку камня как инструмент по умолчанию.
    // В полной реализации — активный предмет из инвентаря.
    return Tools.stone_pickaxe();
  }

  private getMiningTarget(
    transform: { x: number; y: number; rotation: number },
    ctrl: CharacterControllerData,
    _tool: MiningToolData,
  ): Vec2 {
    // Цель — перед игроком в направлении ввода (или взгляда, если ввод нулевой)
    const dir = ctrl.inputDirection;
    let angle = transform.rotation;
    if (dir.x !== 0 || dir.y !== 0) {
      angle = Math.atan2(dir.y, dir.x);
    }
    const distance = 60; // радиус добычи в пикселях
    return new Vec2(
      transform.x + Math.cos(angle) * distance,
      transform.y + Math.sin(angle) * distance,
    );
  }

  private findChunkAt(worldPos: Vec2): number {
    const chunks = this.worldRef.query(Chunk, Transform);
    const tileSize = DEFAULT_CHUNK_CONFIG.tileSize;
    const chunkWidth = DEFAULT_CHUNK_CONFIG.width;
    const chunkHeight = DEFAULT_CHUNK_CONFIG.height;

    for (const { entity, components } of chunks) {
      const chunk = components[0] as ChunkData;
      const transform = components[1] as { x: number; y: number };
      const chunkX = Math.floor(worldPos.x / (chunkWidth * tileSize));
      const chunkY = Math.floor(worldPos.y / (chunkHeight * tileSize));
      if (chunk.chunkX === chunkX && chunk.chunkY === chunkY) {
        return entity;
      }
    }
    return -1;
  }

  private spawnResourceItem(itemId: string, amount: number, x: number, y: number): void {
    const entity = this.worldRef.createEntity();
    this.worldRef.addComponent(entity, Transform as unknown as symbol, { x, y, rotation: 0, scaleX: 1, scaleY: 1 });
    this.worldRef.addComponent(entity, PhysicsBody as unknown as symbol, {
      body: null, gravityScale: 1.0, isSleeping: false,
    });
    this.worldRef.addComponent(entity, Renderable as unknown as symbol, {
      texture: `item_${itemId}`,
      tint: 0xffffff,
      alpha: 1,
      visible: true,
      layer: 15,
    });
    this.worldRef.addComponent(entity, Material as unknown as symbol, {
      mass: 1, density: 500, strength: 100, durability: 1,
      sailArea: 0.05, airResistance: 0.8, state: 'solid',
      temperature: 20, burnable: false, flammable: false, thermalConductivity: 0.2,
    });
    // ItemStack — добавляется в InventorySystem при подборе
    this.eventBus.emit('resource:spawned', { entity, itemId, amount, x, y });
  }
}
