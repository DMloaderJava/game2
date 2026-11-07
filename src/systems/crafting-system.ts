/**
 * CraftingSystem — система крафта с PixiJS UI.
 * Проверка ресурсов в инвентаре, списание, создание предмета.
 */
import * as PIXI from 'pixi.js';
import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus } from '../core/event-bus';
import { RenderService } from '../services/render-service';
import { Inventory, InventoryData } from '../components/inventory';
import { ItemStack } from '../components/inventory';
import { CharacterController } from '../components/character';
import { Transform } from '../components/transform';

/** Рецепт крафта. */
export interface CraftingRecipeData {
  id: string;
  name: string;
  inputs: Array<{ itemId: string; count: number }>;
  output: { itemId: string; count: number };
  unlockAt: string | null; // ID предмета, который нужно иметь для разблокировки
}

export const CRAFTING_RECIPES: CraftingRecipeData[] = [
  {
    id: 'stone_wall',
    name: 'Каменная стена',
    inputs: [{ itemId: 'stone_slabs', count: 2 }],
    output: { itemId: 'stone_wall', count: 1 },
    unlockAt: null,
  },
  {
    id: 'gravity_anchor',
    name: 'Гравитационный якорь',
    inputs: [
      { itemId: 'stone_slabs', count: 5 },
      { itemId: 'ferrite_ore', count: 2 },
    ],
    output: { itemId: 'gravity_anchor', count: 1 },
    unlockAt: null,
  },
  {
    id: 'energy_dome',
    name: 'Энергетический купол',
    inputs: [
      { itemId: 'ferrite_ore', count: 10 },
      { itemId: 'resonit', count: 5 },
    ],
    output: { itemId: 'energy_dome', count: 1 },
    unlockAt: null,
  },
];

/** Текстуры для предметов крафта. */
const CRAFT_ITEM_TEXTURES: Record<string, string> = {
  stone_slabs: '/textures/item_stone_slabs.png',
  ferrite_ore: '/textures/item_ferrite_ore.png',
  stone_wall: '/textures/block_stone_wall.png',
  gravity_anchor: '/textures/gravity_anchor.png',
  energy_dome: '/textures/energy_dome.png',
};

export class CraftingSystem extends System {
  readonly priority = 45;
  readonly required = [Inventory];

  private worldRef!: World;
  private playerEntity: number | null = null;
  private uiContainer: any = null;
  private visible = false;
  private selectedRecipe: string | null = null;
  private recipeButtons: Array<{ bg: any; title: any; icon: any; reqText: any; recipeId: string }> = [];
  private craftBtn: any = null;
  private craftBtnText: any = null;

  constructor(private eventBus: EventBus, private render: RenderService) {
    super();
    this.buildUI();
  }

  private buildUI(): void {
    // Контейнер меню крафта (скрыт по умолчанию)
    this.uiContainer = new PIXI.Container();
    this.uiContainer.visible = false;
    this.uiContainer.x = 500;
    this.uiContainer.y = 100;

    // Фон меню
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, 380, 460);
    bg.fill(0x1a1a2e);
    bg.stroke({ width: 3, color: 0x4cc9f0 });
    this.uiContainer.addChild(bg);

    // Заголовок
    const title = new PIXI.Text('КРАФТ (C)', {
      fontFamily: 'monospace',
      fontSize: 20,
      fill: 0x4cc9f0,
    });
    title.x = 10;
    title.y = 10;
    this.uiContainer.addChild(title);

    // Кнопка закрытия
    const closeBtn = new PIXI.Graphics();
    closeBtn.rect(0, 0, 24, 24);
    closeBtn.fill(0x4cc9f0);
    closeBtn.x = 346;
    closeBtn.y = 10;
    closeBtn.cursor = 'pointer';
    closeBtn.interactive = true;
    closeBtn.on('pointerdown', () => {
      this.visible = false;
      this.uiContainer.visible = false;
    });
    this.uiContainer.addChild(closeBtn);

    const closeLabel = new PIXI.Text('×', {
      fontFamily: 'monospace',
      fontSize: 18,
      fill: 0x1a1a2e,
    });
    closeLabel.x = 352;
    closeLabel.y = 10;
    this.uiContainer.addChild(closeLabel);

    // Список рецептов (прокручиваемая область)
    const listY = 50;
    const listHeight = 320;

