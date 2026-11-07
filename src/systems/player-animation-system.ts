/**
 * PlayerAnimationSystem — переключение анимаций игрока и зеркалирование спрайта.
 * Приоритет 35 — между CharacterSystem (12) и RenderSystem (40).
 * Читает состояние CharacterController и управляет PIXI.AnimatedSprite игрока.
 */
import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { RenderService } from '../services/render-service';
import { Transform } from '../components/transform';
import { CharacterController, CharacterControllerData } from '../components/character';
import { CharacterStats, CharacterStatsData } from '../components/character';

/** Кадра анимации простоя. */
const IDLE_FRAMES = [
  'src/assets/textures/player_idle_0.png',
  'src/assets/textures/player_idle_1.png',
  'src/assets/textures/player_idle_2.png',
  'src/assets/textures/player_idle_3.png',
];

/** Кадра анимации ходьбы. */
const WALK_FRAMES = [
  'src/assets/textures/player_walk_0.png',
  'src/assets/textures/player_walk_1.png',
  'src/assets/textures/player_walk_2.png',
  'src/assets/textures/player_walk_3.png',
  'src/assets/textures/player_walk_4.png',
  'src/assets/textures/player_walk_5.png',
];

/** Кадра анимации прыжка/падения (fallback на одно изображение пока кадры не добавлены). */
const JUMP_FRAMES = ['src/assets/textures/player_jump.png'];

type AnimName = 'idle' | 'walk' | 'jump';

export class PlayerAnimationSystem extends System {
  readonly priority = 35;
  readonly required = [Transform, CharacterController, CharacterStats];

  private worldRef!: World;
  private playerEntity: number | null = null;
  private currentAnimation: AnimName | null = null;
  private lastDirection = 1; // 1 = вправо, -1 = влево

  constructor(private render: RenderService) {
    super();
  }

  /** Привязать игрока (вызывается из main.ts после создания сущности). */
  setPlayerEntity(entity: number): void {
    this.playerEntity = entity;
    // Инициализируем анимацию простоя
    this.render.setSpriteAnimation(entity, IDLE_FRAMES, 0.15);
    this.currentAnimation = 'idle';
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const entities = world.query(Transform, CharacterController, CharacterStats);
    for (const { entity, components } of entities) {
      const ctrl = components[1] as CharacterControllerData;
      const stats = components[2] as CharacterStatsData;

      if (ctrl.state === 'Dead') continue;

      // Определяем нужную анимацию по состоянию персонажа
      let animation: AnimName;
      if (ctrl.state === 'Airborne' || ctrl.state === 'ZeroG') {
        animation = 'jump';
      } else if (ctrl.inputDirection.x !== 0 || ctrl.inputDirection.y !== 0) {
        animation = 'walk';
      } else {
        animation = 'idle';
      }

      // Переключаем анимацию только при изменении
      if (animation !== this.currentAnimation) {
        this.currentAnimation = animation;
        switch (animation) {
          case 'idle':
            this.render.setSpriteAnimation(entity, IDLE_FRAMES, 0.15);
            break;
          case 'walk':
            this.render.setSpriteAnimation(entity, WALK_FRAMES, 0.2);
            break;
          case 'jump':
            this.render.setSpriteAnimation(entity, JUMP_FRAMES, 0.15);
            break;
        }
      }

      // Зеркалирование спрайта по направлению движения по X
      if (ctrl.inputDirection.x !== 0) {
        const dir = ctrl.inputDirection.x > 0 ? 1 : -1;
        if (dir !== this.lastDirection) {
          this.lastDirection = dir;
          this.render.flipSpriteX(entity, dir < 0);
        }
      }
    }
  }
}
