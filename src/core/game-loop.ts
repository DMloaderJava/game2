import { World } from '../ecs/world';

/**
 * Игровой цикл с фиксированным шагом физики и интерполированным рендером.
 * Физика всегда идёт с константным dt (детерминизм), рендер — с интерполяцией
 * между кадрами для плавности на любых мониторах.
 */
export class GameLoop {
  private running = false;
  private lastTime = 0;
  private accumulator = 0;

  constructor(
    private world: World,
    private fixedTimeStep: number = 1 / 60,
    private maxSubSteps: number = 5,
    private onRender?: (alpha: number) => void, // alpha в [0, 1] — интерполяция между кадрами
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((time) => this.tick(time));
  }

  stop(): void {
    this.running = false;
  }

  private tick(time: number): void {
    if (!this.running) return;

    const dt = (time - this.lastTime) / 1000;
    this.lastTime = time;

    // Ограничиваем максимальный шаг (защита от spiral of death при закладках вкладки)
    const cappedDt = Math.min(dt, 0.25);
    this.accumulator += cappedDt;

    // Фиксированные шаги физики/логики
    let steps = 0;
    while (this.accumulator >= this.fixedTimeStep && steps < this.maxSubSteps) {
      this.world.update(this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
      steps++;
    }

    // Рендер с интерполяцией для плавности
    const alpha = this.accumulator / this.fixedTimeStep;
    if (this.onRender) {
      this.onRender(alpha);
    }

    requestAnimationFrame((t) => this.tick(t));
  }
}
