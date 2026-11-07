import { defineComponent } from '../ecs/component';

/** Гравитационная зона биома (черная дыра, антигравитация и т.п.). */
export const GravityZone = defineComponent<GravityZoneData>('GravityZone');

export interface GravityZoneData {
  gx: number; // компонент гравитации по X
  gy: number; // компонент гравитации по Y
  strength: number; // множитель силы внутри зоны
  radius: number; // радиус действия в пикселях
}
