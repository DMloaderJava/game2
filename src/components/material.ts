import { defineComponent } from '../ecs/component';

/**
 * Физические и материальные свойства сущности.
 * Используются GravitySystem (масса, парусность), DamageSystem (прочность),
 * FluidSystem (плотность, состояние), WeatherSystem (ветровое воздействие).
 */
export const Material = defineComponent<MaterialData>('Material');

export type AggregateState = 'solid' | 'liquid' | 'gas';

export interface MaterialData {
  /** Масса в килограммах (используется при расчёте силы F = m * g). */
  mass: number;
  /** Плотность кг/м³ — для плавучести в жидкостях и расчёта объёма. */
  density: number;
  /** Прочность — порог импульса удара, при превышении которого объект ломается. */
  strength: number;
  /** Текущая целостность 0..1 (1 = целая, 0 = разрушена). */
  durability: number;
  /** Эффективная площадь парусности (м²) — для ветрового воздействия на лёгкие объекты. */
  sailArea: number;
  /** Коэффициент лобового сопротивления 0..1. */
  airResistance: number;
  /** Агрегатное состояние: твёрдое / жидкое / газообразное. */
  state: AggregateState;
  /** Температура (°C) — для горения/охлаждения и фазовых переходов жидкостей. */
  temperature: number;
  burnable: boolean;
  flammable: boolean;
  /** Теплопроводность — влияет на скорость обмена теплом с окружающей средой. */
  thermalConductivity: number;
}

/**
 * Предопределённые материалы для быстрого использования в префабах.
 */
export const Materials = {
  stone: (): MaterialData => ({
    mass: 120, density: 2400, strength: 8000, durability: 1,
    sailArea: 0.05, airResistance: 0.3, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 1.5,
  }),
  wood: (): MaterialData => ({
    mass: 40, density: 600, strength: 3000, durability: 1,
    sailArea: 0.1, airResistance: 0.4, state: 'solid',
    temperature: 20, burnable: true, flammable: true, thermalConductivity: 0.15,
  }),
  iron: (): MaterialData => ({
    mass: 220, density: 7800, strength: 15000, durability: 1,
    sailArea: 0.03, airResistance: 0.2, state: 'solid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 80,
  }),
  water: (): MaterialData => ({
    mass: 1, density: 1000, strength: 0, durability: 1,
    sailArea: 0.01, airResistance: 0.9, state: 'liquid',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 0.6,
  }),
  lava: (): MaterialData => ({
    mass: 1, density: 2800, strength: 0, durability: 1,
    sailArea: 0.01, airResistance: 0.9, state: 'liquid',
    temperature: 1100, burnable: false, flammable: false, thermalConductivity: 2.0,
  }),
  gas: (): MaterialData => ({
    mass: 0.02, density: 1.2, strength: 0, durability: 1,
    sailArea: 1.0, airResistance: 0.99, state: 'gas',
    temperature: 20, burnable: false, flammable: false, thermalConductivity: 0.02,
  }),
};
