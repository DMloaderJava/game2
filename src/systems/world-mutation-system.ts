import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Chunk, ChunkData, TileData, TileType, DEFAULT_CHUNK_CONFIG } from '../components/world';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { Renderable } from '../components/renderable';
import { Material } from '../components/material';
import {
  WorldMutation,
  WorldMutationData,
  MutationType,
  MutationMarker,
  MutationMarkerData,
  AnomalyZone,
  AnomalyZoneData,
  AnomalyType,
} from '../components/event-state';
import { GravityZone } from '../components/gravity';

/**
 * WorldMutationSystem — пост-катастрофическая мутация карты (Фаза 4).
 *
 * Применяет накопленные WorldMutation к чанкам мира:
 *   - спавн новых жил руды
 *   - открытие заваленных пещер (очистка тайлов)
 *   - сдвиг парящих островов (перемещение чанков)
 *   - обнажение древних комплексов (замена dirt/stone на construction)
 *   - создание новых аномальных зон (GravityZone + AnomalyZone)
 *
 * Гарантии целостности сохранений:
 *   - Постройки игрока (тип 'construction') НЕ трогаются
 *   - Инвентарь и экипировка игрока не меняются
 *   - Если игрок находится в зоне мутации — он перемещается в ближайшее безопасное место
 *   - Изменённые чанки помечаются dirty и пересохраняются SaveSystem
 *
 * Приоритет 75 — после GravityTideSystem (70), до RenderSystem (90).
 */
export class WorldMutationSystem extends System {
  readonly priority = 75;
  readonly required = [Transform];

  private worldRef!: World;

  constructor(private eventBus: EventBus) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    // Применяем мутации только в фазе aftermath
    const tideEntities = world.query('tide-state' as unknown as symbol);
    if (tideEntities.length === 0) return;
    const tide = tideEntities[0].components[0] as { phase: string } | undefined;
    if (!tide || tide.phase !== 'aftermath') return;

    const mutations = world.query(WorldMutation);
    const pendingMutations = mutations.filter(
      ({ components }) => !(components[0] as WorldMutationData).applied
    );

    if (pendingMutations.length === 0) return;

    const appliedMutations: WorldMutationData[] = [];
    const mutatedChunks = new Set<string>();

    for (const { entity, components } of pendingMutations) {
      const mutation = components[0] as WorldMutationData;
      if (mutation.applied) continue;

      const success = this.applyMutation(world, mutation);
      if (success) {
        mutation.applied = true;
        world.addComponent(entity, WorldMutation as unknown as symbol, mutation);
        appliedMutations.push(mutation);
        mutatedChunks.add(`${mutation.chunkX},${mutation.chunkY}`);
      }
    }

