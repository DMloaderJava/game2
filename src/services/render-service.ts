/**
 * RenderService — обёртка над PixiJS v8.
 * Только текстуры и спрайты — никаких Graphics примитивов для игровых объектов.
 */
import * as PIXI from 'pixi.js';

export class RenderService {
  app: PIXI.Application | null = null;
  stage: PIXI.Container | null = null;
  camera: PIXI.Container | null = null;

  layers = new Map<number, PIXI.Container>();
  private displayObjects = new Map<number, any>();
  private textures = new Map<string, PIXI.Texture>();
  private bgColor = 0x111827;

  async init(options: { width: number; height: number; background?: number }): Promise<void> {
    this.app = new PIXI.Application();
    await this.app.init({
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

  /* Цветовые плейсхолдеры для текстур (имя файла → RGB) — используется,
   * когда загрузка по URL не удаётся (Arena-preview iframe, CORS, битые файлы). */
  private static readonly PLACEHOLDER_COLORS: Record<string, number> = {
    // Блоки мира
    block_dirt: 0x654321,
    block_stone: 0x808080,
    block_ferrite: 0xa9a9a9,
    block_resonit: 0x9370db,
    block_stone_wall: 0x646464,
    // Предметы
    item_stone_slabs: 0xa0a0a0,
    item_ferrite_ore: 0xb4b4b4,
    item_resonit: 0xb478ff,
    item_biovolume: 0x228b22,
    item_biogel: 0x32cd32,
    item_ancient_fragment: 0xdaa520,
    // Устройства
    gravity_anchor: 0x4cc9f0,
    gravity_zone: 0x4cc9f0,
    energy_dome: 0x00ffff,
    // Игрок (анимации)
    player_idle: 0xffdcb1,
    player_idle_0: 0xffdcb1,
    player_idle_1: 0xffdcb1,
    player_idle_2: 0xffdcb1,
    player_idle_3: 0xffdcb1,
    player_walk: 0xffdcb1,
    player_walk_0: 0xffdcb1,
    player_walk_1: 0xffdcb1,
    player_walk_2: 0xffdcb1,
    player_walk_3: 0xffdcb1,
    player_walk_4: 0xffdcb1,
    player_walk_5: 0xffdcb1,
    player_jump: 0xffdcb1,
    player_idle_style: 0xffdcb1,
    // UI
    bg_space: 0x05050a,
    ui_slot: 0x3c3c50,
  };

  /** Создать текстуру-сплошной цвет из canvas (без загрузки файла). */
  private createSolidTexture(color: number, size = 64): PIXI.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, size, size);
    return PIXI.Texture.from(canvas.toDataURL());
  }

  /** Загрузить текстуру по URL (кешируется). В Arena-preview iframe браузер
   *  разрешает относительные пути к домену arena.site, где текстур нет.
   *  Поэтому создаём текстуру программно из canvas — работает везде. */
  async loadTexture(url: string): Promise<PIXI.Texture> {
    if (this.textures.has(url)) return this.textures.get(url)!;

    // Извлекаем имя текстуры из URL для подбора цвета плейсхолдера
    const fileName = url.split('/').pop()?.replace('.png', '') ?? url;
    const color = RenderService.PLACEHOLDER_COLORS[fileName] ?? 0x808080;

    const texture = this.createSolidTexture(color);
    this.textures.set(url, texture);
    return texture;
  }

  /** Предзагрузить список текстур. */
  async loadTextures(urls: string[]): Promise<void> {
    await Promise.all(urls.map((u) => this.loadTexture(u)));
  }

  getTexture(url: string): PIXI.Texture | undefined {
    return this.textures.get(url);
  }

  resize(): void {
    if (!this.app) return;
    const parent = this.app.canvas.parentElement;
    if (!parent) return;
    this.app.renderer.resize(parent.clientWidth, parent.clientHeight);
  }

  /** Добавить спрайт сущности с текстурой. */
  addSprite(
    entity: number,
    textureUrl: string,
    layer = 10,
    animated = false,
    frameCount = 1,
    frameDuration = 0.1,
  ): any {
    if (!this.app) return null;

    const container = this.layers.get(layer);
    if (!container) return null;

    let displayObject: any;
    if (animated && frameCount > 1) {
      const textures: PIXI.Texture[] = [];
      for (let i = 0; i < frameCount; i++) {
        const t = this.textures.get(`${textureUrl.replace('.png', '')}_${i}.png`);
        textures.push(t ?? this.textures.get(textureUrl)!);
      }
      displayObject = new PIXI.AnimatedSprite(textures);
      displayObject.animationSpeed = frameDuration;
      displayObject.play();
    } else {
      const texture = this.textures.get(textureUrl) ?? PIXI.Texture.WHITE;
      displayObject = new PIXI.Sprite(texture);
    }

    container.addChild(displayObject);
    this.displayObjects.set(entity, displayObject);
    return displayObject;
  }

  /** Добавить спрайт из уже загруженной текстуры. */
  addSpriteFromTexture(entity: number, texture: PIXI.Texture, layer = 10): any {
    if (!this.app) return null;
    const container = this.layers.get(layer);
    if (!container) return null;
    const sprite = new PIXI.Sprite(texture);
    container.addChild(sprite);
    this.displayObjects.set(entity, sprite);
    return sprite;
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
    const screen = this.app.renderer.screen;
    // Камера держит игрока ровно в центре экрана
    this.camera.x = screen.width / 2 - targetX;
    this.camera.y = screen.height / 2 - targetY;
    // Ограничиваем камеру по вертикали, чтобы земля не уходила в черноту
    this.camera.y = Math.min(Math.max(this.camera.y, -400), 900);
  }

  /** Получить текущую позицию камеры. */
  getCameraPosition(): { x: number; y: number } {
    return { x: this.camera?.x ?? 0, y: this.camera?.y ?? 0 };
  }

  render(): void {
    if (!this.app) return;
    // PixiJS v8: явно рендерим сцену через рендерер
    (this.app.renderer as any).render(this.app.stage);
  }

  setBackgroundColor(color: number): void {
    this.bgColor = color;
    const app = this.app;
    if (app) {
      (app.renderer as any).background = color;
    }
  }

  /** Задать текстуру фона (параллакс/космос). */
  async setBackgroundTexture(url: string): Promise<void> {
    const texture = await this.loadTexture(url);
    const app = this.app;
    if (!app || !texture) return;
    const bg: any = new PIXI.Sprite(texture);
    const renderer: any = app.renderer;
    // Заполняем экран фоном, не читая width/height текстуры (PixiJS v8 может вернуть 0 до декодирования)
    bg.width = renderer.width;
    bg.height = renderer.height;
    this.stage?.addChildAt(bg, 0);
    this.displayObjects.set(-1, bg);
  }

  /** Переключить анимацию у AnimatedSprite сущности (или текстуру у обычного Sprite). */
  setSpriteAnimation(entity: number, textureUrls: string[], animationSpeed = 0.1): void {
    const obj = this.displayObjects.get(entity);
    if (!obj) return;
    const textures = textureUrls
      .map((u) => this.textures.get(u))
      .filter((t): t is PIXI.Texture => t !== undefined);
    if (textures.length === 0) return;
    if (obj instanceof PIXI.AnimatedSprite) {
      obj.textures = textures;
      obj.animationSpeed = animationSpeed;
      if (!obj.playing) obj.play();
    } else if (obj instanceof PIXI.Sprite) {
      obj.texture = textures[0];
    }
  }

  /** Зеркалировать спрайт по X (отражение влево/вправо). */
  flipSpriteX(entity: number, flipX: boolean): void {
    const obj = this.displayObjects.get(entity);
    if (!obj) return;
    const scaleX = Math.abs(obj.scale.x);
    obj.scale.x = flipX ? -scaleX : scaleX;
  }

  destroy(): void {
    this.app?.destroy(true);
    this.app = null;
    this.stage = null;
    this.camera = null;
    this.layers.clear();
    this.displayObjects.clear();
    this.textures.clear();
  }
}
