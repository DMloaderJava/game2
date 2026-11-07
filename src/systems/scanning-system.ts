import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { CharacterStats } from '../components/character';
import {
  Scanner, ScannerData,
  ScanKnowledge, ScanKnowledgeData,
  BioSample, BioSampleData,
  AncientFragmentKnowledge, AncientFragmentKnowledgeData,
} from '../components/scanning';
import { ProgressionData } from '../components/ability';

/**
 * ScanningSystem — сканирование мира, получение образцов и фрагментов.
 *
 * Игрок с сканером может активировать сканирование области.
 * Результат: знание об объекте, био-образец (для ветки Биология) или
 * знание Древнего фрагмента (для ветки Технологии).
 *
 * Приоритет 16 — после InputSystem (10) и до CharacterSystem (12),
 * чтобы сканирование не блокировало движение.
 */
export class ScanningSystem extends System {
  readonly priority = 16;
  readonly required = [Transform];

  private worldRef!: World;

  constructor(
    private eventBus: EventBus,
    private progressionSystem: {
      addExperience: (entity: number, amount: number, branch?: string) => boolean;
      addBranchPoints: (entity: number, branch: string, points: number) => void;
    },
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const actors = world.query(Transform, Scanner);
    for (const { entity, components } of actors) {
      const scanner = components[1] as ScannerData;
      const stats = world.getComponent(entity, CharacterStats as unknown as symbol) as { energy: number } | undefined;

      if (!scanner.active) continue;
      if (scanner.cooldownRemaining > 0) {
        scanner.cooldownRemaining = Math.max(0, scanner.cooldownRemaining - dt);
        world.addComponent(entity, Scanner as unknown as symbol, scanner);
        continue;
      }

      // Сканирование активировано игроком (через InputSystem/событие)
      // Здесь мы просто проверяем, не запрошено ли сканирование в этом кадре.
      // В полной версии — флаг scanPressed из CharacterController.
    }
  }

  /* ── Публичный API ─────────────────────────────────────────── */

  /** Выполнить сканирование области вокруг сущности. */
  scanArea(entity: number, scanType: string): { knowledge: ScanKnowledgeData | null; sample: BioSampleData | null; fragment: AncientFragmentKnowledgeData | null } {
    const scanner = this.worldRef.getComponent(entity, Scanner as unknown as symbol) as ScannerData | undefined;
    const stats = this.worldRef.getComponent(entity, CharacterStats as unknown as symbol) as { energy: number } | undefined;
    const transform = this.worldRef.getComponent(entity, Transform as unknown as symbol) as { x: number; y: number } | undefined;

    if (!scanner || !stats || !transform) {
      return { knowledge: null, sample: null, fragment: null };
    }

    if (scanner.cooldownRemaining > 0) {
      return { knowledge: null, sample: null, fragment: null };
    }
    if (stats.energy < scanner.energyCostPerScan) {
      this.eventBus.emit('scan:no-energy', { entity });
      return { knowledge: null, sample: null, fragment: null };
    }

    // Тратим энергию и устанавливаем коундаун
    stats.energy = Math.max(0, stats.energy - scanner.energyCostPerScan);
    this.worldRef.addComponent(entity, CharacterStats as unknown as symbol, stats);
    scanner.cooldownRemaining = scanner.scanCooldown;
    this.worldRef.addComponent(entity, Scanner as unknown as symbol, scanner);

    const center = new Vec2(transform.x, transform.y);
    const results = this.findScanTargets(center, scanner.scanRadius, scanType);

    const knowledge: ScanKnowledgeData | null = results.length > 0 ? {
      entityId: results[0].entity,
      scanType,
      scanData: results[0].data,
      scannedAt: Date.now(),
    } : null;

    let sample: BioSampleData | null = null;
    let fragment: AncientFragmentKnowledgeData | null = null;

    // Определяем тип награды по scanType
    if (scanType.startsWith('creature')) {
      sample = {
        speciesId: `species_${results[0].entity}`,
        speciesName: 'Неизвестное существо',
        properties: { health: 50, damage: 10, speed: 100 },
        quantity: 1,
      };
      this.progressionSystem.addBranchPoints(entity, 'biology', 1);
    } else if (scanType.startsWith('ruin') || scanType.startsWith('ancient')) {
      fragment = {
        fragmentId: `fragment_${results[0].entity}`,
        technologyType: 'technology',
        quantity: 1,
      };
      this.progressionSystem.addBranchPoints(entity, 'technology', 1);
    } else if (scanType.startsWith('anomaly')) {
      this.progressionSystem.addBranchPoints(entity, 'gravity', 1);
    }

    // Опыт за сканирование
    this.progressionSystem.addExperience(entity, 10, scanType.startsWith('creature') ? 'biology' : scanType.startsWith('ruin') ? 'technology' : 'gravity');

    // Сохраняем знание в компоненте сканирования (для истории)
    if (knowledge) {
      this.worldRef.addComponent(entity, ScanKnowledge as unknown as symbol, knowledge);
    }
    if (sample) {
      this.worldRef.addComponent(entity, BioSample as unknown as symbol, sample);
    }
    if (fragment) {
      this.worldRef.addComponent(entity, AncientFragmentKnowledge as unknown as symbol, fragment);
    }

    this.eventBus.emit('scan:completed', {
      entity,
      knowledge,
      sample,
      fragment,
      scanType,
    });

    return { knowledge, sample, fragment };
  }

  /* ── Вспомогательное ─────────────────────────────────────── */

  private findScanTargets(center: Vec2, radius: number, scanType: string): Array<{ entity: number; data: Record<string, unknown> }> {
    const results: Array<{ entity: number; data: Record<string, unknown> }> = [];

    // Ищем все сущности с Transform в радиусе
    const entities = this.worldRef.query('transform' as unknown as symbol);
    for (const { entity, components } of entities) {
      const transform = components[0] as { x: number; y: number } | undefined;
      if (!transform) continue;

      const pos = new Vec2(transform.x, transform.y);
      if (pos.distance(center) <= radius) {
        // Фильтруем по типу сканирования (упрощённо — по наличию соответствующих компонентов)
        if (this.matchesScanType(entity, scanType)) {
          results.push({ entity, data: { x: transform.x, y: transform.y, type: scanType } });
        }
      }
    }

    return results;
  }

  private matchesScanType(entity: number, scanType: string): boolean {
    const worldRef = this.worldRef;
    if (scanType.startsWith('creature')) {
      // Существо — имеет AI-компонент (упрощённо: любой не-игрок с физическим телом)
      return true;
    }
    if (scanType.startsWith('ruin') || scanType.startsWith('ancient')) {
      return true;
    }
    if (scanType.startsWith('anomaly')) {
      return worldRef.hasComponent(entity, 'gravity-zone' as unknown as symbol);
    }
    if (scanType.startsWith('ore')) {
      return true;
    }
    return true;
  }
}