    if (appliedMutations.length > 0) {
      // Сохраняем изменённые чанки
      for (const chunkKey of mutatedChunks) {
        const [cx, cy] = chunkKey.split(',').map(Number);
        const chunkEntity = this.findChunk(world, cx, cy);
        if (chunkEntity !== -1) {
          this.eventBus.emit('chunk:dirty', { chunkEntity, chunkX: cx, chunkY: cy });
        }
      }

      // Проверяем позицию игрока после мутации
      this.ensurePlayerSafety(world);

      this.eventBus.emit('world:mutated', {
        mutations: appliedMutations,
      });
    }
  }

  /* ── Применение отдельных мутаций ────────────────────────── */

  private applyMutation(world: World, mutation: WorldMutationData): boolean {
    switch (mutation.type) {
      case 'spawn_ore_vein':
        return this.spawnOreVein(world, mutation);
      case 'open_cave_passage':
        return this.openCavePassage(world, mutation);
      case 'shift_floating_island':
        return this.shiftFloatingIsland(world, mutation);
      case 'expose_complex':
        return this.exposeComplex(world, mutation);
      case 'spawn_anomaly_zone':
        return this.spawnAnomalyZone(world, mutation);
      default:
        return false;
    }
  }

  private spawnOreVein(world: World, mutation: WorldMutationData): boolean {
    const chunkEntity = this.findChunk(world, mutation.chunkX, mutation.chunkY);
    if (chunkEntity === -1) return false;

    const chunk = world.getComponent(chunkEntity, Chunk as unknown as symbol) as ChunkData | undefined;
    if (!chunk) return false;

    const size = mutation.veinSize ?? 6;
    const resourceType = (mutation.resourceType ?? 'resonit_ore') as TileType;

    let placed = 0;
    const attempts = size * 3;

    for (let i = 0; i < attempts && placed < size; i++) {
      const tx = Math.floor(Math.random() * chunk.width);
      const ty = Math.floor(Math.random() * chunk.height);
      const index = ty * chunk.width + tx;
      const tile = chunk.tiles[index];

      // Меняем только камень или землю (не постройки игрока!)
      if (tile && (tile.type === 'stone' || tile.type === 'dirt')) {
        chunk.tiles[index] = {
          ...tile,
          type: resourceType,
          resourceDrop: resourceType === 'air' ? null : resourceType,
          dropAmount: 1,
          hardness: resourceType === 'resonit_ore' ? 6.0 : 4.0,
          health: resourceType === 'resonit_ore' ? 120 : 80,
          maxHealth: resourceType === 'resonit_ore' ? 120 : 80,
        };
        placed++;
      }
    }

    world.addComponent(chunkEntity, Chunk as unknown as symbol, chunk);

    this.addMutationMarker(world, mutation.chunkX, mutation.chunkY, -1, -1, 'ore_vein', resourceType);

    return placed > 0;
  }

  private openCavePassage(world: World, mutation: WorldMutationData): boolean {
    const chunkEntity = this.findChunk(world, mutation.chunkX, mutation.chunkY);
    if (chunkEntity === -1) return false;

    const chunk = world.getComponent(chunkEntity, Chunk as unknown as symbol) as ChunkData | undefined;
    if (!chunk || !mutation.tiles) return false;

    let opened = 0;
    for (const { x, y, type } of mutation.tiles) {
      if (x < 0 || x >= chunk.width || y < 0 || y >= chunk.height) continue;
      const index = y * chunk.width + x;
      const tile = chunk.tiles[index];
      if (!tile || tile.type === 'construction') continue; // не трогаем постройки игрока

      chunk.tiles[index] = {
        ...tile,
        type: 'air' as TileType,
        health: 0,
        resourceDrop: null,
        dropAmount: 0,
      };
      opened++;

      this.addMutationMarker(world, mutation.chunkX, mutation.chunkY, x, y, tile.type, 'air');
    }

    world.addComponent(chunkEntity, Chunk as unknown as symbol, chunk);
    return opened > 0;
  }

  private shiftFloatingIsland(world: World, mutation: WorldMutationData): boolean {
    if (mutation.newChunkX === undefined || mutation.newChunkY === undefined) return false;

    const chunkEntity = this.findChunk(world, mutation.chunkX, mutation.chunkY);
    if (chunkEntity === -1) return false;

    const chunk = world.getComponent(chunkEntity, Chunk as unknown as symbol) as ChunkData | undefined;
    const transform = world.getComponent(chunkEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!chunk || !transform) return false;

    const tileSize = DEFAULT_CHUNK_CONFIG.tileSize;
    const width = DEFAULT_CHUNK_CONFIG.width;
    const height = DEFAULT_CHUNK_CONFIG.height;

    transform.x = mutation.newChunkX * width * tileSize;
    transform.y = mutation.newChunkY * height * tileSize;
    chunk.chunkX = mutation.newChunkX;
    chunk.chunkY = mutation.newChunkY;
    chunk.lastModified = Date.now();

    world.addComponent(chunkEntity, Chunk as unknown as symbol, chunk);
    world.addComponent(chunkEntity, Transform as unknown as symbol, transform);

    this.eventBus.emit('chunk:moved', {
      chunkEntity,
      fromX: mutation.chunkX,
      fromY: mutation.chunkY,
      toX: mutation.newChunkX,
      toY: mutation.newChunkY,
    });

    return true;
  }

  private exposeComplex(world: World, mutation: WorldMutationData): boolean {
    const chunkEntity = this.findChunk(world, mutation.chunkX, mutation.chunkY);
    if (chunkEntity === -1) return false;

    const chunk = world.getComponent(chunkEntity, Chunk as unknown as symbol) as ChunkData | undefined;
    if (!chunk || !mutation.tiles) return false;

    let exposed = 0;
    for (const { x, y, type } of mutation.tiles) {
      if (x < 0 || x >= chunk.width || y < 0 || y >= chunk.height) continue;
      const index = y * chunk.width + x;
      const tile = chunk.tiles[index];
      if (!tile || tile.type === 'construction') continue;

      chunk.tiles[index] = {
        ...tile,
        type: type as TileType,
        hardness: 4.0,
        health: 100,
        maxHealth: 100,
        supportRequired: true,
        fallWhenUnsupported: true,
        resourceDrop: 'construction_materials',
        dropAmount: 1,
        biome: tile.biome,
      };
      exposed++;

      this.addMutationMarker(world, mutation.chunkX, mutation.chunkY, x, y, tile.type, type);
    }

    world.addComponent(chunkEntity, Chunk as unknown as symbol, chunk);
    return exposed > 0;
  }

  private spawnAnomalyZone(world: World, mutation: WorldMutationData): boolean {
    const center = mutation.position ?? new Vec2(0, 0);
    const radius = mutation.radius ?? 200;

    const anomalyEntity = world.createEntity();
    world.addComponent(anomalyEntity, Transform as unknown as symbol, {
      x: center.x,
      y: center.y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });

    const anomalyType = this.randomAnomalyType();
    let gravityVector = new Vec2(0, 0);

    switch (anomalyType) {
      case 'zero_gravity':
        gravityVector = new Vec2(0, 0);
        break;
      case 'inverted_gravity':
        gravityVector = new Vec2(0, -9.81);
        break;
      case 'gravity_vortex':
        gravityVector = new Vec2(0, 9.81);
        break;
      case 'crush_zone':
        gravityVector = new Vec2(0, 9.81).mul(2.0);
        break;
    }

    world.addComponent(anomalyEntity, AnomalyZone as unknown as symbol, {
      id: `anomaly_${Date.now()}`,
      type: anomalyType,
      position: center.clone(),
      radius,
      strength: 1.5,
      spawnedAt: Date.now(),
      expiresAt: null,
    } as AnomalyZoneData);

    world.addComponent(anomalyEntity, GravityZone as unknown as symbol, {
      id: `gravity_zone_${anomalyEntity}`,
      shape: 'circle',
      radius,
      vector: gravityVector,
      strength: 1.5,
      falloff: 'linear',
      coreRadius: 20,
      active: true,
    });

    this.eventBus.emit('anomaly:spawned', {
      entity: anomalyEntity,
      type: anomalyType,
      position: center,
      radius,
    });

    return true;
  }

  /* ── Вспомогательное ─────────────────────────────────────── */

  private findChunk(world: World, chunkX: number, chunkY: number): number {
    const chunks = world.query(Chunk);
    for (const { entity, components } of chunks) {
      const data = components[0] as ChunkData;
      if (data.chunkX === chunkX && data.chunkY === chunkY) return entity;
    }
    return -1;
  }

  private addMutationMarker(
    world: World,
    chunkX: number,
    chunkY: number,
    tileX: number,
    tileY: number,
    oldType: string,
    newType: string
  ): void {
    const markerEntity = world.createEntity();
    world.addComponent(markerEntity, MutationMarker as unknown as symbol, {
      chunkX, chunkY, tileX, tileY, oldType, newType, mutatedAt: Date.now(),
    } as MutationMarkerData);
  }

  private randomAnomalyType(): AnomalyType {
    const types: AnomalyType[] = ['zero_gravity', 'inverted_gravity', 'gravity_vortex', 'crush_zone'];
    return types[Math.floor(Math.random() * types.length)];
  }

  private ensurePlayerSafety(world: World): void {
    const players = world.query('character-controller' as unknown as symbol);
    if (players.length === 0) return;

    const playerEntity = players[0].entity;
    const transform = world.getComponent(playerEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!transform) return;

    const chunkEntity = this.findChunkAtWorldPos(world, transform.x, transform.y);
    if (chunkEntity !== -1) {
      const chunk = world.getComponent(chunkEntity, Chunk as unknown as symbol) as ChunkData | undefined;
      if (chunk) {
        const tileSize = DEFAULT_CHUNK_CONFIG.tileSize;
        const chunkPos = world.getComponent(chunkEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
        if (chunkPos) {
          const tx = Math.floor((transform.x - chunkPos.x) / tileSize);
          const ty = Math.floor((transform.y - chunkPos.y) / tileSize);
          if (tx >= 0 && tx < chunk.width && ty >= 0 && ty < chunk.height) {
            const tile = chunk.tiles[ty * chunk.width + tx];
            if (tile && tile.type !== 'air' && tile.type !== 'construction') {
              // Перемещаем игрока вверх на 2 тайла
              transform.y -= tileSize * 2;
              world.addComponent(playerEntity, Transform as unknown as symbol, transform);
            }
          }
        }
      }
    }
  }

  private findChunkAtWorldPos(world: World, x: number, y: number): number {
    const chunks = world.query(Chunk, Transform);
    const tileSize = DEFAULT_CHUNK_CONFIG.tileSize;
    const width = DEFAULT_CHUNK_CONFIG.width;
    const height = DEFAULT_CHUNK_CONFIG.height;

    for (const { entity, components } of chunks) {
      const chunk = components[0] as ChunkData;
      const transform = components[1] as { x: number; y: number };
      const chunkX = Math.floor(x / (width * tileSize));
      const chunkY = Math.floor(y / (height * tileSize));
      if (chunk.chunkX === chunkX && chunk.chunkY === chunkY) return entity;
    }
    return -1;
  }
}
