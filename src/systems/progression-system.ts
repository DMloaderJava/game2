import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import {
  AbilityBranch,
  ProgressionData,
  SkillTreeNode,
  ALL_ABILITIES,
} from '../components/ability';
import { CharacterStats } from '../components/character';
import { Inventory } from '../components/inventory';

/**
 * ProgressionSystem — дерево навыков, разблокировка способностей, очки веток.
 *
 * Отслеживает経perience персонажа, уровни веток, очки навыков.
 * При получении достаточно опыта или ресурсов — разблокирует узлы дерева
 * и способности через AbilitySystem.
 *
 * Приоритет 65 — после EventSystem (60), чтобы события сканирования
 * и получения ресурсов обработались перед разблокировкой.
 */
export class ProgressionSystem extends System {
  readonly priority = 65;
  readonly required = [CharacterStats, Inventory];

  private worldRef!: World;

  constructor(
    private eventBus: EventBus,
    private abilitySystem: { unlockAbility: (entity: number, abilityId: string) => void },
  ) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const actors = world.query(CharacterStats, Inventory);
    for (const { entity, components } of actors) {
      const stats = components[0] as CharacterStatsData;
      const progression = world.getComponent(entity, 'progression-data' as unknown as symbol) as ProgressionDataData | undefined;

      if (!progression) continue;

      // Проверка повышения уровня веток на основе опыта и разблокированных узлов
      this.checkBranchLevels(entity, progression);

      // Проверка разблокировки способностей из узлов дерева
      this.checkAbilityUnlocks(entity, progression);
    }
  }

  /* ── Публичный API ─────────────────────────────────────────── */

  /** Добавить опыт персонажу. Возвращает true, если был уровень ветки повышен. */
  addExperience(entity: number, amount: number, branch?: AbilityBranch): boolean {
    const progression = this.worldRef.getComponent(entity, 'progression-data' as unknown as symbol) as ProgressionDataData | undefined;
    if (!progression) return false;

    progression.experience += amount;
    let leveledUp = false;

    while (progression.experience >= progression.experienceToNext) {
      progression.experience -= progression.experienceToNext;
      progression.level += 1;
      progression.experienceToNext = Math.floor(progression.experienceToNext * 1.5);

      // Даём очко в ветку (если указана, иначе — в общую)
      if (branch) {
        progression.branchPoints[branch] = (progression.branchPoints[branch] ?? 0) + 1;
      } else {
        // Распределяем очко в самую低уровневую ветку
        const branches: AbilityBranch[] = ['gravity', 'movement', 'energy', 'biology', 'technology'];
        const lowest = branches.reduce((a, b) =>
          (progression.branchLevels[a] ?? 0) < (progression.branchLevels[b] ?? 0) ? a : b,
        );
        progression.branchPoints[lowest] = (progression.branchPoints[lowest] ?? 0) + 1;
      }

      leveledUp = true;
      this.eventBus.emit('progression:level-up', { entity, level: progression.level, branch });
    }

    this.worldRef.addComponent(entity, 'progression-data' as unknown as symbol, progression);
    return leveledUp;
  }

  /** Добавить очки конкретной ветки (за сканирование, исследование и т.д.). */
  addBranchPoints(entity: number, branch: AbilityBranch, points: number): void {
    const progression = this.worldRef.getComponent(entity, 'progression-data' as unknown as symbol) as ProgressionDataData | undefined;
    if (!progression) return;

    progression.branchPoints[branch] = (progression.branchPoints[branch] ?? 0) + points;
    this.worldRef.addComponent(entity, 'progression-data' as unknown as symbol, progression);

    this.eventBus.emit('progression:branch-points', { entity, branch, points, total: progression.branchPoints[branch] });
  }

  /** Попробовать разблокировать узел дерева навыков. */
  unlockNode(entity: number, nodeId: string): boolean {
    const progression = this.worldRef.getComponent(entity, 'progression-data' as unknown as symbol) as ProgressionDataData | undefined;
    if (!progression) return false;

    if (progression.unlockedNodes.includes(nodeId)) return false; // уже разблокирован

    const node = this.getNode(nodeId);
    if (!node) return false;

    // Проверка предшествующих узлов
    for (const prereq of node.prerequisites) {
      if (!progression.unlockedNodes.includes(prereq)) return false;
    }

    // Проверка очков ветки
    const availablePoints = progression.branchPoints[node.branch] ?? 0;
    if (availablePoints < node.branchPointsCost) return false;

    // Проверка ресурсов (упрощённо — через Inventory)
    const inventory = this.worldRef.getComponent(entity, 'inventory' as unknown as symbol) as { slots: Array<{ itemId: string; count: number } | null> } | undefined;
    if (inventory) {
      for (const cost of node.resourceCost) {
        let total = 0;
        for (const slot of inventory.slots) {
          if (slot && slot.itemId === cost.itemId) total += slot.count;
        }
        if (total < cost.count) return false;
      }
    }

    // Списываем очки и ресурсы
    progression.branchPoints[node.branch] = availablePoints - node.branchPointsCost;
    progression.branchLevels[node.branch] = (progression.branchLevels[node.branch] ?? 0) + 1;
    progression.unlockedNodes.push(nodeId);

    if (inventory) {
      for (const cost of node.resourceCost) {
        this.removeItems(inventory, cost.itemId, cost.count);
      }
    }

    this.worldRef.addComponent(entity, 'progression-data' as unknown as symbol, progression);

    // Если узел разблокирует способность — разблокировать её через AbilitySystem
    if (node.abilityId) {
      this.abilitySystem.unlockAbility(entity, node.abilityId);
    }

    this.eventBus.emit('progression:node-unlocked', { entity, nodeId, branch: node.branch, tier: node.tier });
    return true;
  }

  /* ── Внутреннее ───────────────────────────────────────────── */

  private checkBranchLevels(entity: number, progression: ProgressionDataData): void {
    // Автоматическое повышение уровня ветки при накоплении очков
    const branches: AbilityBranch[] = ['gravity', 'movement', 'energy', 'biology', 'technology'];
    for (const branch of branches) {
      const points = progression.branchPoints[branch] ?? 0;
      const currentLevel = progression.branchLevels[branch] ?? 0;
      const neededForNext = (currentLevel + 1) * 3; // 3, 6, 9, 12 очка на уровень

      if (points >= neededForNext) {
        progression.branchLevels[branch] = currentLevel + 1;
        progression.branchPoints[branch] = points - neededForNext;
        this.worldRef.addComponent(entity, 'progression-data' as unknown as symbol, progression);
        this.eventBus.emit('progression:level-up', { entity, level: progression.level, branch });
      }
    }
  }

  private checkAbilityUnlocks(entity: number, progression: ProgressionDataData): void {
    // В упрощённой модели способности разблокируются через unlockNode,
    // здесь может быть дополнительная логика авто-разблокировки по условиям
  }

  private getNode(nodeId: string): { branch: AbilityBranch; branchPointsCost: number; resourceCost: Array<{ itemId: string; count: number }>; prerequisites: string[]; abilityId?: string; tier: number } | undefined {
    // В полной версии узлы загружаются из данных. Здесь — базовые узлы для демонстрации.
    const nodes: Record<string, { branch: AbilityBranch; branchPointsCost: number; resourceCost: Array<{ itemId: string; count: number }>; prerequisites: string[]; abilityId?: string; tier: number }> = {
      node_gravity_pull: {
        branch: 'gravity',
        branchPointsCost: 1,
        resourceCost: [{ itemId: 'resonit', count: 1 }],
        prerequisites: [],
        abilityId: 'gravity_pull',
        tier: 1,
      },
      node_gravity_push: {
        branch: 'gravity',
        branchPointsCost: 1,
        resourceCost: [{ itemId: 'resonit', count: 1 }],
        prerequisites: [],
        abilityId: 'gravity_push',
        tier: 1,
      },
      node_gravity_weight_change: {
        branch: 'gravity',
        branchPointsCost: 2,
        resourceCost: [{ itemId: 'resonit', count: 3 }],
        prerequisites: ['node_gravity_pull'],
        abilityId: 'gravity_weight_change',
        tier: 2,
      },
      node_zero_gravity: {
        branch: 'gravity',
        branchPointsCost: 3,
        resourceCost: [{ itemId: 'resonit', count: 5 }, { itemId: 'ancient_fragment', count: 1 }],
        prerequisites: ['node_gravity_weight_change'],
        abilityId: 'zero_gravity',
        tier: 3,
      },
      node_gravity_dash: {
        branch: 'movement',
        branchPointsCost: 2,
        resourceCost: [{ itemId: 'ferrite_ingot', count: 5 }],
        prerequisites: ['node_jump_enhancement'],
        abilityId: 'gravity_dash',
        tier: 2,
      },
      node_jump_enhancement: {
        branch: 'movement',
        branchPointsCost: 1,
        resourceCost: [],
        prerequisites: [],
        abilityId: 'jump_enhancement',
        tier: 1,
      },
      node_energy_pulse: {
        branch: 'energy',
        branchPointsCost: 1,
        resourceCost: [{ itemId: 'biogel', count: 2 }],
        prerequisites: [],
        abilityId: 'energy_pulse',
        tier: 1,
      },
      node_energy_shield: {
        branch: 'energy',
        branchPointsCost: 2,
        resourceCost: [{ itemId: 'resonit', count: 2 }, { itemId: 'ferrite_ingot', count: 3 }],
        prerequisites: ['node_energy_pulse'],
        abilityId: 'energy_shield',
        tier: 2,
      },
      node_scan_fauna: {
        branch: 'biology',
        branchPointsCost: 1,
        resourceCost: [],
        prerequisites: [],
        abilityId: 'scan_fauna',
        tier: 1,
      },
      node_complex_crafting: {
        branch: 'technology',
        branchPointsCost: 1,
        resourceCost: [{ itemId: 'ancient_fragment', count: 1 }],
        prerequisites: [],
        abilityId: 'complex_crafting',
        tier: 1,
      },
    };
    return nodes[nodeId];
  }

  private removeItems(inventory: { slots: Array<{ itemId: string; count: number } | null> }, itemId: string, count: number): void {
    let remaining = count;
    for (let i = 0; i < inventory.slots.length && remaining > 0; i++) {
      const slot = inventory.slots[i];
      if (slot && slot.itemId === itemId) {
        const remove = Math.min(slot.count, remaining);
        slot.count -= remove;
        remaining -= remove;
        if (slot.count <= 0) inventory.slots[i] = null;
      }
    }
  }
}

// Внутренние типы
interface CharacterStatsData {
  energy: number;
}

interface ProgressionDataData {
  level: number;
  experience: number;
  experienceToNext: number;
  branchPoints: Record<AbilityBranch, number>;
  branchLevels: Record<AbilityBranch, number>;
  unlockedNodes: string[];
  unlockedAbilities: string[];
}
