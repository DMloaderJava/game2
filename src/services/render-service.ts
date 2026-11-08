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
    block_ferrite: 0xff6600,
    block_resonit: 0xaa00ff,
    block_stone_wall: 0x646464,
    // Предметы
    item_stone_slabs: 0xa0a0a0,
    item_ferrite_ore: 0xff6600,
    item_resonit: 0xaa00ff,
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
    player_run_0: 0xffdcb1,
    player_run_1: 0xffdcb1,
    player_run_2: 0xffdcb1,
    player_jump: 0xffdcb1,
    player_mine: 0xffdcb1,
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

    // Фоновая атмосфера планеты (звёзды, кольцо газового гиганта, горы) с zIndex=-10
    try {
      this.addAtmosphereBackground(this.camera, 3000, this.app.renderer.screen.width, this.app.renderer.screen.height);
    } catch (err) {
      console.warn('Atmosphere background skipped:', err);
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /* ── Процедурная отрисовка текстур на canvas (прозрачный фон) ──── */

  private createProceduralTexture(name: string, size = 64): PIXI.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size); // прозрачный фон по умолчанию

    switch (name) {
      // ── Игрок: космонавт — 6 кадров анимации (прозрачный фон) ──
      case 'player_idle_0':
        this.drawAstronautIdle0(ctx, size, size);
        break;
      case 'player_idle_1':
        this.drawAstronautIdle1(ctx, size, size);
        break;
      case 'player_run_0':
        this.drawAstronautRun0(ctx, size, size);
        break;
      case 'player_run_1':
        this.drawAstronautRun1(ctx, size, size);
        break;
      case 'player_run_2':
        this.drawAstronautRun2(ctx, size, size);
        break;
      case 'player_jump':
        this.drawAstronautJump(ctx, size, size);
        break;
      case 'player_mine':
        this.drawAstronautMine(ctx, size, size);
        break;
      case 'player_idle':
      case 'player_walk':
      case 'player_walk_0':
      case 'player_walk_1':
      case 'player_walk_2':
      case 'player_walk_3':
      case 'player_walk_4':
      case 'player_walk_5':
        this.drawAstronautIdle0(ctx, size, size);
        break;

      // ── Блоки мира ──
      case 'block_dirt':
        this.drawGroundBlock(ctx, size, size);
        break;
      case 'block_stone':
        this.drawStoneBlock(ctx, size, size);
        break;
      case 'block_ferrite':
        this.drawFerriteOre(ctx, size, size);
        break;
      case 'block_resonit':
        this.drawResonitOre(ctx, size, size);
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

      // Существа (2 кадра каждый)
      case 'creature_scavenger':
        this.drawScavenger(ctx, size, size, 0);
        break;
      case 'creature_predator':
        this.drawPredator(ctx, size, size, 0);
        break;

      default:
        this.drawSolid(ctx, size, size, RenderService.PLACEHOLDER_COLORS[name] ?? 0x808080);
    }

    return PIXI.Texture.from(canvas);
  }

  /* ── Космонавт — кадры анимации (прозрачный фон) ─────────────── */

  private drawAstronautIdle0(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    // Тело (скафандр)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 10, cy - 4, 20, 12);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 6, cy + 6, 12, 8);
    // Шлем
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Визор
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 12, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ранец
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 11, cy - 1, 7, 10);
    // Руки
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 12, cy - 1, 5, 7);
    ctx.fillRect(cx + 7, cy - 1, 5, 7);
    // Ноги
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 6, cy + 12, 5, 7);
    ctx.fillRect(cx + 1, cy + 12, 5, 7);
  }

  private drawAstronautIdle1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    // Тело с вдохом (смещение корпуса)
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 10, cy - 3, 20, 12);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 6, cy + 7, 12, 8);
    // Шлем
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 11, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Визор — свечение
    ctx.fillStyle = '#40ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 11, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ранец
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 11, cy - 1, 7, 10);
    // Руки
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 12, cy - 1, 5, 7);
    ctx.fillRect(cx + 7, cy - 1, 5, 7);
    // Ноги
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 6, cy + 12, 5, 7);
    ctx.fillRect(cx + 1, cy + 12, 5, 7);
  }

  private drawAstronautRun0(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 10, cy - 4, 20, 12);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 6, cy + 6, 12, 8);
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 12, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ранец
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 11, cy - 1, 7, 10);
    // Ноги — шаг левой вперёд
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 9, cy + 10, 5, 9);
    ctx.fillRect(cx + 3, cy + 13, 5, 6);
    // Руки
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 12, cy - 1, 5, 7);
    ctx.fillRect(cx + 7, cy - 1, 5, 7);
  }

  private drawAstronautRun1(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 10, cy - 3, 20, 12);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 6, cy + 7, 12, 8);
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 11, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 11, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 11, cy - 1, 7, 10);
    // Ноги — фаза переката
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 4, cy + 11, 5, 8);
    ctx.fillRect(cx + 1, cy + 13, 5, 7);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 12, cy - 1, 5, 7);
    ctx.fillRect(cx + 7, cy - 1, 5, 7);
  }

  private drawAstronautRun2(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 10, cy - 4, 20, 12);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 6, cy + 6, 12, 8);
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 12, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 11, cy - 1, 7, 10);
    // Ноги — шаг правой вперёд
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 3, cy + 13, 5, 6);
    ctx.fillRect(cx + 8, cy + 10, 5, 9);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 12, cy - 1, 5, 7);
    ctx.fillRect(cx + 7, cy - 1, 5, 7);
  }

  private drawAstronautJump(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 10, cy - 5, 20, 10);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 6, cy + 4, 12, 7);
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 13, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 13, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Ранец
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 11, cy - 2, 7, 9);
    // Плазма из ранца
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.arc(cx + 14, cy + 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#40ffff';
    ctx.beginPath();
    ctx.arc(cx + 15, cy + 7, 2, 0, Math.PI * 2);
    ctx.fill();
    // Ноги поджаты
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 5, cy + 9, 5, 6);
    ctx.fillRect(cx + 0, cy + 10, 5, 6);
    // Руки
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 12, cy - 1, 5, 7);
    ctx.fillRect(cx + 7, cy - 1, 5, 7);
  }

  private drawAstronautMine(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - 10, cy - 4, 20, 12);
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 6, cy + 6, 12, 8);
    ctx.fillStyle = '#d0d0d0';
    ctx.beginPath();
    ctx.arc(cx, cy - 12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#808080';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#00ffff';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 12, 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx + 11, cy - 1, 7, 10);
    // Рука с резаком вытянута вперёд
    ctx.fillStyle = '#c0c0c0';
    ctx.fillRect(cx - 15, cy - 1, 8, 6);
    // Лазерный резак — вспышка
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(cx - 18, cy + 2, 3, 0, Math.PI * 2);
    ctx.fill();
    // Искры
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.arc(cx - 20, cy - 1, 1.5, 0, Math.PI * 2);
    ctx.arc(cx - 19, cy + 3, 1.5, 0, Math.PI * 2);
    ctx.arc(cx - 17, cy + 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Ноги
    ctx.fillStyle = '#404040';
    ctx.fillRect(cx - 6, cy + 12, 5, 7);
    ctx.fillRect(cx + 1, cy + 12, 5, 7);
  }

  /* ── Блоки мира ──────────────────────────────────────────────── */

  private drawGroundBlock(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Верхний слой — неоново-зелёный мох
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, 8, w, 8);
    // Каменное тело
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 16, w, h - 16);
    // Камни
    ctx.fillStyle = '#475569';
    for (let i = 0; i < w / 24; i++) {
      const rx = i * 24 + (i % 3 === 0 ? 4 : i % 3 === 1 ? 10 : 16);
      const ry = 20 + (i % 2 === 0 ? 0 : 8);
      ctx.fillRect(rx, ry, 10, 6);
    }
    // Трещины
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 16);
      ctx.lineTo(i + 12, h);
      ctx.stroke();
    }
  }

  private drawStoneBlock(ctx: CanvasRenderingContext2D, w: number, h: number): void {
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
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(6, 6, 10, 10);
  }

  private drawFerriteOre(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#2d2d2d';
    ctx.fillRect(0, 0, w, h);
    // Яркие оранжевые жилы
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(w * 0.25, h * 0.3, 8, 0, Math.PI * 2);
    ctx.arc(w * 0.75, h * 0.7, 10, 0, Math.PI * 2);
    ctx.arc(w * 0.5, h * 0.25, 7, 0, Math.PI * 2);
    ctx.arc(w * 0.8, h * 0.4, 6, 0, Math.PI * 2);
    ctx.fill();
    // Внешнее свечение
    ctx.fillStyle = '#ff660040';
    ctx.beginPath();
    ctx.arc(w * 0.25, h * 0.3, 12, 0, Math.PI * 2);
    ctx.arc(w * 0.75, h * 0.7, 14, 0, Math.PI * 2);
    ctx.fill();
    // Границы
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }

  private drawResonitOre(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#2d2d2d';
    ctx.fillRect(0, 0, w, h);
    // Яркие фиолетовые жилы
    ctx.fillStyle = '#aa00ff';
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.3, 8, 0, Math.PI * 2);
    ctx.arc(w * 0.7, h * 0.7, 10, 0, Math.PI * 2);
    ctx.arc(w * 0.5, h * 0.25, 7, 0, Math.PI * 2);
    ctx.arc(w * 0.85, h * 0.45, 6, 0, Math.PI * 2);
    ctx.fill();
    // Внешнее свечение
    ctx.fillStyle = '#aa00ff40';
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.3, 12, 0, Math.PI * 2);
    ctx.arc(w * 0.7, h * 0.7, 14, 0, Math.PI * 2);
    ctx.fill();
    // Границы
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, w - 4, h - 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, w, h);
  }

  private drawStoneWall(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#757575';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#424242';
    ctx.lineWidth = 2;
    for (let y = 0; y < h; y += 16) {
      const offset = (y / 16) % 2 === 0 ? 0 : 16;
      for (let x = -16 + offset; x < w; x += 32) {
        ctx.strokeRect(x, y, 30, 14);
      }
    }
    // Техно-швы
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  /* ── Устройства ──────────────────────────────────────────────── */

  private drawGravityAnchor(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#37474f';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    // Ядро — пульсирующее
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 16, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawEnergyDome(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#263238';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── Существа ────────────────────────────────────────────────── */

  private drawScavenger(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const legOffset = frame === 0 ? 0 : 3;
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
    // Лапки (движение в зависимости от кадра)
    ctx.strokeStyle = '#047857';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const angle = (i - 1.5) * 0.4;
      const legX = cx + Math.cos(angle) * 10;
      const legY = cy + Math.sin(angle) * 6 + legOffset;
      ctx.beginPath();
      ctx.moveTo(legX, legY);
      ctx.lineTo(cx + Math.cos(angle) * 18, cy + Math.sin(angle) * 12 + legOffset);
      ctx.stroke();
    }
    // Глаза
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 4, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawPredator(ctx: CanvasRenderingContext2D, w: number, h: number, frame: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const spikeOffset = frame === 0 ? 0 : 2;
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
      ctx.lineTo(cx + Math.cos(angle) * 16, cy + Math.sin(angle) * 14 + spikeOffset);
      ctx.lineTo(cx + Math.cos(angle + 0.3) * 10, cy + Math.sin(angle + 0.3) * 8);
      ctx.closePath();
      ctx.fill();
    }
    // Глаза
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

  /* ── Одиночный цвет (fallback) ───────────────────────────────── */

  private drawSolid(ctx: CanvasRenderingContext2D, w: number, h: number, color: number): void {
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, w, h);
  }

  /* ── Поверхность планеты (Canvas-спрайт, 650px высота) ───────── */

  /** Рисует слой земли через HTMLCanvasElement -> PIXI.Texture.from(canvas) -> PIXI.Sprite. */
  public drawPlanetSurface(surfaceY: number, worldWidth: number): void {
    if (!this.camera) return;

    const tileW = 512;
    const tileH = 650;
    const canvas = document.createElement('canvas');
    canvas.width = tileW;
    canvas.height = tileH;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, tileW, tileH);

    // Верхний слой — светящийся биолюминесцентный покров (мех/ кора)
    ctx.fillStyle = '#2dd4bf';
    ctx.fillRect(0, 0, tileW, 8);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(0, 8, tileW, 6);
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, 14, tileW, 4);

    // Глубокий срез коры планеты — пласты породы
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 18, tileW, 200);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 218, tileW, 200);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 418, tileW, tileH - 418);

    // Подземные трещины
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let i = 0; i < tileW; i += 40) {
      ctx.beginPath();
      ctx.moveTo(i, 218);
      ctx.lineTo(i + 15, tileH);
      ctx.stroke();
    }

    // Камни внутри породы
    ctx.fillStyle = '#475569';
    for (let i = 0; i < 8; i++) {
      const rx = i * 64 + (i % 3 === 0 ? 8 : i % 3 === 1 ? 24 : 40);
      const ry = 40 + (i % 2 === 0 ? 0 : 15);
      ctx.fillRect(rx, ry, 14, 10);
    }
    for (let i = 0; i < 6; i++) {
      const rx = i * 80 + 20;
      const ry = 250 + (i % 2 === 0 ? 0 : 20);
      ctx.fillRect(rx, ry, 12, 8);
    }

    // Светящиеся жилы кристаллов
    ctx.fillStyle = '#a855f7';
    for (let i = 0; i < 4; i++) {
      const cx = i * 128 + 40;
      const cy = 320 + (i % 2 === 0 ? 30 : 0);
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#38bdf8';
    for (let i = 0; i < 4; i++) {
      const cx = i * 128 + 80;
      const cy = 420 + (i % 2 === 0 ? 20 : 0);
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    const groundTex = PIXI.Texture.from(canvas);

    for (let x = -1024; x <= worldWidth + 1024; x += 512) {
      const sprite = new PIXI.Sprite(groundTex);
      sprite.x = x;
      sprite.y = surfaceY;
      sprite.zIndex = -1;
      sprite.anchor.set(0, 0);
      this.camera.addChild(sprite);
    }
  }

  /* ── Атмосферный фон планеты (звёзды, кольцо, горы) zIndex=-10 ─ */

  private addAtmosphereBackground(container: PIXI.Container, levelWidth: number, screenW: number, screenH: number): void {
    // Звёзды в верхней части неба (над горизонтом)
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * levelWidth;
      const y = Math.random() * (screenH * 0.45);
      const size = Math.random() * 2 + 0.5;
      const color = Math.random() > 0.5 ? 0x38bdf8 : 0xc084fc;
      const star = new PIXI.Graphics();
      star.beginFill(color, 0.7);
      star.drawCircle(0, 0, size);
      star.endFill();
      star.x = x;
      star.y = y;
      star.zIndex = -10;
      container.addChild(star);
    }

    // Кольцо газового гиганта (большой серок в небе)
    const ringW = 400;
    const ringH = 150;
    const ringCanvas = document.createElement('canvas');
    ringCanvas.width = ringW;
    ringCanvas.height = ringH;
    const rctx = ringCanvas.getContext('2d')!;
    rctx.clearRect(0, 0, ringW, ringH);
    const grad = rctx.createRadialGradient(ringW / 2, ringH / 2, 20, ringW / 2, ringH / 2, ringW / 2);
    grad.addColorStop(0, 'rgba(70, 130, 180, 0.15)');
    grad.addColorStop(1, 'rgba(70, 130, 180, 0.0)');
    rctx.fillStyle = grad;
    rctx.beginPath();
    rctx.ellipse(ringW / 2, ringH / 2, ringW / 2 - 10, ringH / 2 - 10, 0, 0, Math.PI * 2);
    rctx.fill();
    rctx.strokeStyle = 'rgba(70, 130, 180, 0.3)';
    rctx.lineWidth = 2;
    rctx.beginPath();
    rctx.ellipse(ringW / 2, ringH / 2, ringW / 2 - 5, ringH / 2 - 5, 0, 0, Math.PI * 2);
    rctx.stroke();
    const ringTex = PIXI.Texture.from(ringCanvas);
    const ringSprite = new PIXI.Sprite(ringTex);
    ringSprite.x = levelWidth / 2 - ringW / 2;
    ringSprite.y = -ringH / 2;
    ringSprite.zIndex = -10;
    container.addChild(ringSprite);

    // Силуэты инопланетных скал вдоль уровня (ровно на линии горизонта)
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

  /* ── Защитный купол вокруг Гравитационного якоря ─────────── */

  /** Рисует визуальный купол защиты вокруг якоря (градиентный круг с пунктирной обводкой). */
  public drawAnchorDome(x: number, y: number, radius: number = 250): PIXI.Sprite {
    if (!this.camera) return null as any;

    const size = radius * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    // Радиальный градиент
    const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.04)');
    grad.addColorStop(1, 'rgba(56, 189, 248, 0.18)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();

    // Пунктирная обводка
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
    sprite.anchor.set(0.5, 0.5);
    sprite.position.set(x, y);
    sprite.zIndex = -0.5;
    this.camera.addChild(sprite);
    return sprite;
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

  /** Загрузить PNG с автоматическим удалением фона по угловым пикселям. */
  async loadSpriteWithoutBackground(src: string, width: number, height: number): Promise<PIXI.Texture> {
    if (this.textures.has(src)) return this.textures.get(src)!;

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;

          // Определяем цвет фона по угловым пикселям
          const corners = [
            { r: data[0], g: data[1], b: data[2] },          // (0,0)
            { r: data[(width - 1) * 4], g: data[(width - 1) * 4 + 1], b: data[(width - 1) * 4 + 2] }, // (w-1,0)
            { r: data[(height - 1) * width * 4], g: data[(height - 1) * width * 4 + 1], b: data[(height - 1) * width * 4 + 2] }, // (0,h-1)
            { r: data[(width - 1 + (height - 1) * width) * 4], g: data[(width - 1 + (height - 1) * width) * 4 + 1], b: data[(width - 1 + (height - 1) * width) * 4 + 2] }, // (w-1,h-1)
          ];
          const bgR = Math.round((corners[0].r + corners[1].r + corners[2].r + corners[3].r) / 4);
          const bgG = Math.round((corners[0].g + corners[1].g + corners[2].g + corners[3].g) / 4);
          const bgB = Math.round((corners[0].b + corners[1].b + corners[2].b + corners[3].b) / 4);

          // Flood-fill от краев: убираем все пиксели близкие к цвету фона
          const visited = new Uint8Array(width * height);
          const stack: number[] = [];
          const pushIfEdge = (x: number, y: number) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return;
            const idx = (y * width + x) * 4;
            if (visited[y * width + x]) return;
            const dr = Math.abs(data[idx] - bgR);
            const dg = Math.abs(data[idx + 1] - bgG);
            const db = Math.abs(data[idx + 2] - bgB);
            if (dr < 45 && dg < 45 && db < 45) {
              visited[y * width + x] = 1;
              stack.push(y * width + x);
            }
          };
          // Засеиваем все граничные пиксели
          for (let x = 0; x < width; x++) { pushIfEdge(x, 0); pushIfEdge(x, height - 1); }
          for (let y = 0; y < height; y++) { pushIfEdge(0, y); pushIfEdge(width - 1, y); }

          while (stack.length > 0) {
            const pos = stack.pop()!;
            const y = Math.floor(pos / width);
            const x = pos % width;
            // Соседи
            pushIfEdge(x + 1, y);
            pushIfEdge(x - 1, y);
            pushIfEdge(x, y + 1);
            pushIfEdge(x, y - 1);
          }

          // Выставляем alpha = 0 для всех посещённых (фоновых) пикселей
          for (let i = 0; i < visited.length; i++) {
            if (visited[i]) {
              data[i * 4 + 3] = 0;
            }
          }

          ctx.putImageData(imageData, 0, 0);

          const texture = PIXI.Texture.from(canvas);
          this.textures.set(src, texture);
          resolve(texture);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => {
        reject(new Error(`Failed to load image: ${src}`));
      };
      img.src = src;
    });
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

