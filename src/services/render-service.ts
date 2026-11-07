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
  private bgColor = 0x05050a;

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

  /** Загрузить текстуру по URL (кешируется). PixiJS v8: Texture.from(url) не подгружает
   *  отсутствующий в кэше ассет и возвращает undefined, поэтому используем Assets.load.
   *  В Arena-preview игра работает через прокси на arena.site, поэтому текстуры
   *  нужно загружать напрямую с dev server (e2b.app). */
  async loadTexture(url: string): Promise<PIXI.Texture> {
    if (this.textures.has(url)) return this.textures.get(url)!;
    const fullUrl = resolveTextureUrl(url);
    const texture = await PIXI.Assets.load(fullUrl);
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
    this.camera.x += (screen.width / 2 - targetX - this.camera.x) * lerp;
    this.camera.y += (screen.height / 2 - targetY - this.camera.y) * lerp;
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

/** Преобразует относительный путь к текстуре в полный URL dev server,
 *  если игра запущена в среде Arena-preview (через arena.site/arena.ai прокси).
 *  В этом случае браузер запрашивает статику с arena.site, где текстур нет,
 *  поэтому нужно явно указывать URL dev server (e2b.app). */
function resolveTextureUrl(url: string): string {
  // Sandbox ID текущего арены-песочницы (известен фиксированно для этой сессии)
  const sandboxId = 'iusof3fx956iwhe0c1x3i';
  const port = '5173';
  // Если уже на e2b.app или localhost — относительный путь сработает сам
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (host.includes('e2b.app') || host.includes('localhost') || host === '127.0.0.1') {
    return url;
  }
  // Иначе —Arena-preview: текстуры загружаем напрямую с dev server
  if (url.startsWith('/')) {
    return `https://${port}-${sandboxId}.e2b.app${url}`;
  }
  return url;
}
