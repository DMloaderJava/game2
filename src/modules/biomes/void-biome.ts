/**
 * Пример плагина модуля: биом «Пустота».
 * Регистрирует компоненты и системы, не меняя ядро ECS.
 */
import { Plugin } from '../../core/types';
import { World } from '../../ecs/world';
import { GravityZone } from '../../components/gravity-zone';

export const voidBiomePlugin: Plugin = {
  name: 'void-biome',
  version: '1.0.0',
  install(world: any, services: any): void {
    // Регистрируем компонент гравитационной зоны
    world.registerComponent(GravityZone as unknown as symbol);

    // Создаём зону слабой гравитации в центре биома
    const zone = world.createEntity();
    world.addComponent(zone, GravityZone as unknown as symbol, {
      gx: 0,
      gy: 0.2, // слабое притяжение к центру
      strength: 0.5,
      radius: 800,
    });

    // Здесь плагин мог бы добавить свою систему обновления биома,
    // таблицу спавна мобов, цвет фона и текстуры.
    console.log('[Plugin] void-biome installed');
  },
};
