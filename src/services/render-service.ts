/** RenderService — обёртка над PixiJS v8. */
import * as PIXI from 'pixi.js';

export class RenderService {
  app: PIXI.Application | null = null;
  stage: PIXI.Container | null = null;
  camera: PIXI.Container | null = null;

  layers = new Map<number, PIXI.Container>();
  private displayObjects = new Map<number, any>();
  private textures = new Map<string, PIXI.Texture>();
  private bgColor = 0x111827;

  /* Цветовые плейсхолдеры для процедурных текстур. */
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
    // Существа
    creature_scavenger: 0x06b6d4,
    creature_predator: 0x7f1d1d,
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
    bgSpace: 0x05050a,
    uiSlot: 0x3c3c50,
  };

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

    // Фоновые декорации — звёзды и скалы с zIndex=-10 (позади игрока и земли)
    this.addBackgroundDecorations(this.camera, 3000, this.app.renderer.screen.width, this.app.renderer.screen.height);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ── Процедурная отрисовка текстур на canvas ───────────────── */

  private createProceduralTexture(name: string, size = 64): PIXI.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    switch (name) {
      // ── Игрок: космонавт ──
      case 'player_idle':
      case 'player_idle_0':
      case 'player_idle_1':
      case 'player_idle_2':
      case 'player_idle_3':
      case 'player_walk':
      case 'player_walk_0':
      case 'player_walk_1':
      case 'player_walk_2':
      case 'player_walk_3':
      case 'player_walk_4':
      case 'player_walk_5':
        this.drawAstronaut(ctx, size, size, 'idle');
        break;

      case 'player_jump':
        this.drawAstronaut(ctx, size, size, 'jump');
        break;

      // ── Блоки мира ──
      case 'block_dirt':
        this.drawGround(ctx, size, size);
        break;

      case 'block_stone':
        this.drawStone(ctx, size, size);
        break;

      case 'block_ferrite':
        this.drawOre(ctx, size, size, 0xff6600);
        break;

      case 'block_resonit':
        this.drawOre(ctx, size, size, 0xaa00ff);
        break;

      case 'block_stone_wall':
        this.drawStoneWall(ctx, size, size);
        break;

      // ── Устройства ──
      case 'gravity_anchor':
        this.drawGravityAnchor(ctx, size, size);
        break;

      case 'energy_dome':
        this.drawEnergyDome(ctx, size, size);
        break;

      // Существа
      case 'creature_scavenger':
        this.drawScavenger(ctx, size, size);
        break;

      case 'creature_predator':
        this.drawPredator(ctx, size, size);
        break;

      default:
        this.drawSolid(ctx, size, size, RenderService.PLACEHOLDER_COLORS[name] ?? 0x808080);
    }

    return PIXI.Texture.from(canvas);
  }

  /** Одиночный цвет (fallback). */
  private drawSolid(ctx: CanvasRenderingContext2D, w: number, h: number, color: number): void {
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, w, h);
  }

  /** Космонавт с шлемом, визором и ранцем. */
  private drawAstronaut(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    pose: 'idle' | 'jump',
  ): void {
    const cx = w / 2;
    const cy = h / 2;

    // Тело (скафандр)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 12, cy - 6, 24, 14);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 8, cy + 6, 16, 10);

    // Шлем
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 14, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Визор (светящийся голубой)
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 14, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Рюкзак / джетпак
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 14, cy - 2, 8, 12);

    // Пламя джетпака при прыжке
    if (pose === 'jump') {
      ctx.fillStyle = '#ff4400';
      ctx.fillRect(cx + 12, cy + 6, 6, 10);
      ctx.fillStyle = '#ffaa00';
      ctx.fillRect(cx + 14, cy + 8, 4, 6);
    }

    // Руки
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 14, cy - 2, 6, 8);
    ctx.fillRect(cx + 8, cy - 2, 6, 8);

    // Ноги
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 8, cy + 14, 6, 8);
    ctx.fillRect(cx + 2, cy + 14, 6, 8);
  }

  /** Слоистая инопланетная почва — яркая и контрастная. */
  private drawGround(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Верхний слой — неоново-зелёный мох
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, 8, w, 8);
    // Каменное тело — тёмная фиолетово-серая порода
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 16, w, h - 16);
    // Камни и вкрапления
    ctx.fillStyle = '#475569';
    for (let i = 0; i < w / 64; i++) {
      const rx = (i * 64) + (i % 3 === 0 ? 8 : i % 3 === 1 ? 24 : 40);
      const ry = 20 + (i % 2 === 0 ? 0 : 10);
      ctx.fillRect(rx, ry, 12, 8);
    }
    // Трещины
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 16);
      ctx.lineTo(i + 20, h);
      ctx.stroke();
    }
  }

  /** Каменный блок с трещинами. */
  private drawStone(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#616161';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#424242';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(w - 4, 8);
    ctx.lineTo(w - 8, h - 4);
    ctx.lineTo(8, h - 8);
    ctx.closePath();
    ctx.stroke();
    // Блик
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(6, 6, 10, 10);
  }

  /** Руда со светящимися жилами. */
  private drawOre(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    glowColor: number,
  ): void {
    ctx.fillStyle = '#424242';
    ctx.fillRect(0, 0, w, h);

    const glowHex = `#${glowColor.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = glowHex;
    // Жилы руды
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.3, 6, 0, Math.PI * 2);
    ctx.arc(w * 0.7, h * 0.7, 8, 0, Math.PI * 2);
    ctx.arc(w * 0.5, h * 0.2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Границы камня
    ctx.strokeStyle = '#212121';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
  }

  /** Кирпичная стена. */
  private drawStoneWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#757575';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#424242';
    ctx.lineWidth = 2;
    // Кирпичный узор
    for (let y = 0; y < h; y += 16) {
      const offset = (y / 16) % 2 === 0 ? 0 : 16;
      for (let x = -16 + offset; x < w; x += 32) {
        ctx.strokeRect(x, y, 30, 14);
      }
    }
  }

  /** Гравитационный якорь — техно-блок с ядром. */
  private drawGravityAnchor(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#37474f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#4cc9f0';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    // Ядро
    ctx.fillStyle = '#4cc9f0';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(76, 201, 240, 0.4)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Энергетический купол — сфера с энергией. */
  private drawEnergyDome(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#263238';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    // Внутренняя энергия
    ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Мирный сборщик — жук с зелёно-голубым панцирем. */
  private drawScavenger(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    // Тело
    ctx.fillStyle = '#059669';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Панцирь
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Лапки
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i - 1.5) * 0.4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 10, cy + Math.sin(angle) * 6);
      ctx.lineTo(cx + Math.cos(angle) * 18, cy + Math.sin(angle) * 12);
      ctx.stroke();
    }
    // Глаза
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 4, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Хищник — красный/фиолетовый с шипами и светящими глазами. */
  private drawPredator(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    // Тело
    ctx.fillStyle = '#7f1d1d';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 14, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    // Шипы
    ctx.fillStyle = '#991b1b';
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * 8, cy + Math.sin(angle) * 6);
      ctx.lineTo(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 14);
      ctx.lineTo(cx + Math.cos(angle + 0.3) * 10, cy + Math.sin(angle + 0.3) * 8);
      ctx.closePath();
      ctx.fill();
    }
    // Глаза (светящиеся фиолетовые)
    ctx.fillStyle = '#c084fc';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 4, 3, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy - 4, 3, 0, Math.PI * 2);
    ctx.fill();
    // Блеск в глазах
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 5, 1, 0, Math.PI * 2);
    ctx.arc(cx + 7, cy - 5, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── Фоновые декорации (звёзды и скалы, zIndex = -10) ─────── */

  private addBackgroundDecorations(container: PIXI.Container, levelWidth: number, screenW: number, screenH: number): void {
    // 100 звёзд/кристаллов
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * levelWidth;
      const y = Math.random() * screenH;
      const size = Math.random() * 2 + 0.5;
      const color = Math.random() > 0.5 ? 0x4cc9f0 : 0xc084fc;
      const star = new PIXI.Graphics();
      star.beginFill(color, 0.6);
      star.drawCircle(0, 0, size);
      star.endFill();
      star.x = x;
      star.y = y;
      star.zIndex = -10;
      container.addChild(star);
    }

    // Силуэты инопланетных скал вдоль уровня
    for (let x = 0; x < levelWidth; x += 200) {
      const rockH = 60 + Math.random() * 80;
      const rock = new PIXI.Graphics();
      rock.beginFill(0x1e293b);
      rock.drawPolygon([x, screenH, x + 30, screenH - rockH, x + 60, screenH]);
      rock.endFill();
      rock.zIndex = -10;
      container.addChild(rock);
    }
  }

  /* ── Явная позиция спрайта ─────────────────────────────────── */

  setSpritePosition(entity: number, x: number, y: number): void {
    const obj = this.displayObjects.get(entity);
    if (obj) {
      obj.x = x;
      obj.y = y;
    }
  }

  /* ── Публичное API ─────────────────────────────────────────── */

  /** Загрузить текстуру по URL (кешируется). PixiJS v8: Texture.from(url) не подгружает
   *  отсутствующий в кэше ассет и возвращает undefined, поэтому создаём текстуру
   *  программно из canvas — работает везде, в том числе в Arena-preview iframe. */
  async loadTexture(url: string): Promise<PIXI.Texture> {
    if (this.textures.has(url)) return this.textures.get(url)!;

    const fileName = url.split('/').pop()?.replace('.png', '') ?? url;
    const texture = this.createProceduralTexture(fileName);
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

  /** Добавить спрайт сущности с текстурой и явно заданными размерами. */
  addSprite(
    entity: number,
    textureUrl: string,
    layer = 10,
    width = 64,
    height = 64,
    animated = false,
    frameCount = 1,
    frameDuration = 0.1,
  ): any {
    if (!this.app) return null;

    const container = this.layers.get(layer);
    if (!container) return null;

    let displayObject: any;
    const texture = this.textures.get(textureUrl) ?? PIXI.Texture.WHITE;

    if (animated && frameCount > 1) {
      const textures: PIXI.Texture[] = [];
      for (let i = 0; i < frameCount; i++) {
        const t = this.textures.get(`${textureUrl.replace('.png', '')}_${i}.png`);
        textures.push(t ?? texture);
      }
      displayObject = new PIXI.AnimatedSprite(textures);
      displayObject.animationSpeed = frameDuration;
      displayObject.play();
    } else {
      displayObject = new PIXI.Sprite(texture);
    }

    displayObject.anchor.set(0.5);
    displayObject.width = width;
    displayObject.height = height;

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
    sprite.anchor.set(0.5);
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

  flipSpriteX(entity: number, flipX: boolean): void {
    const obj = this.displayObjects.get(entity);
    if (!obj) return;
    const scaleX = Math.abs(obj.scale.x);
    obj.scale.x = flipX ? -scaleX : scaleX;
  }

  follow(targetX: number, targetY: number, lerp = 0.15): void {
    if (!this.camera || !this.app) return;
    // Защита от NaN — камера не улетает за экран
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;
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
    (this.app.renderer as any).render(this.app.stage);
  }

  setBackgroundColor(color: number): void {
    this.bgColor = color;
    const app = this.app;
    if (app) {
      (app.renderer as any).background = color;
    }
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
