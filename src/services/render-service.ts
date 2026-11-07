/**
 * RenderService — обёртка над PixiJS.
 * Управляет_application, сценами, слоями, камерой и текстурами.
 */
export class RenderService {
  app: unknown = null; // PIXI.Application
  stage: unknown = null; // PIXI.Container
  camera: unknown = null; // камера с follow-целью и интерполяцией

  /** Слои отрисовки: ключ — номер слоя, значение — PIXI.Container. */
  layers = new Map<number, unknown>();

  /** Зарегистрировать спрайт сущности на нужном слое. */
  addSprite(entity: number, texture: string): unknown {
    // return new PIXI.Sprite(PIXI.Texture.from(texture))
    throw new Error('RenderService.addSprite: инициализируйте PixiJS в main.ts');
  }

  /** Удалить спрайт сущности. */
  removeSprite(entity: number): void {}

  /** Обновить трансформацию спрайта из компонента Transform. */
  updateSprite(entity: number, x: number, y: number, rotation: number): void {}

  /** Установить цель камеры (например, игрока). */
  follow(entity: number): void {}

  /** Отрисовать кадр с интерполяцией alpha. */
  render(alpha: number): void {
    // this.app.render()
  }

  /** Ресайз окна. */
  resize(width: number, height: number): void {}
}
