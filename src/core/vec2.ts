/**
 * Двумерный вектор с набором операций, необходимых для физики гравитации.
 * Используется вместо голых {x, y} для единообразия вычислений и читаемости кода.
 */
export class Vec2 {
  constructor(public x: number, public y: number) {}

  static zero(): Vec2 {
    return new Vec2(0, 0);
  }

  /** Вектор под заданным углом (радианы) с длиной length. */
  static fromAngle(angle: number, length = 1): Vec2 {
    return new Vec2(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  static fromPoints(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(b.x - a.x, b.y - a.y);
  }

  add(v: Vec2): Vec2 {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  sub(v: Vec2): Vec2 {
    return new Vec2(this.x - v.x, this.y - v.y);
  }

  mul(s: number): Vec2 {
    return new Vec2(this.x * s, this.y * s);
  }

  div(s: number): Vec2 {
    return new Vec2(this.x / s, this.y / s);
  }

  dot(v: Vec2): number {
    return this.x * v.x + this.y * v.y;
  }

  cross(v: Vec2): number {
    return this.x * v.y - this.y * v.x;
  }

  length(): number {
    return Math.hypot(this.x, this.y);
  }

  lengthSq(): number {
    return this.x * this.x + this.y * this.y;
  }

  normalize(): Vec2 {
    const l = this.length();
    return l === 0 ? Vec2.zero() : this.div(l);
  }

  distance(v: Vec2): number {
    return this.sub(v).length();
  }

  distanceSq(v: Vec2): number {
    return this.sub(v).lengthSq();
  }

  lerp(v: Vec2, t: number): Vec2 {
    return this.add(v.sub(this).mul(t));
  }

  /** Ограничить длину вектором max. */
  clamp(max: number): Vec2 {
    const l = this.length();
    if (l > max && l > 0) {
      return this.normalize().mul(max);
    }
    return this;
  }

  rotate(angle: number): Vec2 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
  }

  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  equals(v: Vec2, eps = 1e-6): boolean {
    return Math.abs(this.x - v.x) < eps && Math.abs(this.y - v.y) < eps;
  }

  clone(): Vec2 {
    return new Vec2(this.x, this.y);
  }

  toString(): string {
    return `(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
  }
}
