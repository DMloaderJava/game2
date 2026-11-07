import { defineComponent } from '../ecs/component';
import { Vec2 } from '../core/vec2';

/**
 * Ветка прокачки персонажа.
 */
export type AbilityBranch = 'gravity' | 'movement' | 'energy' | 'biology' | 'technology';

/**
 * Тип способности.
 */
export type AbilityType = 'active' | 'passive' | 'toggle';

/**
 * Тип эффекта способности (данные, которые выполняет система).
 */
export type EffectType =
  | 'apply_force'
  | 'modify_gravity'
  | 'create_zone'
  | 'shield'
  | 'impulse'
  | 'scan_reveal'
  | 'absorb_damage'
  | 'hack_device'
  | 'destroy_tile'
  | 'heal';

/**
 * Шаблон способности — регистрируется плагинами веток прокачки.
 * Ядро не знает о конкретных способностях, только об этом интерфейсе.
 */
export const AbilityDefinition = defineComponent<AbilityDefinitionData>('AbilityDefinition');

export interface AbilityDefinitionData {
  id: string;              // уникальный ID (gravity_pull, gravity_dash, ...)
  branch: AbilityBranch;
  tier: number;            // 1..5
  type: AbilityType;
  name: string;
  description: string;
  /** Эффекты способности (могут быть несколько). */
  effects: Array<{
    type: EffectType;
    power: number;         // сила эффекта
    duration?: number;     // длительность в секундах (для toggle/zone)
    radius?: number;       // радиус действия (для зон)
    vector?: Vec2;         // вектор эффекта (для apply_force)
    energyCost: number;    // затрата энергии при активации
    cooldown: number;      // коундаун в секундах
  }>;
  /** Необходимые предшествующие способности (ID). */
  prerequisites: string[];
  /** Необходимые ресурсы для разблокировки. */
  unlockCost: Array<{ itemId: string; count: number }>;
  /** Необходимые знания сканирования (типы сканированных объектов). */
  requiredScanTypes: string[];
  /** Уровень ветки для разблокировки. */
  requiredBranchLevel: number;
  /** Синергии с другими способностями (по ID). */
  synergies: Array<{
    withAbilityId: string;
    comboType: string;
    multiplier: number;    // усилитель эффекта при синергии
  }>;
}

/**
 * Ячейка способности у персонажа — активированная способность с состоянием коундауна.
 */
export const AbilitySlot = defineComponent<AbilitySlotData>('AbilitySlot');

export interface AbilitySlotData {
  abilityId: string;
  /** Текущий коундаун (секунды). 0 = готов к активации. */
  cooldownRemaining: number;
  /** Активен ли эффект прямо сейчас (для toggle/активных с длительностью). */
  isActive: boolean;
  /** Время активации (для отслеживания длительности). */
  activatedAt: number | null;
}

/**
 * Экземпляр действия способности в реальном времени.
 * Создаётся при активации, существует пока не истечёт длительность.
 */
export const ActiveEffect = defineComponent<ActiveEffectData>('ActiveEffect');

export interface ActiveEffectData {
  abilityId: string;
  effectType: EffectType;
  casterEntity: number;
  /** Сила эффекта (с учётом синергий и улучшений). */
  power: number;
  duration: number;
  /** Оставшееся время эффекта. */
  timeRemaining: number;
  /** Позиция эффекта (для зон и полей). */
  position: Vec2;
  radius?: number;
  vector?: Vec2;
  /** Цели эффекта (сущности, на которые воздействует). */
  targetEntities: number[];
}

/**
 * Обнаруженная синергия между двумя+ активными эффектами.
 */
export const AbilityCombo = defineComponent<AbilityComboData>('AbilityCombo');

export interface AbilityComboData {
  id: string;
  comboType: string;       //例如: 'pull_dash', 'zero_repulse'
  multiplier: number;      // усилитель эффекта
  involvedAbilityIds: string[];
  sourceEntities: number[]; // сущности-источники эффектов
  targetEntity: number | null;
  timeRemaining: number;
}

/**
 * Узел дерева навыков — разблокировка способности или улучшения ветки.
 */
export const SkillTreeNode = defineComponent<SkillTreeNodeData>('SkillTreeNode');

export interface SkillTreeNodeData {
  id: string;
  branch: AbilityBranch;
  tier: number;
  abilityId?: string;      // если узел разблокирует способность
  /** Очки ветки, необходимые для разблокировки. */
  branchPointsCost: number;
  /** Ресурсы, необходимые для разблокировки. */
  resourceCost: Array<{ itemId: string; count: number }>;
  /** Предшествующие узлы (ID). */
  prerequisites: string[];
  unlocked: boolean;
}

