import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { Transform } from '../components/transform';
import { PhysicsBody } from '../components/physics-body';
import { GravityAnchor } from '../components/construction';
import { CharacterStats } from '../components/character';
import { Mineable } from '../components/mining';

/**
 * QuestSystem — отслеживание прогресса сюжета миссии.
 * Приоритет 60 — после всех игровых систем, перед рендером.
 */
export class QuestSystem extends System {
  readonly priority = 60;
  readonly required = [Transform];

  private worldRef!: World;
  private playerEntity: number | null = null;

  // Этапы квеста
  private questStage = 0; // 0=не начато, 1=переместился, 2=добыл руду, 3=укрылся, 4=построил
  private blocksMined = 0;
  private lastPlayerX = 0;
  private inDomeDuringCatastrophe = false;

  // Сообщения этапов
  private readonly STAGE_TEXTS: Record<string, string> = {
    0: '1/4: Приземлись и пройди к месторождению руды (A/D или Стрелки, Пробел — прыжок)',
    1: '1/4: Приземлись и пройди к месторождению руды (A/D или Стрелки, Пробел — прыжок)',
    2: '2/4: Добудь 2 ед. Ферритовой или Резонитовой руды (подойди к кристаллам и зажми [E] или кликни ЛКМ)',
    3: '3/4: Укройся внутри синего купола Гравитационного якоря и переживи Гравитационный прилив!',
    4: '4/4: Открой модуль крафта [C] и собери новый Гравитационный якорь или стену укрытия [1/2/3]',
  };

  constructor(
    private eventBus: EventBus,
  ) {
    super();
  }

  setPlayerEntity(entity: number): void {
    this.playerEntity = entity;
    this.lastPlayerX = 0;
  }

  update(world: World, dt: number): void {
    this.worldRef = world;
    if (!this.playerEntity) return;

    const transform = world.getComponent(this.playerEntity, Transform as unknown as symbol) as { x: number; y: number } | undefined;
    if (!transform) return;

    // Этап 1: переместился на 60px
    if (this.questStage <= 1) {
      if (this.lastPlayerX === 0) this.lastPlayerX = transform.x;
      if (Math.abs(transform.x - this.lastPlayerX) >= 60) {
        this.questStage = 2;
        this.eventBus.emit('quest:stage-changed', { stage: this.questStage });
      }
    }

    // Этап 3: игрок в купола во время катастрофы
    if (this.questStage === 3) {
      this.checkDomeProtection(world, transform);
    }
  }

  private checkDomeProtection(world: World, transform: { x: number; y: number }): void {
    const anchors = world.query(GravityAnchor as unknown as symbol, Transform as unknown as symbol);
    const tidePhase = this.getTidePhase(world);
    if (tidePhase !== 'catastrophe') return;

    for (const { components } of anchors) {
      const anchorData = components[0] as { active: boolean; radius: number };
      const anchorTransform = components[1] as { x: number; y: number };
      if (anchorData.active && anchorTransform) {
        const dx = transform.x - anchorTransform.x;
        const dy = transform.y - anchorTransform.y;
        if (Math.hypot(dx, dy) <= anchorData.radius) {
          this.inDomeDuringCatastrophe = true;
          this.questStage = 4;
          this.eventBus.emit('quest:stage-changed', { stage: this.questStage });
          return;
        }
      }
    }
  }

  /** Вызов извне при добыче блока руды. */
  onBlockMined(tileType: string): void {
    if (tileType === 'ferrite_ore' || tileType === 'resonit_ore') {
      this.blocksMined++;
      if (this.blocksMined >= 2 && this.questStage === 2) {
        this.questStage = 3;
        this.eventBus.emit('quest:stage-changed', { stage: this.questStage });
      }
    }
  }

  private getTidePhase(world: World): string {
    const tideEntities = world.query('tide-state' as unknown as symbol);
    if (tideEntities.length > 0) {
      const data = tideEntities[0].components[0] as { phase: string };
      return data.phase;
    }
    return 'stability';
  }

  getStage(): number { return this.questStage; }
  getStageText(): string { return this.STAGE_TEXTS[this.questStage] || this.STAGE_TEXTS[0]; }
  getBlocksMined(): number { return this.blocksMined; }
}