    CRAFTING_RECIPES.forEach((recipe, i) => {
      const y = listY + i * 78;

      // Фон слота рецепта
      const slotBg = new PIXI.Graphics();
      slotBg.rect(0, 0, 360, 70);
      slotBg.fill(0x2a2a3e);
      slotBg.stroke({ width: 1, color: 0x3a3a5e });
      slotBg.x = 10;
      slotBg.y = y;
      slotBg.cursor = 'pointer';
      slotBg.interactive = true;
      slotBg.on('pointerdown', () => {
        this.selectedRecipe = recipe.id;
        this.updateCraftButton();
      });
      this.uiContainer.addChild(slotBg);

      // Иконка результата
      const icon = new PIXI.Graphics();
      icon.rect(0, 0, 48, 48);
      icon.fill(0x3a3a5e);
      icon.x = 18;
      icon.y = y + 11;
      this.uiContainer.addChild(icon);

      // Название рецепта
      const titleText = new PIXI.Text(recipe.name, {
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xe8e8f0,
      });
      titleText.x = 76;
      titleText.y = y + 14;
      this.uiContainer.addChild(titleText);

      // Требования ресурсов
      const reqText = new PIXI.Text('', {
        fontFamily: 'monospace',
        fontSize: 11,
        fill: 0x8a8aa0,
      });
      reqText.x = 76;
      reqText.y = y + 34;
      this.uiContainer.addChild(reqText);

      this.recipeButtons.push({
        bg: slotBg,
        title: titleText,
        icon,
        reqText,
        recipeId: recipe.id,
      });
    });

    // Кнопка крафта
    this.craftBtn = new PIXI.Graphics();
    this.craftBtn.rect(0, 0, 360, 44);
    this.craftBtn.fill(0x4cc9f0);
    this.craftBtn.x = 10;
    this.craftBtn.y = listY + CRAFTING_RECIPES.length * 78 + 10;
    this.craftBtn.cursor = 'pointer';
    this.craftBtn.interactive = true;
    this.craftBtn.on('pointerdown', () => {
      if (this.selectedRecipe) {
        this.craft(this.selectedRecipe);
      }
    });
    this.uiContainer.addChild(this.craftBtn);

    this.craftBtnText = new PIXI.Text('Скрафтить', {
      fontFamily: 'monospace',
      fontSize: 16,
      fill: 0x1a1a2e,
      fontWeight: 'bold',
    });
    this.craftBtnText.x = 160 - this.craftBtnText.width / 2;
    this.craftBtnText.y = this.craftBtn.y + 12;
    this.uiContainer.addChild(this.craftBtnText);

    // Подсказка Resources
    const hint = new PIXI.Text('Требуемые ресурсы:', {
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 0x6a6a8a,
    });
    hint.x = 10;
    hint.y = this.craftBtn.y + 58;
    this.uiContainer.addChild(hint);

