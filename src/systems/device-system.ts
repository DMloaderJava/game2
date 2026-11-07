import { System } from '../ecs/system';
import { World } from '../ecs/world';
import { EventBus as EventBusClass } from '../core/event-bus';
import { Vec2 } from '../core/vec2';
import { Transform } from '../components/transform';
import { Device, DeviceData, DeviceType } from '../components/devices';
import { EnergyNode, EnergyNodeData } from '../components/devices';
import { EnergyCable, EnergyCableData } from '../components/devices';
import { Conveyor, ConveyorData } from '../components/devices';
import { ItemRoute, ItemRouteData } from '../components/devices';
import { PowerProducer, PowerProducerData } from '../components/devices';
import { PowerConsumer, PowerConsumerData } from '../components/devices';
import { EnergyStorage, EnergyStorageData } from '../components/devices';
import { Inventory, InventoryData } from '../components/inventory';
import { ItemStack, ItemStackData } from '../components/inventory';
import { CharacterStats } from '../components/character';

/**
 * DeviceSystem — энергетическая сеть, логистика предметов и работа устройств.
 *
 * Управляет:
 *   - передачей энергии между производителями, потребителями и батареями
 *   - транспортировкой предметов через конвейеры и маршруты
 *   - включением/выключением устройств при дефиците энергии
 *
 * Приоритет 55 — после InventorySystem (50) и CraftingSystem (52),
 * до EventSystem (60).
 */
export class DeviceSystem extends System {
  readonly priority = 55;
  readonly required = [Transform];

  private worldRef!: World;

  constructor(private eventBus: EventBusClass) {
    super();
  }

  update(world: World, dt: number): void {
    this.worldRef = world;

    this.updateEnergyNetwork(dt);
    this.updateConveyors(dt);
    this.updateDeviceStates(dt);
  }

  /* ── Энергетическая сеть ───────────────────────────────────── */

  private updateEnergyNetwork(dt: number): void {
    // Собираем все узлы энергии
    const nodes = this.worldRef.query(EnergyNode);
    const nodeMap = new Map<number, EnergyNodeData>();
    for (const { entity, components } of nodes) {
      nodeMap.set(entity, components[0] as EnergyNodeData);
    }

    // Считаем баланс сети
    let totalProduction = 0;
    let totalConsumption = 0;
    const producers: Array<{ entity: number; data: EnergyNodeData }> = [];
    const consumers: Array<{ entity: number; data: EnergyNodeData }> = [];
    const batteries: Array<{ entity: number; data: EnergyNodeData }> = [];

    for (const [entity, data] of nodeMap) {
      if (data.type === 'producer') {
        totalProduction += data.powerOutput;
        producers.push({ entity, data });
      } else if (data.type === 'consumer') {
        totalConsumption += data.powerConsumption;
        consumers.push({ entity, data });
      } else if (data.type === 'battery') {
        batteries.push({ entity, data });
      }
    }

    const netPower = totalProduction - totalConsumption;

    // Разряд/заряд батарей
    if (netPower < 0) {
      // Дефицит — батареи разряжаются
      const deficit = -netPower;
      for (const { entity, data } of batteries) {
        if (deficit <= 0) break;
        const drain = Math.min(data.storedEnergy, deficit * dt);
        data.storedEnergy = Math.max(0, data.storedEnergy - drain);
        this.worldRef.addComponent(entity, EnergyNode as unknown as symbol, data);
      }
    } else if (netPower > 0) {
      // Избыток — батареи заряжаются
      const surplus = netPower;
      for (const { entity, data } of batteries) {
        if (surplus <= 0) break;
        const space = data.maxStored - data.storedEnergy;
        const charge = Math.min(space, surplus * dt);
        data.storedEnergy = Math.min(data.maxStored, data.storedEnergy + charge);
        this.worldRef.addComponent(entity, EnergyNode as unknown as symbol, data);
      }
    }

    // Отключение потребителей при критическом дефиците (по приоритету)
    const critical = totalProduction + (batteries.reduce((sum, b) => sum + b.data.storedEnergy, 0)) < totalConsumption;
    if (critical) {
      consumers.sort((a, b) => {
        const ca = this.worldRef.getComponent(a.entity, PowerConsumer as unknown as symbol) as PowerConsumerData | undefined;
        const cb = this.worldRef.getComponent(b.entity, PowerConsumer as unknown as symbol) as PowerConsumerData | undefined;
        return (ca?.priority ?? 1) - (cb?.priority ?? 1);
      });
      for (const { entity, data } of consumers) {
        const consumer = this.worldRef.getComponent(entity, PowerConsumer as unknown as symbol) as PowerConsumerData | undefined;
        if (consumer) {
          consumer.isOperational = false;
          this.worldRef.addComponent(entity, PowerConsumer as unknown as symbol, consumer);
          this.eventBus.emit('device:powered-off', { entity, reason: 'energy_deficit' });
        }
      }
    } else {
      // Включаем всех потребителей обратно
      for (const { entity } of consumers) {
        const consumer = this.worldRef.getComponent(entity, PowerConsumer as unknown as symbol) as PowerConsumerData | undefined;
        if (consumer && !consumer.isOperational) {
          consumer.isOperational = true;
          this.worldRef.addComponent(entity, PowerConsumer as unknown as symbol, consumer);
          this.eventBus.emit('device:powered-on', { entity });
        }
      }
    }
  }