/**
 * Прогрессия персонажа — уровни веток, очки навыка, опыт.
 */
export const ProgressionData = defineComponent<ProgressionDataData>('ProgressionData');

export interface ProgressionDataData {
  /** Общий уровень персонажа. */
  level: number;
  /** Общий опыт. */
  experience: number;
  /** Опыт до следующего уровня. */
  experienceToNext: number;
  /** Очки веток (получаются за сканирование и исследование). */
  branchPoints: Record<AbilityBranch, number>;
  /** Уровень каждой ветки. */
  branchLevels: Record<AbilityBranch, number>;
  /** Разблокированные узлы дерева навыков. */
  unlockedNodes: string[];
  /** Разблокированные способности. */
  unlockedAbilities: string[];
}

/**
 * Предопределённые способности (шаблоны для плагинов веток).
 */
export const Abilities = {
  // === Гравитация ===
  gravity_pull: (): AbilityDefinitionData => ({
    id: 'gravity_pull',
    branch: 'gravity',
    tier: 1,
    type: 'active',
    name: 'Притяжение',
    description: 'Притягивает объекты и сущности к персонажу.',
    effects: [
      {
        type: 'apply_force',
        power: 500,
        radius: 8,
        vector: new Vec2(0, 0), // вычисляется к персонажу
        energyCost: 25,
        cooldown: 3,
      },
    ],
    prerequisites: [],
    unlockCost: [{ itemId: 'resonit', count: 1 }],
    requiredScanTypes: ['gravity_anomaly'],
    requiredBranchLevel: 0,
    synergies: [
      { withAbilityId: 'gravity_dash', comboType: 'pull_dash', multiplier: 1.5 },
      { withAbilityId: 'gravity_push', comboType: 'compress', multiplier: 2.0 },
    ],
  }),

  gravity_push: (): AbilityDefinitionData => ({
    id: 'gravity_push',
    branch: 'gravity',
    tier: 1,
    type: 'active',
    name: 'Отталкивание',
    description: 'Отбрасывает объекты в радиусе от персонажа.',
    effects: [
      {
        type: 'apply_force',
        power: 400,
        radius: 8,
        vector: new Vec2(0, 0), // вычисляется от персонажа
        energyCost: 25,
        cooldown: 3,
      },
    ],
    prerequisites: [],
    unlockCost: [{ itemId: 'resonit', count: 1 }],
    requiredScanTypes: ['gravity_anomaly'],
    requiredBranchLevel: 0,
    synergies: [
      { withAbilityId: 'gravity_pull', comboType: 'compress', multiplier: 2.0 },
      { withAbilityId: 'zero_gravity', comboType: 'zero_repulse', multiplier: 2.0 },
    ],
  }),

  gravity_weight_change: (): AbilityDefinitionData => ({
    id: 'gravity_weight_change',
    branch: 'gravity',
    tier: 2,
    type: 'toggle',
    name: 'Изменение веса',
    description: 'Меняет собственную гравитацию персонажа (ходьба по стенам/потолку).',
    effects: [
      {
        type: 'modify_gravity',
        power: 1.0, // множитель gravityScale
        energyCost: 0,
        cooldown: 0,
      },
    ],
    prerequisites: ['gravity_pull'],
    unlockCost: [{ itemId: 'resonit', count: 3 }],
    requiredScanTypes: ['wall_run_surface'],
    requiredBranchLevel: 1,
    synergies: [],
  }),

  zero_gravity: (): AbilityDefinitionData => ({
    id: 'zero_gravity',
    branch: 'gravity',
    tier: 3,
    type: 'active',
    name: 'Невесомость',
    description: 'Создаёт локальную зону нулевой гравитации вокруг персонажа.',
    effects: [
      {
        type: 'create_zone',
        power: 0, // gravityScale = 0
        duration: 8,
        radius: 6,
        energyCost: 40,
        cooldown: 12,
      },
    ],
    prerequisites: ['gravity_weight_change'],
    unlockCost: [{ itemId: 'resonit', count: 5 }, { itemId: 'ancient_fragment', count: 1 }],
    requiredScanTypes: ['zero_gravity_zone'],
    requiredBranchLevel: 2,
    synergies: [
      { withAbilityId: 'gravity_push', comboType: 'zero_repulse', multiplier: 2.0 },
    ],
  }),

  gravity_dash: (): AbilityDefinitionData => ({
    id: 'gravity_dash',
    branch: 'movement',
    tier: 2,
    type: 'active',
    name: 'Грави-рывок',
    description: 'Рывок в сторону взгляда с ускорением.',
    effects: [
      {
        type: 'impulse',
        power: 800,
        duration: 0.5,
        energyCost: 30,
        cooldown: 4,
      },
    ],
    prerequisites: ['jump_enhancement'],
    unlockCost: [{ itemId: 'ferrite_ingot', count: 5 }],
    requiredScanTypes: ['movement_anomaly'],
    requiredBranchLevel: 1,
    synergies: [
      { withAbilityId: 'gravity_pull', comboType: 'pull_dash', multiplier: 1.5 },
    ],
  }),

  // === Передвижение ===
  jump_enhancement: (): AbilityDefinitionData => ({
    id: 'jump_enhancement',
    branch: 'movement',
    tier: 1,
    type: 'passive',
    name: 'Улучшенный прыжок',
    description: '+50% к силе прыжка, доступен двойной прыжок.',
    effects: [
      {
        type: 'apply_force', // применяется как модификатор jumpForce
        power: 1.5,
        energyCost: 0,
        cooldown: 0,
      },
    ],
    prerequisites: [],
    unlockCost: [],
    requiredScanTypes: [],
    requiredBranchLevel: 0,
    synergies: [],
  }),

  // === Энергия ===
  energy_pulse: (): AbilityDefinitionData => ({
    id: 'energy_pulse',
    branch: 'energy',
    tier: 1,
    type: 'active',
    name: 'Энергетический импульс',
    description: 'Взрывная волна, наносит урон и отбрасывает.',
    effects: [
      {
        type: 'apply_force',
        power: 600,
        radius: 6,
        energyCost: 35,
        cooldown: 6,
      },
    ],
    prerequisites: [],
    unlockCost: [{ itemId: 'biogel', count: 2 }],
    requiredScanTypes: ['energy_anomaly'],
    requiredBranchLevel: 0,
    synergies: [
      { withAbilityId: 'energy_shield', comboType: 'shield_burst', multiplier: 1.8 },
    ],
  }),

  energy_shield: (): AbilityDefinitionData => ({
    id: 'energy_shield',
    branch: 'energy',
    tier: 2,
    type: 'toggle',
    name: 'Энергетический щит',
    description: 'Временный барьер, поглощающий урон.',
    effects: [
      {
        type: 'shield',
        power: 100,
        duration: 10,
        energyCost: 50,
        cooldown: 20,
      },
    ],
    prerequisites: ['energy_pulse'],
    unlockCost: [{ itemId: 'resonit', count: 2 }, { itemId: 'ferrite_ingot', count: 3 }],
    requiredScanTypes: ['energy_anomaly'],
    requiredBranchLevel: 1,
    synergies: [
      { withAbilityId: 'energy_pulse', comboType: 'shield_burst', multiplier: 1.8 },
    ],
  }),

  // === Биология ===
  scan_fauna: (): AbilityDefinitionData => ({
    id: 'scan_fauna',
    branch: 'biology',
    tier: 1,
    type: 'active',
    name: 'Сканирование фауны',
    description: 'Раскрывает свойства близких существ.',
    effects: [
      {
        type: 'scan_reveal',
        power: 1,
        radius: 12,
        energyCost: 10,
        cooldown: 2,
      },
    ],
    prerequisites: [],
    unlockCost: [],
    requiredScanTypes: [],
    requiredBranchLevel: 0,
    synergies: [],
  }),

  // === Технологии ===
  complex_crafting: (): AbilityDefinitionData => ({
    id: 'complex_crafting',
    branch: 'technology',
    tier: 1,
    type: 'passive',
    name: 'Сложный крафт',
    description: 'Доступ к рецептам 2 уровня.',
    effects: [
      {
        type: 'absorb_damage', // placeholder — пассивный эффект
        power: 1,
        energyCost: 0,
        cooldown: 0,
      },
    ],
    prerequisites: [],
    unlockCost: [{ itemId: 'ancient_fragment', count: 1 }],
    requiredScanTypes: ['ancient_ruin'],
    requiredBranchLevel: 0,
    synergies: [],
  }),
};

/** Все предустановленные способности по ID. */
export const ALL_ABILITIES: Record<string, () => AbilityDefinitionData> = {
  gravity_pull: Abilities.gravity_pull,
  gravity_push: Abilities.gravity_push,
  gravity_weight_change: Abilities.gravity_weight_change,
  zero_gravity: Abilities.zero_gravity,
  gravity_dash: Abilities.gravity_dash,
  jump_enhancement: Abilities.jump_enhancement,
  energy_pulse: Abilities.energy_pulse,
  energy_shield: Abilities.energy_shield,
  scan_fauna: Abilities.scan_fauna,
  complex_crafting: Abilities.complex_crafting,
};