    if (this.render.stage) {
      this.render.stage.addChild(this.uiContainer);
    }
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    const inventories = world.query(Inventory);
    for (const { entity, components } of inventories) {
      const isPlayer = world.hasComponent(entity, CharacterController as unknown as symbol);
      if (isPlayer) {
        this.playerEntity = entity;
        // Обновляем отображение требований для каждого рецепта
        this.updateRecipeRequirements(entity);
      }
    }
  }

  private updateRecipeRequirements(entity: number): void {
    const inv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return;

    for (const btn of this.recipeButtons) {
      const recipe = CRAFTING_RECIPES.find((r) => r.id === btn.recipeId);
      if (!recipe) continue;

      let canAfford = true;
      const reqParts: string[] = [];
      for (const input of recipe.inputs) {
        let has = 0;
        for (const slot of inv.slots) {
          if (slot && slot.itemId === input.itemId) has += slot.count;
        }
        const enough = has >= input.count;
        if (!enough) canAfford = false;
        reqParts.push(`${enough ? '✓' : '✗'} ${input.itemId.replace(/_/g, ' ')}: ${has}/${input.count}`);
      }
      btn.reqText.text = reqParts.join('  ');
      btn.reqText.fill = canAfford ? 0x4cc9f0 : 0xff5555;

      // Подсветка выбранного рецепта
      if (btn.recipeId === this.selectedRecipe) {
        btn.bg.clear();
        btn.bg.rect(0, 0, 360, 70);
        btn.bg.fill(0x3a3a5e);
        btn.bg.stroke({ width: 2, color: 0x4cc9f0 });
      } else {
        btn.bg.clear();
        btn.bg.rect(0, 0, 360, 70);
        btn.bg.fill(0x2a2a3e);
        btn.bg.stroke({ width: 1, color: 0x3a3a5e });
      }
    }

    this.updateCraftButton();
  }

  private updateCraftButton(): void {
    if (!this.craftBtn || !this.craftBtnText || !this.playerEntity) return;

    const recipe = CRAFTING_RECIPES.find((r) => r.id === this.selectedRecipe);
    if (!recipe) {
      this.craftBtn.clear();
      this.craftBtn.fill(0x444455);
      this.craftBtnText.text = 'Выберите рецепт';
      this.craftBtnText.x = 160 - this.craftBtnText.width / 2;
      return;
    }

    const inv = this.worldRef.getComponent(this.playerEntity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return;

    let canAfford = true;
    for (const input of recipe.inputs) {
      let has = 0;
      for (const slot of inv.slots) {
        if (slot && slot.itemId === input.itemId) has += slot.count;
      }
      if (has < input.count) canAfford = false;
    }

    this.craftBtn.clear();
    this.craftBtn.fill(canAfford ? 0x4cc9f0 : 0x444455);
    this.craftBtnText.text = canAfford ? `Скрафтить ${recipe.name}` : 'Недостаточно ресурсов';
    this.craftBtnText.x = 190 - this.craftBtnText.width / 2;
  }

  private craft(recipeId: string): void {
    if (!this.playerEntity) return;

    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return;

    const inv = this.worldRef.getComponent(this.playerEntity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return;

    // Проверяем ресурсы
    for (const input of recipe.inputs) {
      let has = 0;
      for (const slot of inv.slots) {
        if (slot && slot.itemId === input.itemId) has += slot.count;
      }
      if (has < input.count) return; // Недостаточно ресурсов
    }

    // Списываем ресурсы
    for (const input of recipe.inputs) {
      let remaining = input.count;
      for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
        const slot = inv.slots[i];
        if (slot && slot.itemId === input.itemId) {
          const remove = Math.min(slot.count, remaining);
          slot.count -= remove;
          remaining -= remove;
          if (slot.count <= 0) inv.slots[i] = null;
          else inv.slots[i] = slot;
        }
      }
    }

    // Добавляем результат
    const added = this.addItemToInventory(recipe.output.itemId, recipe.output.count);
    if (added > 0) {
      this.worldRef.addComponent(this.playerEntity, Inventory as unknown as symbol, inv);
      this.eventBus.emit('item:crafted', {
        entity: this.playerEntity,
        recipeId: recipe.id,
        itemId: recipe.output.itemId,
        count: recipe.output.count,
      });
    }
    this.updateRecipeRequirements(this.playerEntity);
  }

  private addItemToInventory(itemId: string, count: number): number {
    if (!this.playerEntity) return 0;
    const inv = this.worldRef.getComponent(this.playerEntity, Inventory as unknown as symbol) as InventoryData | undefined;
    if (!inv) return 0;

    let remaining = count;
    const tags = this.getItemTags(itemId);
    const maxCount = 64; // default stack limit

    // Добиваем существующие стаки
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
      const slot = inv.slots[i];
      if (slot && slot.itemId === itemId && slot.count < slot.maxCount) {
        const space = slot.maxCount - slot.count;
        const add = Math.min(space, remaining);
        slot.count += add;
        remaining -= add;
        inv.slots[i] = slot;
      }
    }

    // Новые стаки
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
      if (!inv.slots[i]) {
        const add = Math.min(maxCount, remaining);
        inv.slots[i] = { itemId, count: add, maxCount, tags };
        remaining -= add;
      }
    }

    return count - remaining;
  }

  private getItemTags(itemId: string): string[] {
    const tagMap: Record<string, string[]> = {
      stone_slabs: ['building_material'],
      ferrite_ore: ['ore'],
      stone_wall: ['building_material'],
      gravity_anchor: ['device'],
      energy_dome: ['device'],
    };
    return tagMap[itemId] ?? [];
  }

  /** Получить текстуру предмета для инвентаря. */
  getItemTexture(itemId: string): string {
    return CRAFT_ITEM_TEXTURES[itemId] ?? '/textures/item_stone_slabs.png';
  }

  /** Открыть/закрыть меню крафта. */
  toggle(): void {
    this.visible = !this.visible;
    if (this.uiContainer) {
      this.uiContainer.visible = this.visible;
    }
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Установить игрока. */
  setPlayerEntity(entity: number): void {
    this.playerEntity = entity;
  }
}