  /* ── Конвейеры и транспортировка предметов ─────────────────── */

  private updateConveyors(dt: number): void {
    const conveyors = this.worldRef.query(Conveyor);
    for (const { entity, components } of conveyors) {
      const conv = components[0] as ConveyorData;

      if (!conv.targetEntity) continue;

      // Переносим предметы из источника в цель
      const sourceInv = this.worldRef.getComponent(entity, Inventory as unknown as symbol) as InventoryData | undefined;
      const targetInv = this.worldRef.getComponent(conv.targetEntity, Inventory as unknown as symbol) as InventoryData | undefined;

      if (!sourceInv || !targetInv) continue;

      const transferRate = conv.speed * dt;
      let transferred = 0;

      for (let i = 0; i < sourceInv.slots.length && transferred < transferRate; i++) {
        const slot = sourceInv.slots[i];
        if (!slot) continue;

        const toMove = Math.min(slot.count, transferRate - transferred);
        // Добавляем в цель
        const added = this.addToInventory(targetInv, slot.itemId, toMove);
        slot.count -= added;
        transferred += added;
        if (slot.count <= 0) sourceInv.slots[i] = null;
        else sourceInv.slots[i] = slot;
      }

      if (transferred > 0) {
        this.worldRef.addComponent(entity, Conveyor as unknown as symbol, conv);
        this.worldRef.addComponent(entity, Inventory as unknown as symbol, sourceInv);
        this.worldRef.addComponent(conv.targetEntity, Inventory as unknown as symbol, targetInv);
        this.eventBus.emit('conveyor:transferred', { from: entity, to: conv.targetEntity, amount: transferred });
      }
    }
  }

  /* ── Состояние устройств ───────────────────────────────────── */

  private updateDeviceStates(dt: number): void {
    const devices = this.worldRef.query(Device);
    for (const { entity, components } of devices) {
      const dev = components[0] as DeviceData;

      // Проверка энергии для потребителей
      const consumer = this.worldRef.getComponent(entity, PowerConsumer as unknown as symbol) as PowerConsumerData | undefined;
      if (consumer && !consumer.isOperational) {
        // Устройство выключено из-за недостатка энергии
        dev.active = false;
        this.worldRef.addComponent(entity, Device as unknown as symbol, dev);
        continue;
      }

      // Производители вырабатывают топливо
      const producer = this.worldRef.getComponent(entity, PowerProducer as unknown as symbol) as PowerProducerData | undefined;
      if (producer && producer.fuelAmount > 0) {
        producer.fuelAmount = Math.max(0, producer.fuelAmount - dt * 0.1); // расход топлива
        this.worldRef.addComponent(entity, PowerProducer as unknown as symbol, producer);
        dev.active = true;
      } else if (producer) {
        dev.active = false;
      }

      this.worldRef.addComponent(entity, Device as unknown as symbol, dev);
    }
  }

  /* ── Публичный API ─────────────────────────────────────────── */

  /** Связать два устройства для передачи энергии. */
  linkEnergy(fromEntity: number, toEntity: number): void {
    const cableEntity = this.worldRef.createEntity();
    this.worldRef.addComponent(cableEntity, EnergyCable as unknown as symbol, {
      fromEntity, toEntity, active: true,
    });

    // Добавляем в connectedNodes обоих узлов
    this.addConnectedNode(fromEntity, toEntity);
    this.addConnectedNode(toEntity, fromEntity);

    this.eventBus.emit('energy:linked', { fromEntity, toEntity });
  }

  /** Настроить маршрут транспортировки предмета. */
  setItemRoute(fromEntity: number, toEntity: number, itemId: string, maxRate: number): void {
    const routeEntity = this.worldRef.createEntity();
    this.worldRef.addComponent(routeEntity, ItemRoute as unknown as symbol, {
      fromEntity, toEntity, itemId, maxRate, currentLoad: 0,
    });
    this.eventBus.emit('route:created', { routeEntity, fromEntity, toEntity, itemId });
  }

  private addConnectedNode(entity: number, node: number): void {
    const data = this.worldRef.getComponent(entity, EnergyNode as unknown as symbol) as EnergyNodeData | undefined;
    if (!data) return;
    if (!data.connectedNodes.includes(node)) {
      data.connectedNodes.push(node);
      this.worldRef.addComponent(entity, EnergyNode as unknown as symbol, data);
    }
  }

  private addToInventory(inv: InventoryData, itemId: string, count: number): number {
    let remaining = count;
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
      const slot = inv.slots[i];
      if (slot && slot.itemId === itemId && slot.count < slot.maxCount) {
        const space = slot.maxCount - slot.count;
        const add = Math.min(space, remaining);
        slot.count += add;
        remaining -= add;
        inv.slots[i] = slot;
      } else if (!slot) {
        const add = Math.min(64, remaining); // StackLimits.default
        inv.slots[i] = { itemId, count: add, maxCount: 64, tags: [] };
        remaining -= add;
      }
    }
    return count - remaining;
  }
}
