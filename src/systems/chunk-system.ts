import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { Chunk, ChunkData, TileData, TileType, DEFAULT_CHUNK_CONFIG, Biomes, BiomeData, BiomeType } from '../components/world';
import { Biome } from '../components/world';

/**
 * ChunkSystem — загрузка, выгрузка и генерация чанков мира.
 *
 * Управляет видимыми чанками вокруг игрока, генерирует биомы и ресурсы
 * при первом создании чанка, выгружает遠くшие чанки из памяти.
 *
 * Приоритет 8 — до CharacterSystem (12), чтобы чанки были загружены
 * перед тем, как персонаж начнёт с ними взаимодействовать.
 */
export class ChunkSystem extends System {
  readonly priority = 8;
  readonly required = [Transform];

  private worldRef!: World;

  // Расстояние загрузки чанков вокруг игрока (в чанках)
  private readonly loadRadius = 3;
  // Расстояние выгрузки чанков (в чанках)
  private readonly unloadRadius = 6;

  constructor(private eventBus: EventBus) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    // Находим игрока (первую сущность с CharacterController)
    const players = world.query(Transform);
    if (players.length === 0) return;

    const playerTransform = players[0].components[0] as { x: number; y: number };
    const playerChunkX = Math.floor(
      playerTransform.x / (DEFAULT_CHUNK_CONFIG.width * DEFAULT_CHUNK_CONFIG.tileSize),
    );
    const playerChunkY = Math.floor(
      playerTransform.y / (DEFAULT_CHUNK_CONFIG.height * DEFAULT_CHUNK_CONFIG.tileSize),
    );

    // Загружаем чанки в радиусе
    for (let dy = -this.loadRadius; dy <= this.loadRadius; dy++) {
      for (let dx = -this.loadRadius; dx <= this.loadRadius; dx++) {
        this.ensureChunkLoaded(playerChunkX + dx, playerChunkY + dy);
      }
    }

