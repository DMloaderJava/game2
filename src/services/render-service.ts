/**
 * RenderService — обёртка над PixiJS v8.
 */
import * as PIXI from 'pixi.js';

export class RenderService {
  app: PIXI.Application | null = null;
  stage: PIXI.Container | null = null;
  camera: PIXI.Container | null = null;

  layers = new Map<number, PIXI.Container>();
  private displayObjects = new Map<number, any>();
  private bgColor = 0x05050a;

  init(options: { width: number; height: number; background?: number }): void {
    this.app = new PIXI.Application({
      width: options.width,
      height: options.height,
      backgroundColor: options.background ?? this.bgColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    this.app.canvas.style.display = 'block';
    document.body.appendChild(this.app.canvas);

    this.stage = this.app.stage;
    this.camera = new PIXI.Container();
    this.stage.addChild(this.camera);

    for (const layer of [0, 10, 20, 30]) {
      const container = new PIXI.Container();
      this.camera.addChild(container);
      this.layers.set(layer, container);
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize(): void {
    if (!this.app) return;
    const parent = this.app.canvas.parentElement;
    if (!parent) return;
    (this.app.renderer as any).resize(parent.clientWidth, parent.clientHeight);
  }

  addColorBlock(
    entity: number,
    width: number,
    height: number,
    color: number,
    layer = 10,
  ): any {
    if (!this.app) return null;
    const graphics = new PIXI.Graphics();
    graphics.rect(0, 0, width, height);
    graphics.fill(color);
    const container = this.layers.get(layer);
    if (container) {
      container.addChild(graphics);
      this.displayObjects.set(entity, graphics);
      return graphics;
    }
    return null;
  }

  removeSprite(entity: number): void {
    const obj = this.displayObjects.get(entity);
    if (obj) {
      obj.parent?.removeChild(obj);
      if (typeof obj.destroy === 'function') obj.destroy();
      this.displayObjects.delete(entity);
    }
  }

  updateSprite(entity: number, x: number, y: number, rotation: number): void {
    const obj = this.displayObjects.get(entity);
    if (obj) {
      obj.x = x;
      obj.y = y;
      obj.rotation = rotation;
    }
  }

  follow(targetX: number, targetY: number, lerp = 0.15): void {
    if (!this.camera || !this.app) return;
    this.camera.x += (this.app.screen.width / 2 - targetX - this.camera.x) * lerp;
    this.camera.y += (this.app.screen.height / 2 - targetY - this.camera.y) * lerp;
  }

  render(): void {
    this.app?.render();
  }

  setBackgroundColor(color: number): void {
    if (this.app) {
      (this.app as any).renderer.backgroundColor = color;
    }
    this.bgColor = color;
  }

  destroy(): void {
    this.app?.destroy(true);
    this.app = null;
    this.stage = null;
    this.camera = null;
    this.layers.clear();
    this.displayObjects.clear();
  }
}