    // Выгружаем遠くшие чанки
    const chunks = world.query(Chunk, Transform);
    for (const { entity, components } of chunks) {
      const chunk = components[0] as ChunkData;
      const transform = components[1] as { x: number; y: number };
      const distX = Math.abs(chunk.chunkX - playerChunkX);
      const distY = Math.abs(chunk.chunkY - playerChunkY);
      if (distX > this.unloadRadius || distY > this.unloadRadius) {
        this.unloadChunk(entity, chunk);
      }
    }
  }

  /* ── Управление чанками ─────────────────────────────────────── */

  private ensureChunkLoaded(chunkX: number, chunkY: number): void {
    const existing = this.findChunk(chunkX, chunkY);
    if (existing !== -1) return;

    const entity = this.worldRef.createEntity();
    const chunk = this.generateChunk(chunkX, chunkY);
    this.worldRef.addComponent(entity, Chunk as unknown as symbol, chunk);
    this.worldRef.addComponent(entity, Transform as unknown as symbol, {
      x: chunkX * DEFAULT_CHUNK_CONFIG.width * DEFAULT_CHUNK_CONFIG.tileSize,
      y: chunkY * DEFAULT_CHUNK_CONFIG.height * DEFAULT_CHUNK_CONFIG.tileSize,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });

    this.eventBus.emit('chunk:loaded', { chunkEntity: entity, chunkX, chunkY });
  }

  private unloadChunk(entity: number, chunk: ChunkData): void {
    // Сохраняем изменения чанка перед выгрузкой (через SaveSystem)
    this.eventBus.emit('chunk:unload', { chunkEntity: entity, chunkX: chunk.chunkX, chunkY: chunk.chunkY });
    this.worldRef.destroyEntity(entity);
  }

  private findChunk(chunkX: number, chunkY: number): number {
    const chunks = this.worldRef.query(Chunk);
    for (const { entity, components } of chunks) {
      const data = components[0] as ChunkData;
      if (data.chunkX === chunkX && data.chunkY === chunkY) return entity;
    }
    return -1;
  }

  /* ── Генерация чанка ───────────────────────────────────────── */

  private generateChunk(chunkX: number, chunkY: number): ChunkData {
    const { tileSize, width, height } = DEFAULT_CHUNK_CONFIG;
    const tiles: TileData[] = [];

    // Определяем биом для чанка (упрощённо: по координатам чанка)
    const biome = this.pickBiome(chunkX, chunkY);
    const biomeData = this.getBiomeData(biome);

    // Заполняем чанк тайлами в зависимости от биома
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const worldY = chunkY * height + y;
        const worldX = chunkX * width + x;

        // Поверхность: земля сверху, камень ниже
        if (biome === 'surface') {
          const surfaceLevel = height * 0.6;
          if (y < surfaceLevel) {
            tiles.push(this.makeTile(x, y, 'air', biome));
          } else if (y < surfaceLevel + 3) {
            tiles.push(this.makeTile(x, y, 'dirt', biome));
          } else {
            tiles.push(this.makeTile(x, y, 'stone', biome));
          }
        } else if (biome === 'caves') {
          // Пещеры: преимущественно камень с жилами руды
          tiles.push(this.makeTile(x, y, 'stone', biome));
        } else if (biome === 'floating_islands') {
          // Парящие острова: камень в изоляции
          tiles.push(this.makeTile(x, y, 'stone', biome));
        } else if (biome === 'anomaly') {
          // Аномалии: смешанные материалы
          tiles.push(this.makeTile(x, y, 'stone', biome));
        } else if (biome === 'complex') {
          // Комплексы: искусственные постройки
          tiles.push(this.makeTile(x, y, 'construction', biome));
        }
      }
    }

    // Генерируем жилы ресурсов по весам биома
    this.generateVeins(tiles, width, height, biomeData);

    return {
      chunkX,
      chunkY,
      tileSize,
      width,
      height,
      tiles,
      loaded: true,
      lastModified: Date.now(),
    };
  }

  private makeTile(x: number, y: number, type: TileType, biome: BiomeType): TileData {
    const tileConfigs: Record<TileType, { hardness: number; health: number; supportRequired: boolean; fallWhenUnsupported: boolean; resourceDrop: string | null; dropAmount: number }> = {
      air: { hardness: 0, health: 0, supportRequired: false, fallWhenUnsupported: false, resourceDrop: null, dropAmount: 0 },
      dirt: { hardness: 1.0, health: 20, supportRequired: true, fallWhenUnsupported: true, resourceDrop: 'dirt', dropAmount: 1 },
      stone: { hardness: 3.0, health: 60, supportRequired: true, fallWhenUnsupported: true, resourceDrop: 'stone_slabs', dropAmount: 1 },
      ferrite_ore: { hardness: 4.0, health: 80, supportRequired: true, fallWhenUnsupported: true, resourceDrop: 'ferrite_ore', dropAmount: 1 },
      resonit_ore: { hardness: 6.0, health: 120, supportRequired: true, fallWhenUnsupported: true, resourceDrop: 'resonit', dropAmount: 1 },
      biovolume: { hardness: 1.5, health: 30, supportRequired: false, fallWhenUnsupported: false, resourceDrop: 'biovolume', dropAmount: 1 },
      biogel: { hardness: 0.5, health: 15, supportRequired: false, fallWhenUnsupported: false, resourceDrop: 'biogel', dropAmount: 2 },
      ancient_fragment: { hardness: 5.0, health: 100, supportRequired: true, fallWhenUnsupported: true, resourceDrop: 'ancient_fragment', dropAmount: 1 },
      construction: { hardness: 4.0, health: 100, supportRequired: true, fallWhenUnsupported: true, resourceDrop: 'construction_materials', dropAmount: 1 },
      debris: { hardness: 2.0, health: 40, supportRequired: false, fallWhenUnsupported: false, resourceDrop: null, dropAmount: 0 },
    };

    const cfg = tileConfigs[type];
    return {
      x, y, type,
      hardness: cfg.hardness,
      health: cfg.health,
      maxHealth: cfg.health,
      supportRequired: cfg.supportRequired,
      fallWhenUnsupported: cfg.fallWhenUnsupported,
      resourceDrop: cfg.resourceDrop,
      dropAmount: cfg.dropAmount,
      biome,
    };
  }

  private pickBiome(chunkX: number, chunkY: number): BiomeType {
    // Упрощённая процедурная генерация биомов по координатам чанка
    const noise = Math.sin(chunkX * 0.7) * Math.cos(chunkY * 0.7);
    if (noise > 0.6) return 'floating_islands';
    if (noise > 0.3) return 'anomaly';
    if (noise > 0.0) return 'caves';
    if (noise > -0.3) return 'complex';
    return 'surface';
  }

  private getBiomeData(type: BiomeType): BiomeData {
    switch (type) {
      case 'surface': return Biomes.surface();
      case 'caves': return Biomes.caves();
      case 'complex': return Biomes.complex();
      case 'floating_islands': return Biomes.floating_islands();
      case 'anomaly': return Biomes.anomaly();
    }
    return Biomes.surface(); // fallback (TypeScript exhaustive check)
  }

  private generateVeins(tiles: TileData[], width: number, height: number, biome: BiomeData): void {
    // Для каждого типа ресурса в весах биома определяем, создавать ли жилу
    const resourceTypes = Object.entries(biome.resourceWeights);
    for (const [resourceType, weight] of resourceTypes) {
      if (Math.random() > biome.veinChance * weight) continue;

      const veinSize = Math.floor(Math.random() * (biome.veinSizeMax - biome.veinSizeMin + 1)) + biome.veinSizeMin;
      const startX = Math.floor(Math.random() * width);
      const startY = Math.floor(Math.random() * height);

      // Распространяем жилу случайным блужданием от стартовой точки
      let cx = startX;
      let cy = startY;
      for (let i = 0; i < veinSize; i++) {
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) break;
        const index = cy * width + cx;
        const tile = tiles[index];
        if (tile && tile.type === 'stone') {
          tiles[index] = { ...tile, type: resourceType as TileType, resourceDrop: resourceType };
        }
        // Случайное движение жилы
        cx += Math.floor(Math.random() * 3) - 1;
        cy += Math.floor(Math.random() * 3) - 1;
      }
    }
  }
}
